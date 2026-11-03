import { NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { coachHistory, coachUsageToday, COACH_DAILY_LIMIT, isStage, studentSubmission } from "@/lib/submissions";
import { runCoach } from "@/lib/coach";
import { logEvent } from "@/lib/events";
import { getGenre, REVISION_LENSES } from "@/data/genres";
import { getStandard } from "@/data/standards";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.kind !== "student") return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const id = Number((await params).id);
  const row = await studentSubmission(session.studentId, id);
  if (!row) return NextResponse.json({ error: "찾을 수 없어요." }, { status: 404 });
  if (!row.assignment.coachEnabled) return NextResponse.json({ error: "이 과제는 선생님이 코치를 꺼 두었어요." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
  const lens = typeof body.lens === "string" && REVISION_LENSES.some((l) => l.key === body.lens) ? body.lens : undefined;
  const sub = row.submission;
  const stage = isStage(sub.stage) ? sub.stage : "brainstorm";
  const actor = `student:${session.studentId}`;

  const used = await coachUsageToday(session.studentId);
  if (used >= COACH_DAILY_LIMIT) {
    await logEvent(actor, "coach_limit", "submission", id);
    return NextResponse.json(
      { error: `오늘은 코치와 ${COACH_DAILY_LIMIT}번 이야기했어요. 이제 스스로 해 보고, 막히면 선생님께 물어보세요!` },
      { status: 429 },
    );
  }

  const db = await getDb();
  const [{ n: helpCountThisStage }] = await db
    .select({ n: count() })
    .from(schema.coachMessages)
    .where(
      and(
        eq(schema.coachMessages.submissionId, id),
        eq(schema.coachMessages.role, "student"),
        eq(schema.coachMessages.stage, stage),
      ),
    );
  const history = (await coachHistory(id)).map((m) => ({ role: m.role, content: m.content }));
  const genre = getGenre(row.assignment.genreId);

  const result = await runCoach({
    grade: row.klass.grade,
    genreName: genre?.name ?? row.assignment.title,
    coachFocus: genre?.coachFocus ?? "",
    standardStatements: row.assignment.standardCodes.map((c) => `[${c}] ${getStandard(c)?.statement ?? ""}`),
    prompt: row.assignment.prompt,
    organizer: row.assignment.organizer,
    rubric: row.assignment.rubric,
    stage,
    brainstorm: sub.brainstorm,
    organizerValues: sub.organizerValues,
    draft: sub.draft,
    studentMessage: message,
    lens,
    history,
    helpCountThisStage: Number(helpCountThisStage),
  });

  const [studentMsg] = await db
    .insert(schema.coachMessages)
    .values({
      submissionId: id,
      role: "student",
      stage,
      content: message || "(도움 요청)",
      meta: { lens: lens ?? null, flags: result.inputFlags },
    })
    .returning();
  const coachText = [result.output.reply, ...result.output.questions].join("\n");
  const [coachMsg] = await db
    .insert(schema.coachMessages)
    .values({
      submissionId: id,
      role: "coach",
      stage,
      content: coachText,
      meta: { questions: result.output.questions, highlights: result.output.highlights, flag: result.output.flag },
      policyVersion: result.policyVersion,
      model: result.model,
      blocked: result.blocked,
      blockReason: result.blockReason ?? null,
    })
    .returning();

  await logEvent(actor, "help_request", "submission", id, { stage, lens: lens ?? null, hasMessage: !!message });
  await logEvent(actor, result.blocked ? "coach_blocked" : "coach_reply", "submission", id, {
    stage,
    model: result.model,
    flag: result.output.flag,
    blockReason: result.blockReason ?? null,
  });

  return NextResponse.json({
    student: { id: studentMsg.id, role: "student", content: studentMsg.content, stage },
    coach: {
      id: coachMsg.id,
      role: "coach",
      content: coachText,
      stage,
      reply: result.output.reply,
      questions: result.output.questions,
      highlights: result.output.highlights,
      flag: result.output.flag,
    },
    remainingToday: COACH_DAILY_LIMIT - used - 1,
  });
}
