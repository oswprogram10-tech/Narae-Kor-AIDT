import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { studentSubmission } from "@/lib/submissions";
import { findActivity, findItem, isReadingHostKind } from "@/lib/activities";
import { parseReadingAnswer } from "@/lib/reading-rules";
import { recordReadingAnswer } from "@/lib/reading";
import { parseListeningUsage } from "@/lib/listening-rules";
import { logEvent } from "@/lib/events";

export async function POST(req: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const session = await getSession();
  if (!session || session.kind !== "student") return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const id = Number((await params).submissionId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "찾을 수 없어요." }, { status: 404 });
  const row = await studentSubmission(session.studentId, id);
  if (!row || !isReadingHostKind(row.assignment.kind)) return NextResponse.json({ error: "찾을 수 없어요." }, { status: 404 });
  if (!row.assignment.isOpen) return NextResponse.json({ error: "선생님이 과제를 닫았어요." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { itemId?: unknown; answer?: unknown; usage?: unknown } | null;
  if (!body || typeof body.itemId !== "string") return NextResponse.json({ error: "문제를 확인해 주세요." }, { status: 400 });
  const activity = row.assignment.activityId ? findActivity(row.assignment.activityId) : undefined;
  const item = findItem(body.itemId);
  if (!activity || !item || !activity.itemIds.includes(item.id)) {
    return NextResponse.json({ error: "문제를 찾을 수 없어요." }, { status: 400 });
  }
  const answer = parseReadingAnswer(item, body.answer);
  if (!answer) return NextResponse.json({ error: "답을 다시 확인해 주세요." }, { status: 400 });

  // 듣기 활동: 학생 기기에서 센 횟수의 증가분(숫자만, 0~1000)을 연구용으로 남긴다. 채점과는 관계없다.
  if (row.assignment.kind === "listening") {
    const usage = parseListeningUsage(body.usage);
    if (usage) await logEvent(`student:${session.studentId}`, "listening_usage", "submission", row.submission.id, { itemId: item.id, ...usage });
  }

  const out = await recordReadingAnswer(row.submission, row.assignment.activityId, session.studentId, item, answer);
  if (out.status !== 200) return NextResponse.json({ error: out.error }, { status: out.status });
  const { status: _status, ...rest } = out;
  void _status;
  return NextResponse.json(rest);
}
