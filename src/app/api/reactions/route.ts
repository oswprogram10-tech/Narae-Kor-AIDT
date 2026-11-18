import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { toggleReaction } from "@/lib/artifacts";

// 반 갤러리의 스티커 붙이기·떼기
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.kind !== "student") return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { submissionId?: unknown; stickerId?: unknown } | null;
  const out = await toggleReaction(session.studentId, session.classId, body?.submissionId, body?.stickerId);
  if (out.status !== 200) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, on: out.on, counts: out.counts, mine: out.mine });
}
