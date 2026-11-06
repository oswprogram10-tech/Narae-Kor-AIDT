import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ownedClass, requireTeacher } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { TeacherHeader } from "@/components/TeacherHeader";
import { resetStudentPin } from "@/app/actions/teacher";
import { getGenre } from "@/core/data/genres";
import { getActivity } from "@/core/grammar";
import { getActivity as getReadingActivity } from "@/core/reading";

export default async function ClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const { teacherId } = await requireTeacher();
  const classId = Number((await params).classId);
  const klass = await ownedClass(teacherId, classId);
  if (!klass) notFound();
  const db = await getDb();
  const [teacher] = await db.select().from(schema.teachers).where(eq(schema.teachers.id, teacherId));
  const students = await db
    .select()
    .from(schema.students)
    .where(eq(schema.students.classId, classId))
    .orderBy(schema.students.number);
  const assignments = await db
    .select()
    .from(schema.assignments)
    .where(eq(schema.assignments.classId, classId))
    .orderBy(desc(schema.assignments.createdAt));

  return (
    <>
      <TeacherHeader name={teacher?.displayName ?? ""} crumbs={[{ href: `/teacher/classes/${classId}`, label: klass.name }]} />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold">
              {klass.name} <span className="text-base font-normal text-stone-500">{klass.grade}학년</span>
            </h1>
            <Link href={`/teacher/classes/${classId}/assignments/new`} className="btn-primary">+ 과제 만들기</Link>
          </div>
          {assignments.length === 0 && <p className="card text-stone-600">아직 과제가 없어요.</p>}
          {assignments.map((a) => (
            <Link key={a.id} href={`/teacher/assignments/${a.id}`} className="card block transition hover:shadow-md">
              <div className="flex items-center gap-2 text-sm text-stone-500">
                <span>{a.kind === "grammar"
                    ? (getActivity(a.activityId ?? "")?.title ?? "문법·어휘 활동")
                    : a.kind === "reading"
                      ? (getReadingActivity(a.activityId ?? "")?.title ?? "읽기 활동")
                      : getGenre(a.genreId)?.name}</span>
                <span>·</span>
                <span>{a.standardCodes.map((c) => `[${c}]`).join(" ")}</span>
                {!a.isOpen && <span className="rounded bg-stone-100 px-2 py-0.5 text-xs">닫힘</span>}
              </div>
              <div className="mt-1 text-lg font-bold">{a.title}</div>
              <p className="mt-1 line-clamp-2 text-stone-600">{a.prompt}</p>
            </Link>
          ))}
        </section>

        <aside className="space-y-4">
          <div className="card text-center">
            <div className="text-sm text-stone-500">학생 참여 코드</div>
            <div className="mt-1 font-mono text-4xl font-bold tracking-[0.3em] text-brand-700">{klass.joinCode}</div>
            <p className="mt-2 text-xs text-stone-500">학생은 첫 화면의 ‘학생 입장’에서 이 코드와 자기 번호를 넣고, 별명과 그림 비밀번호를 정해요.</p>
          </div>
          <div className="card">
            <h2 className="mb-2 font-bold">학생 ({students.length}명)</h2>
            <p className="mb-3 text-xs text-stone-500">실명은 저장하지 않아요. 번호와 이름 대응표는 선생님이 따로 보관해 주세요.</p>
            <ul className="divide-y divide-black/5 text-sm">
              {students.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <span>
                    <b className="inline-block w-8">{s.number}</b>
                    {s.nickname}
                    {s.pinHash === "" && <span className="ml-2 text-xs text-sun-400">비밀번호 재설정 대기</span>}
                  </span>
                  <form action={resetStudentPin.bind(null, classId, s.id)}>
                    <button className="text-xs text-stone-500 underline hover:text-stone-800">그림 비밀번호 초기화</button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </>
  );
}
