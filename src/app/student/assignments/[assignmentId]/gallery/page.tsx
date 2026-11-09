import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStudent } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { debateGalleryFor, galleryFor, impressionGalleryFor } from "@/lib/artifacts";
import { ImpressionGalleryView } from "./ImpressionGalleryView";
import { GalleryView } from "./GalleryView";
import { DebateGalleryView } from "./DebateGalleryView";

// 우리 반 갤러리: 선생님이 공유를 승인한 같은 반 작품만 보인다.
export default async function Gallery({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { studentId, classId } = await requireStudent();
  const assignmentId = Number((await params).assignmentId);
  if (!Number.isInteger(assignmentId)) notFound();
  const db = await getDb();
  const [asg] = await db.select({ kind: schema.assignments.kind, classId: schema.assignments.classId }).from(schema.assignments).where(eq(schema.assignments.id, assignmentId));
  if (!asg || asg.classId !== classId) notFound();
  if (asg.kind === "debate") {
    const g = await debateGalleryFor(assignmentId, classId, studentId);
    if (!g) notFound();
    return (
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <header className="space-y-1">
          <Link href={`/student/assignments/${assignmentId}`} className="text-sm text-stone-500 underline">← 내 토론 준비로</Link>
          <h1 className="text-xl font-bold">우리 반 갤러리 · {g.title}</h1>
          <p className="text-sm text-stone-600">상대편의 근거를 살펴보고 내 반론을 준비해 봐요. 읽고 스티커로 마음을 전해요. 글로 쓰는 댓글은 없어요.</p>
        </header>
        <DebateGalleryView motion={g.motion} works={g.works} />
      </main>
    );
  }
  if (asg.kind === "impression") {
    const g = await impressionGalleryFor(assignmentId, classId, studentId);
    if (!g) notFound();
    return (
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <header className="space-y-1">
          <Link href={`/student/assignments/${assignmentId}`} className="text-sm text-stone-500 underline">← 내 글로</Link>
          <h1 className="text-xl font-bold">우리 반 갤러리 · {g.title}</h1>
          <p className="text-sm text-stone-600">같은 문장을 고른 친구들의 생각을 모아 봤어요. 읽고 스티커로 마음을 전해요. 글로 쓰는 댓글은 없어요.</p>
        </header>
        <ImpressionGalleryView works={g.works} />
      </main>
    );
  }
  const gallery = await galleryFor(assignmentId, classId, studentId);
  if (!gallery) notFound();
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header className="space-y-1">
        <Link href={`/student/assignments/${assignmentId}`} className="text-sm text-stone-500 underline">← 내 카드뉴스로</Link>
        <h1 className="text-xl font-bold">우리 반 갤러리 · {gallery.title}</h1>
        <p className="text-sm text-stone-600">친구들의 카드뉴스를 읽고 스티커로 마음을 전해요. 글로 쓰는 댓글은 없어요.</p>
      </header>
      <GalleryView works={gallery.works} />
    </main>
  );
}
