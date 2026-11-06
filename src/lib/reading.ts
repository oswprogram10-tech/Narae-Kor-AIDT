import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  INCOMPLETE_MESSAGE,
  SUMMARY_HELP_AFTER,
  correctFeedback,
  evaluateSummary,
  feedbackFor,
  getActivity,
  getItem,
  gradeAnswer,
  renderAnswer,
  summaryFeedback,
  summaryGate,
  type ReadingAnswer,
  type ReadingItem,
  type SummaryReason,
  type SummaryWriteItem,
} from "@/core/reading";
import { isItemUnlocked, isProgressiveActivity, studentReadingView, toDisplayAnswer, type ReadingView } from "@/lib/reading-rules";
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

export function readingActivityItems(activityId: string | null): ReadingItem[] {
  const activity = activityId ? getActivity(activityId) : undefined;
  if (!activity) return [];
  return activity.itemIds.map((id) => getItem(id)).filter((x): x is ReadingItem => !!x);
}

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
      feedback?: { level: HintLevel; message: string; reveal?: { answer: ReadingAnswer; rendered: string } };
      explanation?: string;
      progress: ProgressSummary;
      summary?: SummaryOutcome;
      /** 요약에 위험 신호·개인 정보가 있어 점검 없이 안내만 함(교사에게 알림이 간다) */
      safety?: SummarySafety;
      /** 문단을 차례로 펼치는 활동에서 문제를 풀었을 때: 다음에 보일 문제와 지문 */
      view?: Pick<ReadingView, "items" | "passages">;
    };

type Submission = typeof schema.submissions.$inferSelect;

export async function recordReadingAnswer(
  submission: Submission,
  activityId: string | null,
  studentId: number,
  item: ReadingItem,
  answer: ReadingAnswer,
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
    return recordSummary(submission, activityId, studentId, item, answer, prev);
  }
  const result = gradeAnswer(item, answer);
  const rendered = renderAnswer(item, answer);

  if (!result.correct && !result.countsAsWrong) {
    // 다 고르지 않았거나 형식이 맞지 않음: 안내만 하고 기록하지 않는다.
    const summary = progressSummary(await readingProgress(submission.id, activityId));
    return { status: 200, correct: false, incomplete: true, message: INCOMPLETE_MESSAGE, rendered, progress: summary };
  }

  let level: HintLevel | null = null;
  let feedback: { level: HintLevel; message: string; reveal?: { answer: ReadingAnswer; rendered: string } } | undefined;
  let solved = result.correct;
  if (!result.correct) {
    const wrongCount = wrongAttemptCount(prev.map((p) => p.reason)) + 1;
    const fb = feedbackFor(item, wrongCount, result.reason);
    level = fb.level;
    feedback = {
      level: fb.level,
      message: fb.message,
      reveal: fb.reveal ? { answer: toDisplayAnswer(item, fb.reveal), rendered: renderAnswer(item, fb.reveal) } : undefined,
    };
    if (fb.level === "reveal") solved = true;
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

  return {
    status: 200,
    correct: result.correct,
    rendered,
    feedback,
    explanation: result.correct ? correctFeedback(item) : solved ? item.explanation : undefined,
    progress: summary,
    ...(view ? { view } : {}),
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
 * 요약 쓰기: 정답/오답이 아니라 고쳐 쓰기. 제출할 때마다 (1) 위험 신호·개인 정보를 먼저 확인하고,
 * (2) 걸리지 않으면 문단 반영·베껴 쓰기·길이를 규칙으로 점검한다. 시도마다 기록한다.
 */
async function recordSummary(
  submission: Submission,
  activityId: string | null,
  studentId: number,
  item: SummaryWriteItem,
  answer: ReadingAnswer,
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
