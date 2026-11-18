import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isStage, saveSubmission, studentSubmission, type SaveInput } from "@/lib/submissions";
import { logEvent } from "@/lib/events";

// 학생 글 자동 저장
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.kind !== "student") return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const id = Number((await params).id);
  const row = await studentSubmission(session.studentId, id);
  if (!row) return NextResponse.json({ error: "찾을 수 없어요." }, { status: 404 });
  if (!row.assignment.isOpen) return NextResponse.json({ error: "선생님이 과제를 닫았어요." }, { status: 403 });
  if (row.submission.status === "submitted") {
    return NextResponse.json({ error: "이미 제출했어요. 선생님이 돌려주면 다시 고칠 수 있어요." }, { status: 409 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const input: SaveInput = {};
  if (isStage(body.stage)) input.stage = body.stage;
  if (typeof body.brainstorm === "string") input.brainstorm = body.brainstorm;
  if (typeof body.draft === "string") input.draft = body.draft;
  if (body.organizerValues && typeof body.organizerValues === "object") {
    input.organizerValues = body.organizerValues as Record<string, string>;
  }
  if (typeof body.pasteChars === "number" && body.pasteChars > 0) input.pasteChars = Math.floor(body.pasteChars);

  const { stageChanged } = await saveSubmission(id, row.submission, input);
  const actor = `student:${session.studentId}`;
  if (stageChanged) await logEvent(actor, "stage_enter", "submission", id, { stage: input.stage });
  if (input.pasteChars) await logEvent(actor, "paste", "submission", id, { chars: input.pasteChars, stage: input.stage ?? row.submission.stage });
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
