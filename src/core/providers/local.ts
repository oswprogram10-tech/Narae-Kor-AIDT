import { parseJsonOutput, toJsonSchema } from "./json";
import type { JsonRequest, LlmProvider } from "./types";

// 모듈에 내장하는 초소형 모델(0.5B~1B급)의 연결 지점.
// 2단계에서 브라우저(WebGPU/WASM)·안드로이드 WebView·윈도우(Electron/Tauri)에서 돌아가는 실행기를 이 규약에 맞춰 붙인다.
// 실행기가 없거나 아직 모델을 내려받지 않았으면 available() = false 이고, 엔진은 다음 AI(또는 모의 코치)로 넘어간다.
export interface LocalModelRuntime {
  readonly modelId: string;
  isReady(): boolean;
  // jsonSchema를 주면 실행기가 지원하는 경우 형식을 강제하고(문법 제약 디코딩 등), 아니면 프롬프트로만 요구한다.
  complete(input: { system: string; user: string; maxTokens: number; jsonSchema: Record<string, unknown> }): Promise<string>;
}

export function createLocalProvider(runtime?: LocalModelRuntime | null): LlmProvider {
  return {
    id: "local",
    model: runtime?.modelId ?? "(내장 모델 미설치)",
    available: () => !!runtime?.isReady(),
    async generateJson<T>(req: JsonRequest<T>): Promise<T | null> {
      if (!runtime?.isReady()) return null;
      const text = await runtime.complete({
        system: req.system,
        user: `${req.user}\n\n반드시 JSON 객체 하나로만 답하세요.`,
        maxTokens: req.maxTokens ?? 512,
        jsonSchema: toJsonSchema(req.schema),
      });
      const parsed = parseJsonOutput(text, req.schema);
      // JSON이 깨졌거나 평문이면(초소형 모델에서 흔함) 호출한 쪽이 준 복구 함수로 한 번 더 시도한다.
      if (parsed || !req.plainTextFallback || !text.trim()) return parsed;
      const r = req.schema.safeParse(req.plainTextFallback(text.trim()));
      return r.success ? r.data : null;
    },
  };
}
