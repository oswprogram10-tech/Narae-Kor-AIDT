import "server-only";
import { and, count, eq } from "drizzle-orm";
import type { CoachHostAdapter } from "@/core/host/adapter";
import { PROVIDER_IDS, type ProviderId } from "@/core/providers";
import { getGenre } from "@/core/data/genres";
import { getStandard } from "@/core/data/standards";
import { getDb, schema } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { coachHistory, coachUsageToday, isStage, studentSubmission } from "@/lib/submissions";
import type { Session } from "@/lib/auth";

// 레퍼런스 호스트(이 Next.js 앱)가 CoachHostAdapter를 구현한 예시.
// 다른 프로그램에 병합할 때는 그 프로그램의 서버가 같은 인터페이스를 자기 DB·로그인으로 구현한다.

function asProvider(v: string): ProviderId | "auto" {
  return (PROVIDER_IDS as readonly string[]).includes(v) ? (v as ProviderId) : "auto";
}

export const drizzleCoachAdapter: CoachHostAdapter = {
  async loadCoachTurn(principal, submissionId) {
    const session = principal as Session | null;
    if (!session || session.kind !== "student") return null;
    const id = Number(submissionId);
    const row = await studentSubmission(session.studentId, id);
    if (!row) return null;
    const db = await getDb();
    const sub = row.submission;
    const stage = isStage(sub.stage) ? sub.stage : "brainstorm";
    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.coachMessages)
      .where(
        and(
          eq(schema.coachMessages.submissionId, id),
          eq(schema.coachMessages.role, "student"),
          eq(schema.coachMessages.stage, stage),
        ),
      );
    const genre = getGenre(row.assignment.genreId);
    return {
      studentKey: String(session.studentId),
      coachEnabled: row.assignment.coachEnabled,
      preferredProvider: asProvider(row.assignment.coachProvider),
      context: {
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
        history: (await coachHistory(id)).map((m) => ({ role: m.role, content: m.content })),
        helpCountThisStage: Number(n),
      },
    };
  },

  coachUsageToday: (studentKey) => coachUsageToday(Number(studentKey)),

  async saveCoachTurn(submissionId, { stage, studentMessage, lens, result }) {
    const db = await getDb();
    const id = Number(submissionId);
    const [s] = await db
      .insert(schema.coachMessages)
      .values({ submissionId: id, role: "student", stage, content: studentMessage, meta: { lens, flags: result.inputFlags } })
      .returning({ id: schema.coachMessages.id });
    const [c] = await db
      .insert(schema.coachMessages)
      .values({
        submissionId: id,
        role: "coach",
        stage,
        content: [result.output.reply, ...result.output.questions].join("\n"),
        meta: {
          questions: result.output.questions,
          highlights: result.output.highlights,
          flag: result.output.flag,
          attempts: result.attempts,
          fellBack: result.fellBack,
        },
        policyVersion: result.policyVersion,
        provider: result.provider,
        model: result.model,
        blocked: result.blocked,
        blockReason: result.blockReason ?? null,
      })
      .returning({ id: schema.coachMessages.id });
    return { studentMessageId: String(s.id), coachMessageId: String(c.id) };
  },

  async logEvent(actor, verb, submissionId, meta) {
    await logEvent(actor, verb as Parameters<typeof logEvent>[1], "submission", Number(submissionId), meta);
  },
};
