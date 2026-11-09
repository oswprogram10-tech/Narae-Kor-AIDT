// 말하기 준비 도구(토론·면담)의 교사 화면·CSV용 순수 계산. DB·서버 의존 없음.
import { checkDebate, checkInterview, CHECKLIST_ITEMS, type DebateArtifact, type InterviewArtifact } from "@/core/speaking";

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
