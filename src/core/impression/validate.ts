import { LIMITS, MIN_CHARS, type ImpressionArtifact, type ImpressionStep } from "./types";
import { getImpressionWork, sentenceInWork, type GradeBand } from "./works";

const clampStr = (x: unknown, max: number): string =>
  typeof x === "string" ? Array.from(x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")).slice(0, max).join("") : "";
const asRecord = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const asStep = (x: unknown): ImpressionStep => (x === 1 || x === 2 || x === 3 ? x : 1);
const len = (s: string) => Array.from(s.trim()).length;

export function emptyImpression(): ImpressionArtifact {
  return { kind: "impression", step: 1, maxStep: 1, workId: "", sentenceId: "", why: "", life: "" };
}

/**
 * 밖에서 들어온 값을 안전한 형식으로 고친다(글자 수 제한, 작품·문장 확인).
 * 목록에 없는 작품이면 작품과 문장을 비우고, 작품 안에 없는 문장이면 문장을 비운다.
 * 안전 점검(위험 신호·개인 정보)은 이 함수가 아니라 호스트가 글자 수를 자르기 전의 원문에 먼저 한다.
 */
export function sanitizeImpression(raw: unknown, prev?: ImpressionArtifact | null, bands?: readonly GradeBand[]): ImpressionArtifact | null {
  const r = asRecord(raw);
  if (r.kind !== "impression") return null;
  const work = typeof r.workId === "string" ? getImpressionWork(r.workId, bands) : undefined;
  const sentence = work && typeof r.sentenceId === "string" ? sentenceInWork(work, r.sentenceId) : undefined;
  const step = asStep(r.step);
  return {
    kind: "impression",
    step,
    maxStep: Math.max(prev?.maxStep ?? 1, step) as ImpressionStep,
    workId: work?.id ?? "",
    sentenceId: sentence?.id ?? "",
    why: clampStr(r.why, LIMITS.why),
    life: clampStr(r.life, LIMITS.life),
  };
}

/** 제출 전에 꼭 채워야 하는 것 */
export function submitProblems(a: ImpressionArtifact): string[] {
  const out: string[] = [];
  if (!a.workId) out.push("읽을 작품을 골라 주세요.");
  else if (!a.sentenceId) out.push("인상적인 문장을 하나 눌러 골라 주세요.");
  if (len(a.why) < MIN_CHARS.why) out.push(`그 문장이 인상적인 까닭을 ${MIN_CHARS.why}자 이상 써 주세요.`);
  if (len(a.life) < MIN_CHARS.life) out.push(`내 삶과 이어 본 생각을 ${MIN_CHARS.life}자 이상 써 주세요.`);
  return out;
}

