import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  INCOMPLETE_MESSAGE,
  SUMMARY_HELP_AFTER,
  evaluateSummary,
  summaryFeedback,
  summaryGate,
  type SummaryReason,
  type SummaryWriteItem,
} from "@/core/reading";
import {
  gradeMediaAnswer,
  mediaCorrectFeedback,
  mediaFeedbackFor,
  renderMediaAnswer,
  type MediaAnswer,
  type MediaItem,
} from "@/core/media";
import {
  OWN_LINE_MAX,
  RELATION_MAIN,
  correctLiteratureAnswerOf,
  gradeLiteratureAnswer,
  literatureCorrectFeedback,
  literatureFeedbackFor,
  moodGraph,
  ownLineCheck,
  relationEdges,
  renderLiteratureAnswer,
  type LiteratureAnswer,
  type LiteratureGradeReason,
  type OwnLineItem,
} from "@/core/literature";
import {
  isItemUnlocked,
  isProgressiveActivity,
  searchViewFor,
  studentReadingView,
  toDisplayAnswer,
  type LiteratureExtras,
  type ReadingView,
  type StudentSearchView,
} from "@/lib/reading-rules";
import { activityItemsOf, isLiteratureItem, type HostItem } from "@/lib/activities";
import { logEvent } from "@/lib/events";
import { attemptsFor } from "@/lib/grammar";
import {
  progressSummary,
  SAFETY_REASONS,
  summarizeAttempts,
  wrongAttemptCount,
  type HintLevel,
  type ItemProgress,
  type ProgressSummary,
} from "@/lib/grammar-rules";

/** 읽기·매체·문학 활동의 문제(매체의 검색 실험실 문제, 문학의 마음 온도·순서 놓기·내 한 줄 포함) */
export function readingActivityItems(activityId: string | null): HostItem[] {
  return activityItemsOf(activityId);
}

type HostAnswer = MediaAnswer | LiteratureAnswer;
type HostGrade = { correct: boolean; reason: string; countsAsWrong: boolean };

// 문학 은행의 문제는 문학 채점·안내를, 나머지는 매체(=읽기+검색) 채점·안내를 쓴다. 문제는 한쪽에만 속하므로 답 형식도 그쪽이다.
const gradeHost = (item: HostItem, answer: HostAnswer): HostGrade =>
  isLiteratureItem(item) ? gradeLiteratureAnswer(item, answer as LiteratureAnswer) : gradeMediaAnswer(item as MediaItem, answer as MediaAnswer);
const renderHost = (item: HostItem, answer: HostAnswer): string =>
  isLiteratureItem(item) ? renderLiteratureAnswer(item, answer as LiteratureAnswer) : renderMediaAnswer(item as MediaItem, answer as MediaAnswer);
const correctFeedbackHost = (item: HostItem): string =>
  isLiteratureItem(item) ? literatureCorrectFeedback(item) : mediaCorrectFeedback(item as MediaItem);
function feedbackHost(item: HostItem, wrongCount: number, reason: string): { level: HintLevel; message: string; reveal?: HostAnswer } {
  return isLiteratureItem(item)
    ? literatureFeedbackFor(item, wrongCount, reason as LiteratureGradeReason)
    : mediaFeedbackFor(item as MediaItem, wrongCount, reason as Parameters<typeof mediaFeedbackFor>[2]);
}

/**
 * 문학 활동의 마음 그래프·관계도 재료를 계산한다. 푼 문제만 담는다(아직 안 푼 문제의 값·관계는 알려 주지 않는다).
 * 마음 그래프 값은 맞힌 시도에서 학생이 고른 값이고, 정답을 보고 넘어간 문제는 공개된 정답 값이다.
 */
export async function literatureExtras(submissionId: number, activityId: string | null): Promise<LiteratureExtras> {
  const items = readingActivityItems(activityId).filter(isLiteratureItem);
  const rows = await attemptsFor([submissionId]);
  const prog = summarizeAttempts(items.map((i) => i.id), rows);
  const solvedIds = new Set(prog.filter((p) => p.solved).map((p) => p.itemId));
  const answers: Record<string, LiteratureAnswer | undefined> = {};
  for (const item of items) {
    if (item.type !== "mood-scale" || !solvedIds.has(item.id)) continue;
    const mine = rows.filter((r) => r.itemId === item.id && !SAFETY_REASONS.has(r.reason ?? "")).sort((a, b) => a.attemptNo - b.attemptNo);
    const correct = mine.find((r) => r.correct);
    answers[item.id] = correct ? (correct.answer as LiteratureAnswer) : correctLiteratureAnswerOf(item);
  }
  return { mood: moodGraph(items, answers), relations: { main: RELATION_MAIN, edges: relationEdges(solvedIds) } };
}

/** 검색 실험실에서 1단계(검색어만 골랐을 때) 알맞은 검색어의 결과를 보여 주며 하는 안내 */
export const SEARCH_PICK_MESSAGE = "이 검색어로 찾은 결과예요. 목적에 가장 알맞고 믿을 만한 결과를 하나 고른 뒤, 그렇게 생각한 까닭이 되는 부분을 눌러 보세요.";

/** 한 제출물의 문제별 진행 상황. */
export async function readingProgress(submissionId: number, activityId: string | null): Promise<ItemProgress[]> {
  const items = readingActivityItems(activityId);
  const rows = await attemptsFor([submissionId]);
  return summarizeAttempts(items.map((i) => i.id), rows);
}

/** 요약 쓰기 한 번의 점검 결과(학생 화면에 보낸다. 핵심 낱말·문단 내용은 들어 있지 않다). */
export interface SummaryOutcome {
  done: boolean;
  coverage: number;
  covered: number;
  total: number;
  /** 빠진 문단 번호 */
  missing: number[];
  copied: boolean;
  length: number;
  reason: SummaryReason | "submit-as-is";
  /** 이번을 포함해 점검받은 횟수 */
  tries: number;
  /** 여러 번 고쳐 써도 안 될 때 '선생님께 그대로 내기'를 보여 준다 */
  canSubmitAsIs: boolean;
  submittedAsIs: boolean;
}

/** 위험 신호·개인 정보로 요약을 점검하지 않고 안내만 한 경우 */
export type SummarySafety = "distress" | "personal_info";

export type ReadingOutcome =
  | { status: 409 | 404; error: string }
  | {
      status: 200;
      correct: boolean;
      /** 아직 다 고르지 않음: 시도로 기록하지 않고 틀린 횟수에도 넣지 않는다 */
      incomplete?: boolean;
      message?: string;
      rendered: string;
      feedback?: { level: HintLevel; message: string; reveal?: { answer: HostAnswer; rendered: string } };
      explanation?: string;
      progress: ProgressSummary;
      summary?: SummaryOutcome;
      /** 요약에 위험 신호·개인 정보가 있어 점검 없이 안내만 함(교사에게 알림이 간다) */
      safety?: SummarySafety;
      /**
       * 검색 실험실: 학생이 고른 검색어의 결과(표시 순서). 알맞지 않은 검색어를 골랐을 때 그 검색어의 결과,
       * 알맞은 검색어인데 결과를 아직 안 골랐을 때와 정답 공개 때는 알맞은 검색어의 결과.
       */
      search?: StudentSearchView;
      /** 문단을 차례로 펼치는 활동에서 문제를 풀었을 때: 다음에 보일 문제와 지문 */
      view?: Pick<ReadingView, "items" | "passages">;
      /** 문학 활동에서 마음 온도·관계 문제를 풀었을 때: 마음 그래프·관계도 재료 */
      literature?: LiteratureExtras;
    };

type Submission = typeof schema.submissions.$inferSelect;

export async function recordReadingAnswer(
  submission: Submission,
  activityId: string | null,
  studentId: number,
  item: HostItem,
  answer: HostAnswer,
): Promise<ReadingOutcome> {
  const db = await getDb();
  const prev = await db
    .select()
    .from(schema.grammarAttempts)
    .where(and(eq(schema.grammarAttempts.submissionId, submission.id), eq(schema.grammarAttempts.itemId, item.id)));
  if (prev.some((p) => p.correct || p.feedbackLevel === "reveal")) {
    return { status: 409, error: "이미 푼 문제예요." };
  }
  if (activityId && isProgressiveActivity(activityId)) {
    const solved = new Set((await readingProgress(submission.id, activityId)).filter((x) => x.solved).map((x) => x.itemId));
    if (!isItemUnlocked(activityId, item.id, solved)) return { status: 409, error: "앞 문제를 먼저 풀어 주세요." };
  }
  if (item.type === "summary-write") {
    return recordSummary(submission, activityId, studentId, item, answer as MediaAnswer, prev);
  }
  if (item.type === "own-line") {
    return recordOwnLine(submission, activityId, studentId, item, answer, prev);
  }
  const result = gradeHost(item, answer);
  const rendered = renderHost(item, answer);

  if (!result.correct && !result.countsAsWrong) {
    // 다 고르지 않았거나 형식이 맞지 않음: 안내만 하고 기록하지 않는다.
    const summary = progressSummary(await readingProgress(submission.id, activityId));
    // 검색 실험실: 알맞은 검색어를 골랐지만 결과를 아직 안 골랐으면 그 검색어의 결과를 보여 준다(틀린 횟수에 넣지 않는다).
    if (item.type === "search-task" && answer.type === "search-task" && answer.result === undefined && answer.query === item.correctQuery) {
      const search = searchViewFor(item, item.correctQuery);
      if (search) {
        return { status: 200, correct: false, incomplete: true, message: SEARCH_PICK_MESSAGE, rendered, progress: summary, search };
      }
    }
    return { status: 200, correct: false, incomplete: true, message: INCOMPLETE_MESSAGE, rendered, progress: summary };
  }

  let level: HintLevel | null = null;
  let feedback: { level: HintLevel; message: string; reveal?: { answer: HostAnswer; rendered: string } } | undefined;
  let search: StudentSearchView | undefined;
  let solved = result.correct;
  if (!result.correct) {
    const wrongCount = wrongAttemptCount(prev.map((p) => p.reason)) + 1;
    const fb = feedbackHost(item, wrongCount, result.reason);
    level = fb.level;
    feedback = {
      level: fb.level,
      message: fb.message,
      reveal: fb.reveal ? { answer: toDisplayAnswer(item, fb.reveal), rendered: renderHost(item, fb.reveal) } : undefined,
    };
    if (fb.level === "reveal") solved = true;
    if (item.type === "search-task" && answer.type === "search-task" && (fb.level === "reveal" || result.reason === "wrong-query")) {
      // 알맞지 않은 검색어: 그 검색어의 결과를 실제로 보여 준다. 정답 공개: 알맞은 검색어의 결과(정답·근거 칸을 표시하려고).
      search = searchViewFor(item, fb.level === "reveal" ? item.correctQuery : answer.query);
    }
  }

  // 저장하는 답(answer)은 원래 보기 번호(섞기 전)
  await db.insert(schema.grammarAttempts).values({
    submissionId: submission.id,
    itemId: item.id,
    attemptNo: prev.length + 1,
    correct: result.correct,
    reason: result.reason,
    feedbackLevel: level,
    answer,
  });
  await logEvent(`student:${studentId}`, "reading_answer", "submission", submission.id, {
    itemId: item.id,
    correct: result.correct,
    level,
  });

  const { summary, view } = await touchSubmission(submission, activityId, solved);
  // 문학: 마음 온도·관계 문제를 풀면 그래프·관계도 재료를 함께 보낸다
  const literature =
    solved && isLiteratureItem(item) && (item.type === "mood-scale" || relationEdges([item.id]).length > 0)
      ? await literatureExtras(submission.id, activityId)
      : undefined;

  return {
    status: 200,
    correct: result.correct,
    rendered,
    feedback,
    explanation: result.correct ? correctFeedbackHost(item) : solved ? item.explanation : undefined,
    progress: summary,
    ...(search ? { search } : {}),
    ...(view ? { view } : {}),
    ...(literature ? { literature } : {}),
  };
}

/** 시도를 기록한 뒤: 진행 요약을 다시 세고, 모두 풀었으면 제출 처리. 문단을 차례로 펼치는 활동이면 다음 화면(문제·지문)도 계산한다. */
async function touchSubmission(submission: Submission, activityId: string | null, justSolved: boolean) {
  const db = await getDb();
  const prog = await readingProgress(submission.id, activityId);
  const summary = progressSummary(prog);
  const now = new Date();
  if (summary.total > 0 && summary.solved === summary.total) {
    await db
      .update(schema.submissions)
      .set({ status: "submitted", submittedAt: submission.submittedAt ?? now, updatedAt: now })
      .where(eq(schema.submissions.id, submission.id));
  } else {
    await db.update(schema.submissions).set({ updatedAt: now }).where(eq(schema.submissions.id, submission.id));
  }
  let view: Pick<ReadingView, "items" | "passages"> | undefined;
  if (justSolved && activityId) {
    const v = studentReadingView(activityId, new Set(prog.filter((p) => p.solved).map((p) => p.itemId)));
    if (v.progressive) view = { items: v.items, passages: v.passages };
  }
  return { summary, view };
}

type PrevAttempt = { reason: string; correct: boolean; feedbackLevel: string | null };

/**
 * 내 한 줄 쓰기: 채점하지 않는다. 비어 있지 않고 60자 안이면 '다 했어요'.
 * 요약 쓰기와 같은 안전 경로: 위험 신호는 돌봄 안내 + 교사 알림(글을 남겨 교사가 맥락을 봄),
 * 개인 정보는 안내만 하고 글은 어디에도 저장하지 않는다.
 */
async function recordOwnLine(
  submission: Submission,
  activityId: string | null,
  studentId: number,
  item: OwnLineItem,
  answer: HostAnswer,
  prev: PrevAttempt[],
): Promise<ReadingOutcome> {
  const db = await getDb();
  if (answer.type !== "own-line") return { status: 409, error: "답을 다시 확인해 주세요." };
  const text = answer.text.trim();
  if (text.length === 0) {
    const progress = progressSummary(await readingProgress(submission.id, activityId));
    return { status: 200, correct: false, incomplete: true, message: "먼저 한 줄을 써 보세요.", rendered: "", progress };
  }

  // 안전 점검이 먼저다: 글이 길어도(60자를 넘어도) 위험 신호·개인 정보는 놓치지 않는다.
  const gate = summaryGate(text);
  if (gate.kind) {
    await db.insert(schema.grammarAttempts).values({
      submissionId: submission.id,
      itemId: item.id,
      attemptNo: prev.length + 1,
      correct: false,
      reason: gate.kind,
      feedbackLevel: null,
      answer: { type: "own-line", text: gate.kind === "distress" ? text : "", safety: gate.kind },
    });
    await logEvent(`student:${studentId}`, "reading_answer", "submission", submission.id, { itemId: item.id, safety: gate.kind });
    await db.update(schema.submissions).set({ updatedAt: new Date() }).where(eq(schema.submissions.id, submission.id));
    const progress = progressSummary(await readingProgress(submission.id, activityId));
    return { status: 200, correct: false, safety: gate.kind, message: gate.reply, rendered: "", progress };
  }

  // 안전한 글이 60자를 넘으면 too-long: 고쳐 쓰라고 안내만 하고 기록하지 않으며 틀린 횟수에도 넣지 않는다.
  if (ownLineCheck(text).tooLong) {
    const progress = progressSummary(await readingProgress(submission.id, activityId));
    return { status: 200, correct: false, incomplete: true, message: `${OWN_LINE_MAX}자 안으로 줄여 써 볼까요?`, rendered: "", progress };
  }

  await db.insert(schema.grammarAttempts).values({
    submissionId: submission.id,
    itemId: item.id,
    attemptNo: prev.length + 1,
    correct: true,
    reason: "ok",
    feedbackLevel: null,
    answer: { type: "own-line", text },
  });
  await logEvent(`student:${studentId}`, "reading_answer", "submission", submission.id, { itemId: item.id, correct: true, level: null });
  const { summary: progress, view } = await touchSubmission(submission, activityId, true);
  return {
    status: 200,
    correct: true,
    rendered: text,
    explanation: literatureCorrectFeedback(item),
    progress,
    ...(view ? { view } : {}),
  };
}

/**
 * 요약 쓰기: 정답/오답이 아니라 고쳐 쓰기. 제출할 때마다 (1) 위험 신호·개인 정보를 먼저 확인하고,
 * (2) 걸리지 않으면 문단 반영·베껴 쓰기·길이를 규칙으로 점검한다. 시도마다 기록한다.
 */
async function recordSummary(
  submission: Submission,
  activityId: string | null,
  studentId: number,
  item: SummaryWriteItem,
  answer: MediaAnswer,
  prev: PrevAttempt[],
): Promise<ReadingOutcome> {
  const db = await getDb();
  if (answer.type !== "summary-write") return { status: 409, error: "답을 다시 확인해 주세요." };
  const text = answer.text;
  if (text.length === 0) {
    const progress = progressSummary(await readingProgress(submission.id, activityId));
    return { status: 200, correct: false, incomplete: true, message: "먼저 요약을 써 보세요.", rendered: "", progress };
  }

  const gate = summaryGate(text);
  if (gate.kind) {
    // 점검하지 않는다. 힘든 일 언급은 글을 남겨 교사가 맥락을 보게 하고, 개인 정보는 글 자체를 남기지 않는다.
    await db.insert(schema.grammarAttempts).values({
      submissionId: submission.id,
      itemId: item.id,
      attemptNo: prev.length + 1,
      correct: false,
      reason: gate.kind,
      feedbackLevel: null,
      answer: { type: "summary-write", text: gate.kind === "distress" ? text : "", safety: gate.kind },
    });
    await logEvent(`student:${studentId}`, "reading_answer", "submission", submission.id, { itemId: item.id, safety: gate.kind });
    await db.update(schema.submissions).set({ updatedAt: new Date() }).where(eq(schema.submissions.id, submission.id));
    const progress = progressSummary(await readingProgress(submission.id, activityId));
    return { status: 200, correct: false, safety: gate.kind, message: gate.reply, rendered: "", progress };
  }

  const result = evaluateSummary(item, text);
  const evaluated = prev.filter((p) => !SAFETY_REASONS.has(p.reason)).length;
  const tries = evaluated + 1;
  const asIs = answer.submitAsIs === true && !result.done && evaluated >= SUMMARY_HELP_AFTER;
  const reason = asIs ? "submit-as-is" : result.reason;
  await db.insert(schema.grammarAttempts).values({
    submissionId: submission.id,
    itemId: item.id,
    attemptNo: prev.length + 1,
    correct: result.done,
    reason,
    // 그대로 내기는 정답 공개와 같은 '도움 받아 완료'로 센다
    feedbackLevel: asIs ? "reveal" : null,
    answer: {
      type: "summary-write",
      text,
      coverage: result.coverage,
      covered: result.covered,
      total: result.total,
      missing: result.missing,
      copied: result.copied,
      length: result.length,
      ...(asIs ? { submitAsIs: true } : {}),
    },
  });
  await logEvent(`student:${studentId}`, "reading_answer", "submission", submission.id, {
    itemId: item.id,
    correct: result.done,
    level: asIs ? "reveal" : null,
  });
  const solved = result.done || asIs;
  const { summary: progress, view } = await touchSubmission(submission, activityId, solved);
  const canSubmitAsIs = !solved && tries >= SUMMARY_HELP_AFTER;
  const message = asIs
    ? "선생님께 그대로 냈어요. 고쳐 쓰느라 애썼어요. 선생님이 읽고 도와주실 거예요."
    : summaryFeedback(item, result, tries);
  return {
    status: 200,
    correct: result.done,
    message,
    rendered: text,
    progress,
    summary: {
      done: result.done,
      coverage: result.coverage,
      covered: result.covered,
      total: result.total,
      missing: result.missing,
      copied: result.copied,
      length: result.length,
      reason,
      tries,
      canSubmitAsIs,
      submittedAsIs: asIs,
    },
    ...(view ? { view } : {}),
  };
}
