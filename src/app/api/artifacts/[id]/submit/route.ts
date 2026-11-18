import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { studentSubmission } from "@/lib/submissions";
import { submitArtifact } from "@/lib/artifacts";
import { isArtifactKind } from "@/core/artifact";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.kind !== "student") return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "찾을 수 없어요." }, { status: 404 });
  const row = await studentSubmission(session.studentId, id);
  if (!row || !isArtifactKind(row.assignment.kind)) return NextResponse.json({ error: "찾을 수 없어요." }, { status: 404 });
  const out = await submitArtifact(row.submission, row.assignment, session.studentId);
  if (out.status !== 200) return NextResponse.json({ error: out.error, problems: out.problems ?? [] }, { status: out.status });
  return NextResponse.json({ ok: true, submitted: out.submitted === true, artifact: out.artifact, safety: out.safety ?? null });
}
