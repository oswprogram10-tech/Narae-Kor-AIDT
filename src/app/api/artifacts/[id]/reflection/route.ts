import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { studentSubmission } from "@/lib/submissions";
import { saveReflection } from "@/lib/artifacts";

// 카드뉴스 작가가 받은 반응을 보고 '고칠 점'을 적는다.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.kind !== "student") return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "찾을 수 없어요." }, { status: 404 });
  const row = await studentSubmission(session.studentId, id);
  if (!row) return NextResponse.json({ error: "찾을 수 없어요." }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const out = await saveReflection(row.submission, row.assignment, session.studentId, body?.text);
  if (out.status !== 200) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, reflection: out.reflection, safety: out.safety ?? null });
}
