import type { LocalModelRuntime } from "@/core/providers/local";
import type { LocalModelInfo } from "./catalog";

// transformers.js(ONNX Runtime Web)로 내장 모델을 기기 안에서 실행한다.
// - 브라우저: WebGPU가 있으면 WebGPU(q4f16), 없으면 WASM(q4)
// - 안드로이드 WebView·윈도우(Electron/Tauri)도 같은 웹 코드로 동작
// - 모델 파일은 모듈과 함께 배포한 경로(modelBaseUrl)에서 읽고, 브라우저 캐시에 저장되어 두 번째부터는 내려받지 않는다.

export type LocalDevice = "webgpu" | "wasm" | "cpu";

export interface LoadProgress {
  status: string; // initiate | download | progress | progress_total | done | ready
  file?: string;
  progress?: number; // 0~100
  loaded?: number;
  total?: number;
}

export interface LocalRuntimeOptions {
  model: LocalModelInfo;
  // 모델 파일을 둔 곳. 예: "/models/" → /models/qwen2.5-0.5b/onnx/model_q4f16.onnx
  modelBaseUrl?: string;
  // true면 내장 파일이 없을 때 Hugging Face에서 받아 온다(개발·실험용)
  allowRemote?: boolean;
  // 브라우저용 ONNX Runtime(WASM) 파일 위치. 기본 "/ort/"(scripts/copy-ort.mjs가 복사). 외부 CDN을 쓰지 않기 위함
  wasmBaseUrl?: string;
  device?: LocalDevice | "auto";
  onProgress?: (p: LoadProgress) => void;
  // 테스트에서 실제 라이브러리 대신 넣는 생성기
  pipelineFactory?: PipelineFactory;
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type Generator = (
  messages: ChatMessage[],
  opts: { max_new_tokens: number; do_sample: boolean; return_full_text?: boolean },
) => Promise<unknown>;
export type PipelineFactory = (args: {
  modelPath: string;
  device: LocalDevice;
  dtype: string;
  externalData?: false;
  onProgress?: (p: LoadProgress) => void;
}) => Promise<Generator>;

export function detectDevice(): LocalDevice {
  const nav = (globalThis as { navigator?: { gpu?: unknown } }).navigator;
  if (nav?.gpu) return "webgpu";
  if (typeof (globalThis as { window?: unknown }).window !== "undefined") return "wasm";
  return "cpu";
}

// 실제 transformers.js를 쓰는 기본 생성기(필요할 때만 불러와서 다른 화면의 용량을 늘리지 않음)
const defaultFactory = (opts: LocalRuntimeOptions): PipelineFactory => async ({ modelPath, device, dtype, externalData, onProgress }) => {
  const tf = await import("@huggingface/transformers");
  if (opts.modelBaseUrl) {
    tf.env.localModelPath = opts.modelBaseUrl;
    tf.env.allowLocalModels = true;
  }
  tf.env.allowRemoteModels = !!opts.allowRemote;
  const onnxWasm = (tf.env.backends.onnx as { wasm?: { wasmPaths?: unknown; proxy?: boolean; numThreads?: number } } | undefined)?.wasm;
  if (onnxWasm && typeof (globalThis as { window?: unknown }).window !== "undefined") {
    const base = opts.wasmBaseUrl ?? "/ort/";
    onnxWasm.wasmPaths = {
      mjs: `${base}ort-wasm-simd-threaded.asyncify.mjs`,
      wasm: `${base}ort-wasm-simd-threaded.asyncify.wasm`,
    };
    // 계산을 별도 작업 스레드(Web Worker)로 보내 학생 화면이 멈추지 않게 한다.
    onnxWasm.proxy = true;
    // 교차 출처 격리(COOP/COEP)가 되어 있으면 여러 코어를 쓴다.
    const g = globalThis as { crossOriginIsolated?: boolean; navigator?: { hardwareConcurrency?: number } };
    if (g.crossOriginIsolated) onnxWasm.numThreads = Math.max(1, Math.min(4, (g.navigator?.hardwareConcurrency ?? 2) - 1));
  }
  const pipe = await tf.pipeline("text-generation", modelPath, {
    device,
    dtype: dtype as "q4" | "q4f16" | "int8",
    ...(externalData === false ? { use_external_data_format: false } : {}),
    progress_callback: (p: unknown) => onProgress?.(p as LoadProgress),
  });
  return (messages, genOpts) => (pipe as unknown as Generator)(messages, genOpts);
};

// 출력 형식이 버전·입력에 따라 다르므로 마지막 assistant 텍스트를 찾아낸다.
export function extractAssistantText(out: unknown): string {
  const first = Array.isArray(out) ? out[0] : out;
  const gen = (first as { generated_text?: unknown } | undefined)?.generated_text;
  if (typeof gen === "string") return gen;
  if (Array.isArray(gen)) {
    const last = [...gen].reverse().find((m) => (m as ChatMessage).role === "assistant") as ChatMessage | undefined;
    return last?.content ?? "";
  }
  return "";
}

export class TransformersLocalRuntime implements LocalModelRuntime {
  readonly modelId: string;
  readonly trustsGhostwriteFlag: boolean;
  private gen: Generator | null = null;
  private loading: Promise<void> | null = null;
  device: LocalDevice | null = null;
  lastError: string | null = null;
  loadMs: number | null = null;

  constructor(private readonly opts: LocalRuntimeOptions) {
    this.modelId = opts.model.id;
    this.trustsGhostwriteFlag = !!opts.model.trustsGhostwriteFlag;
  }

  isReady(): boolean {
    return !!this.gen;
  }

  load(): Promise<void> {
    if (this.gen) return Promise.resolve();
    this.loading ??= (async () => {
      const t0 = Date.now();
      const preferred = this.opts.device && this.opts.device !== "auto" ? this.opts.device : detectDevice();
      const factory = this.opts.pipelineFactory ?? defaultFactory(this.opts);
      const modelPath = this.opts.modelBaseUrl ? this.opts.model.id : this.opts.model.hfRepo;
      const tryDevice = async (device: LocalDevice) => {
        const spec = device === "webgpu" ? this.opts.model.webgpu : this.opts.model.wasm;
        const externalData = "externalData" in spec ? spec.externalData : undefined;
        this.gen = await factory({ modelPath, device, dtype: spec.dtype, externalData, onProgress: this.opts.onProgress });
        this.device = device;
      };
      try {
        await tryDevice(preferred);
      } catch (err) {
        // WebGPU가 있어도 드라이버 문제 등으로 실패하면 WASM으로 한 번 더 시도
        if (preferred !== "webgpu") throw err;
        await tryDevice("wasm");
      }
      this.loadMs = Date.now() - t0;
      this.opts.onProgress?.({ status: "ready" });
    })().catch((err) => {
      this.loading = null;
      this.lastError = String((err as Error)?.message ?? err);
      throw err;
    });
    return this.loading;
  }

  async complete(input: { system: string; user: string; maxTokens: number }): Promise<string> {
    if (!this.gen) throw new Error("내장 모델이 아직 준비되지 않았어요.");
    const out = await this.gen(
      [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      { max_new_tokens: input.maxTokens, do_sample: false },
    );
    return extractAssistantText(out);
  }
}
