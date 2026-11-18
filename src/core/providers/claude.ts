import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ProviderError, type JsonRequest, type LlmProvider } from "./types";

export interface ClaudeConfig {
  apiKey?: string;
  // 결정 7(저렴한 모델)에 따라 기본값은 가장 저렴한 현행 모델
  model?: string;
  coachEffort?: "low" | "medium" | "high";
}

export const CLAUDE_DEFAULT_MODEL = "claude-haiku-5-5";

export function createClaudeProvider(cfg: ClaudeConfig): LlmProvider {
  const model = cfg.model || CLAUDE_DEFAULT_MODEL;
  let client: Anthropic | null = null;
  return {
    id: "claude",
    model,
    available: () => !!cfg.apiKey,
    async generateJson<T>(req: JsonRequest<T>): Promise<T | null> {
      if (!cfg.apiKey) return null;
      client ??= new Anthropic({ apiKey: cfg.apiKey, timeout: 30_000, maxRetries: 1 });
      try {
        const res = await client.messages.parse({
          model,
          max_tokens: req.maxTokens ?? 2048,
          system: req.system,
          output_config: {
            effort: req.purpose === "coach" ? (cfg.coachEffort ?? "low") : "medium",
            format: zodOutputFormat(req.schema),
          },
          messages: [{ role: "user", content: req.user }],
        });
        if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
        return (res.parsed_output as T | null) ?? null;
      } catch (err) {
        if (err instanceof Anthropic.APIError) throw new ProviderError("claude", err.status ?? null, err.message);
        throw err;
      }
    },
  };
}
