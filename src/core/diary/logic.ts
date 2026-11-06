import {
  CATEGORY_IDS,
  DAYS,
  LIMITS,
  MAX_MINUTES,
  MOOD_IDS,
  type CategoryId,
  type DiaryArtifact,
  type DiaryEntry,
  type DiaryReflection,
  type Minutes,
} from "./types";

const clampStr = (x: unknown, max: number): string =>
  typeof x === "string" ? Array.from(x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")).slice(0, max).join("") : "";
const asRecord = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});

export const zeroMinutes = (): Minutes => ({ video: 0, game: 0, chat: 0, study: 0, read: 0 });

export function emptyDiary(): DiaryArtifact {
  return { kind: "media-diary", step: 1, maxStep: 1, entries: [], reflection: { good: "", change: "", promise: "" } };
}

export function emptyEntry(day: number): DiaryEntry {
  return { day, minutes: zeroMinutes(), longest: null, mood: null, note: "" };
}

const asMinutes = (x: unknown): number => {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? Math.min(MAX_MINUTES, Math.max(0, Math.round(n))) : 0;
};

/** 밖에서 들어온 값을 안전한 일지 형식으로 고친다(날 1~7, 분 0~180 정수, 고정 목록). */
export function sanitizeDiary(raw: unknown, prev?: DiaryArtifact | null): DiaryArtifact | null {
  const r = asRecord(raw);
  if (r.kind !== "media-diary" || !Array.isArray(r.entries)) return null;
  const byDay = new Map<number, DiaryEntry>();
  for (const e of r.entries) {
    const o = asRecord(e);
    const day = Number(o.day);
    if (!Number.isInteger(day) || day < 1 || day > DAYS || byDay.has(day)) continue;
    const m = asRecord(o.minutes);
    const minutes = zeroMinutes();
    for (const id of CATEGORY_IDS) minutes[id] = asMinutes(m[id]);
    byDay.set(day, {
      day,
      minutes,
      longest: typeof o.longest === "string" && (CATEGORY_IDS as readonly string[]).includes(o.longest) ? (o.longest as CategoryId) : null,
      mood: typeof o.mood === "string" && MOOD_IDS.includes(o.mood) ? o.mood : null,
      note: clampStr(o.note, LIMITS.note),
    });
  }
  const rf = asRecord(r.reflection);
  const reflection: DiaryReflection = {
    good: clampStr(rf.good, LIMITS.reflection),
    change: clampStr(rf.change, LIMITS.reflection),
    promise: clampStr(rf.promise, LIMITS.reflection),
  };
  const step = r.step === 1 || r.step === 2 || r.step === 3 ? r.step : 1;
  const maxStep = Math.max(prev?.maxStep ?? 1, step) as 1 | 2 | 3;
  return { kind: "media-diary", step, maxStep, entries: [...byDay.values()].sort((a, b) => a.day - b.day), reflection };
}

/** 그날 무엇이든 기록했는가(분이 있거나, 기분·한 줄 생각을 남김) */
export const isLogged = (e: DiaryEntry): boolean =>
  CATEGORY_IDS.some((c) => e.minutes[c] > 0) || e.mood !== null || e.note.trim() !== "" || e.longest !== null;

export const reflectionComplete = (r: DiaryReflection): boolean => !!(r.good.trim() && r.change.trim() && r.promise.trim());

export function submitProblems(a: DiaryArtifact): string[] {
  const out: string[] = [];
  if (a.entries.filter(isLogged).length < 1) out.push("하루 이상 기록해 주세요.");
  if (!reflectionComplete(a.reflection)) out.push("성찰 질문 세 가지에 모두 답해 주세요.");
  return out;
}

export interface DiarySummary {
  daysLogged: number;
  /** 분야별 합계(분) */
  totals: Minutes;
  /** 기록한 날 하루당 평균(분, 소수 첫째 자리) */
  averages: Minutes;
  totalMinutes: number;
  /** '가장 오래 한 일'로 고른 횟수 */
  longestCounts: Record<CategoryId, number>;
  moodCounts: Record<string, number>;
  reflectionComplete: boolean;
}

export function summarizeDiary(a: DiaryArtifact): DiarySummary {
  const logged = a.entries.filter(isLogged);
  const totals = zeroMinutes();
  const longestCounts = { video: 0, game: 0, chat: 0, study: 0, read: 0 } as Record<CategoryId, number>;
  const moodCounts: Record<string, number> = {};
  for (const e of logged) {
    for (const c of CATEGORY_IDS) totals[c] += e.minutes[c];
    if (e.longest) longestCounts[e.longest]++;
    if (e.mood) moodCounts[e.mood] = (moodCounts[e.mood] ?? 0) + 1;
  }
  const averages = zeroMinutes();
  for (const c of CATEGORY_IDS) averages[c] = logged.length ? Math.round((totals[c] / logged.length) * 10) / 10 : 0;
  return {
    daysLogged: logged.length,
    totals,
    averages,
    totalMinutes: CATEGORY_IDS.reduce((s, c) => s + totals[c], 0),
    longestCounts,
    moodCounts,
    reflectionComplete: reflectionComplete(a.reflection),
  };
}

/** 학급 평균: 기록한 날이 있는 학생들의 '하루 평균'을 다시 평균 낸다(교사용). */
export function classAverages(summaries: readonly DiarySummary[]): { students: number; averages: Minutes } {
  const active = summaries.filter((s) => s.daysLogged > 0);
  const averages = zeroMinutes();
  if (active.length) {
    for (const c of CATEGORY_IDS) averages[c] = Math.round((active.reduce((s, x) => s + x.averages[c], 0) / active.length) * 10) / 10;
  }
  return { students: active.length, averages };
}
