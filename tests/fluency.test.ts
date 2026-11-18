import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { alignEojeol, charErrorRate, fluencyScore, normalizeEojeol, splitEojeols } from "@/core/fluency";

interface Case {
  name: string;
  reference: string;
  hypothesis: string;
  seconds: number;
  maxCer?: number;
  items: [string, string | null, string][];
  insertions: [number, string][];
  errors: number[];
  accuracy: number;
  wcpm: number;
}

const fixture = JSON.parse(readFileSync(new URL("./fixtures/fluency-align.json", import.meta.url), "utf8")) as { cases: Case[] };

describe("낭독 어절 맞춤: 공통 시험 자료", () => {
  it("시험 자료는 25쌍 이상", () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(25);
  });

  for (const c of fixture.cases) {
    it(c.name, () => {
      const opts = c.maxCer === undefined ? {} : { maxCer: c.maxCer };
      const a = alignEojeol(c.reference, c.hypothesis, opts);
      expect(a.items.map((x) => [x.ref, x.hyp ?? null, x.op])).toEqual(c.items);
      expect(a.insertions.map((x) => [x.at, x.hyp])).toEqual(c.insertions);
      const s = fluencyScore(c.reference, c.hypothesis, c.seconds, opts);
      expect(s.errors).toEqual(c.errors);
      expect(s.accuracy).toBeCloseTo(c.accuracy, 9);
      expect(s.wcpm).toBeCloseTo(c.wcpm, 9);
    });
  }
});

describe("낭독 어절 맞춤: 띄어쓰기 옵션", () => {
  const ref = "그는 괜찮은 척하려고 애쓰는 것 같았다";
  const hyp = "걔는괜찮은척하려고애쓰는것같았다";

  it("기본(ignore)은 띄어쓰기에 흔들리지 않는다", () => {
    expect(fluencyScore(ref, hyp, 60).errors).toEqual([0]);
    expect(fluencyScore(ref, hyp, 60, { spacing: "ignore" }).errors).toEqual([0]);
  });

  it("strict는 예전 동작(공백 어절 단위)", () => {
    const a = alignEojeol(ref, hyp, { spacing: "strict" });
    expect(a.items.every((x) => x.op !== "match")).toBe(true);
    expect(fluencyScore(ref, hyp, 60, { spacing: "strict" }).correct).toBe(0);
    expect(alignEojeol("할 수 있다", "할수 있다", { spacing: "strict" }).items.map((x) => x.op)).toEqual(["sub", "del", "match"]);
  });
});

describe("낭독 어절 맞춤: 기본 함수", () => {
  it("문장부호를 지우고 공백을 줄이며 숫자는 그대로 둔다", () => {
    expect(normalizeEojeol("  나는,  3개를   샀어요! ")).toBe("나는 3개를 샀어요");
    expect(splitEojeols("… — ,")).toEqual([]);
  });

  it("글자 오류율", () => {
    expect(charErrorRate("갔어요", "갔어여")).toBeCloseTo(1 / 3, 9);
    expect(charErrorRate("", "")).toBe(0);
  });

  it("걸린 시간이 0 이하면 wcpm은 0", () => {
    expect(fluencyScore("나는 갔어요", "나는 갔어요", 0).wcpm).toBe(0);
    expect(fluencyScore("나는 갔어요", "나는 갔어요", 0).accuracy).toBe(1);
  });
});
