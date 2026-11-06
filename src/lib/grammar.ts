import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  AWKWARD_MESSAGE,
  correctFeedback,
  feedbackFor,
  getActivity,
  getItem,
  gradeAnswer,
  renderAnswer,
  type GrammarAnswer,
  type GrammarItem,
} from "@/core/grammar";
import { logEvent } from "@/lib/events";
import {
  progressSummary,
  studentItems,
  summarizeAttempts,
  wrongAttemptCount,
  type AttemptRow,
  type HintLevel,
  type ItemProgress,
  type ProgressSummary,
} from "@/lib/grammar-rules";

export { studentItems };

export function activityItems(activityId: string | null): GrammarItem[] {
  const activity = activityId ? getActivity(activityId) : undefined;
  if (!activity) return [];
  return activity.itemIds.map((id) => getItem(id)).filter((x): x is GrammarItem => !!x);
}

export async function attemptsFor(submissionIds: number[]): Promise<(AttemptRow & { submissionId: number })[]> {
  if (submissionIds.length === 0) return [];
  const db = await getDb();
  const rows = await db.select().from(schema.grammarAttempts).where(inArray(schema.grammarAttempts.submissionId, submissionIds));
  return rows.map((r) => ({
    submissionId: r.submissionId,
    itemId: r.itemId,
    attemptNo: r.attemptNo,
    correct: r.correct,
    feedbackLevel: r.feedbackLevel,
    createdAt: r.createdAt,
    reason: r.reason,
  }));
}

/** 한 제출물의 문제별 진행 상황. */
export async function progress(submissionId: number, activityId: string | null): Promise<ItemProgress[]> {
  const items = activityItems(activityId);
  const rows = await attemptsFor([submissionId]);
  return summarizeAttempts(items.map((i) => i.id), rows);
}

export type AnswerOutcome =
  | { status: 409 | 404; error: string }
  | {
      status: 200;
      correct: boolean;
      awkward?: boolean;
      message?: string;
      rendered: string;
      feedback?: { level: HintLevel; message: string; reveal?: { answer: GrammarAnswer; rendered: string } };
      explanation?: string;
      progress: ProgressSummary;
    };

type Submission = typeof schema.submissions.$inferSelect;

export async function recordAnswer(
  submission: Submission,
  activityId: string | null,
  studentId: number,
  item: GrammarItem,
  answer: GrammarAnswer,
): Promise<AnswerOutcome> {
  const db = await getDb();
  const prev = await db
    .select()
    .from(schema.grammarAttempts)
    .where(and(eq(schema.grammarAttempts.submissionId, submission.id), eq(schema.grammarAttempts.itemId, item.id)));
  if (prev.some((p) => p.correct || p.feedbackLevel === "reveal")) {
    return { status: 409, error: "이미 푼 문제예요." };
  }
  const attemptNo = prev.length + 1;
  const result = gradeAnswer(item, answer);
  const rendered = renderAnswer(item, answer);

  let level: HintLevel | "awkward" | null = null;
  let feedback: { level: HintLevel; message: string; reveal?: { answer: GrammarAnswer; rendered: string } } | undefined;
  let solved = result.correct;
  if (!result.correct && result.reason !== "awkward") {
    const wrongCount = wrongAttemptCount(prev.map((p) => p.reason)) + 1;
    const fb = feedbackFor(item, wrongCount);
    level = fb.level;
    feedback = {
      level: fb.level,
      message: fb.message,
      reveal: fb.reveal ? { answer: fb.reveal, rendered: renderAnswer(item, fb.reveal) } : undefined,
    };
    if (fb.level === "reveal") solved = true;
  } else if (result.reason === "awkward") {
    level = "awkward";
  }

  await db.insert(schema.grammarAttempts).values({
    submissionId: submission.id,
    itemId: item.id,
    attemptNo,
    correct: result.correct,
    reason: result.reason,
    feedbackLevel: level,
    answer,
  });
  await logEvent(`student:${studentId}`, "grammar_answer", "submission", submission.id, {
    itemId: item.id,
    correct: result.correct,
    level,
  });

  const all = await progress(submission.id, activityId);
  const summary = progressSummary(all);
  const now = new Date();
  if (summary.total > 0 && summary.solved === summary.total) {
    await db
      .update(schema.submissions)
      .set({ status: "submitted", submittedAt: submission.submittedAt ?? now, updatedAt: now })
      .where(eq(schema.submissions.id, submission.id));
  } else {
    await db.update(schema.submissions).set({ updatedAt: now }).where(eq(schema.submissions.id, submission.id));
  }

  if (result.reason === "awkward") {
    return { status: 200, correct: false, awkward: true, message: AWKWARD_MESSAGE, rendered, progress: summary };
  }
  return {
    status: 200,
    correct: result.correct,
    rendered,
    feedback,
    explanation: result.correct ? correctFeedback(item) : solved ? item.explanation : undefined,
    progress: summary,
  };
}
