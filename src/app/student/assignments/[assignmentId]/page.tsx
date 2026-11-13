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
import { getReplyCharacter } from "@/core/literature";
import { studentReadingView } from "@/lib/reading-rules";
import { isReadingHostKind } from "@/lib/activities";
import { ReadingRunner } from "./ReadingRunner";
import { isArtifactKind } from "@/core/artifact";
import { CardnewsMaker } from "./CardnewsMaker";
import { DiaryMaker } from "./DiaryMaker";
import { ImpressionMaker } from "./ImpressionMaker";
import { DebateMaker } from "./DebateMaker";
import { InterviewMaker } from "./InterviewMaker";
import { PresentationMaker } from "./PresentationMaker";
import { bandOfGrade, withBand, withMotion } from "@/core/speaking";
import { debateSecondsOf, presentationSecondsOf } from "@/lib/assignment-settings";
import { impressionGalleryFor, galleryFor, storedArtifact } from "@/lib/artifacts";

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
  if (isArtifactKind(assignment.kind)) {
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
    if (art.kind === "impression") {
      const mine = submission.shareApproved ? (await impressionGalleryFor(assignment.id, classId, studentId))?.works.find((w) => w.own) : undefined;
      return (
        <ImpressionMaker
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
    if (art.kind === "debate") {
      // 논제는 교사가 정한 값(과제의 prompt)이다.
      return (
        <DebateMaker
          submissionId={submission.id}
          title={assignment.title}
          motion={assignment.prompt}
          seconds={debateSecondsOf(assignment.settings)}
          isOpen={assignment.isOpen}
          initial={withMotion(art, assignment.prompt)}
          status={submission.status}
          assignmentId={assignment.id}
          approved={submission.shareApproved}
        />
      );
    }
    if (art.kind === "interview") {
      return <InterviewMaker submissionId={submission.id} title={assignment.title} prompt={assignment.prompt} isOpen={assignment.isOpen} initial={art} status={submission.status} />;
    }
    if (art.kind === "presentation") {
      // 학년대는 학급 학년으로 정한다(학생이 바꿀 수 없다).
      const [k] = await db.select({ grade: schema.classes.grade }).from(schema.classes).where(eq(schema.classes.id, classId));
      return (
        <PresentationMaker
          submissionId={submission.id}
          title={assignment.title}
          prompt={assignment.prompt}
          targetSeconds={presentationSecondsOf(assignment.settings)}
          isOpen={assignment.isOpen}
          initial={withBand(art, bandOfGrade(k?.grade ?? 3))}
          status={submission.status}
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
        kind={assignment.kind}
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
    .select({ id: schema.teacherComments.id, content: schema.teacherComments.content, asCharacter: schema.teacherComments.asCharacter })
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
        genreId: assignment.genreId,
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
      comments={comments.map((c) => ({ id: c.id, content: c.content, characterName: (c.asCharacter && getReplyCharacter(c.asCharacter)?.name) || null }))}
      messages={messages}
      coach={{ preferredProvider: assignment.coachProvider, local: getLocalModelConfig() }}
    />
  );
}
