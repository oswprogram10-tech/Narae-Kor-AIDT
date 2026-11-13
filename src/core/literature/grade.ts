// 문학 나래 채점과 피드백. 마음 온도·순서 놓기·내 한 줄만 새로 다루고, 나머지는 읽기 핵심부에 맡긴다.

import { feedbackLevel } from "@/core/practice/feedback";
import {
  EVIDENCE_MESSAGE,
  correctAnswerOf as readingCorrectAnswerOf,
  correctFeedback as readingCorrectFeedback,
  feedbackFor as readingFeedbackFor,
  gradeAnswer as readingGradeAnswer,
  renderAnswer as readingRenderAnswer,
  visibleSentences,
  type GradeReason,
  type ReadingFeedback,
} from "@/core/reading";
import { ownLineCheck } from "./display";
import type { LiteratureAnswer, LiteratureItem, MoodScaleAnswer, MoodScaleItem, SequenceAnswer, SequenceItem } from "./types";

export type LiteratureGradeReason =
  | GradeReason
  /** 마음 온도가 인정 범위 밖 */
  | "wrong-scale"
  /** 순서가 틀림 */
  | "wrong-order";

export interface LiteratureGradeResult {
  correct: boolean;
  reason: LiteratureGradeReason;
  /** "incomplete"·"type-mismatch"·"too-long"은 false(고치라고 안내만 한다) */
  countsAsWrong: boolean;
}

/** reason이 "wrong-scale"일 때 안내 문구 앞에 붙는 말 */
export const WRONG_SCALE_MESSAGE = "마음 온도를 다시 생각해 봐요. 그 장면에서 인물이 한 말이나 행동을 살펴봐요.";

const ok: LiteratureGradeResult = { correct: true, reason: "ok", countsAsWrong: false };
const wrong = (reason: LiteratureGradeReason): LiteratureGradeResult => ({ correct: false, reason, countsAsWrong: true });
const soft = (reason: LiteratureGradeReason): LiteratureGradeResult => ({ correct: false, reason, countsAsWrong: false });
const validIndex = (n: unknown, len: number) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < len;

function gradeMood(item: MoodScaleItem, answer: MoodScaleAnswer): LiteratureGradeResult {
  if (typeof answer.value !== "number" || !Number.isInteger(answer.value) || answer.value < 1 || answer.value > 5) return soft("incomplete");
  if (!validIndex(answer.feeling, item.feelingOptions.length)) return soft("incomplete");
  const ids = new Set(visibleSentences(item).map((s) => s.id));
  if (typeof answer.evidenceId !== "string" || !ids.has(answer.evidenceId)) return soft("incomplete");
  if (answer.value < item.minOk || answer.value > item.maxOk) return wrong("wrong-scale");
  if (answer.feeling !== item.correctFeeling) return wrong("wrong-option");
  return item.evidenceIds.includes(answer.evidenceId) ? ok : wrong("evidence-wrong");
}

function gradeSequence(item: SequenceItem, answer: SequenceAnswer): LiteratureGradeResult {
  const order = answer.order;
  const known = new Set(item.events.map((e) => e.id));
  if (!Array.isArray(order) || order.length !== item.events.length) return soft("incomplete");
  if (order.some((id) => typeof id !== "string" || !known.has(id)) || new Set(order).size !== order.length) return soft("incomplete");
  return order.every((id, i) => id === item.correctOrder[i]) ? ok : wrong("wrong-order");
}

export function gradeLiteratureAnswer(item: LiteratureItem, answer: LiteratureAnswer): LiteratureGradeResult {
  if (item.type === "mood-scale") return answer.type === "mood-scale" ? gradeMood(item, answer) : soft("type-mismatch");
  if (item.type === "sequence") return answer.type === "sequence" ? gradeSequence(item, answer) : soft("type-mismatch");
  if (item.type === "own-line") {
    if (answer.type !== "own-line") return soft("type-mismatch");
    const c = ownLineCheck(typeof answer.text === "string" ? answer.text : "");
    return c.ok ? ok : soft(c.tooLong ? "too-long" : "incomplete");
  }
  if (answer.type === "mood-scale" || answer.type === "sequence" || answer.type === "own-line") return soft("type-mismatch");
  return readingGradeAnswer(item, answer);
}

export interface LiteratureFeedback extends Omit<ReadingFeedback, "reveal"> {
  /** level이 "reveal"일 때만 들어 있다. */
  reveal?: LiteratureAnswer;
}

/** 정답 공개용 정답(마음 온도는 인정 범위의 가운데 값). 내 한 줄·요약 쓰기는 정답이 없다. */
export function correctLiteratureAnswerOf(item: LiteratureItem): LiteratureAnswer {
  if (item.type === "mood-scale") {
    return {
      type: "mood-scale",
      value: Math.ceil((item.minOk + item.maxOk) / 2),
      feeling: item.correctFeeling,
      evidenceId: item.evidenceIds[0],
    };
  }
  if (item.type === "sequence") return { type: "sequence", order: [...item.correctOrder] };
  if (item.type === "own-line" || item.type === "summary-write") throw new Error("이 문제는 정답이 없어요");
  return readingCorrectAnswerOf(item);
}

/** wrongCount: 지금까지 틀린 횟수(이번 오답 포함). countsAsWrong이 true인 결과 뒤에만 부른다. */
export function literatureFeedbackFor(item: LiteratureItem, wrongCount: number, reason?: LiteratureGradeReason): LiteratureFeedback {
  if (item.type === "own-line") return { level: "principle", message: item.principle };
  if (item.type !== "mood-scale" && item.type !== "sequence") {
    return readingFeedbackFor(item, wrongCount, reason === "evidence-wrong" ? "evidence-wrong" : undefined);
  }
  const level = feedbackLevel(wrongCount);
  if (level === "reveal") return { level, message: item.explanation, reveal: correctLiteratureAnswerOf(item) };
  const base = level === "principle" ? item.principle : level === "hint1" ? item.hints[0] : item.hints[1];
  const prefix = reason === "wrong-scale" ? WRONG_SCALE_MESSAGE : reason === "evidence-wrong" ? EVIDENCE_MESSAGE : "";
  return { level, message: prefix ? `${prefix} ${base}` : base };
}

/** 정답 뒤 피드백 */
export function literatureCorrectFeedback(item: LiteratureItem): string {
  if (item.type === "own-line") return `내 느낌을 한 줄로 잘 표현했어요! ${item.explanation}`;
  if (item.type === "mood-scale" || item.type === "sequence") {
    let sum = 0;
    for (const ch of item.id) sum += ch.charCodeAt(0);
    const praise = ["인물의 말과 행동을 살펴서 잘 찾았어요!", "이야기 속 단서를 모아 잘 해결했어요!", "끝까지 차근차근 생각해서 잘 찾았어요!"];
    return `${praise[sum % praise.length]} ${item.explanation}`;
  }
  return readingCorrectFeedback(item);
}

/** 학생의 답(또는 정답)을 읽을 수 있는 글로 돌려준다. */
export function renderLiteratureAnswer(item: LiteratureItem, answer: LiteratureAnswer): string {
  if (item.type === "mood-scale") {
    if (answer.type !== "mood-scale") return "";
    const text = new Map(visibleSentences({ ...item, revealUpTo: undefined }).map((s) => [s.id, s.text]));
    return `${item.character}의 마음 온도: ${answer.value}\n마음: ${item.feelingOptions[answer.feeling] ?? ""}\n(근거) ${text.get(answer.evidenceId) ?? ""}`;
  }
  if (item.type === "sequence") {
    if (answer.type !== "sequence") return "";
    const byId = new Map(item.events.map((e) => [e.id, e.text]));
    return answer.order.map((id, i) => `${i + 1}. ${byId.get(id) ?? ""}`).join("\n");
  }
  if (item.type === "own-line") return answer.type === "own-line" ? answer.text : "";
  if (answer.type === "mood-scale" || answer.type === "sequence" || answer.type === "own-line") return "";
  return readingRenderAnswer(item, answer);
}
