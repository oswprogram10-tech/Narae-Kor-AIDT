// 과제 종류별 교사 설정(assignments.settings). 순수 함수라 서버·화면·시험에서 함께 쓴다.
import { DEBATE_STEPS, PRESENTATION_SECONDS_DEFAULT, PRESENTATION_SECONDS_MAX, PRESENTATION_SECONDS_MIN, debateSteps } from "@/core/speaking";

/** 토론 과제: 단계 id → 초(30~300). 적은 단계만 들어 있다. 발표 준비: 목표 시간(초, 60~300). */
export interface AssignmentSettings {
  debateSeconds?: Record<string, number>;
  presentationSeconds?: number;
}

/**
 * 밖에서 들어온 값(저장된 값 포함)을 안전한 토론 시간 설정으로 고친다.
 * 알 수 없는 단계 id·숫자가 아닌 값은 버리고, 나머지는 debateSteps로 30~300초로 자른다. 쓸 값이 없으면 undefined.
 */
export function cleanDebateSeconds(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const given: Record<string, number> = {};
  for (const step of DEBATE_STEPS) {
    const v = (raw as Record<string, unknown>)[step.id];
    if (typeof v === "number" && Number.isFinite(v)) given[step.id] = v;
  }
  if (Object.keys(given).length === 0) return undefined;
  const clamped = debateSteps(given);
  const out: Record<string, number> = {};
  for (const s of clamped) if (s.id in given) out[s.id] = s.seconds;
  return out;
}

/** 저장된 설정에서 토론 시간만 안전하게 꺼낸다. */
export function debateSecondsOf(settings: unknown): Record<string, number> | undefined {
  if (!settings || typeof settings !== "object") return undefined;
  return cleanDebateSeconds((settings as AssignmentSettings).debateSeconds);
}

/** 밖에서 들어온 발표 목표 시간(초)을 60~300초 정수로 자른다. 숫자가 아니면 undefined. */
export function cleanPresentationSeconds(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return Math.min(PRESENTATION_SECONDS_MAX, Math.max(PRESENTATION_SECONDS_MIN, Math.round(raw)));
}

/** 저장된 설정에서 발표 목표 시간(초)을 꺼낸다. 없거나 깨졌으면 기본(180초). */
export function presentationSecondsOf(settings: unknown): number {
  if (!settings || typeof settings !== "object") return PRESENTATION_SECONDS_DEFAULT;
  return cleanPresentationSeconds((settings as AssignmentSettings).presentationSeconds) ?? PRESENTATION_SECONDS_DEFAULT;
}
