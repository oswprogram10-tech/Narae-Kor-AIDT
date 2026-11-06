// 미디어 나래 채점과 피드백. 검색 실험실만 새로 채점하고, 나머지는 읽기 핵심부에 맡긴다.

import { feedbackLevel } from "@/core/practice/feedback";
import {
  EVIDENCE_MESSAGE,
  correctAnswerOf as readingCorrectAnswerOf,
  correctFeedback as readingCorrectFeedback,
  feedbackFor as readingFeedbackFor,
  gradeAnswer as readingGradeAnswer,
  renderAnswer as readingRenderAnswer,
  type GradeReason,
  type GradeResult,
  type ReadingFeedback,
} from "@/core/reading";
import { searchEvidence } from "./search";
import type { MediaAnswer, MediaItem, SearchTaskAnswer, SearchTaskItem } from "./types";

export type MediaGradeReason =
  | GradeReason
  /** 목적에 맞지 않는 검색어(그 검색어의 결과를 보여 준다) */
  | "wrong-query"
  /** 검색어는 맞았지만 고른 결과가 알맞지 않음 */
  | "wrong-result";

export interface MediaGradeResult {
  correct: boolean;
  reason: MediaGradeReason;
  /** "incomplete"·"type-mismatch"는 false(답을 다 고르라고 안내만 한다) */
  countsAsWrong: boolean;
}

/** reason이 "wrong-query"일 때 안내 문구 앞에 붙는 말 */
export const WRONG_QUERY_MESSAGE = "이 검색어로 찾은 결과를 살펴봐요. 결과가 내 목적과 맞나요?";
/** reason이 "wrong-result"일 때 안내 문구 앞에 붙는 말 */
export const WRONG_RESULT_MESSAGE = "검색어는 알맞아요. 이제 목적에 가장 잘 맞고 믿을 만한 결과를 다시 골라 봐요.";

const ok: MediaGradeResult = { correct: true, reason: "ok", countsAsWrong: false };
const wrong = (reason: MediaGradeReason): MediaGradeResult => ({ correct: false, reason, countsAsWrong: true });
const soft = (reason: MediaGradeReason): MediaGradeResult => ({ correct: false, reason, countsAsWrong: false });
const validIndex = (n: unknown, len: number) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < len;

function gradeSearch(item: SearchTaskItem, answer: SearchTaskAnswer): MediaGradeResult {
  if (!validIndex(answer.query, item.queries.length)) return soft("incomplete");
  if (answer.query !== item.correctQuery) return wrong("wrong-query");
  const results = item.queries[item.correctQuery].results;
  if (answer.result === undefined || !validIndex(answer.result, results.length)) return soft("incomplete");
  if (answer.result !== item.correctResult) return wrong("wrong-result");
  // 근거는 정답 결과의 보이는 칸 안에서만 인정한다.
  const fields = new Set(searchEvidence(results[answer.result]).map((f) => f.id));
  if (answer.evidenceId === undefined || !fields.has(answer.evidenceId)) return soft("incomplete");
  return item.evidenceIds.includes(answer.evidenceId) ? ok : wrong("evidence-wrong");
}

export function gradeMediaAnswer(item: MediaItem, answer: MediaAnswer): MediaGradeResult {
  if (item.type === "search-task") {
    return answer.type === "search-task" ? gradeSearch(item, answer) : soft("type-mismatch");
  }
  if (answer.type === "search-task") return soft("type-mismatch");
  const r: GradeResult = readingGradeAnswer(item, answer);
  return r;
}

export interface MediaFeedback extends Omit<ReadingFeedback, "reveal"> {
  /** level이 "reveal"일 때만 들어 있다. */
  reveal?: MediaAnswer;
}

/** 정답 공개용 정답 */
export function correctMediaAnswerOf(item: MediaItem): MediaAnswer {
  if (item.type === "search-task") {
    return {
      type: "search-task",
      query: item.correctQuery,
      result: item.correctResult,
      evidenceId: item.evidenceIds[0],
    };
  }
  if (item.type === "summary-write") throw new Error("요약 쓰기는 정답이 없어요");
  return readingCorrectAnswerOf(item);
}

/** wrongCount: 지금까지 틀린 횟수(이번 오답 포함). countsAsWrong이 true인 결과 뒤에만 부른다. */
export function mediaFeedbackFor(item: MediaItem, wrongCount: number, reason?: MediaGradeReason): MediaFeedback {
  if (item.type !== "search-task") {
    return readingFeedbackFor(item, wrongCount, reason === "evidence-wrong" ? "evidence-wrong" : undefined);
  }
  const level = feedbackLevel(wrongCount);
  if (level === "reveal") return { level, message: item.explanation, reveal: correctMediaAnswerOf(item) };
  const base = level === "principle" ? item.principle : level === "hint1" ? item.hints[0] : item.hints[1];
  const prefix =
    reason === "wrong-query" ? WRONG_QUERY_MESSAGE
    : reason === "wrong-result" ? WRONG_RESULT_MESSAGE
    : reason === "evidence-wrong" ? EVIDENCE_MESSAGE
    : "";
  return { level, message: prefix ? `${prefix} ${base}` : base };
}

/** 정답 뒤 피드백 */
export function mediaCorrectFeedback(item: MediaItem): string {
  if (item.type !== "search-task") return readingCorrectFeedback(item);
  let sum = 0;
  for (const ch of item.id) sum += ch.charCodeAt(0);
  const praise = ["검색어와 결과를 차근차근 살펴서 잘 찾았어요!", "단서를 모아 믿을 만한 결과를 잘 골랐어요!", "목적을 떠올리며 끝까지 잘 찾았어요!"];
  return `${praise[sum % praise.length]} ${item.explanation}`;
}

/** 학생의 답(또는 정답)을 읽을 수 있는 글로 돌려준다. */
export function renderMediaAnswer(item: MediaItem, answer: MediaAnswer): string {
  if (item.type !== "search-task") return answer.type === "search-task" ? "" : readingRenderAnswer(item, answer);
  if (answer.type !== "search-task") return "";
  const q = item.queries[answer.query];
  if (!q) return "";
  const lines = [`검색어: ${q.text}`];
  const r = answer.result === undefined ? undefined : q.results[answer.result];
  if (r) {
    lines.push(`결과: ${r.title}`);
    const f = searchEvidence(r).find((x) => x.id === answer.evidenceId);
    if (f) lines.push(`(근거) ${f.text}`);
  }
  return lines.join("\n");
}

