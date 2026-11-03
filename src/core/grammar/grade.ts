// 문법 문제 채점과 피드백(규칙 기반, AI 없음).

import type { GrammarAnswer, GrammarItem } from "./types";

export type GradeReason =
  | "ok"
  | "wrong-order"
  | "awkward"
  | "missing-blocks"
  | "wrong-position"
  | "wrong-option"
  | "type-mismatch";

export interface GradeResult {
  correct: boolean;
  reason: GradeReason;
}

/** reason이 "awkward"일 때 학생에게 보여 주는 말 */
export const AWKWARD_MESSAGE = "뜻은 통하는 문장이에요. 그런데 조금 어색하게 들려요. '누가'를 앞쪽에 놓아 보면 어떨까요?";

/**
 * 채점. reason "awkward"는 correct:false지만 오답이 아니에요.
 * 호출하는 쪽은 awkward를 틀린 횟수에 넣지 말고, feedbackFor도 부르지 말고 AWKWARD_MESSAGE만 보여 줘야 해요.
 */
export function gradeAnswer(item: GrammarItem, answer: GrammarAnswer): GradeResult {
  if (item.type === "sentence-build") {
    if (answer.type !== "sentence-build") return { correct: false, reason: "type-mismatch" };
    const ids = item.blocks.map((b) => b.id);
    const used = new Set(answer.order);
    const usesAll =
      answer.order.length === ids.length &&
      used.size === ids.length &&
      ids.every((id) => used.has(id));
    if (!usesAll) return { correct: false, reason: "missing-blocks" };
    const hit = item.answers.some((a) => a.length === answer.order.length && a.every((id, i) => id === answer.order[i]));
    if (hit) return { correct: true, reason: "ok" };
    const soft = item.awkward.some((a) => a.length === answer.order.length && a.every((id, i) => id === answer.order[i]));
    return soft ? { correct: false, reason: "awkward" } : { correct: false, reason: "wrong-order" };
  }
  if (answer.type !== "agreement-fix") return { correct: false, reason: "type-mismatch" };
  if (answer.index !== item.wrongIndex) return { correct: false, reason: "wrong-position" };
  if (answer.option !== item.correctOption) return { correct: false, reason: "wrong-option" };
  return { correct: true, reason: "ok" };
}

export interface GrammarFeedback {
  level: "principle" | "hint1" | "hint2" | "reveal";
  message: string;
  reveal?: GrammarAnswer;
}

/** wrongCount: 지금까지 틀린 횟수(이번 오답 포함). 오답 뒤에만 부른다. */
export function feedbackFor(item: GrammarItem, wrongCount: number): GrammarFeedback {
  if (wrongCount <= 1) return { level: "principle", message: item.principle };
  if (wrongCount === 2) return { level: "hint1", message: item.hints[0] };
  if (wrongCount === 3) return { level: "hint2", message: item.hints[1] };
  const reveal: GrammarAnswer =
    item.type === "sentence-build"
      ? { type: "sentence-build", order: [...item.answers[0]] }
      : { type: "agreement-fix", index: item.wrongIndex, option: item.correctOption };
  return { level: "reveal", message: item.explanation, reveal };
}

const PRAISE = ["차근차근 생각해서 잘 찾았어요!", "원리를 떠올려서 잘 해결했어요!", "끝까지 생각해서 잘 찾았어요!"];

/** 정답 뒤 피드백: 노력과 방법을 칭찬하고 설명을 덧붙인다(과장하지 않는다). */
export function correctFeedback(item: GrammarItem): string {
  let sum = 0;
  for (const ch of item.id) sum += ch.charCodeAt(0);
  return `${PRAISE[sum % PRAISE.length]} ${item.explanation}`;
}

/** 학생이 만든 문장을 문자열로 돌려준다. */
export function renderAnswer(item: GrammarItem, answer: GrammarAnswer): string {
  if (item.type === "sentence-build") {
    if (answer.type !== "sentence-build") return "";
    const byId = new Map(item.blocks.map((b) => [b.id, b.text]));
    return `${answer.order.map((id) => byId.get(id) ?? "").join(" ")}.`;
  }
  if (answer.type !== "agreement-fix") return "";
  return item.tokens
    .map((t, i) => (i === answer.index ? (item.options[answer.option] ?? t) : t))
    .join(" ");
}
