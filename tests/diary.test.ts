import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  MAX_MINUTES,
  MOODS,
  classAverages,
  emptyDiary,
  emptyEntry,
  isLogged,
  sanitizeDiary,
  submitProblems,
  summarizeDiary,
  type DiaryArtifact,
} from "@/core/diary";
import { fieldsOf, scanSafety } from "@/core/artifact";

function entry(day: number, m: Partial<Record<"video" | "game" | "chat" | "study" | "read", number>>, extra = {}) {
  const e = emptyEntry(day);
  Object.assign(e.minutes, m);
  return Object.assign(e, extra);
}

describe("매체 이용 일지 형식", () => {
  it("분야 5개, 기분 얼굴 5개", () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(["video", "game", "chat", "study", "read"]);
    expect(MOODS.length).toBe(5);
  });

  it("날 1~7, 분 0~180 정수, 고정 목록, 글자 수를 고친다", () => {
    const raw = {
      kind: "media-diary",
      step: 9,
      entries: [
        { day: 0, minutes: {} },
        { day: 8, minutes: {} },
        { day: 2, minutes: { video: 999, game: -5, chat: 12.6, study: "30", read: "abc" }, longest: "nothing", mood: "angry", note: "가".repeat(300) },
        { day: 2, minutes: { video: 1 } },
        { day: 1, minutes: { video: 10 }, longest: "video", mood: "great" },
      ],
      reflection: { good: "나".repeat(400), change: 3, promise: "약속" },
    };
    const a = sanitizeDiary(raw)!;
    expect(a.entries.map((e) => e.day)).toEqual([1, 2]);
    const d2 = a.entries[1];
    expect(d2.minutes).toEqual({ video: MAX_MINUTES, game: 0, chat: 13, study: 30, read: 0 });
    expect(d2.longest).toBeNull();
    expect(d2.mood).toBeNull();
    expect(d2.note.length).toBe(100);
    expect(a.entries[0]).toMatchObject({ longest: "video", mood: "great" });
    expect(a.reflection.good.length).toBe(150);
    expect(a.reflection.change).toBe("");
    expect(a.step).toBe(1);
    expect(sanitizeDiary({ kind: "cardnews" })).toBeNull();
  });

  it("제출 전에 막는 문제: 하루 이상 기록, 성찰 세 가지", () => {
    const a = emptyDiary();
    expect(submitProblems(a).length).toBe(2);
    a.entries = [entry(1, { video: 30 })];
    a.reflection = { good: "a", change: "b", promise: "c" };
    expect(submitProblems(a)).toEqual([]);
  });

  it("아무것도 안 건드린 날은 기록한 날로 세지 않는다", () => {
    expect(isLogged(emptyEntry(3))).toBe(false);
    expect(isLogged(entry(3, {}, { mood: "good" }))).toBe(true);
  });
});

describe("요약", () => {
  const a: DiaryArtifact = {
    ...emptyDiary(),
    entries: [entry(1, { video: 60, game: 30 }, { longest: "video", mood: "good" }), entry(2, { video: 30, read: 20 }, { longest: "video", mood: "tired" }), emptyEntry(3)],
    reflection: { good: "a", change: "b", promise: "c" },
  };
  it("분야별 합계와 하루 평균", () => {
    const s = summarizeDiary(a);
    expect(s.daysLogged).toBe(2);
    expect(s.totals).toEqual({ video: 90, game: 30, chat: 0, study: 0, read: 20 });
    expect(s.averages).toEqual({ video: 45, game: 15, chat: 0, study: 0, read: 10 });
    expect(s.totalMinutes).toBe(140);
    expect(s.longestCounts.video).toBe(2);
    expect(s.moodCounts).toEqual({ good: 1, tired: 1 });
    expect(s.reflectionComplete).toBe(true);
  });
  it("학급 평균: 기록한 학생만, 학생별 하루 평균의 평균", () => {
    const b = summarizeDiary({ ...emptyDiary(), entries: [entry(1, { video: 100 })] });
    const c = summarizeDiary(emptyDiary());
    const avg = classAverages([summarizeDiary(a), b, c]);
    expect(avg.students).toBe(2);
    expect(avg.averages.video).toBe(72.5);
    expect(classAverages([c])).toEqual({ students: 0, averages: { video: 0, game: 0, chat: 0, study: 0, read: 0 } });
  });
});

describe("일지 안전 점검", () => {
  it("한 줄 생각·성찰 글에도 점검이 돈다", () => {
    const prev = emptyDiary();
    const next: DiaryArtifact = { ...emptyDiary(), entries: [entry(1, { game: 20 }, { note: "엄마 전화번호는 010-1111-2222예요" })], reflection: { good: "숙제를 먼저 했어요", change: "", promise: "" } };
    expect(fieldsOf(next).map((f) => f.key)).toEqual(["entry.1.note", "reflection.good", "reflection.change", "reflection.promise"]);
    const scan = scanSafety(prev, next);
    expect(scan.hits).toEqual([{ key: "entry.1.note", kind: "personal_info" }]);
    expect((scan.artifact as DiaryArtifact).entries[0].note).toBe("");
    expect((scan.artifact as DiaryArtifact).reflection.good).toBe("숙제를 먼저 했어요");
  });
});
