// 읽기 문제 채점과 피드백(규칙 기반, AI 없음). 찍기 방지 단계는 문법 활동과 같다.

import { feedbackLevel, type FeedbackLevel } from "@/core/practice/feedback";
import { itemPassages, visibleSentences } from "./passages";
import { evaluateSummary } from "./summary";
import type { ReadingAnswer, ReadingItem, SummaryWriteItem } from "./types";

/** 정답이 있는 문제(요약 쓰기는 정답이 없다) */
type KeyedItem = Exclude<ReadingItem, SummaryWriteItem>;

export type GradeReason =
  | "ok"
  | "wrong-option"
  | "wrong-sentence"
  | "wrong-labels"
  | "wrong-slots"
  /** 요약 쓰기: 고쳐 쓰기를 안내하는 사유(오답이 아니라 아직 다 안 쓴 것) */
  | "too-short"
  | "missing-paragraph"
  | "copied"
  | "too-long"
  /** 보기는 맞았지만 근거 문장이 틀림 */
  | "evidence-wrong"
  /** 아직 다 고르지 않음(꼬리표·칸·보기·근거 비어 있음, 지문에 없는 문장 id 등) */
  | "incomplete"
  | "type-mismatch";

export interface GradeResult {
  correct: boolean;
  reason: GradeReason;
  /**
   * 틀린 횟수에 넣을지. "incomplete"와 "type-mismatch"는 false(답을 다 고르라고 안내만 한다).
   * "evidence-wrong"은 true: 오답 횟수는 다른 오답과 똑같이 세어 힌트가 한 단계씩 나아가고,
   * 안내 문구만 EVIDENCE_MESSAGE를 앞에 붙여 다르게 보여 준다.
   */
  countsAsWrong: boolean;
}

/** reason이 "incomplete"일 때 학생에게 보여 주는 말 */
export const INCOMPLETE_MESSAGE = "아직 다 고르지 않았어요. 빠뜨린 곳이 없는지 살펴봐요.";

/** reason이 "evidence-wrong"일 때 안내 문구 앞에 붙는 말 */
export const EVIDENCE_MESSAGE = "답은 맞았어요. 지문에서 그렇게 생각한 문장을 다시 찾아봐요.";

const ok: GradeResult = { correct: true, reason: "ok", countsAsWrong: false };
const wrong = (reason: GradeReason): GradeResult => ({ correct: false, reason, countsAsWrong: true });
const soft = (reason: GradeReason): GradeResult => ({ correct: false, reason, countsAsWrong: false });

const validOption = (n: number, len: number) => Number.isInteger(n) && n >= 0 && n < len;

export function gradeAnswer(item: ReadingItem, answer: ReadingAnswer): GradeResult {
  if (answer.type !== item.type) return soft("type-mismatch");
  const passages = itemPassages(item);
  if (passages.length === 0 || passages.length !== (item.passageIds ?? [item.passageId]).length) return soft("incomplete");
  if (item.type === "summary-write" && answer.type === "summary-write") {
    // 요약은 정답/오답이 아니라 고쳐 쓰기다. 안전 점검(summaryGate)은 호스트가 먼저 한다.
    const r = evaluateSummary(item, answer.text);
    return r.done ? ok : wrong(r.reason);
  }
  // 근거·고를 문장은 학생에게 보이는 문장 안에서만(지문 쌍이면 둘 다, 문단을 차례로 펼치면 펼친 문단까지)
  const sentenceIds = new Set(visibleSentences(item).map((s) => s.id));

  if (item.type === "sentence-pick" && answer.type === "sentence-pick") {
    if (!sentenceIds.has(answer.sentenceId)) return soft("incomplete");
    return item.correctSentenceIds.includes(answer.sentenceId) ? ok : wrong("wrong-sentence");
  }
  if (item.type === "label-sentences" && answer.type === "label-sentences") {
    const given = item.sentenceIds.map((id) => answer.labels[id]);
    if (given.some((l) => l === undefined || !item.labels.includes(l))) return soft("incomplete");
    return item.sentenceIds.every((id) => answer.labels[id] === item.answers[id]) ? ok : wrong("wrong-labels");
  }
  if (item.type === "slot-paragraphs" && answer.type === "slot-paragraphs") {
    const slotIds = new Set(item.slots.map((s) => s.id));
    const given = item.paragraphIds.map((id) => answer.placement[id]);
    if (given.some((s) => s === undefined || !slotIds.has(s))) return soft("incomplete");
    const hit = item.slots.every((slot) => slot.paragraphIds.every((pid) => answer.placement[pid] === slot.id));
    return hit ? ok : wrong("wrong-slots");
  }
  if (item.type === "choice" && answer.type === "choice") {
    if (!validOption(answer.option, item.options.length)) return soft("incomplete");
    return answer.option === item.correctOption ? ok : wrong("wrong-option");
  }
  if (item.type === "choice-with-evidence" && answer.type === "choice-with-evidence") {
    if (!validOption(answer.option, item.options.length) || !sentenceIds.has(answer.sentenceId)) return soft("incomplete");
    if (answer.option !== item.correctOption) return wrong("wrong-option");
    return item.evidenceIds.includes(answer.sentenceId) ? ok : wrong("evidence-wrong");
  }
  return soft("type-mismatch");
}

export interface ReadingFeedback {
  level: FeedbackLevel;
  message: string;
  /** level이 "reveal"일 때만 들어 있다. 그 전에는 어떤 문장이 틀렸는지도 알려 주지 않는다. */
  reveal?: ReadingAnswer;
}

/** 정답 공개용 정답 */
export function correctAnswerOf(item: KeyedItem): ReadingAnswer {
  switch (item.type) {
    case "sentence-pick":
      return { type: "sentence-pick", sentenceId: item.correctSentenceIds[0] };
    case "label-sentences":
      return { type: "label-sentences", labels: { ...item.answers } };
    case "slot-paragraphs": {
      const placement: Record<string, string> = {};
      for (const slot of item.slots) for (const pid of slot.paragraphIds) placement[pid] = slot.id;
      return { type: "slot-paragraphs", placement };
    }
    case "choice":
      return { type: "choice", option: item.correctOption };
    case "choice-with-evidence":
      return { type: "choice-with-evidence", option: item.correctOption, sentenceId: item.evidenceIds[0] };
  }
}

/**
 * wrongCount: 지금까지 틀린 횟수(이번 오답 포함). countsAsWrong이 true인 결과 뒤에만 부른다.
 * reason에 "evidence-wrong"을 넘기면 정답 공개 전까지 안내 문구 앞에 EVIDENCE_MESSAGE가 붙는다.
 */
export function feedbackFor(item: ReadingItem, wrongCount: number, reason?: GradeReason): ReadingFeedback {
  // 요약 쓰기는 단계별 힌트를 쓰지 않는다(summaryFeedback이 따로 안내한다).
  if (item.type === "summary-write") return { level: "principle", message: item.principle };
  const level = feedbackLevel(wrongCount);
  if (level === "reveal") return { level, message: item.explanation, reveal: correctAnswerOf(item) };
  const base = level === "principle" ? item.principle : level === "hint1" ? item.hints[0] : item.hints[1];
  return { level, message: reason === "evidence-wrong" ? `${EVIDENCE_MESSAGE} ${base}` : base };
}

const PRAISE = ["차근차근 읽고 잘 찾았어요!", "글에서 단서를 모아 잘 해결했어요!", "끝까지 생각해서 잘 찾았어요!"];

/** 정답 뒤 피드백: 노력과 방법을 칭찬하고 설명을 덧붙인다(과장하지 않는다). */
export function correctFeedback(item: ReadingItem): string {
  let sum = 0;
  for (const ch of item.id) sum += ch.charCodeAt(0);
  return `${PRAISE[sum % PRAISE.length]} ${item.explanation}`;
}

/** 학생의 답(또는 정답)을 읽을 수 있는 글로 돌려준다. */
export function renderAnswer(item: ReadingItem, answer: ReadingAnswer): string {
  if (item.type === "summary-write") return answer.type === "summary-write" ? answer.text : "";
  const passage = itemPassages(item)[0];
  const text = new Map(visibleSentences({ ...item, revealUpTo: undefined }).map((s) => [s.id, s.text]));
  if (item.type === "sentence-pick") {
    return answer.type === "sentence-pick" ? (text.get(answer.sentenceId) ?? "") : "";
  }
  if (item.type === "label-sentences") {
    if (answer.type !== "label-sentences") return "";
    return item.sentenceIds.map((id) => `${text.get(id) ?? ""} → ${answer.labels[id] ?? "?"}`).join("\n");
  }
  if (item.type === "slot-paragraphs") {
    if (answer.type !== "slot-paragraphs") return "";
    const num = (pid: string) => `${(passage?.paragraphs.findIndex((p) => p.id === pid) ?? -1) + 1}문단`;
    return item.slots
      .map((slot) => {
        const placed = item.paragraphIds.filter((pid) => answer.placement[pid] === slot.id).map(num);
        return `${slot.label}: ${placed.length ? placed.join(", ") : "-"}`;
      })
      .join("\n");
  }
  if (item.type === "choice") {
    return answer.type === "choice" ? (item.options[answer.option] ?? "") : "";
  }
  if (answer.type !== "choice-with-evidence") return "";
  return `${item.options[answer.option] ?? ""}\n(근거) ${text.get(answer.sentenceId) ?? ""}`;
}
