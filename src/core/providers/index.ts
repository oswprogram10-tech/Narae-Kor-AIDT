import { createClaudeProvider, type ClaudeConfig } from "./claude";
import { createGeminiProvider, type GeminiConfig } from "./gemini";
import { createLocalProvider, type LocalModelRuntime } from "./local";
import { createOpenAIProvider, type OpenAIConfig } from "./openai";
import { PROVIDER_IDS, type LlmProvider, type ProviderId } from "./types";

export * from "./types";
export { createClaudeProvider, createGeminiProvider, createLocalProvider, createOpenAIProvider };
export type { ClaudeConfig, GeminiConfig, LocalModelRuntime, OpenAIConfig };

export interface ProviderSetup {
  // 기본 시도 순서. 기본값: 내장 모델 → Claude → Gemini → ChatGPT (끝에는 항상 모의 코치)
  order?: ProviderId[];
  local?: LocalModelRuntime | null;
  claude?: ClaudeConfig;
  gemini?: GeminiConfig;
  openai?: OpenAIConfig;
}

export const DEFAULT_ORDER: ProviderId[] = ["local", "claude", "gemini", "openai"];

export class ProviderRegistry {
  private readonly byId: Map<ProviderId, LlmProvider>;
  readonly order: ProviderId[];

  constructor(setup: ProviderSetup) {
    this.byId = new Map<ProviderId, LlmProvider>([
      ["local", createLocalProvider(setup.local)],
      ["claude", createClaudeProvider(setup.claude ?? {})],
      ["gemini", createGeminiProvider(setup.gemini ?? {})],
      ["openai", createOpenAIProvider(setup.openai ?? {})],
    ]);
    const order = (setup.order ?? DEFAULT_ORDER).filter((p) => PROVIDER_IDS.includes(p));
    this.order = [...new Set(order)];
  }

  static fromProviders(providers: LlmProvider[], order?: ProviderId[]): ProviderRegistry {
    const reg = new ProviderRegistry({ order: order ?? providers.map((p) => p.id) });
    for (const p of providers) reg.byId.set(p.id, p);
    return reg;
  }

  get(id: ProviderId): LlmProvider | undefined {
    return this.byId.get(id);
  }

  // 사용할 수 있는(설정된) AI 목록
  available(): ProviderId[] {
    return this.order.filter((id) => this.byId.get(id)?.available());
  }

  // preferred가 있으면 맨 앞에, 나머지는 기본 순서대로. 설정되지 않은 AI는 뺀다.
  chain(preferred?: ProviderId | "auto" | null): LlmProvider[] {
    const ids = preferred && preferred !== "auto" ? [preferred, ...this.order.filter((x) => x !== preferred)] : this.order;
    return ids.map((id) => this.byId.get(id)).filter((p): p is LlmProvider => !!p && p.available());
  }
}
