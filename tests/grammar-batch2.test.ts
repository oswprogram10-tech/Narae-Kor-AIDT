import { describe, expect, it } from "vitest";
import {
  GRAMMAR_ITEMS,
  feedbackFor,
  getActivity,
  getItem,
  gradeAnswer,
  renderAnswer,
  validateItem,
  type AgreementFixItem,
  type ChoiceItem,
} from "@/core/grammar";

const ids = (activityId: string) => getActivity(activityId)!.itemIds;
const BATCH2 = ["word-relations", "dictionary-form", "time-expression", "spelling-spacing"];
const items2 = BATCH2.flatMap((a) => ids(a).map((id) => getItem(id)!));
const choices = items2.filter((i): i is ChoiceItem => i.type === "choice");
const fixes = items2.filter((i): i is AgreementFixItem => i.type === "agreement-fix");

describe("2차 활동 구성", () => {
  it("활동별 형식·성취기준·학년이 맞아요", () => {
    const want: Record<string, [string, string, string]> = {
      "word-relations": ["choice", "4국04-01", "3-4"],
      "dictionary-form": ["choice", "4국04-02", "3-4"],
      "time-expression": ["agreement-fix", "6국04-05", "5-6"],
      "spelling-spacing": ["agreement-fix", "6국04-06", "5-6"],
    };
    for (const [id, [type, code, band]] of Object.entries(want)) {
      const act = getActivity(id)!;
      expect(act.itemIds).toHaveLength(10);
      expect(act.standardCode).toBe(code);
      expect(act.gradeBand).toBe(band);
      for (const itemId of act.itemIds) {
        const item = getItem(itemId)!;
        expect(item.type, itemId).toBe(type);
        expect(item.standardCode, itemId).toBe(code);
        expect(band === "3-4" ? item.grade <= 4 : item.grade >= 5, itemId).toBe(true);
      }
    }
  });
  it("맞춤법·띄어쓰기는 두 갈래가 5개씩, 시간 표현은 모두 tense", () => {
    const ss = ids("spelling-spacing").map((i) => (getItem(i) as AgreementFixItem).category);
    expect(ss.filter((c) => c === "spelling")).toHaveLength(5);
    expect(ss.filter((c) => c === "spacing")).toHaveLength(5);
    expect(ids("time-expression").every((i) => (getItem(i) as AgreementFixItem).category === "tense")).toBe(true);
  });
});

describe("2차 문제 내용 규칙", () => {
  it("모든 문제가 validateItem을 통과해요", () => {
    expect(items2.flatMap((i) => validateItem(i).map((p) => `${i.id}: ${p}`))).toEqual([]);
  });
  it("보기는 서로 다르고 정답은 정확히 하나예요", () => {
    for (const i of [...choices, ...fixes]) {
      expect(new Set(i.options).size, i.id).toBe(i.options.length);
      expect(i.options.length, i.id).toBeGreaterThanOrEqual(3);
      expect(i.options.length, i.id).toBeLessThanOrEqual(4);
      const hits = i.options.filter((_, o) =>
        i.type === "choice"
          ? gradeAnswer(i, { type: "choice", option: o }).correct
          : gradeAnswer(i, { type: "agreement-fix", index: i.wrongIndex, option: o }).correct,
      );
      expect(hits, i.id).toHaveLength(1);
    }
  });
  it("안내 문구가 해요체로 끝나요", () => {
    for (const i of items2) {
      for (const t of [i.prompt, i.principle, ...i.hints, i.explanation]) {
        expect(/(요|세요|까요)[.?!]$/.test(t.trim()), `${i.id}: ${t}`).toBe(true);
      }
    }
  });
  it("힌트에 정답 보기 글이 들어 있지 않아요", () => {
    for (const i of [...choices, ...fixes]) {
      const c = i.options[i.correctOption].replace(/[.?!,]+$/u, "");
      for (const h of [i.principle, ...i.hints]) expect(h.includes(c), `${i.id}: ${h}`).toBe(false);
    }
  });
  it("힌트 두 개와 원리가 서로 달라요", () => {
    for (const i of items2) expect(new Set([i.principle, ...i.hints]).size, i.id).toBe(3);
  });
  it("3~4학년 문제에는 어려운 용어를 쓰지 않아요", () => {
    const TERMS = ["형태소", "어간", "어미", "서술어", "주어", "부사어", "시제", "목적어"];
    for (const i of items2.filter((x) => x.grade <= 4)) {
      const text = [i.prompt, i.principle, ...i.hints, i.explanation].join(" ");
      for (const t of TERMS) expect(new RegExp(`(?<![가-힣])${t}`).test(text), `${i.id}: ${t}`).toBe(false);
    }
  });
});

describe("choice 문제", () => {
  it("context와 target 관계: target은 context 안에 있어요", () => {
    for (const i of choices) if (i.target) expect(i.context?.includes(i.target), i.id).toBe(true);
    expect(choices.filter((i) => i.context).length).toBeGreaterThanOrEqual(10);
  });
  it("채점·단계별 안내·정답 공개", () => {
    const c = getItem("wr-01") as ChoiceItem;
    expect(gradeAnswer(c, { type: "choice", option: c.correctOption })).toEqual({ correct: true, reason: "ok" });
    expect(gradeAnswer(c, { type: "choice", option: (c.correctOption + 1) % c.options.length })).toEqual({ correct: false, reason: "wrong-option" });
    expect(gradeAnswer(c, { type: "agreement-fix", index: 0, option: 0 }).reason).toBe("type-mismatch");
    expect(feedbackFor(c, 1).level).toBe("principle");
    expect(feedbackFor(c, 2).message).toBe(c.hints[0]);
    expect(feedbackFor(c, 3).message).toBe(c.hints[1]);
    const r = feedbackFor(c, 4);
    expect(r.level).toBe("reveal");
    expect(r.reveal).toEqual({ type: "choice", option: c.correctOption });
    expect(renderAnswer(c, r.reveal!)).toBe(c.options[c.correctOption]);
  });
  it("agreement-fix 문제에 choice 답을 내면 type-mismatch", () => {
    const f = getItem("te-01") as AgreementFixItem;
    expect(gradeAnswer(f, { type: "choice", option: 0 }).reason).toBe("type-mismatch");
  });
  it("validateItem이 잘못된 choice를 잡아내요", () => {
    const c = getItem("wr-08") as ChoiceItem;
    expect(validateItem({ ...c, options: ["가", "나"] }).length).toBeGreaterThan(0);
    expect(validateItem({ ...c, options: ["가", "가", "나"] }).some((p) => p.includes("겹"))).toBe(true);
    expect(validateItem({ ...c, correctOption: 9 }).some((p) => p.includes("correctOption"))).toBe(true);
    expect(validateItem({ ...c, target: "없는말" }).some((p) => p.includes("target"))).toBe(true);
    expect(validateItem({ ...c, context: undefined }).some((p) => p.includes("context"))).toBe(true);
    expect(validateItem({ ...c, hints: [`${c.options[c.correctOption]}이에요`, c.hints[1]] }).some((p) => p.includes("hints[0]"))).toBe(true);
  });
});

describe("agreement-fix 2차 문제", () => {
  it("고친 문장은 틀린 어절 하나만 달라요", () => {
    for (const f of fixes) {
      const fixed = renderAnswer(f, { type: "agreement-fix", index: f.wrongIndex, option: f.correctOption });
      const expected = f.tokens.map((t, i) => (i === f.wrongIndex ? f.options[f.correctOption] : t)).join(" ");
      expect(fixed, f.id).toBe(expected);
      expect(f.options[f.correctOption], f.id).not.toBe(f.tokens[f.wrongIndex]);
    }
  });
  it("보기가 원래 어절과 같지 않아요", () => {
    for (const f of fixes) expect(f.options, f.id).not.toContain(f.tokens[f.wrongIndex]);
  });
  it("시간 표현 문제는 서술어(맨 뒤 어절)나 꾸며 주는 말을 고쳐요", () => {
    for (const id of ids("time-expression")) {
      const f = getItem(id) as AgreementFixItem;
      expect(f.wrongIndex === f.tokens.length - 1 || id === "te-08", id).toBe(true);
    }
  });
  it("띄어쓰기 문제는 띄어쓰기만 다르고, 정답 보기에 띄어쓰기가 있어요", () => {
    for (const id of ids("spelling-spacing")) {
      const f = getItem(id) as AgreementFixItem;
      if (f.category !== "spacing") continue;
      const strip = (s: string) => s.replace(/\s+/g, "");
      expect(strip(f.options[f.correctOption]), id).toBe(strip(f.tokens[f.wrongIndex]));
      expect(f.options[f.correctOption].includes(" "), id).toBe(true);
      for (const o of f.options) expect(strip(o), id).toBe(strip(f.tokens[f.wrongIndex]));
    }
  });
  it("전체 문제 id가 겹치지 않아요", () => {
    const all = GRAMMAR_ITEMS.map((i) => i.id);
    expect(new Set(all).size).toBe(all.length);
  });
});
