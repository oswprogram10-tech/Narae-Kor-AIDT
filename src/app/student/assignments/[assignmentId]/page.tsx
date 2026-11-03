import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requireStudent } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { coachHistory, getOrCreateSubmission, isStage } from "@/lib/submissions";
import { Workbench, type CoachMessageView } from "./Workbench";

export default async function StudentAssignment({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { studentId, classId } = await requireStudent();
  const assignmentId = Number((await params).assignmentId);
  const found = await getOrCreateSubmission(studentId, classId, assignmentId);
  if (!found) notFound();
  const { assignment, submission } = found;
  if (!submission) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="card">선생님이 이 과제를 닫았어요.</p>
        <Link href="/student" className="mt-4 inline-block underline">목록으로</Link>
      </main>
    );
  }
  const db = await getDb();
  const comments = await db
    .select({ id: schema.teacherComments.id, content: schema.teacherComments.content })
    .from(schema.teacherComments)
    .where(eq(schema.teacherComments.submissionId, submission.id))
    .orderBy(asc(schema.teacherComments.createdAt));
  const messages: CoachMessageView[] = (await coachHistory(submission.id)).map((m) => {
    const meta = (m.meta ?? {}) as { questions?: string[]; highlights?: CoachMessageView["highlights"] };
    return { id: m.id, role: m.role, content: m.content, stage: m.stage, highlights: meta.highlights ?? [] };
  });

  return (
    <Workbench
      submissionId={submission.id}
      assignment={{
        title: assignment.title,
        prompt: assignment.prompt,
        organizer: assignment.organizer,
        coachEnabled: assignment.coachEnabled,
        isOpen: assignment.isOpen,
      }}
      initial={{
        stage: isStage(submission.stage) ? submission.stage : "brainstorm",
        status: submission.status,
        brainstorm: submission.brainstorm,
        organizerValues: submission.organizerValues,
        draft: submission.draft,
      }}
      comments={comments}
      messages={messages}
    />
  );
}
