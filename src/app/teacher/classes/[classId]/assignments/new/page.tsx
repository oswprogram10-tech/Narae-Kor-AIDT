import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ownedClass, requireTeacher } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { TeacherHeader } from "@/components/TeacherHeader";
import { genresForGrade } from "@/core/data/genres";
import { getStandard } from "@/core/data/standards";
import { NewAssignmentForm } from "./NewAssignmentForm";

export default async function NewAssignment({ params }: { params: Promise<{ classId: string }> }) {
  const { teacherId } = await requireTeacher();
  const classId = Number((await params).classId);
  const klass = await ownedClass(teacherId, classId);
  if (!klass) notFound();
  const db = await getDb();
  const [teacher] = await db.select().from(schema.teachers).where(eq(schema.teachers.id, teacherId));
  const genres = genresForGrade(klass.grade).map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    defaultPrompt: g.defaultPrompt,
    standards: g.standardCodes.map((c) => ({ code: c, statement: getStandard(c)?.statement ?? "" })),
    organizer: g.organizer.map((f) => f.label),
    rubric: g.rubric.map((r) => r.label),
  }));
  return (
    <>
      <TeacherHeader
        name={teacher?.displayName ?? ""}
        crumbs={[
          { href: `/teacher/classes/${classId}`, label: klass.name },
          { href: `/teacher/classes/${classId}/assignments/new`, label: "새 과제" },
        ]}
      />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold">글쓰기 과제 만들기</h1>
        <NewAssignmentForm classId={classId} genres={genres} />
      </main>
    </>
  );
}
