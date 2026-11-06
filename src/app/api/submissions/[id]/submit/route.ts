import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { studentSubmission } from "@/lib/submissions";
import { logEvent } from "@/lib/events";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.kind !== "student") return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const id = Number((await params).id);
  const row = await studentSubmission(session.studentId, id);
  if (!row) return NextResponse.json({ error: "찾을 수 없어요." }, { status: 404 });
  if (!row.assignment.isOpen) return NextResponse.json({ error: "선생님이 과제를 닫았어요." }, { status: 403 });
  if (!row.submission.draft.trim()) return NextResponse.json({ error: "글을 쓴 뒤에 제출할 수 있어요." }, { status: 400 });

  const db = await getDb();
  const now = new Date();
  await db
    .update(schema.submissions)
    .set({ status: "submitted", submittedAt: now, updatedAt: now })
    .where(eq(schema.submissions.id, id));
  await db.insert(schema.drafts).values({ submissionId: id, stage: row.submission.stage, content: row.submission.draft, reason: "submit" });
  await logEvent(`student:${session.studentId}`, "submit", "submission", id, { chars: row.submission.draft.length });
  return NextResponse.json({ ok: true });
}
