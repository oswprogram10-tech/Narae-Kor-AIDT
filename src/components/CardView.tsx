import { colorOf, LAYOUT_LABELS, type CardLayout, type SourceCard } from "@/core/cardnews";

export interface CardViewData {
  layout: CardLayout;
  title: string;
  body: string;
  color: string;
  icon: string;
}

/** 카드 한 장 그림. 서버·클라이언트 어디서나 쓴다. 배경색과 글자색은 정해 둔 색 묶음에서만 온다. */
export function CardView({ card, size = "lg", label }: { card: CardViewData; size?: "lg" | "sm"; label?: string }) {
  const c = colorOf(card.color);
  const big = size === "lg";
  const cover = card.layout === "cover";
  return (
    <div
      role="group"
      aria-label={label ?? `${LAYOUT_LABELS[card.layout]} 카드`}
      data-testid="card-view"
      data-layout={card.layout}
      style={{ background: c.bg, color: c.fg }}
      className={`flex aspect-square w-full flex-col justify-between overflow-hidden rounded-2xl border border-black/10 shadow-sm ${big ? "p-5 sm:p-6" : "p-3"}`}
    >
      <div className={`flex items-center justify-between ${big ? "text-xs" : "text-[10px]"} font-semibold opacity-80`}>
        <span>{LAYOUT_LABELS[card.layout]}</span>
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <span aria-hidden="true" className={big ? (cover ? "text-7xl" : "text-6xl") : "text-3xl"}>{card.icon}</span>
        <p className={`break-words font-bold leading-snug ${big ? (cover ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl") : "text-sm"}`}>
          {card.title || <span className="opacity-50">제목</span>}
        </p>
        <p className={`whitespace-pre-wrap break-words leading-relaxed ${big ? "text-base sm:text-lg" : "text-[11px]"}`}>
          {card.body || <span className="opacity-50">본문</span>}
        </p>
      </div>
      <div />
    </div>
  );
}

/** 마지막 장에 자동으로 붙는 출처 카드 */
export function SourceCardView({ source, size = "lg" }: { source: SourceCard; size?: "lg" | "sm" }) {
  const big = size === "lg";
  return (
    <div
      role="group"
      aria-label="출처 카드"
      data-testid="source-card"
      className={`flex aspect-square w-full flex-col justify-between overflow-hidden rounded-2xl border border-black/10 bg-white text-stone-800 shadow-sm ${big ? "p-5 sm:p-6" : "p-3"}`}
    >
      <div className={`${big ? "text-xs" : "text-[10px]"} font-semibold text-stone-500`}>출처 (자동)</div>
      <div className="text-center">
        <span aria-hidden="true" className={big ? "text-5xl" : "text-2xl"}>📎</span>
        <p className={`mt-1 font-bold ${big ? "text-xl" : "text-sm"}`}>{source.title}</p>
        <ul className={`mt-2 space-y-1 ${big ? "text-base" : "text-[11px]"}`}>
          {source.lines.map((l, i) => (
            <li key={i} className="break-words">{l}</li>
          ))}
        </ul>
      </div>
      <div />
    </div>
  );
}
