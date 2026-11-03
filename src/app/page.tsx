import Link from "next/link";
import { getRegistry } from "@/lib/coach";
import { PROVIDER_LABELS } from "@/core/providers";

export const dynamic = "force-dynamic";

export default function Home() {
  const available = getRegistry().available();
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-4 py-12">
      <header className="text-center">
        <p className="text-sm font-semibold tracking-wide text-brand-600">국어나래 AI · 생각·붓 나래</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">대신 써 주지 않는 글쓰기 코치</h1>
        <p className="mt-3 text-stone-600">
          질문으로 생각을 꺼내고, 내 글은 내가 씁니다. 2022 개정 초등 국어 쓰기 성취기준에 맞춘 4단계 글쓰기.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/join" className="card group block p-6 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-4xl">✏️</div>
          <h2 className="mt-3 text-xl font-bold">학생 입장</h2>
          <p className="mt-1 text-stone-600">선생님이 알려 준 참여 코드로 들어가요.</p>
        </Link>
        <Link href="/teacher" className="card group block p-6 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-4xl">🧑‍🏫</div>
          <h2 className="mt-3 text-xl font-bold">선생님</h2>
          <p className="mt-1 text-stone-600">학급과 과제를 만들고, 학생들의 쓰기 과정을 실시간으로 봅니다.</p>
        </Link>
      </div>
      <p className="text-center text-sm text-stone-500">
        {available.length === 0 ? (
          <>
            지금은 <b>모의 코치 모드</b>입니다(설정된 AI 없음). 정해진 질문 은행으로 동작합니다.
          </>
        ) : (
          <>사용 가능한 코치 AI: {available.map((p) => PROVIDER_LABELS[p]).join(", ")} (모두 실패하면 모의 코치)</>
        )}
      </p>
    </main>
  );
}
