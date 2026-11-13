import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { teacherSubmission } from "@/lib/submissions";
import { suggestRubric } from "@/core/rubric";
import { getRegistry } from "@/lib/coach";
import { PROVIDER_IDS, type ProviderId } from "@/core/providers";
import { getGenre } from "@/core/data/genres";
import { logEvent } from "@/lib/events";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.kind !== "teacher") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const row = await teacherSubmission(session.teacherId, id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const pref = (PROVIDER_IDS as readonly string[]).includes(row.assignment.coachProvider)
    ? (row.assignment.coachProvider as ProviderId)
    : "auto";
  const { suggestions, reason } = await suggestRubric(
    getRegistry(),
    {
      grade: row.klass.grade,
      genreName: getGenre(row.assignment.genreId)?.name ?? row.assignment.title,
      prompt: row.assignment.prompt,
      rubric: row.assignment.rubric,
      draft: row.submission.draft,
    },
    pref,
  );
  if (!suggestions) return NextResponse.json({ error: reason }, { status: 422 });

  const db = await getDb();
  for (const s of suggestions) {
    await db
      .insert(schema.rubricScores)
      .values({ submissionId: id, criterion: s.key, aiSuggested: s.level, aiEvidence: s.evidence })
      .onConflictDoUpdate({
        target: [schema.rubricScores.submissionId, schema.rubricScores.criterion],
        set: { aiSuggested: s.level, aiEvidence: s.evidence, updatedAt: new Date() },
      });
  }
  await logEvent(`teacher:${session.teacherId}`, "rubric_ai", "submission", id);
  return NextResponse.json({ suggestions });
}
