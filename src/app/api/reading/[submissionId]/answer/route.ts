import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { studentSubmission } from "@/lib/submissions";
import { findActivity, findItem, isReadingHostKind } from "@/lib/activities";
import { parseReadingAnswer } from "@/lib/reading-rules";
import { recordReadingAnswer } from "@/lib/reading";

export async function POST(req: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const session = await getSession();
  if (!session || session.kind !== "student") return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const id = Number((await params).submissionId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "찾을 수 없어요." }, { status: 404 });
  const row = await studentSubmission(session.studentId, id);
  if (!row || !isReadingHostKind(row.assignment.kind)) return NextResponse.json({ error: "찾을 수 없어요." }, { status: 404 });
  if (!row.assignment.isOpen) return NextResponse.json({ error: "선생님이 과제를 닫았어요." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { itemId?: unknown; answer?: unknown } | null;
  if (!body || typeof body.itemId !== "string") return NextResponse.json({ error: "문제를 확인해 주세요." }, { status: 400 });
  const activity = row.assignment.activityId ? findActivity(row.assignment.activityId) : undefined;
  const item = findItem(body.itemId);
  if (!activity || !item || !activity.itemIds.includes(item.id)) {
    return NextResponse.json({ error: "문제를 찾을 수 없어요." }, { status: 400 });
  }
  const answer = parseReadingAnswer(item, body.answer);
  if (!answer) return NextResponse.json({ error: "답을 다시 확인해 주세요." }, { status: 400 });

  const out = await recordReadingAnswer(row.submission, row.assignment.activityId, session.studentId, item, answer);
  if (out.status !== 200) return NextResponse.json({ error: out.error }, { status: out.status });
  const { status: _status, ...rest } = out;
  void _status;
  return NextResponse.json(rest);
}
