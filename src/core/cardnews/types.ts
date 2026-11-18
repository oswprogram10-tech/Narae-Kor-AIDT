// 카드뉴스 만들기([6국06-03]) 핵심부 형식. 호스트(웹·앱)와 무관한 순수 데이터다.

export const CARD_MIN = 4;
export const CARD_MAX = 6;
export const MAX_SOURCES = 5;

/** 글자 수 제한(글자 단위) */
export const LIMITS = {
  topic: 30,
  audience: 30,
  keyMessage: 60,
  sourceTitle: 40,
  sourceWhere: 40,
  cardTitle: 20,
  cardBody: 90,
  reflection: 100,
} as const;

export type CardLayout = "cover" | "content" | "closing";

export interface CardColor {
  id: string;
  label: string;
  /** 배경색과 글자색(글자 대비 4.5:1 이상으로 골랐다) */
  bg: string;
  fg: string;
}

export const CARD_COLORS: readonly CardColor[] = [
  { id: "mint", label: "연두", bg: "#d9f2e6", fg: "#14463a" },
  { id: "sky", label: "하늘", bg: "#d8eafc", fg: "#14355a" },
  { id: "sun", label: "노랑", bg: "#fff1c2", fg: "#5a3d00" },
  { id: "rose", label: "분홍", bg: "#fde0e4", fg: "#6a1b2b" },
  { id: "lilac", label: "보라", bg: "#e6e0fb", fg: "#3a2a73" },
  { id: "peach", label: "주황", bg: "#ffe3d0", fg: "#6b3410" },
  { id: "leaf", label: "풀색", bg: "#e3f1c8", fg: "#2f4a0a" },
  { id: "navy", label: "남색", bg: "#1f3a5f", fg: "#ffffff" },
];

export const COLOR_IDS = CARD_COLORS.map((c) => c.id);

/** 그림 기호: 정해 둔 이모지 24개만 쓴다(사진·내려받기 없음) */
export const CARD_ICONS: readonly string[] = [
  "📚", "💡", "🌱", "🐾", "🌍", "⭐", "🎈", "🚲",
  "🍎", "🥕", "🎵", "✏️", "🔍", "🏃", "🌧️", "☀️",
  "🐶", "🐱", "🧠", "🤝", "🧼", "🛡️", "📣", "✅",
];

export interface Reaction {
  id: string;
  label: string;
  emoji: string;
}

/** 반 친구가 남길 수 있는 반응 스티커(자유 댓글은 없다) */
export const STICKERS: readonly Reaction[] = [
  { id: "clear", label: "이해가 잘 돼요", emoji: "💡" },
  { id: "new", label: "새로 알게 됐어요", emoji: "✨" },
  { id: "icons", label: "그림 기호가 잘 어울려요", emoji: "🎨" },
  { id: "trust", label: "출처가 믿음직해요", emoji: "🔎" },
];

export const STICKER_IDS = STICKERS.map((s) => s.id);
export const isStickerId = (x: unknown): x is string => typeof x === "string" && STICKER_IDS.includes(x);

export interface Source {
  title: string;
  where: string;
}

export interface CardPlan {
  topic: string;
  audience: string;
  keyMessage: string;
  sources: Source[];
}

export interface Card {
  id: string;
  /** 위치로 정해진다: 첫 장 표지, 마지막 장 마무리, 나머지 내용 */
  layout: CardLayout;
  title: string;
  body: string;
  color: string;
  icon: string;
}

export type StepNo = 1 | 2 | 3 | 4;

export interface CardnewsArtifact {
  kind: "cardnews";
  step: StepNo;
  /** 지금까지 가장 멀리 간 단계(연구용) */
  maxStep: StepNo;
  plan: CardPlan;
  cards: Card[];
  /** 학생이 직접 확인하는 점검 */
  confirms: { keyMessage: boolean; audience: boolean };
  /** 호스트가 제출할 때 적는다(학생 입력은 무시) */
  submitWarnings: number | null;
  /** 호스트가 적는다: 제출 뒤 내용을 고친 횟수와 마지막으로 센 시각(ms) */
  revisions: number;
  lastRevisionAt: number | null;
}

/** 자동 출처 카드(마지막 장). 계획의 출처 목록에서 만든다. */
export interface SourceCard {
  title: string;
  lines: string[];
}
