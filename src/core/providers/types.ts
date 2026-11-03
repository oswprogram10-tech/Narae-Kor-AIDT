import type { z } from "zod";

// 모듈이 쓸 수 있는 AI. local = 모듈에 내장한 초소형 모델(2단계에서 연결), mock = 규칙 기반 모의 코치.
export const PROVIDER_IDS = ["local", "claude", "gemini", "openai"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_LABELS: Record<ProviderId | "mock", string> = {
  local: "내장 모델",
  claude: "Claude",
  gemini: "Gemini",
  openai: "ChatGPT",
  mock: "모의 코치",
};

export interface JsonRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaName: string;
  purpose: "coach" | "rubric";
  maxTokens?: number;
}

// 모든 AI가 따르는 공통 규약: 정해진 형식(JSON 스키마)의 결과를 돌려주거나, 못 하면 null.
// 네트워크·인증 오류는 예외로 던지고, 엔진이 다음 AI로 넘어간다.
export interface LlmProvider {
  readonly id: ProviderId;
  readonly model: string;
  available(): boolean;
  generateJson<T>(req: JsonRequest<T>): Promise<T | null>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly status: number | null,
    message: string,
  ) {
    super(`[${provider}] ${message}`);
  }
}
