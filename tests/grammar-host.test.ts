import { describe, expect, it } from "vitest";
import { GRAMMAR_ACTIVITIES, getItem, type AgreementFixItem, type SentenceBuildItem } from "@/core/grammar";
import {
  parseAnswer,
  progressSummary,
  studentItems,
  summarizeAttempts,
  wrongAttemptCount,
  type AttemptRow,
} from "@/lib/grammar-rules";

const FORBIDDEN = ["answers", "awkward", "wrongIndex", "correctOption", "explanation", "principle", "hints"];

describe("studentItems", () => {
  it("모든 활동의 문제에 정답 정보가 새지 않는다", () => {
    for (const act of GRAMMAR_ACTIVITIES) {
      const items = studentItems(act.id);
      expect(items.length).toBe(act.itemIds.length);
      for (const it of items) {
        for (const key of FORBIDDEN) expect(it).not.toHaveProperty(key);
        const json = JSON.stringify(it);
        const full = getItem(it.id)!;
        expect(json).not.toContain(full.explanation);
        expect(json).not.toContain(full.principle);
      }
    }
  });
  it("없는 활동은 빈 배열", () => {
    expect(studentItems("nope")).toEqual([]);
  });
});

describe("wrongAttemptCount", () => {
  it("awkward와 ok는 세지 않는다", () => {
    expect(wrongAttemptCount(["awkward", "awkward"])).toBe(0);
    expect(wrongAttemptCount(["wrong-order", "awkward", "wrong-order"])).toBe(2);
    expect(wrongAttemptCount(["missing-blocks", "wrong-position", "wrong-option"])).toBe(3);
    expect(wrongAttemptCount([])).toBe(0);
  });
});

describe("parseAnswer", () => {
  const sb = getItem("sb-05") as SentenceBuildItem;
  const ag = getItem("hn-01") as AgreementFixItem;
  const ids = sb.blocks.map((b) => b.id);

  it("올바른 모양은 통과", () => {
    expect(parseAnswer(sb, { type: "sentence-build", order: ids })).toEqual({ type: "sentence-build", order: ids });
    expect(parseAnswer(ag, { type: "agreement-fix", index: 0, option: 0 })).toEqual({ type: "agreement-fix", index: 0, option: 0 });
  });
  it("잘못된 모양은 거부", () => {
    expect(parseAnswer(sb, null)).toBeNull();
    expect(parseAnswer(sb, { type: "agreement-fix", index: 0, option: 0 })).toBeNull();
    expect(parseAnswer(sb, { type: "sentence-build", order: ids.slice(1) })).toBeNull();
    expect(parseAnswer(sb, { type: "sentence-build", order: [ids[0], ids[0], ...ids.slice(2)] })).toBeNull();
    expect(parseAnswer(sb, { type: "sentence-build", order: [...ids.slice(1), "zz"] })).toBeNull();
    expect(parseAnswer(sb, { type: "sentence-build", order: ids.map(() => 1) })).toBeNull();
    expect(parseAnswer(ag, { type: "sentence-build", order: [] })).toBeNull();
    expect(parseAnswer(ag, { type: "agreement-fix", index: -1, option: 0 })).toBeNull();
    expect(parseAnswer(ag, { type: "agreement-fix", index: ag.tokens.length, option: 0 })).toBeNull();
    expect(parseAnswer(ag, { type: "agreement-fix", index: 0, option: ag.options.length })).toBeNull();
    expect(parseAnswer(ag, { type: "agreement-fix", index: 0.5, option: 0 })).toBeNull();
    expect(parseAnswer(ag, { type: "agreement-fix", index: "0", option: 0 })).toBeNull();
  });
});

describe("summarizeAttempts", () => {
  const t0 = new Date("2026-01-01T00:00:00Z");
  const row = (itemId: string, attemptNo: number, correct: boolean, feedbackLevel: string | null, sec: number): AttemptRow => ({
    itemId,
    attemptNo,
    correct,
    feedbackLevel,
    createdAt: new Date(t0.getTime() + sec * 1000),
  });
  it("첫 시도 정답, 도움 받아 완료, 힌트 단계를 계산한다", () => {
    const rows = [
      row("a", 1, true, null, 0),
      row("b", 1, false, "principle", 0),
      row("b", 2, false, "hint1", 10),
      row("b", 3, false, "awkward", 15),
      row("b", 4, true, null, 30),
      row("c", 1, false, "principle", 0),
      row("c", 2, false, "hint1", 5),
      row("c", 3, false, "hint2", 10),
      row("c", 4, false, "reveal", 20),
    ];
    const p = summarizeAttempts(["a", "b", "c", "d"], rows);
    expect(p[0]).toMatchObject({ solved: true, firstTryCorrect: true, revealed: false, hintsUsed: 0, attempts: 1 });
    expect(p[1]).toMatchObject({ solved: true, firstTryCorrect: false, revealed: false, hintsUsed: 1, secondsToSolve: 30 });
    expect(p[2]).toMatchObject({ solved: true, revealed: true, hintsUsed: 3, secondsToSolve: 20 });
    expect(p[3]).toMatchObject({ solved: false, attempts: 0, secondsToSolve: null });
    expect(progressSummary(p)).toEqual({ total: 4, solved: 3, firstTry: 1, revealed: 1 });
  });
});
