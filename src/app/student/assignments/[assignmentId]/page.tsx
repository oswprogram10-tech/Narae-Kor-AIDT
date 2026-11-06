import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requireStudent } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { coachHistory, getOrCreateSubmission, isStage } from "@/lib/submissions";
import { Workbench, type CoachMessageView } from "./Workbench";
import { getLocalModelConfig } from "@/lib/coach";
import { progress, studentItems } from "@/lib/grammar";
import { progressSummary } from "@/lib/grammar-rules";
import { GrammarRunner } from "./GrammarRunner";
import { literatureExtras, readingProgress } from "@/lib/reading";
import { studentReadingView } from "@/lib/reading-rules";
import { isReadingHostKind } from "@/lib/activities";
import { ReadingRunner } from "./ReadingRunner";
import { CardnewsMaker } from "./CardnewsMaker";
import { DiaryMaker } from "./DiaryMaker";
import { galleryFor, storedArtifact } from "@/lib/artifacts";

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
  if (assignment.kind === "cardnews" || assignment.kind === "media-diary") {
    const art = storedArtifact(submission, assignment.kind);
    if (art.kind === "cardnews") {
      const mine = submission.shareApproved ? (await galleryFor(assignment.id, classId, studentId))?.works.find((w) => w.own) : undefined;
      return (
        <CardnewsMaker
          submissionId={submission.id}
          assignmentId={assignment.id}
          title={assignment.title}
          prompt={assignment.prompt}
          isOpen={assignment.isOpen}
          initial={art}
          status={submission.status}
          approved={submission.shareApproved}
          reactions={mine?.counts ?? {}}
          reflection={submission.reflection}
        />
      );
    }
    if (art.kind === "media-diary") {
      return <DiaryMaker submissionId={submission.id} title={assignment.title} prompt={assignment.prompt} isOpen={assignment.isOpen} initial={art} status={submission.status} />;
    }
  }
  if (isReadingHostKind(assignment.kind)) {
    if (submission.stage !== "reading") {
      await db.update(schema.submissions).set({ stage: "reading" }).where(eq(schema.submissions.id, submission.id));
    }
    const prog = await readingProgress(submission.id, assignment.activityId);
    const solvedIds = prog.filter((p) => p.solved).map((p) => p.itemId);
    // 문단을 차례로 펼치는 활동은 푼 만큼의 문단·문제만 보낸다.
    const view = studentReadingView(assignment.activityId ?? "", new Set(solvedIds));
    return (
      <ReadingRunner
        submissionId={submission.id}
        title={assignment.title}
        isOpen={assignment.isOpen}
        items={view.items}
        passages={view.passages}
        solvedIds={solvedIds}
        initialSummary={progressSummary(prog)}
        initialLiterature={assignment.kind === "literature" ? await literatureExtras(submission.id, assignment.activityId) : undefined}
      />
    );
  }
  if (assignment.kind === "grammar") {
    if (submission.stage !== "grammar") {
      await db.update(schema.submissions).set({ stage: "grammar" }).where(eq(schema.submissions.id, submission.id));
    }
    const prog = await progress(submission.id, assignment.activityId);
    return (
      <GrammarRunner
        submissionId={submission.id}
        title={assignment.title}
        isOpen={assignment.isOpen}
        items={studentItems(assignment.activityId ?? "")}
        solvedIds={prog.filter((p) => p.solved).map((p) => p.itemId)}
        initialSummary={progressSummary(prog)}
      />
    );
  }
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
      coach={{ preferredProvider: assignment.coachProvider, local: getLocalModelConfig() }}
    />
  );
}
