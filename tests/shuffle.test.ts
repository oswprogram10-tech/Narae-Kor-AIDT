import { describe, expect, it } from "vitest";
import { optionOrder, toDisplayIndex, toOriginalIndex, displayOptions } from "@/core/practice/shuffle";
import { GRAMMAR_ITEMS, feedbackFor as gFeedback, gradeAnswer as gGrade, type GrammarItem } from "@/core/grammar";
import { READING_ITEMS, feedbackFor as rFeedback, gradeAnswer as rGrade, type ReadingItem } from "@/core/reading";
import { parseAnswer, studentItems, toDisplayAnswer as gDisplay } from "@/lib/grammar-rules";
import { parseReadingAnswer, toDisplayAnswer as rDisplay, toStudentReadingItem } from "@/lib/reading-rules";
import { GRAMMAR_ACTIVITIES } from "@/core/grammar";

type Opt = { id: string; options: string[]; correctOption: number };
const gOpt = (GRAMMAR_ITEMS as readonly GrammarItem[]).filter((i) => i.type === "choice" || i.type === "agreement-fix") as unknown as Opt[];
const rOpt = (READING_ITEMS as readonly ReadingItem[]).filter((i) => i.type === "choice" || i.type === "choice-with-evidence") as unknown as Opt[];

describe("optionOrder", () => {
  it("순열이고 같은 입력이면 늘 같다(결정적)", () => {
    for (const n of [2, 3, 4, 5]) {
      const o = optionOrder("x-01", n);
      expect([...o].sort()).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(optionOrder("x-01", n)).toEqual(o);
    }
    expect(optionOrder("a", 1)).toEqual([0]);
  });
  it("표시↔원래 번호가 서로 되돌려져요", () => {
    for (let d = 0; d < 4; d++) expect(toDisplayIndex("k", 4, toOriginalIndex("k", 4, d))).toBe(d);
    const opts = ["가", "나", "다", "라"];
    const shown = displayOptions("k", opts);
    expect([...shown].sort()).toEqual([...opts].sort());
  });
});

describe("정답 자리가 한쪽에 쏠리지 않아요", () => {
  const share = (list: readonly Opt[], display: boolean, n: number) => {
    const items = list.filter((i) => i.options.length === n);
    const count = new Array(n).fill(0);
    for (const i of items) count[display ? toDisplayIndex(i.id, n, i.correctOption) : i.correctOption]++;
    return { total: items.length, max: Math.max(...count) / items.length, count };
  };
  for (const [name, list] of [["문법", gOpt], ["읽기", rOpt], ["문법+읽기", [...gOpt, ...rOpt]]] as const) {
    it(`${name}: 한 자리가 3보기 50%, 4보기 40%를 넘지 않아요`, () => {
      for (const [n, limit] of [[3, 0.5], [4, 0.4]] as const) {
        const r = share(list, true, n);
        if (r.total >= 8) expect(r.max, `${name} n=${n} ${r.count}`).toBeLessThanOrEqual(limit);
      }
    });
  }
});

describe("문법: 표시 번호로 주고받아도 원래 번호로 채점돼요", () => {
  it("표시된 정답을 고르면 정답, 다른 보기는 오답, 정답 공개는 표시 번호", () => {
    for (const item of GRAMMAR_ITEMS as readonly GrammarItem[]) {
      if (item.type !== "choice" && item.type !== "agreement-fix") continue;
      const n = item.options.length;
      const shown = studentItems(GRAMMAR_ACTIVITIES.find((a) => a.itemIds.includes(item.id))!.id).find((x) => x.id === item.id)!;
      if (shown.type === "sentence-build") continue;
      const dCorrect = toDisplayIndex(item.id, n, item.correctOption);
      expect(shown.options[dCorrect]).toBe(item.options[item.correctOption]);
      const mk = (d: number) => (item.type === "choice" ? { type: "choice", option: d } : { type: "agreement-fix", index: item.wrongIndex, option: d });
      for (let d = 0; d < n; d++) {
        const parsed = parseAnswer(item, mk(d))!;
        expect(gGrade(item, parsed).correct, `${item.id}/${d}`).toBe(d === dCorrect);
      }
      const rev = gFeedback(item, 4).reveal!;
      const disp = gDisplay(item, rev);
      expect((disp as { option: number }).option).toBe(dCorrect);
    }
  });
});

describe("읽기: 표시 번호로 주고받아도 원래 번호로 채점돼요", () => {
  it("표시된 정답을 고르면 정답, 다른 보기는 오답, 정답 공개는 표시 번호", () => {
    for (const item of READING_ITEMS as readonly ReadingItem[]) {
      if (item.type !== "choice" && item.type !== "choice-with-evidence") continue;
      const n = item.options.length;
      const shown = toStudentReadingItem(item);
      if (shown.type !== "choice" && shown.type !== "choice-with-evidence") throw new Error("type");
      const dCorrect = toDisplayIndex(item.id, n, item.correctOption);
      expect(shown.options[dCorrect]).toBe(item.options[item.correctOption]);
      const ev = item.type === "choice-with-evidence" ? item.evidenceIds[0] : "";
      for (let d = 0; d < n; d++) {
        const raw = item.type === "choice" ? { type: "choice", option: d } : { type: "choice-with-evidence", option: d, sentenceId: ev };
        const parsed = parseReadingAnswer(item, raw)!;
        expect(rGrade(item, parsed).correct, `${item.id}/${d}`).toBe(d === dCorrect);
      }
      const disp = rDisplay(item, rFeedback(item, 4).reveal!);
      expect((disp as { option: number }).option).toBe(dCorrect);
    }
  });
  it("같은 문제는 다시 불러도 같은 순서", () => {
    for (const item of rOpt) expect(optionOrder(item.id, item.options.length)).toEqual(optionOrder(item.id, item.options.length));
    const it0 = READING_ITEMS.find((i) => i.type === "choice")!;
    expect(toStudentReadingItem(it0)).toEqual(toStudentReadingItem(it0));
  });
});
