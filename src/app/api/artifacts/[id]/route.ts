import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { studentSubmission } from "@/lib/submissions";
import { saveArtifact } from "@/lib/artifacts";
import { isArtifactKind } from "@/core/artifact";

// 카드뉴스·매체 이용 일지 자동 저장
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.kind !== "student") return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "찾을 수 없어요." }, { status: 404 });
  const row = await studentSubmission(session.studentId, id);
  if (!row || !isArtifactKind(row.assignment.kind)) return NextResponse.json({ error: "찾을 수 없어요." }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { artifact?: unknown } | null;
  if (!body) return NextResponse.json({ error: "내용을 다시 확인해 주세요." }, { status: 400 });
  const out = await saveArtifact(row.submission, row.assignment, session.studentId, body.artifact);
  if (out.status !== 200) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, artifact: out.artifact, safety: out.safety ?? null, savedAt: out.savedAt });
}
