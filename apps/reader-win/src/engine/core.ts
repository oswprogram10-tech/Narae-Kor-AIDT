// 음성 인식 엔진 핵심(Electron 없이 Node에서도 돌아요: scripts/engine-smoke.mjs).
// transformers.js + onnxruntime-node. 네트워크를 쓰지 않고 로컬 모델 폴더만 읽는다. 소리는 메모리에서만 쓰고 어디에도 쓰지 않는다.
import os from "node:os";
import path from "node:path";

import type { DeviceChoice, TranscribeResult, UsedDevice } from "../lib/api";
import { deviceOrder } from "../lib/device";
import { checkAudio, checkDtype, checkModelId } from "../lib/validate";
import type { SpeechDtype } from "../../../../src/core/speech";

export interface EngineConfig {
  /** 모델 폴더들이 들어 있는 곳(<modelsDir>/<modelId>/…) */
  modelsDir: string;
  /** CPU 스레드 수 */
  threads: number;
  /** 시험용: 운영체제 이름 바꾸기 */
  platform?: string;
}

export interface EngineRequest {
  modelId: string;
  device: DeviceChoice;
  dtype: SpeechDtype;
  audio: Float32Array;
}

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | Array<{ text: string }>>;
interface Loaded {
  run: Asr;
  modelType: string;
  dispose: () => Promise<void> | void;
}

const MAX_CACHED = 2;

export function createEngine(cfg: EngineConfig) {
  const platform = cfg.platform ?? process.platform;
  const cache = new Map<string, Loaded>();
  let tfPromise: Promise<typeof import("@huggingface/transformers")> | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  async function tf() {
    tfPromise ??= import("@huggingface/transformers").then((m) => {
      m.env.allowRemoteModels = false; // 엔진은 네트워크를 쓰지 않는다
      m.env.allowLocalModels = true;
      m.env.localModelPath = cfg.modelsDir.endsWith(path.sep) ? cfg.modelsDir : cfg.modelsDir + path.sep;
      m.env.useFSCache = false;
      return m;
    });
    return tfPromise;
  }

  async function load(modelId: string, dtype: SpeechDtype, device: UsedDevice): Promise<{ loaded: Loaded; loadSeconds: number }> {
    const key = `${modelId}|${dtype}|${device}`;
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key); // 가장 최근 것으로 옮기기
      cache.set(key, hit);
      return { loaded: hit, loadSeconds: 0 };
    }
    const m = await tf();
    const t0 = performance.now();
    const sessionOptions =
      device === "cpu"
        ? { intra_op_num_threads: cfg.threads, inter_op_num_threads: 1 }
        : { enableMemPattern: false, executionMode: "sequential" }; // DirectML 권장 설정
    const pipe = (await m.pipeline("automatic-speech-recognition", modelId, {
      device,
      dtype,
      session_options: sessionOptions,
    } as never)) as unknown as { model?: { config?: { model_type?: string } }; dispose?: () => Promise<void> } & Asr;
    const loaded: Loaded = {
      run: (a, o) => (pipe as unknown as Asr)(a, o),
      modelType: pipe.model?.config?.model_type ?? "",
      dispose: () => pipe.dispose?.(),
    };
    cache.set(key, loaded);
    while (cache.size > MAX_CACHED) {
      const oldest = cache.keys().next().value as string;
      const old = cache.get(oldest);
      cache.delete(oldest);
      try {
        await old?.dispose();
      } catch {
        /* 정리 실패는 무시 */
      }
    }
    return { loaded, loadSeconds: (performance.now() - t0) / 1000 };
  }

  async function runOne(req: EngineRequest, device: UsedDevice): Promise<TranscribeResult> {
    const { loaded, loadSeconds } = await load(req.modelId, req.dtype, device);
    // 언어 ko·transcribe 고정, 30초씩 나눠(겹침 5초) 처리
    const callOpts = loaded.modelType === "whisper" ? { language: "korean", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 } : {};
    const t0 = performance.now();
    const res = await loaded.run(req.audio, callOpts);
    const seconds = (performance.now() - t0) / 1000;
    const text = String(Array.isArray(res) ? res[0]?.text : res.text).trim();
    const audioSeconds = req.audio.length / 16000;
    return {
      text,
      seconds: round(seconds, 3),
      audioSeconds: round(audioSeconds, 2),
      rtf: round(seconds / audioSeconds, 4),
      device,
      dtype: req.dtype,
      loadSeconds: round(loadSeconds, 2),
      threads: cfg.threads,
    };
  }

  async function transcribeNow(req: EngineRequest): Promise<TranscribeResult> {
    const m = checkModelId(req.modelId);
    if (!m.ok) throw new Error(m.error);
    const d = checkDtype(m.model, req.dtype);
    if (!d.ok) throw new Error(d.error);
    const a = checkAudio(req.audio);
    if (!a.ok) throw new Error(a.error);
    const order = deviceOrder(req.device, platform);
    const notes: string[] = [];
    let lastError: unknown;
    for (const dev of order) {
      try {
        const r = await runOne(req, dev);
        if (notes.length) r.note = notes.join(" ");
        return r;
      } catch (e) {
        lastError = e;
        // 실패한 파이프라인은 버린다
        const key = `${req.modelId}|${req.dtype}|${dev}`;
        const bad = cache.get(key);
        cache.delete(key);
        try {
          await bad?.dispose();
        } catch {
          /* 무시 */
        }
        if (req.device === "auto" && order.length > 1) notes.push(`${dev === "dml" ? "DirectML" : dev}로는 돌리지 못해서 다음 장치로 넘어갔어요(${briefError(e)}).`);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  return {
    /** 한 번에 하나씩 차례로 처리한다(CPU 경쟁을 피함) */
    transcribe(req: EngineRequest): Promise<TranscribeResult> {
      const p = queue.then(() => transcribeNow(req));
      queue = p.catch(() => undefined);
      return p;
    },
    async dispose() {
      for (const l of cache.values()) {
        try {
          await l.dispose();
        } catch {
          /* 무시 */
        }
      }
      cache.clear();
    },
    cpuModel: os.cpus()[0]?.model ?? "",
  };
}

export type Engine = ReturnType<typeof createEngine>;

function round(x: number, n: number): number {
  const f = 10 ** n;
  return Math.round(x * f) / f;
}

/** 오류 문장을 짧게(사용자 경로 등을 줄이기 위해 첫 줄 120자) */
function briefError(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e);
  return s.split("\n")[0].slice(0, 120);
}
