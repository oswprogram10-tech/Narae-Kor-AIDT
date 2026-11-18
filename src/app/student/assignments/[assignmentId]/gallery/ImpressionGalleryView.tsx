"use client";

import { useMemo, useState } from "react";
import { IMPRESSION_STICKERS, groupBySentence } from "@/core/impression";
import type { ImpressionGalleryWork } from "@/lib/artifacts";

export function ImpressionGalleryView({ works: initial }: { works: ImpressionGalleryWork[] }) {
  const [works, setWorks] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const groups = useMemo(() => groupBySentence(works), [works]);

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

  if (works.length === 0) return <p className="card text-stone-600" data-testid="gallery-empty">아직 갤러리에 올라온 글이 없어요. 선생님이 공유를 허락하면 여기에 보여요.</p>;
  return (
    <div className="space-y-8">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {groups.map((g) => (
        <section key={`${g.workId}/${g.sentenceId}`} className="space-y-3" data-testid="sentence-group" data-group={`${g.workId}/${g.sentenceId}`} aria-label={`「${g.workTitle}」에서 같은 문장을 고른 친구들`}>
          <header className="rounded-xl bg-sun-100 px-4 py-3">
            <p className="text-xs text-stone-600">같은 문장을 고른 친구들 · {g.items.length}명 · 「{g.workTitle}」</p>
            <p className="mt-1 text-lg font-bold">{g.text}</p>
          </header>
          {g.items.map((w) => (
            <article key={w.submissionId} className="card space-y-3" data-testid="gallery-work" data-own={w.own}>
              <p className="text-sm font-semibold">{w.nickname}{w.own && " (나)"}</p>
              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-xs font-semibold text-stone-500">이 문장이 인상적인 까닭</div>
                  <p className="whitespace-pre-wrap break-words">{w.why}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold text-stone-500">내 삶과 이어 본 생각</div>
                  <p className="whitespace-pre-wrap break-words">{w.life}</p>
                </div>
              </div>
              <div role="group" aria-label="반응 스티커" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {IMPRESSION_STICKERS.map((s) => {
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
              {w.own && <p className="text-xs text-stone-500">내 글에는 스티커를 붙일 수 없어요. 받은 스티커는 위의 개수로 볼 수 있어요.</p>}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
