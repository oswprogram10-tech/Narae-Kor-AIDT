import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStudent } from "@/lib/auth";
import { galleryFor } from "@/lib/artifacts";
import { GalleryView } from "./GalleryView";

// 우리 반 갤러리: 선생님이 공유를 승인한 같은 반 작품만 보인다.
export default async function Gallery({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { studentId, classId } = await requireStudent();
  const assignmentId = Number((await params).assignmentId);
  if (!Number.isInteger(assignmentId)) notFound();
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
