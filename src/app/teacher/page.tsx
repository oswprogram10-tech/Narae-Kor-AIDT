import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { requireTeacher } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { TeacherHeader } from "@/components/TeacherHeader";
import { CreateClassForm } from "./CreateClassForm";

export default async function TeacherHome() {
  const { teacherId } = await requireTeacher();
  const db = await getDb();
  const [teacher] = await db.select().from(schema.teachers).where(eq(schema.teachers.id, teacherId));
  const classes = await db
    .select({
      id: schema.classes.id,
      name: schema.classes.name,
      grade: schema.classes.grade,
      joinCode: schema.classes.joinCode,
      students: count(schema.students.id),
    })
    .from(schema.classes)
    .leftJoin(schema.students, eq(schema.students.classId, schema.classes.id))
    .where(eq(schema.classes.teacherId, teacherId))
    .groupBy(schema.classes.id)
    .orderBy(schema.classes.createdAt);

  return (
    <>
      <TeacherHeader name={teacher?.displayName ?? ""} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <h1 className="text-2xl font-bold">내 학급</h1>
        {classes.length === 0 && <p className="text-stone-600">아직 학급이 없어요. 아래에서 첫 학급을 만들어 보세요.</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Link key={c.id} href={`/teacher/classes/${c.id}`} className="card block transition hover:shadow-md">
              <div className="text-sm text-stone-500">{c.grade}학년</div>
              <div className="mt-1 text-lg font-bold">{c.name}</div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span>
                  참여 코드 <b className="font-mono tracking-widest text-brand-700">{c.joinCode}</b>
                </span>
                <span className="text-stone-500">학생 {c.students}명</span>
              </div>
            </Link>
          ))}
        </div>
        <section className="card max-w-md">
          <h2 className="mb-3 font-bold">새 학급 만들기</h2>
          <CreateClassForm />
        </section>
      </main>
    </>
  );
}
