import { describe, expect, it } from "vitest";
import { feedbackLevel } from "@/core/practice/feedback";
import { EVIDENCE_MESSAGE, getPassage } from "@/core/reading";
import { getStandard } from "@/core/data/standards";
import {
  LITERATURE_ACTIVITIES,
  LITERATURE_ITEMS,
  LITERATURE_PASSAGES,
  OWN_LINE_MAX,
  WRONG_SCALE_MESSAGE,
  correctLiteratureAnswerOf,
  displayEventIds,
  displayEvents,
  displayFeelings,
  feelingOrder,
  getLiteratureActivity,
  getLiteratureItem,
  gradeLiteratureAnswer,
  literatureActivitiesForGrade,
  literatureCorrectFeedback,
  literatureFeedbackFor,
  moodGraph,
  ownLineCheck,
  renderLiteratureAnswer,
  validateLiteratureItem,
  validateLiteraturePassage,
  type LiteratureAnswer,
  type LiteratureItem,
  type MoodScaleItem,
  type SequenceItem,
} from "@/core/literature";

const moodItems = LITERATURE_ITEMS.filter((i): i is MoodScaleItem => i.type === "mood-scale");
const seqItems = LITERATURE_ITEMS.filter((i): i is SequenceItem => i.type === "sequence");
const mt01 = getLiteratureItem("mt-01") as MoodScaleItem;
const mt06 = getLiteratureItem("mt-06") as SequenceItem;

/** 정답 답안 */
const good = (i: MoodScaleItem): LiteratureAnswer => ({ type: "mood-scale", value: i.minOk, feeling: i.correctFeeling, evidenceId: i.evidenceIds[0] });

describe("작품", () => {
  it("모든 작품이 검증을 통과해요", () => {
    expect(LITERATURE_PASSAGES.flatMap((p) => validateLiteraturePassage(p).map((m) => `${p.id}: ${m}`))).toEqual([]);
  });
  it("id가 겹치지 않고 읽기 핵심부에서 찾을 수 있어요", () => {
    expect(new Set(LITERATURE_PASSAGES.map((p) => p.id)).size).toBe(LITERATURE_PASSAGES.length);
    for (const p of LITERATURE_PASSAGES) expect(getPassage(p.id), p.id).toBe(p);
  });
  it("동화 둘, 시 둘이고 학년군이 설계와 같아요", () => {
    const by = (g: string) => LITERATURE_PASSAGES.filter((p) => p.genre === g);
    expect(by("동화").map((p) => p.id)).toEqual(["lt-stage", "lt-kite"]);
    expect(by("시").map((p) => p.id)).toEqual(["lt-rain-market", "lt-grandma-hand"]);
    expect(getPassage("lt-stage")!.gradeBand).toBe("3-4");
    expect(getPassage("lt-kite")!.gradeBand).toBe("5-6");
    expect(getPassage("lt-stage")!.paragraphs.length).toBe(5);
    expect(getPassage("lt-kite")!.paragraphs.length).toBeGreaterThanOrEqual(6);
    expect(getPassage("lt-kite")!.paragraphs.length).toBeLessThanOrEqual(8);
  });
  it("시는 연 3~4개, 연마다 3~4행이고 행 id가 s{연}-{행}이에요", () => {
    for (const p of LITERATURE_PASSAGES.filter((x) => x.genre === "시")) {
      expect(p.paragraphs.length).toBeGreaterThanOrEqual(3);
      p.paragraphs.forEach((para, pi) => {
        expect(para.id).toBe(`p${pi + 1}`);
        expect(para.sentences.length).toBeGreaterThanOrEqual(3);
        expect(para.sentences.length).toBeLessThanOrEqual(4);
        para.sentences.forEach((s, si) => expect(s.id).toBe(`s${pi + 1}-${si + 1}`));
      });
    }
  });
  it("검증이 갈래와 구조 오류를 잡아내요", () => {
    const poem = getPassage("lt-rain-market")!;
    expect(validateLiteraturePassage({ ...poem, paragraphs: poem.paragraphs.slice(0, 2) }).some((m) => m.includes("연"))).toBe(true);
    expect(validateLiteraturePassage({ ...poem, genre: "논설문" }).some((m) => m.includes("갈래"))).toBe(true);
    const planted = { ...poem, paragraphs: poem.paragraphs.map((p, i) => (i === 0 ? { ...p, sentences: [{ ...p.sentences[0], text: "유튜브 소리가 나요" }, ...p.sentences.slice(1)] } : p)) };
    expect(validateLiteraturePassage(planted).some((m) => m.includes("유튜브"))).toBe(true);
  });
});

describe("문제 은행", () => {
  it("모든 문제가 validateLiteratureItem을 통과해요", () => {
    const problems = LITERATURE_ITEMS.flatMap((i) => validateLiteratureItem(i).map((m) => `${i.id}: ${m}`));
    if (problems.length) console.log(problems.join("\n"));
    expect(problems).toEqual([]);
  });
  it("문제 id가 겹치지 않아요", () => {
    const ids = LITERATURE_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("성취기준 코드가 활동과 같고 학년군이 맞아요", () => {
    for (const a of LITERATURE_ACTIVITIES) {
      expect(getStandard(a.standardCode), a.id).toBeDefined();
      for (const id of a.itemIds) {
        const it = getLiteratureItem(id)!;
        expect(it.standardCode, id).toBe(a.standardCode);
        expect(it.grade >= 5, id).toBe(a.gradeBand === "5-6");
        expect(getPassage(it.passageId)!.gradeBand, id).toBe(a.gradeBand);
      }
    }
  });
  it("검증이 문제 오류를 잡아내요", () => {
    expect(validateLiteratureItem({ ...mt01, minOk: 1, maxOk: 5 }).some((m) => m.includes("범위"))).toBe(true);
    expect(validateLiteratureItem({ ...mt01, minOk: 0 }).length).toBeGreaterThan(0);
    expect(validateLiteratureItem({ ...mt01, sceneParagraphId: "p9" }).length).toBeGreaterThan(0);
    expect(validateLiteratureItem({ ...mt01, evidenceIds: ["s2-5"] }).some((m) => m.includes("장면"))).toBe(true);
    expect(validateLiteratureItem({ ...mt01, correctFeeling: 9 }).length).toBeGreaterThan(0);
    expect(validateLiteratureItem({ ...mt01, hints: ["걱정되고 긴장돼요", mt01.hints[1]] }).some((m) => m.includes("정답 마음 낱말"))).toBe(true);
    expect(validateLiteratureItem({ ...mt06, correctOrder: ["e1", "e2", "e3"] }).length).toBeGreaterThan(0);
    expect(validateLiteratureItem({ ...mt06, events: mt06.events.slice(0, 2), correctOrder: ["e1", "e2"] }).some((m) => m.includes("3~5"))).toBe(true);
    expect(validateLiteratureItem({ ...mt06, hints: [mt06.events[0].text, mt06.hints[1]] }).some((m) => m.includes("사건"))).toBe(true);
    expect(validateLiteratureItem({ ...mt01, prompt: "하준이는 어떨까." }).some((m) => m.includes("해요체"))).toBe(true);
  });
  it("문제 구성이 설계와 같아요", () => {
    const of = (prefix: string) => LITERATURE_ITEMS.filter((i) => i.id.startsWith(prefix));
    const count = (prefix: string, t: string) => of(prefix).filter((i) => i.type === t).length;
    expect(count("mt-", "mood-scale")).toBe(5);
    expect(count("mt-", "sequence")).toBe(1);
    expect(count("mt-", "choice")).toBe(1);
    expect(seqItems.find((s) => s.id === "mt-06")!.events).toHaveLength(4);
    expect(count("sn-", "label-sentences")).toBeGreaterThanOrEqual(1);
    expect(count("sn-", "sentence-pick")).toBe(1);
    expect(count("sn-", "choice-with-evidence")).toBe(1);
    expect(count("sn-", "own-line")).toBe(1);
    expect(count("cm-", "choice-with-evidence")).toBe(6);
    expect(count("cm-", "sequence")).toBe(1);
    expect(seqItems.find((s) => s.id === "cm-06")!.events).toHaveLength(5);
    expect(count("fg-", "sentence-pick")).toBe(1);
    expect(count("fg-", "label-sentences")).toBe(1);
    expect(count("fg-", "choice-with-evidence")).toBe(4);
  });
  it("정답이 하나로 분명해요: 보기 중 정답은 하나", () => {
    for (const i of LITERATURE_ITEMS) {
      if (i.type === "choice") {
        expect(i.options.filter((_, o) => gradeLiteratureAnswer(i, { type: "choice", option: o }).correct), i.id).toHaveLength(1);
      } else if (i.type === "choice-with-evidence") {
        expect(i.options.filter((_, o) => gradeLiteratureAnswer(i, { type: "choice-with-evidence", option: o, sentenceId: i.evidenceIds[0] }).correct), i.id).toHaveLength(1);
      } else if (i.type === "mood-scale") {
        expect(i.feelingOptions.filter((_, f) => gradeLiteratureAnswer(i, { ...(good(i) as object), feeling: f } as LiteratureAnswer).correct), i.id).toHaveLength(1);
      }
    }
  });
  it("마음 온도 범위는 1~5 안, 폭 2 이하이고 처음엔 낮고 끝엔 높아요", () => {
    for (const i of moodItems) {
      expect(i.minOk).toBeGreaterThanOrEqual(1);
      expect(i.maxOk).toBeLessThanOrEqual(5);
      expect(i.maxOk - i.minOk).toBeLessThanOrEqual(2);
    }
    const hi = moodItems.map((i) => i.maxOk);
    expect(hi[1]).toBeLessThan(hi[hi.length - 1]);
    expect(moodItems.map((i) => i.sceneParagraphId)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });
  it("정답 공개용 정답은 늘 정답으로 채점돼요", () => {
    for (const i of LITERATURE_ITEMS) {
      if (i.type === "own-line") continue;
      const a = correctLiteratureAnswerOf(i);
      expect(gradeLiteratureAnswer(i, a).correct, i.id).toBe(true);
      expect(renderLiteratureAnswer(i, a).length, i.id).toBeGreaterThan(0);
    }
    expect(() => correctLiteratureAnswerOf(getLiteratureItem("sn-05")!)).toThrow();
  });
});

describe("마음 온도 채점", () => {
  it("범위 안 값 + 알맞은 마음 + 근거면 정답이에요", () => {
    for (const i of moodItems) {
      for (let v = i.minOk; v <= i.maxOk; v++) {
        for (const e of i.evidenceIds) {
          expect(gradeLiteratureAnswer(i, { type: "mood-scale", value: v, feeling: i.correctFeeling, evidenceId: e })).toEqual({ correct: true, reason: "ok", countsAsWrong: false });
        }
      }
    }
  });
  it("범위 밖 값은 wrong-scale이에요(마음·근거가 맞아도)", () => {
    for (const i of moodItems) {
      for (let v = 1; v <= 5; v++) {
        if (v >= i.minOk && v <= i.maxOk) continue;
        expect(gradeLiteratureAnswer(i, { type: "mood-scale", value: v, feeling: i.correctFeeling, evidenceId: i.evidenceIds[0] }), `${i.id}/${v}`).toEqual({ correct: false, reason: "wrong-scale", countsAsWrong: true });
      }
    }
  });
  it("마음 낱말이 틀리면 wrong-option, 근거가 틀리면 evidence-wrong이에요", () => {
    const wrongFeeling = (mt01.correctFeeling + 1) % mt01.feelingOptions.length;
    expect(gradeLiteratureAnswer(mt01, { type: "mood-scale", value: 2, feeling: wrongFeeling, evidenceId: "s1-3" })).toEqual({ correct: false, reason: "wrong-option", countsAsWrong: true });
    expect(gradeLiteratureAnswer(mt01, { type: "mood-scale", value: 2, feeling: mt01.correctFeeling, evidenceId: "s1-1" })).toEqual({ correct: false, reason: "evidence-wrong", countsAsWrong: true });
  });
  it("다 고르지 않았거나 이상한 값이면 incomplete(틀린 횟수에 넣지 않음)", () => {
    const base = { type: "mood-scale" as const, value: 2, feeling: mt01.correctFeeling, evidenceId: "s1-3" };
    const cases: LiteratureAnswer[] = [
      { ...base, value: 0 }, { ...base, value: 6 }, { ...base, value: 2.5 }, { ...base, value: Number.NaN },
      { ...base, feeling: -1 }, { ...base, feeling: 4 }, { ...base, evidenceId: "s9-9" }, { ...base, evidenceId: "" },
      { type: "mood-scale", value: undefined, feeling: 0, evidenceId: "s1-1" } as unknown as LiteratureAnswer,
      { type: "mood-scale", value: 2, feeling: undefined, evidenceId: "s1-1" } as unknown as LiteratureAnswer,
      { type: "mood-scale", value: 2, feeling: 0 } as unknown as LiteratureAnswer,
    ];
    for (const a of cases) expect(gradeLiteratureAnswer(mt01, a), JSON.stringify(a)).toEqual({ correct: false, reason: "incomplete", countsAsWrong: false });
  });
  it("다른 형식의 답은 type-mismatch예요", () => {
    expect(gradeLiteratureAnswer(mt01, { type: "choice", option: 0 })).toEqual({ correct: false, reason: "type-mismatch", countsAsWrong: false });
    expect(gradeLiteratureAnswer(mt06, { type: "mood-scale", value: 1, feeling: 0, evidenceId: "s1-1" }).reason).toBe("type-mismatch");
    expect(gradeLiteratureAnswer(getLiteratureItem("mt-07")!, { type: "sequence", order: [] }).reason).toBe("type-mismatch");
  });
  it("피드백: 찍기 방지 단계를 따르고 wrong-scale·evidence-wrong은 앞말이 붙어요", () => {
    expect(WRONG_SCALE_MESSAGE).toBe("마음 온도를 다시 생각해 봐요. 그 장면에서 인물이 한 말이나 행동을 살펴봐요.");
    const f1 = literatureFeedbackFor(mt01, 1, "wrong-scale");
    expect(f1.level).toBe("principle");
    expect(f1.message).toBe(`${WRONG_SCALE_MESSAGE} ${mt01.principle}`);
    expect(literatureFeedbackFor(mt01, 2, "wrong-scale").message).toBe(`${WRONG_SCALE_MESSAGE} ${mt01.hints[0]}`);
    expect(literatureFeedbackFor(mt01, 3, "wrong-scale").message).toBe(`${WRONG_SCALE_MESSAGE} ${mt01.hints[1]}`);
    expect(literatureFeedbackFor(mt01, 1, "wrong-option").message).toBe(mt01.principle);
    expect(literatureFeedbackFor(mt01, 2, "evidence-wrong").message).toBe(`${EVIDENCE_MESSAGE} ${mt01.hints[0]}`);
    for (let n = 1; n <= 3; n++) expect(literatureFeedbackFor(mt01, n, "wrong-scale").reveal).toBeUndefined();
    const r = literatureFeedbackFor(mt01, 4, "wrong-scale");
    expect(r.level).toBe(feedbackLevel(4));
    expect(r.message).toBe(mt01.explanation);
    expect(r.reveal).toEqual(correctLiteratureAnswerOf(mt01));
    expect(literatureCorrectFeedback(mt01)).toContain(mt01.explanation);
  });
  it("읽기 형식은 읽기 채점과 피드백을 그대로 따라요", () => {
    const cwe = getLiteratureItem("cm-01")!;
    if (cwe.type !== "choice-with-evidence") throw new Error("형식");
    expect(gradeLiteratureAnswer(cwe, { type: "choice-with-evidence", option: cwe.correctOption, sentenceId: "s1-1" }).reason).toBe("evidence-wrong");
    expect(literatureFeedbackFor(cwe, 2, "evidence-wrong").message).toBe(`${EVIDENCE_MESSAGE} ${cwe.hints[0]}`);
    expect(literatureFeedbackFor(cwe, 4).reveal).toEqual({ type: "choice-with-evidence", option: cwe.correctOption, sentenceId: cwe.evidenceIds[0] });
  });
  it("답을 읽을 수 있는 글로 돌려줘요", () => {
    const text = renderLiteratureAnswer(mt01, good(mt01));
    expect(text).toContain("하준의 마음 온도: 2");
    expect(text).toContain(mt01.feelingOptions[mt01.correctFeeling]);
    expect(text).toContain("(근거)");
  });
});

describe("순서 놓기", () => {
  const ok = (i: SequenceItem): LiteratureAnswer => ({ type: "sequence", order: [...i.correctOrder] });
  it("정확한 순서만 정답이에요", () => {
    for (const i of seqItems) expect(gradeLiteratureAnswer(i, ok(i)), i.id).toEqual({ correct: true, reason: "ok", countsAsWrong: false });
    const swapped = [...mt06.correctOrder];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(gradeLiteratureAnswer(mt06, { type: "sequence", order: swapped })).toEqual({ correct: false, reason: "wrong-order", countsAsWrong: true });
    expect(gradeLiteratureAnswer(mt06, { type: "sequence", order: [...mt06.correctOrder].reverse() }).reason).toBe("wrong-order");
  });
  it("다 놓지 않았거나 이상한 답이면 incomplete예요", () => {
    const bad: unknown[] = [[], mt06.correctOrder.slice(0, 3), [...mt06.correctOrder, "e1"], ["e1", "e1", "e2", "e3"], ["e1", "e2", "e3", "x"], "e1e2e3e4", null];
    for (const order of bad) {
      expect(gradeLiteratureAnswer(mt06, { type: "sequence", order } as unknown as LiteratureAnswer), JSON.stringify(order)).toEqual({ correct: false, reason: "incomplete", countsAsWrong: false });
    }
  });
  it("피드백과 정답 공개", () => {
    expect(literatureFeedbackFor(mt06, 1, "wrong-order").message).toBe(mt06.principle);
    expect(literatureFeedbackFor(mt06, 2, "wrong-order").message).toBe(mt06.hints[0]);
    const r = literatureFeedbackFor(mt06, 4, "wrong-order");
    expect(r.reveal).toEqual({ type: "sequence", order: mt06.correctOrder });
    expect(renderLiteratureAnswer(mt06, ok(mt06)).split("\n")).toHaveLength(4);
  });
  it("보여 주는 순서는 결정적이고 모든 카드를 한 번씩 담으며 정답 순서가 아니에요", () => {
    for (const i of seqItems) {
      const a = displayEventIds(i);
      expect(displayEventIds(i)).toEqual(a);
      expect([...a].sort()).toEqual([...i.correctOrder].sort());
      expect(a.join(), i.id).not.toBe(i.correctOrder.join());
      expect(displayEvents(i).map((e) => e.id)).toEqual(a);
    }
  });
  it("섞은 결과가 정답 순서와 같으면 한 칸 돌려요(모든 문제 id로 시험)", () => {
    for (let n = 0; n < 400; n++) {
      for (const base of seqItems) {
        const probe: SequenceItem = { ...base, id: `probe-${n}` };
        expect(displayEventIds(probe).join()).not.toBe(probe.correctOrder.join());
      }
    }
    // 3장짜리 카드도 마찬가지
    for (let n = 0; n < 400; n++) {
      const probe: SequenceItem = { ...mt06, id: `p3-${n}`, events: mt06.events.slice(0, 3), correctOrder: ["e1", "e2", "e3"] };
      expect(displayEventIds(probe).join()).not.toBe("e1,e2,e3");
    }
  });
});

describe("내 한 줄", () => {
  it("ownLineCheck가 빈 글·긴 글을 가려내요", () => {
    expect(OWN_LINE_MAX).toBe(60);
    expect(ownLineCheck("")).toEqual({ ok: false, tooLong: false, empty: true });
    expect(ownLineCheck("   \n ")).toEqual({ ok: false, tooLong: false, empty: true });
    expect(ownLineCheck("후두둑 빗소리가 들려요")).toEqual({ ok: true, tooLong: false, empty: false });
    expect(ownLineCheck("가".repeat(60)).ok).toBe(true);
    expect(ownLineCheck(`  ${"가".repeat(60)}  `).ok).toBe(true);
    expect(ownLineCheck("가".repeat(61))).toEqual({ ok: false, tooLong: true, empty: false });
  });
  it("채점하지 않고, 비어 있지 않고 길이 안이면 다 한 것으로 봐요", () => {
    const item = getLiteratureItem("sn-05")!;
    expect(gradeLiteratureAnswer(item, { type: "own-line", text: "빗방울이 톡톡 우산을 두드려요" })).toEqual({ correct: true, reason: "ok", countsAsWrong: false });
    expect(gradeLiteratureAnswer(item, { type: "own-line", text: "  " })).toEqual({ correct: false, reason: "incomplete", countsAsWrong: false });
    expect(gradeLiteratureAnswer(item, { type: "own-line", text: "가".repeat(61) })).toEqual({ correct: false, reason: "too-long", countsAsWrong: false });
    expect(gradeLiteratureAnswer(item, { type: "choice", option: 0 }).reason).toBe("type-mismatch");
    expect(renderLiteratureAnswer(item, { type: "own-line", text: "내 글" })).toBe("내 글");
    expect(literatureFeedbackFor(item, 3).reveal).toBeUndefined();
  });
});

describe("마음 그래프", () => {
  it("장면(문단) 순서대로 학생이 고른 값을 돌려줘요", () => {
    const answers: Record<string, LiteratureAnswer> = {};
    const values: Record<string, number> = { "mt-05": 5, "mt-02": 1, "mt-04": 4, "mt-01": 2, "mt-03": 3 };
    for (const i of moodItems) answers[i.id] = { ...(good(i) as object), value: values[i.id] } as LiteratureAnswer;
    // 문제 순서를 일부러 뒤섞어도 장면 순서로 나온다.
    const shuffled = [...LITERATURE_ITEMS].filter((i) => i.id.startsWith("mt-")).reverse();
    expect(moodGraph(shuffled, answers)).toEqual([
      { sceneParagraphId: "p1", character: "하준", value: 2 },
      { sceneParagraphId: "p2", character: "하준", value: 1 },
      { sceneParagraphId: "p3", character: "하준", value: 3 },
      { sceneParagraphId: "p4", character: "하준", value: 4 },
      { sceneParagraphId: "p5", character: "하준", value: 5 },
    ]);
  });
  it("답이 없거나 마음 온도 답이 아닌 것은 건너뛰어요", () => {
    const items = LITERATURE_ITEMS.filter((i) => i.id.startsWith("mt-"));
    expect(moodGraph(items, {})).toEqual([]);
    expect(moodGraph(items, { "mt-01": { type: "choice", option: 0 } })).toEqual([]);
    expect(moodGraph(items, { "mt-01": { type: "mood-scale", value: 9, feeling: 0, evidenceId: "s1-1" } })).toEqual([]);
    expect(moodGraph(items, { "mt-03": good(getLiteratureItem("mt-03") as MoodScaleItem) })).toEqual([{ sceneParagraphId: "p3", character: "하준", value: 3 }]);
  });
});

describe("보기 섞기", () => {
  it("마음 낱말은 결정적으로 섞고 정답 위치가 한쪽으로 쏠리지 않아요", () => {
    for (const i of moodItems) {
      expect(displayFeelings(i)).toEqual(feelingOrder(i).map((o) => i.feelingOptions[o]));
      expect([...feelingOrder(i)].sort()).toEqual([0, 1, 2, 3]);
    }
    const shown = moodItems.map((i) => feelingOrder(i).indexOf(i.correctFeeling));
    expect(new Set(shown).size).toBeGreaterThanOrEqual(2);
    expect(new Set(moodItems.map((i) => i.correctFeeling)).size).toBeGreaterThanOrEqual(2);
  });
  it("모든 보기 문제에서 정답이 늘 같은 자리에 있지 않아요(원래 자리·보이는 자리)", () => {
    const choiceLike = LITERATURE_ITEMS.filter((i) => i.type === "choice" || i.type === "choice-with-evidence") as (LiteratureItem & { correctOption: number; options: string[] })[];
    const original = new Set(choiceLike.map((i) => i.correctOption));
    expect(original.size).toBeGreaterThanOrEqual(3);
    for (const k of [0, 1, 2, 3]) expect(choiceLike.filter((i) => i.correctOption === k).length, `원래 ${k}번`).toBeLessThan(choiceLike.length * 0.6);
  });
});

describe("활동 구성", () => {
  it("활동 4개의 id·성취기준·학년군이 설계와 같아요", () => {
    expect(LITERATURE_ACTIVITIES.map((a) => [a.id, a.standardCode, a.gradeBand])).toEqual([
      ["mood-thermometer", "4국05-01", "3-4"],
      ["sensory", "4국05-04", "3-4"],
      ["character-map", "6국05-03", "5-6"],
      ["figurative", "6국05-02", "5-6"],
    ]);
    expect(getLiteratureActivity("sensory")?.title).toBe("감각적 표현 찾기");
    expect(getLiteratureActivity("nope")).toBeUndefined();
    expect(literatureActivitiesForGrade(3).map((a) => a.id)).toEqual(["mood-thermometer", "sensory"]);
    expect(literatureActivitiesForGrade(6).map((a) => a.id)).toEqual(["character-map", "figurative"]);
  });
  it("활동마다 문제 5~8개이고, 모든 문제와 지문이 활동에 속해요", () => {
    const all: string[] = [];
    for (const a of LITERATURE_ACTIVITIES) {
      expect(a.itemIds.length, a.id).toBeGreaterThanOrEqual(5);
      expect(a.itemIds.length, a.id).toBeLessThanOrEqual(8);
      for (const id of a.itemIds) {
        const it = getLiteratureItem(id)!;
        expect(it, id).toBeDefined();
        expect(a.passageIds, id).toContain(it.passageId);
      }
      for (const pid of a.passageIds) expect(getPassage(pid), pid).toBeDefined();
      all.push(...a.itemIds);
    }
    expect(all.sort()).toEqual(LITERATURE_ITEMS.map((i) => i.id).sort());
  });
});
