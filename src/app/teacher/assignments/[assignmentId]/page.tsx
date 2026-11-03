import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ownedAssignment, requireTeacher } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { TeacherHeader } from "@/components/TeacherHeader";
import { assignmentStatus } from "@/lib/dashboard";
import { setAssignmentOpen, setCoachEnabled } from "@/app/actions/teacher";
import { getGenre } from "@/data/genres";
import { coachMode } from "@/lib/coach";
import { LiveStatus } from "./LiveStatus";

export default async function AssignmentDashboard({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { teacherId } = await requireTeacher();
  const id = Number((await params).assignmentId);
  const owned = await ownedAssignment(teacherId, id);
  if (!owned) notFound();
  const { assignment: a, klass } = owned;
  const db = await getDb();
  const [teacher] = await db.select().from(schema.teachers).where(eq(schema.teachers.id, teacherId));
  const rows = await assignmentStatus(id, klass.id);

  return (
    <>
      <TeacherHeader
        name={teacher?.displayName ?? ""}
        crumbs={[
          { href: `/teacher/classes/${klass.id}`, label: klass.name },
          { href: `/teacher/assignments/${id}`, label: a.title },
        ]}
      />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm text-stone-500">
              {getGenre(a.genreId)?.name} · {a.standardCodes.map((c) => `[${c}]`).join(" ")}
            </div>
            <h1 className="text-2xl font-bold">{a.title}</h1>
            <p className="mt-1 max-w-2xl text-stone-600">{a.prompt}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={setCoachEnabled.bind(null, id, !a.coachEnabled)}>
              <button className="btn-ghost text-sm">{a.coachEnabled ? "🤖 코치 끄기" : "🤖 코치 켜기"}</button>
            </form>
            <form action={setAssignmentOpen.bind(null, id, !a.isOpen)}>
              <button className="btn-ghost text-sm">{a.isOpen ? "과제 닫기" : "과제 다시 열기"}</button>
            </form>
            <a className="btn-ghost text-sm" href={`/api/teacher/assignments/${id}/export`}>연구용 CSV</a>
          </div>
        </div>
        <p className="text-sm text-stone-500">
          코치: {a.coachEnabled ? "켜짐" : "꺼짐"} · 모드: {coachMode() === "mock" ? "모의 코치(API 키 없음)" : "Claude"} · 과제: {a.isOpen ? "열림" : "닫힘"}
        </p>
        <LiveStatus assignmentId={id} initial={rows} />
      </main>
    </>
  );
}
