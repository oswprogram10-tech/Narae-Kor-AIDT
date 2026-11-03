import "server-only";
import { PROVIDER_IDS, ProviderRegistry, type ProviderId } from "@/core/providers";
import { getLocalModel } from "@/core/local/catalog";

// 레퍼런스 호스트 서버의 AI 설정. API 키는 서버 환경 변수에만 두고 학생 기기로 보내지 않는다.
// 실제 병합 대상 프로그램은 자기 서버의 설정 방식으로 같은 ProviderRegistry를 만들면 된다.

function parseOrder(v: string | undefined): ProviderId[] | undefined {
  if (!v) return undefined;
  const ids = v
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ProviderId => (PROVIDER_IDS as readonly string[]).includes(s));
  return ids.length ? ids : undefined;
}

let registry: ProviderRegistry | null = null;

export function getRegistry(): ProviderRegistry {
  if (registry) return registry;
  const env = process.env;
  const mockOnly = env.NARAE_COACH_MODE === "mock";
  registry = new ProviderRegistry({
    order: parseOrder(env.NARAE_PROVIDER_ORDER),
    // 내장 모델 실행기는 2단계에서 연결한다(지금은 없음 → 자동으로 건너뜀).
    local: null,
    claude: {
      apiKey: mockOnly ? undefined : env.ANTHROPIC_API_KEY,
      model: env.NARAE_CLAUDE_MODEL || env.NARAE_COACH_MODEL,
      coachEffort: (env.NARAE_COACH_EFFORT as "low" | "medium" | "high" | undefined) ?? "low",
    },
    gemini: { apiKey: mockOnly ? undefined : env.GEMINI_API_KEY, model: env.NARAE_GEMINI_MODEL },
    openai: { apiKey: mockOnly ? undefined : env.OPENAI_API_KEY, model: env.NARAE_OPENAI_MODEL, baseUrl: env.NARAE_OPENAI_BASE_URL },
  });
  return registry;
}

export const COACH_DAILY_LIMIT = Number(process.env.NARAE_COACH_DAILY_LIMIT || 30);

// ── 내장 모델(학생 기기에서 실행) 설정 ──
// NARAE_LOCAL_MODEL: 카탈로그 id(gemma-3-1b 등). 비우면 내장 모델을 쓰지 않음
// NARAE_LOCAL_MODEL_BASE_URL: 모델 파일을 둔 경로(기본 /models/ → public/models/<id>/)
// NARAE_LOCAL_MODEL_REMOTE=1: 내장 파일이 없으면 Hugging Face에서 받아 옴(개발·실험용)
export interface LocalModelConfig {
  id: string;
  baseUrl: string;
  allowRemote: boolean;
}

export function getLocalModelConfig(): LocalModelConfig | null {
  const id = process.env.NARAE_LOCAL_MODEL;
  if (!id || !getLocalModel(id)) return null;
  return {
    id,
    baseUrl: process.env.NARAE_LOCAL_MODEL_BASE_URL || "/models/",
    allowRemote: process.env.NARAE_LOCAL_MODEL_REMOTE === "1",
  };
}

// 교사가 과제에 고를 수 있는 AI: 서버에 설정된 외부 AI + (설정되어 있으면) 내장 모델
export function assignableProviders(): ProviderId[] {
  const server = getRegistry().available();
  return getLocalModelConfig() ? ["local", ...server.filter((p) => p !== "local")] : server;
}
