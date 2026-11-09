// 말하기 준비 도구(토론·면담)의 교사 화면·CSV용 순수 계산. DB·서버 의존 없음.
import {
  checkDebate,
  checkInterview,
  checkPresentation,
  CHECKLIST_ITEMS,
  SELF_CHECK_ITEMS,
  type DebateArtifact,
  type InterviewArtifact,
  type PresentationArtifact,
} from "@/core/speaking";

export interface DebateStats {
  side: "pro" | "con" | "";
  /** 쓴 근거 수 */
  reasons: number;
  /** 뒷받침 자료까지 쓴 근거 수 */
  withSupport: number;
  /** 출처까지 쓴 근거 수 */
  withSource: number;
  /** 예상 반론을 쓴 수 */
  rebuttals: number;
  /** 지금 점검에 걸리는 경고 수 */
  warnings: number;
}

export function debateStats(a: DebateArtifact): DebateStats {
  const reasons = a.reasons.filter((r) => r.text.trim());
  return {
    side: a.side ?? "",
    reasons: reasons.length,
    withSupport: reasons.filter((r) => r.support.trim()).length,
    withSource: reasons.filter((r) => r.source.trim()).length,
    rebuttals: a.rebuttals.filter((b) => b.expected.trim()).length,
    warnings: checkDebate(a).length,
  };
}

export interface InterviewStats {
  /** 쓴 질문 수 */
  questions: number;
  closedQuestions: number;
  sensitiveQuestions: number;
  checklistDone: number;
  /** 면담 뒤 알게 된 것을 쓴 수 */
  learned: number;
  warnings: number;
}

export function interviewStats(a: InterviewArtifact): InterviewStats {
  const w = checkInterview(a);
  return {
    questions: a.questions.filter((q) => q.text.trim()).length,
    closedQuestions: w.filter((x) => x.kind === "closed-question").length,
    sensitiveQuestions: w.filter((x) => x.kind === "sensitive-question").length,
    checklistDone: CHECKLIST_ITEMS.filter((c) => a.checklist[c.id]).length,
    learned: a.learned.filter((t) => t.trim()).length,
    warnings: w.length,
  };
}

export const DEBATE_CSV_HEADER = ["student_number", "status", "side", "reasons", "with_support", "with_source", "rebuttals", "warnings", "safety_alert"] as const;
export const INTERVIEW_CSV_HEADER = ["student_number", "status", "questions", "closed_questions", "sensitive_questions", "checklist_done", "learned", "warnings", "safety_alert"] as const;

/** 번호·상태·경고 알림을 뺀 가운데 칸들(시작 전이면 모두 빈 칸 대신 0/빈 값) */
export function debateCsvCells(a: DebateArtifact | null): (string | number)[] {
  if (!a) return ["", 0, 0, 0, 0, 0];
  const s = debateStats(a);
  return [s.side, s.reasons, s.withSupport, s.withSource, s.rebuttals, s.warnings];
}

export function interviewCsvCells(a: InterviewArtifact | null): (string | number)[] {
  if (!a) return [0, 0, 0, 0, 0, 0];
  const s = interviewStats(a);
  return [s.questions, s.closedQuestions, s.sensitiveQuestions, s.checklistDone, s.learned, s.warnings];
}

export interface PresentationStats {
  purpose: string;
  /** 자료를 쓴 수(이름이나 핵심 정보가 있는 것) */
  sources: number;
  sourcesWithFrom: number;
  /** 가운데 내용을 쓴 수 */
  points: number;
  pointsWithSource: number;
  /** 보조 매체를 고른 내용 수(없음 제외, 5~6학년만. 3~4학년이면 null) */
  aids: number | null;
  practiceRuns: number;
  lastPractice: number | null;
  targetSeconds: number;
  /** 연습 뒤 돌아보기 5항목 값(0 = 안 함) */
  selfCheck: number[];
  /** 돌아보기 평균(한 항목이라도 했을 때만, 한 것만 평균. 없으면 null) */
  selfCheckAverage: number | null;
  warnings: number;
}

export function presentationStats(a: PresentationArtifact, targetSeconds: number): PresentationStats {
  const sources = a.sources.filter((s) => s.name.trim() || s.keyInfo.trim());
  const points = a.points.filter((p) => p.text.trim());
  const ids = new Set(a.sources.map((s) => s.id));
  const selfCheck = SELF_CHECK_ITEMS.map((i) => a.selfCheck[i.id]);
  const done = selfCheck.filter((v) => v > 0);
  return {
    purpose: a.purpose ?? "",
    sources: sources.length,
    sourcesWithFrom: sources.filter((s) => s.from.trim()).length,
    points: points.length,
    pointsWithSource: points.filter((p) => p.sourceIds.some((i) => ids.has(i))).length,
    aids: a.band === "5-6" ? points.filter((p) => p.aid && p.aid !== "none").length : null,
    practiceRuns: a.practice.length,
    lastPractice: a.practice.length ? a.practice[a.practice.length - 1] : null,
    targetSeconds,
    selfCheck,
    selfCheckAverage: done.length ? Math.round((done.reduce((n, v) => n + v, 0) / done.length) * 10) / 10 : null,
    warnings: checkPresentation(a, targetSeconds).length,
  };
}

export const PRESENTATION_CSV_HEADER = [
  "student_number",
  "status",
  "purpose",
  "sources",
  "sources_with_from",
  "points",
  "points_with_source",
  "aids",
  "practice_runs",
  "last_practice_s",
  "target_s",
  "self_volume",
  "self_pace",
  "self_eyes",
  "self_posture",
  "self_gesture",
  "warnings",
  "safety_alert",
] as const;

/** 번호·상태·경고 알림을 뺀 가운데 칸들. 학생 글 내용은 넣지 않는다. */
export function presentationCsvCells(a: PresentationArtifact | null, targetSeconds: number): (string | number)[] {
  if (!a) return ["", 0, 0, 0, 0, "", 0, "", targetSeconds, "", "", "", "", "", 0];
  const s = presentationStats(a, targetSeconds);
  return [s.purpose, s.sources, s.sourcesWithFrom, s.points, s.pointsWithSource, s.aids ?? "", s.practiceRuns, s.lastPractice ?? "", s.targetSeconds, ...s.selfCheck, s.warnings];
}
