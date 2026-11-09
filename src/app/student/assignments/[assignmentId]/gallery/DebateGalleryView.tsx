"use client";

import { useState } from "react";
import { DEBATE_STICKERS } from "@/core/speaking";
import type { DebateSide } from "@/core/speaking";
import type { DebateGalleryWork } from "@/lib/artifacts";

const SIDE_TEXT: Record<DebateSide, string> = { pro: "찬성", con: "반대" };
const SIDE_MARK: Record<DebateSide, string> = { pro: "▲", con: "▼" };
// 편 색은 토론 타이머와 같다(찬성 파랑·반대 주황, 글자도 함께 보여 색에만 기대지 않는다).
const SIDE_HEAD: Record<DebateSide, string> = { pro: "bg-blue-700 text-white", con: "bg-orange-700 text-white" };
const SIDE_CARD: Record<DebateSide, string> = { pro: "border-blue-700 bg-blue-50", con: "border-orange-700 bg-orange-50" };
const SIDE_TAB: Record<DebateSide, string> = { pro: "border-blue-700 bg-blue-700 text-white", con: "border-orange-700 bg-orange-700 text-white" };

export function DebateGalleryView({ motion, works: initial }: { motion: string; works: DebateGalleryWork[] }) {
  const [works, setWorks] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  // 휴대폰에서는 한 번에 한 편만 보여 주는 탭
  const [tab, setTab] = useState<DebateSide>("pro");

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

  const by = (side: DebateSide) => works.filter((w) => w.shared.side === side);

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-black/10 bg-white p-3 text-lg" data-testid="gallery-motion">
        <span className="mr-2 text-sm font-semibold text-stone-500">논제</span>
        <b>{motion}</b>
      </p>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {works.length === 0 && <p className="card text-stone-600" data-testid="gallery-empty">아직 갤러리에 올라온 토론 준비가 없어요. 선생님이 공유를 허락하면 여기에 보여요.</p>}

      <div role="tablist" aria-label="편 고르기" className="grid grid-cols-2 gap-2 md:hidden">
        {(["pro", "con"] as const).map((side) => (
          <button
            key={side}
            type="button"
            role="tab"
            aria-selected={tab === side}
            data-tab={side}
            onClick={() => setTab(side)}
            className={`min-h-11 rounded-xl border-2 px-3 py-2 font-bold ${tab === side ? SIDE_TAB[side] : "border-stone-300 bg-white text-stone-800"}`}
          >
            {SIDE_MARK[side]} {SIDE_TEXT[side]} {by(side).length}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(["pro", "con"] as const).map((side) => (
          <section key={side} data-side-col={side} aria-label={`${SIDE_TEXT[side]} 편`} className={`space-y-3 ${tab === side ? "" : "hidden md:block md:space-y-3"}`}>
            <h2 className={`hidden rounded-xl px-3 py-2 text-lg font-bold md:block ${SIDE_HEAD[side]}`}>{SIDE_MARK[side]} {SIDE_TEXT[side]} {by(side).length}</h2>
            {by(side).length === 0 && <p className="rounded-xl border border-dashed border-stone-300 p-3 text-sm text-stone-500">아직 {SIDE_TEXT[side]} 편 글이 없어요.</p>}
            {by(side).map((w) => (
              <article key={w.submissionId} className={`space-y-3 rounded-2xl border-2 p-3 ${SIDE_CARD[side]}`} data-testid="gallery-work" data-own={w.own} data-side={side}>
                <p className="text-sm font-semibold">{w.nickname}{w.own && " (나)"}</p>
                <p className="text-base font-bold break-words" data-testid="claim">{w.shared.claim || "(주장을 쓰지 않았어요)"}</p>
                <ul className="space-y-2">
                  {w.shared.reasons.map((r, i) => (
                    <li key={i} className="rounded-lg bg-white/80 p-2 text-sm" data-testid="reason">
                      <p className="break-words"><b>근거 {i + 1}</b> {r.text}</p>
                      {r.support.trim() && <p className="mt-1 break-words text-xs text-stone-600">뒷받침 자료: {r.support}</p>}
                      {r.source.trim() && <p className="break-words text-xs text-stone-600">출처: {r.source}</p>}
                    </li>
                  ))}
                </ul>
                <div role="group" aria-label="반응 스티커" className="grid grid-cols-2 gap-2">
                  {DEBATE_STICKERS.map((s) => {
                    const on = w.mine.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        data-sticker={s.id}
                        disabled={w.own}
                        aria-pressed={on}
                        onClick={() => toggle(w.submissionId, s.id)}
                        className={`flex min-h-11 flex-col items-center rounded-xl border px-2 py-2 text-sm ${on ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-black/10 bg-white"} disabled:opacity-60`}
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
    </div>
  );
}
