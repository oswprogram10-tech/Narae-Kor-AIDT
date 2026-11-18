import { parseJsonOutput, toJsonSchema } from "./json";
import { ProviderError, type FetchLike, type JsonRequest, type LlmProvider } from "./types";

// Gemini API(generateContent)를 표준 fetch로 호출한다. 모델 이름은 호스트가 NARAE_GEMINI_MODEL 등으로 지정한다.
export interface GeminiConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string; // 기본 https://generativelanguage.googleapis.com/v1beta
  fetch?: FetchLike;
}

export function createGeminiProvider(cfg: GeminiConfig): LlmProvider {
  const model = cfg.model ?? "";
  const base = (cfg.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const doFetch: FetchLike = cfg.fetch ?? ((u, i) => fetch(u, i));

  async function call(req: JsonRequest<unknown>, withSchema: boolean) {
    return doFetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 2048,
          responseMimeType: "application/json",
          ...(withSchema ? { responseJsonSchema: toJsonSchema(req.schema) } : {}),
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
  }

  return {
    id: "gemini",
    model,
    available: () => !!cfg.apiKey && !!model,
    async generateJson<T>(req: JsonRequest<T>): Promise<T | null> {
      if (!cfg.apiKey || !model) return null;
      let res = await call(req, true);
      // 스키마 지정 방식을 지원하지 않는 모델·API 버전이면 스키마 없이 JSON만 요구해 한 번 더 시도한다(결과는 아래에서 검증).
      if (res.status === 400) res = await call(req, false);
      if (!res.ok) throw new ProviderError("gemini", res.status, (await res.text()).slice(0, 300));
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
      };
      if (data.promptFeedback?.blockReason) return null;
      const cand = data.candidates?.[0];
      if (!cand || cand.finishReason === "MAX_TOKENS" || cand.finishReason === "SAFETY") return null;
      const text = (cand.content?.parts ?? []).map((p) => p.text ?? "").join("");
      return text ? parseJsonOutput(text, req.schema) : null;
    },
  };
}
