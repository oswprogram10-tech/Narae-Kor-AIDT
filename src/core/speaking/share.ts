// 토론 준비 반 공유: 반 친구에게 보여 주는 것(편·주장·근거)과 남길 수 있는 반응 스티커.
import type { DebateArtifact, DebateSide } from "./types";

export interface DebateSticker {
  id: string;
  label: string;
  emoji: string;
}

/** 반 친구가 남길 수 있는 반응 스티커(자유 댓글은 없다). 토론 갤러리에서만 쓴다. */
export const DEBATE_STICKERS: readonly DebateSticker[] = [
  { id: "solid", label: "근거가 탄탄해요", emoji: "🧱" },
  { id: "trust", label: "출처가 믿음직해요", emoji: "🔎" },
  { id: "new", label: "새롭게 생각하게 됐어요", emoji: "✨" },
  { id: "prepare", label: "반론을 준비하게 돼요", emoji: "🛡️" },
];

export const DEBATE_STICKER_IDS: readonly string[] = DEBATE_STICKERS.map((s) => s.id);
export const isDebateStickerId = (x: unknown): x is string => typeof x === "string" && DEBATE_STICKER_IDS.includes(x);

/** 반 친구에게 보이는 토론 준비: 편·주장·근거뿐. 예상 반론과 토론 뒤 한 줄은 들어가지 않는다. */
export interface SharedDebate {
  side: DebateSide;
  claim: string;
  reasons: { text: string; support: string; source: string }[];
}

/**
 * 공유 투영: 갤러리로 나가는 값을 이 함수로만 만든다(허용 목록 방식).
 * 편을 고르지 않았거나 주장·근거가 모두 비어 있으면 보여 줄 것이 없으므로 null.
 */
export function sharedDebateView(a: DebateArtifact): SharedDebate | null {
  if (a.side === null) return null;
  const reasons = a.reasons
    .filter((r) => r.text.trim())
    .map((r) => ({ text: r.text, support: r.support, source: r.source }));
  if (!a.claim.trim() && reasons.length === 0) return null;
  return { side: a.side, claim: a.claim, reasons };
}
