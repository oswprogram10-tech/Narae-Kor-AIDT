"use client";

import { useState } from "react";
import { STICKERS, sourceCardOf } from "@/core/cardnews";
import type { GalleryWork } from "@/lib/artifacts";
import { CardView, SourceCardView } from "@/components/CardView";

export function GalleryView({ works: initial }: { works: GalleryWork[] }) {
  const [works, setWorks] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function toggle(submissionId: number, stickerId: string) {
    setError(null);
    try {
      const res = await fetch("/api/reactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissionId, stickerId }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; counts?: Record<string, number>; mine?: string[] };
      if (!res.ok || !data.counts || !data.mine) {
        setError(data.error ?? "스티커를 붙이지 못했어요.");
        return;
      }
      setWorks((ws) => ws.map((w) => (w.submissionId === submissionId ? { ...w, counts: data.counts!, mine: data.mine! } : w)));
    } catch {
      setError("스티커를 붙이지 못했어요. 인터넷을 확인해 주세요.");
    }
  }

  if (works.length === 0) return <p className="card text-stone-600" data-testid="gallery-empty">아직 갤러리에 올라온 작품이 없어요. 선생님이 공유를 허락하면 여기에 보여요.</p>;
  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {works.map((w) => (
        <article key={w.submissionId} className="card space-y-3" data-testid="gallery-work" data-own={w.own}>
          <header>
            <h2 className="text-lg font-bold">{w.topic || "카드뉴스"}</h2>
            <p className="text-sm text-stone-600">
              {w.nickname}{w.own && " (나)"} · 읽을 사람: {w.audience}
            </p>
            <p className="text-sm text-stone-700">핵심 메시지: {w.keyMessage}</p>
          </header>
          <ul className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2" aria-label="카드 넘겨 보기" tabIndex={0}>
            {w.cards.map((c, i) => (
              <li key={c.id} className="w-64 shrink-0 snap-start sm:w-72">
                <CardView card={c} label={`${i + 1}번 카드`} />
              </li>
            ))}
            <li className="w-64 shrink-0 snap-start sm:w-72">
              <SourceCardView source={sourceCardOf({ topic: "", audience: "", keyMessage: "", sources: w.sources })} />
            </li>
          </ul>
          <div role="group" aria-label="반응 스티커" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STICKERS.map((s) => {
              const on = w.mine.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  data-sticker={s.id}
                  disabled={w.own}
                  aria-pressed={on}
                  onClick={() => toggle(w.submissionId, s.id)}
                  className={`flex flex-col items-center rounded-xl border px-2 py-2 text-sm ${on ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-black/10 bg-white"} disabled:opacity-60`}
                >
                  <span className="text-2xl" aria-hidden="true">{s.emoji}</span>
                  <span>{s.label}</span>
                  <span className="text-base font-bold" data-count={s.id}>{w.counts[s.id] ?? 0}</span>
                </button>
              );
            })}
          </div>
          {w.own && <p className="text-xs text-stone-500">내 작품에는 스티커를 붙일 수 없어요. 받은 스티커는 위의 개수로 볼 수 있어요.</p>}
        </article>
      ))}
    </div>
  );
}
