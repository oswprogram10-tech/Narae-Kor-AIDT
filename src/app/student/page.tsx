import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireStudent } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { studentLogout } from "@/app/actions/student";
import { activityItems, attemptsFor } from "@/lib/grammar";
import { readingActivityItems } from "@/lib/reading";
import { isReadingHostKind } from "@/lib/activities";
import { summarizeAttempts, progressSummary } from "@/lib/grammar-rules";
import { STAGE_LABELS, type Stage } from "@/core/data/genres";
import { isArtifactKind } from "@/core/artifact";

export default async function StudentHome() {
  const { studentId, classId } = await requireStudent();
  const db = await getDb();
  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, studentId));
  const [klass] = await db.select().from(schema.classes).where(eq(schema.classes.id, classId));
  const assignments = await db
    .select({ a: schema.assignments, s: schema.submissions })
    .from(schema.assignments)
    .leftJoin(
      schema.submissions,
      and(eq(schema.submissions.assignmentId, schema.assignments.id), eq(schema.submissions.studentId, studentId)),
    )
    .where(eq(schema.assignments.classId, classId))
    .orderBy(desc(schema.assignments.createdAt));

  const grammarSubIds = assignments.filter(({ a, s }) => (a.kind === "grammar" || isReadingHostKind(a.kind)) && s).map(({ s }) => s!.id);
  const grammarAttempts = await attemptsFor(grammarSubIds);
  const label = (a: (typeof assignments)[number]["a"], s: (typeof assignments)[number]["s"]): string => {
    if (a.kind === "grammar" || isReadingHostKind(a.kind)) {
      if (!s) return "시작하기";
      const ids = (isReadingHostKind(a.kind) ? readingActivityItems(a.activityId) : activityItems(a.activityId)).map((i) => i.id);
      const sum = progressSummary(summarizeAttempts(ids, grammarAttempts.filter((t) => t.submissionId === s.id)));
      if (sum.total > 0 && sum.solved === sum.total) return "완료 ✓";
      return sum.solved === 0 ? "시작하기" : `${sum.solved}/${sum.total} 문제`;
    }
    if (isArtifactKind(a.kind)) {
      if (!s) return "시작하기";
      if ((a.kind === "cardnews" || a.kind === "impression" || a.kind === "debate") && s.shareApproved) return "공유됨 ✓";
      return s.status === "submitted" ? "제출 ✓" : "만드는 중";
    }
    return !s
      ? "시작하기"
      : s.status === "submitted"
        ? "제출 ✓"
        : s.status === "returned"
          ? "선생님 코멘트 💬"
          : STAGE_LABELS[s.stage as Stage];
  };

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-stone-500">{klass?.grade}학년 {klass?.name}</p>
          <h1 className="text-2xl font-bold">{student?.number}번 {student?.nickname}의 국어나래</h1>
        </div>
        <form action={studentLogout}>
          <button className="text-sm text-stone-500 underline">나가기</button>
        </form>
      </header>
      {assignments.length === 0 && <p className="card text-stone-600">아직 선생님이 낸 과제가 없어요.</p>}
      <ul className="space-y-3">
        {assignments
          .filter(({ a, s }) => a.isOpen || s)
          .map(({ a, s }) => (
            <li key={a.id}>
              <Link href={`/student/assignments/${a.id}`} className="card flex items-center justify-between gap-3 transition hover:shadow-md">
                <span>
                  <span className="block text-lg font-bold">{a.title}</span>
                  <span className="line-clamp-1 text-sm text-stone-600">{a.prompt}</span>
                </span>
                <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-sm">
                  {label(a, s)}
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </main>
  );
}
