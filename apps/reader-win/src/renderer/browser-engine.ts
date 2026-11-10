// 브라우저 엔진(WASM): 앱에 함께 묶은 transformers.js 웹 빌드를 이 화면 안에서 돌린다. 외부 CDN을 쓰지 않는다(wasm 파일도 /ort/ 로컬).
// 설정은 src/core/local/runtime.ts(웹 모듈)와 같은 방식이다.
import type { TranscribeResult } from "../lib/api";
import type { SpeechDtype } from "../../../../src/core/speech";

type Tf = typeof import("@huggingface/transformers");
type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | Array<{ text: string }>>;

let tfPromise: Promise<Tf> | null = null;
const pipes = new Map<string, { run: Asr; modelType: string }>();

async function tf(): Promise<Tf> {
  tfPromise ??= import("@huggingface/transformers").then((m) => {
    m.env.allowRemoteModels = false;
    m.env.allowLocalModels = true;
    m.env.localModelPath = "/models/"; // 앱 프로토콜의 /models/ = 설치한 모델 폴더
    m.env.useBrowserCache = false;
    const wasm = (m.env.backends.onnx as { wasm?: { wasmPaths?: unknown; proxy?: boolean; numThreads?: number } }).wasm;
    if (wasm) {
      wasm.wasmPaths = { mjs: "/ort/ort-wasm-simd-threaded.asyncify.mjs", wasm: "/ort/ort-wasm-simd-threaded.asyncify.wasm" };
      wasm.proxy = true;
      if (self.crossOriginIsolated) wasm.numThreads = Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 2) - 1));
    }
    return m;
  });
  return tfPromise;
}

export async function browserTranscribe(modelId: string, dtype: SpeechDtype, audio: Float32Array): Promise<TranscribeResult> {
  const m = await tf();
  const key = `${modelId}|${dtype}`;
  let loadSeconds = 0;
  let p = pipes.get(key);
  if (!p) {
    const t0 = performance.now();
    const pipe = (await m.pipeline("automatic-speech-recognition", modelId, { device: "wasm", dtype } as never)) as unknown as { model?: { config?: { model_type?: string } } } & Asr;
    p = { run: (a, o) => (pipe as unknown as Asr)(a, o), modelType: pipe.model?.config?.model_type ?? "" };
    pipes.set(key, p);
    loadSeconds = (performance.now() - t0) / 1000;
  }
  const opts = p.modelType === "whisper" ? { language: "korean", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 } : {};
  const t1 = performance.now();
  const res = await p.run(audio, opts);
  const seconds = (performance.now() - t1) / 1000;
  const audioSeconds = audio.length / 16000;
  return {
    text: String(Array.isArray(res) ? res[0]?.text : res.text).trim(),
    seconds: Math.round(seconds * 1000) / 1000,
    audioSeconds: Math.round(audioSeconds * 100) / 100,
    rtf: Math.round((seconds / audioSeconds) * 10000) / 10000,
    device: "cpu",
    dtype,
    loadSeconds: Math.round(loadSeconds * 100) / 100,
    threads: (m.env.backends.onnx as { wasm?: { numThreads?: number } }).wasm?.numThreads ?? 1,
  };
}
