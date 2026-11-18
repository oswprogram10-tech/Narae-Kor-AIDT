import { parseJsonOutput, toJsonSchema } from "./json";
import { ProviderError, type FetchLike, type JsonRequest, type LlmProvider } from "./types";

// ChatGPT(OpenAI) Chat Completions API를 표준 fetch로 호출한다(추가 패키지 없음, 어떤 서버 런타임에서도 동작).
// 모델 이름은 계속 바뀌므로 기본값을 두지 않는다. 호스트가 NARAE_OPENAI_MODEL 등으로 지정한다.
export interface OpenAIConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string; // 기본 https://api.openai.com/v1 (호환 서버를 쓸 때 바꿈)
  fetch?: FetchLike;
}

export function createOpenAIProvider(cfg: OpenAIConfig): LlmProvider {
  const model = cfg.model ?? "";
  const base = (cfg.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const doFetch: FetchLike = cfg.fetch ?? ((u, i) => fetch(u, i));
  return {
    id: "openai",
    model,
    available: () => !!cfg.apiKey && !!model,
    async generateJson<T>(req: JsonRequest<T>): Promise<T | null> {
      if (!cfg.apiKey || !model) return null;
      const res = await doFetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model,
          max_completion_tokens: req.maxTokens ?? 2048,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: req.schemaName, strict: true, schema: toJsonSchema(req.schema) },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new ProviderError("openai", res.status, (await res.text()).slice(0, 300));
      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
      };
      const choice = data.choices?.[0];
      if (!choice?.message?.content || choice.message.refusal || choice.finish_reason === "length") return null;
      return parseJsonOutput(choice.message.content, req.schema);
    },
  };
}
