import "server-only";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { STAGES, type Stage } from "@/core/data/genres";

const AUTOSAVE_SNAPSHOT_GAP_MS = 60_000;

export function isStage(s: unknown): s is Stage {
  return typeof s === "string" && (STAGES as readonly string[]).includes(s);
}

// 학생이 해당 과제에 접근할 수 있는지 확인하고, 제출물이 없으면 만든다.
export async function getOrCreateSubmission(studentId: number, classId: number, assignmentId: number) {
  const db = await getDb();
  const [assignment] = await db
    .select()
    .from(schema.assignments)
    .where(and(eq(schema.assignments.id, assignmentId), eq(schema.assignments.classId, classId)));
  if (!assignment) return null;
  let [submission] = await db
    .select()
    .from(schema.submissions)
    .where(and(eq(schema.submissions.assignmentId, assignmentId), eq(schema.submissions.studentId, studentId)));
  if (!submission) {
    if (!assignment.isOpen) return { assignment, submission: null };
    [submission] = await db
      .insert(schema.submissions)
      .values({ assignmentId, studentId })
      .onConflictDoNothing()
      .returning();
    if (!submission) {
      [submission] = await db
        .select()
        .from(schema.submissions)
        .where(and(eq(schema.submissions.assignmentId, assignmentId), eq(schema.submissions.studentId, studentId)));
    }
  }
  return { assignment, submission };
}

// 학생 본인의 제출물인지 확인한다.
export async function studentSubmission(studentId: number, submissionId: number) {
  const db = await getDb();
  const [row] = await db
    .select({ submission: schema.submissions, assignment: schema.assignments, klass: schema.classes })
    .from(schema.submissions)
    .innerJoin(schema.assignments, eq(schema.submissions.assignmentId, schema.assignments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .where(and(eq(schema.submissions.id, submissionId), eq(schema.submissions.studentId, studentId)));
  return row ?? null;
}

// 교사가 담임인 학급의 제출물인지 확인한다.
export async function teacherSubmission(teacherId: number, submissionId: number) {
  const db = await getDb();
  const [row] = await db
    .select({
      submission: schema.submissions,
      assignment: schema.assignments,
      klass: schema.classes,
      student: schema.students,
    })
    .from(schema.submissions)
    .innerJoin(schema.assignments, eq(schema.submissions.assignmentId, schema.assignments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .innerJoin(schema.students, eq(schema.submissions.studentId, schema.students.id))
    .where(and(eq(schema.submissions.id, submissionId), eq(schema.classes.teacherId, teacherId)));
  return row ?? null;
}

export interface SaveInput {
  stage?: Stage;
  brainstorm?: string;
  organizerValues?: Record<string, string>;
  draft?: string;
  pasteChars?: number;
}

export async function saveSubmission(submissionId: number, prev: typeof schema.submissions.$inferSelect, input: SaveInput) {
  const db = await getDb();
  const now = new Date();
  const update: Partial<typeof schema.submissions.$inferInsert> = { updatedAt: now };
  if (input.brainstorm !== undefined) update.brainstorm = input.brainstorm.slice(0, 5000);
  if (input.organizerValues !== undefined) {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.organizerValues)) {
      if (typeof v === "string") clean[k.slice(0, 40)] = v.slice(0, 2000);
    }
    update.organizerValues = clean;
  }
  if (input.draft !== undefined) update.draft = input.draft.slice(0, 20000);
  if (input.pasteChars && input.pasteChars > 0) {
    update.pasteChars = sql`${schema.submissions.pasteChars} + ${Math.min(input.pasteChars, 20000)}` as unknown as number;
  }
  const stageChanged = input.stage !== undefined && input.stage !== prev.stage;
  if (stageChanged) update.stage = input.stage;
  if (prev.status === "returned" && (input.draft !== undefined || stageChanged)) update.status = "in_progress";

  await db.update(schema.submissions).set(update).where(eq(schema.submissions.id, submissionId));

  const draft = update.draft ?? prev.draft;
  if (stageChanged && draft.trim()) {
    await db.insert(schema.drafts).values({ submissionId, stage: input.stage!, content: draft, reason: "stage_change" });
  } else if (input.draft !== undefined && input.draft !== prev.draft && input.draft.trim()) {
    const [last] = await db
      .select({ createdAt: schema.drafts.createdAt })
      .from(schema.drafts)
      .where(eq(schema.drafts.submissionId, submissionId))
      .orderBy(desc(schema.drafts.createdAt))
      .limit(1);
    if (!last || now.getTime() - last.createdAt.getTime() > AUTOSAVE_SNAPSHOT_GAP_MS) {
      await db.insert(schema.drafts).values({ submissionId, stage: input.stage ?? prev.stage, content: input.draft, reason: "autosave" });
    }
  }
  return { stageChanged };
}

// 한국 시간 기준 오늘 0시(UTC로 표현)
export function startOfTodayKST(now = new Date()): Date {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 3600_000);
}

export async function coachUsageToday(studentId: number): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(schema.coachMessages)
    .innerJoin(schema.submissions, eq(schema.coachMessages.submissionId, schema.submissions.id))
    .where(
      and(
        eq(schema.submissions.studentId, studentId),
        eq(schema.coachMessages.role, "student"),
        gte(schema.coachMessages.createdAt, startOfTodayKST()),
      ),
    );
  return Number(row?.n ?? 0);
}

export async function coachHistory(submissionId: number) {
  const db = await getDb();
  return db
    .select()
    .from(schema.coachMessages)
    .where(eq(schema.coachMessages.submissionId, submissionId))
    .orderBy(schema.coachMessages.createdAt, schema.coachMessages.id);
}
