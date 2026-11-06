// 인상적인 부분 의견 나누기([6국05-04]) 핵심부 형식. 호스트(웹·앱)와 무관한 순수 데이터다.

/** 글자 수 제한(글자 단위)과 제출 때 필요한 최소 글자 수 */
export const LIMITS = {
  why: 200,
  life: 200,
  reflection: 100,
} as const;

export const MIN_CHARS = {
  why: 20,
  life: 10,
} as const;

export type ImpressionStep = 1 | 2 | 3;

export interface ImpressionArtifact {
  kind: "impression";
  /** 1 작품 고르기 · 2 문장 고르기 · 3 쓰고 내기 */
  step: ImpressionStep;
  /** 지금까지 가장 멀리 간 단계(연구용) */
  maxStep: ImpressionStep;
  /** 고른 작품(지문 id). 없으면 "" */
  workId: string;
  /** 고른 인상적인 문장(작품 안의 문장 id). 없으면 "" */
  sentenceId: string;
  /** 그 문장이 인상적인 까닭 */
  why: string;
  /** 내 삶(경험·생각)과 이어 본 생각 */
  life: string;
}

export interface ImpressionSticker {
  id: string;
  label: string;
  emoji: string;
}

/** 반 친구가 남길 수 있는 반응 스티커(자유 댓글은 없다). 카드뉴스 스티커와 id가 겹치지 않는다. */
export const IMPRESSION_STICKERS: readonly ImpressionSticker[] = [
  { id: "same", label: "나도 그 부분이 좋았어요", emoji: "💛" },
  { id: "rethink", label: "새롭게 생각하게 됐어요", emoji: "💭" },
  { id: "memory", label: "내 경험이 떠올랐어요", emoji: "🌈" },
  { id: "reason", label: "까닭이 잘 드러나요", emoji: "🔍" },
];

export const IMPRESSION_STICKER_IDS = IMPRESSION_STICKERS.map((s) => s.id);
export const isImpressionStickerId = (x: unknown): x is string => typeof x === "string" && IMPRESSION_STICKER_IDS.includes(x);
