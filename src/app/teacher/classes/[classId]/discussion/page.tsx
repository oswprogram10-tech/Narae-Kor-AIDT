import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ownedClass, requireTeacher } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { TeacherHeader } from "@/components/TeacherHeader";
import { DiscussionBoard } from "./DiscussionBoard";

export const metadata = { title: "토의 말차례 신호등 · 국어나래" };

export default async function DiscussionPage({ params }: { params: Promise<{ classId: string }> }) {
  const { teacherId } = await requireTeacher();
  const classId = Number((await params).classId);
  const klass = await ownedClass(teacherId, classId);
  if (!klass) notFound();
  const db = await getDb();
  const [teacher] = await db.select().from(schema.teachers).where(eq(schema.teachers.id, teacherId));
  const students = await db
    .select({ number: schema.students.number })
    .from(schema.students)
    .where(eq(schema.students.classId, classId))
    .orderBy(schema.students.number);
  // 별명·이름은 화면으로 보내지 않고 번호만 보낸다.
  const numbers = students.map((s) => s.number);

  return (
    <>
      <TeacherHeader
        name={teacher?.displayName ?? ""}
        crumbs={[
          { href: `/teacher/classes/${classId}`, label: klass.name },
          { href: `/teacher/classes/${classId}/discussion`, label: "토의 말차례 신호등" },
        ]}
      />
      <DiscussionBoard classId={classId} numbers={numbers} />
    </>
  );
}
