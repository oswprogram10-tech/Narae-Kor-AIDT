import { describe, expect, it } from "vitest";
import { STANDARDS, getStandard } from "@/core/data/standards";
import { GENRES, REVISION_LENSES, genresForGrade, lensQuestion } from "@/core/data/genres";

describe("standards", () => {
  it("has 87 elementary standards (23 / 30 / 34)", () => {
    expect(STANDARDS).toHaveLength(87);
    expect(STANDARDS.filter((s) => s.gradeBand === "1-2")).toHaveLength(23);
    expect(STANDARDS.filter((s) => s.gradeBand === "3-4")).toHaveLength(30);
    expect(STANDARDS.filter((s) => s.gradeBand === "5-6")).toHaveLength(34);
    expect(new Set(STANDARDS.map((s) => s.code)).size).toBe(87);
  });
  it("matches the code format and does not contain 6국02-06", () => {
    for (const s of STANDARDS) expect(s.code).toMatch(/^[246]국0[1-6]-0[1-7]$/);
    expect(getStandard("6국02-06")).toBeUndefined();
    expect(getStandard("4국02-06")).toBeDefined();
  });
});

// 문학 성취기준을 쓰기 활동으로 풀어내는 글 종류
const LITERATURE_GENRE_IDS = new Set(["character-letter", "experience-poem", "experience-story"]);

describe("genres", () => {
  it("only reference existing writing (or literature) standards and have 3-level rubrics", () => {
    for (const g of GENRES) {
      for (const c of g.standardCodes) expect(getStandard(c)?.area, `${g.id}:${c}`).toBe(LITERATURE_GENRE_IDS.has(g.id) ? "문학" : "쓰기");
      expect(g.organizer.length).toBeGreaterThan(0);
      for (const r of g.rubric) expect(r.levels).toHaveLength(3);
    }
  });
  it("offers genres for grades 3-6", () => {
    expect(genresForGrade(3).map((g) => g.id)).toContain("paragraph");
    expect(genresForGrade(6).map((g) => g.id)).toContain("argument");
  });
});


describe("글 종류별 고쳐 쓰기 렌즈 질문", () => {
  const keys = REVISION_LENSES.map((l) => l.key as string);
  it("재정의 키는 모두 올바른 렌즈이고 해요체 질문이에요", () => {
    for (const g of GENRES) {
      for (const [k, q] of Object.entries(g.lensQuestions ?? {})) {
        expect(keys, `${g.id}.${k}`).toContain(k);
        expect(q, `${g.id}.${k}`).toMatch(/요\?$/);
        expect(q).not.toMatch(/[“"'‘]/);
      }
    }
  });
  it("편지·시·이야기는 일반 질문 대신 자기 질문을 써요", () => {
    for (const id of ["letter", "character-letter", "experience-poem", "experience-story"]) {
      expect(lensQuestion(id, "whole")).not.toContain("중심 생각(주장)");
    }
    expect(lensQuestion("letter", "whole")).toContain("받는 사람");
  });
  it("없으면 일반 질문으로 돌아가요", () => {
    const generic = REVISION_LENSES.find((l) => l.key === "whole")!.question;
    expect(lensQuestion("argument", "whole")).toBe(generic);
    expect(lensQuestion(undefined, "whole")).toBe(generic);
    expect(lensQuestion("no-such", "word")).toBe(REVISION_LENSES.find((l) => l.key === "word")!.question);
    expect(lensQuestion("experience-story", "word")).toBe(REVISION_LENSES.find((l) => l.key === "word")!.question);
  });
});
