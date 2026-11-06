// 매체 이용 성찰 일지([6국06-04]) 핵심부 형식.

export const DAYS = 7;
export const MAX_MINUTES = 180;
export const LIMITS = { note: 100, reflection: 150 } as const;

export interface Category {
  id: string;
  label: string;
  /** 막대 색(글자 없이도 구별되도록 이름표를 항상 함께 쓴다) */
  color: string;
}

export const CATEGORIES: readonly Category[] = [
  { id: "video", label: "영상 보기", color: "#d1495b" },
  { id: "game", label: "게임", color: "#edae49" },
  { id: "chat", label: "대화·메시지", color: "#00798c" },
  { id: "study", label: "검색·공부", color: "#30638e" },
  { id: "read", label: "책·신문 읽기", color: "#66a182" },
];
export type CategoryId = "video" | "game" | "chat" | "study" | "read";
export const CATEGORY_IDS: readonly CategoryId[] = CATEGORIES.map((c) => c.id as CategoryId);

export interface Mood {
  id: string;
  emoji: string;
  label: string;
}

export const MOODS: readonly Mood[] = [
  { id: "great", emoji: "😄", label: "아주 좋았어요" },
  { id: "good", emoji: "🙂", label: "좋았어요" },
  { id: "soso", emoji: "😐", label: "그저 그랬어요" },
  { id: "tired", emoji: "😴", label: "피곤했어요" },
  { id: "bad", emoji: "😟", label: "속상했어요" },
];
export const MOOD_IDS = MOODS.map((m) => m.id);

export type Minutes = Record<CategoryId, number>;

export interface DiaryEntry {
  day: number;
  minutes: Minutes;
  /** 그날 가장 오래 한 일 */
  longest: CategoryId | null;
  mood: string | null;
  note: string;
}

export interface DiaryReflection {
  good: string;
  change: string;
  promise: string;
}

export interface DiaryArtifact {
  kind: "media-diary";
  step: 1 | 2 | 3;
  maxStep: 1 | 2 | 3;
  /** 기록한 날만 들어 있다(날짜 순) */
  entries: DiaryEntry[];
  reflection: DiaryReflection;
}
