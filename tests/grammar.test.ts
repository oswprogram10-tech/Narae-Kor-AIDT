import { describe, expect, it } from "vitest";
import {
  AWKWARD_MESSAGE,
  GRAMMAR_ACTIVITIES,
  GRAMMAR_ITEMS,
  activitiesForGrade,
  classifyOrder,
  correctFeedback,
  feedbackFor,
  getActivity,
  getItem,
  gradeAnswer,
  renderAnswer,
  validateItem,
  type AgreementFixItem,
  type SentenceBuildItem,
} from "@/core/grammar";

const sb = getItem("sb-05") as SentenceBuildItem; // 3가지 정답
const ag = getItem("hn-01") as AgreementFixItem;

describe("문제 은행", () => {
  it("모든 문제가 validateItem을 통과해요", () => {
    const problems = GRAMMAR_ITEMS.flatMap((i) => validateItem(i).map((p) => `${i.id}: ${p}`));
    if (problems.length) console.log(problems.join("\n"));
    expect(problems).toEqual([]);
  });

  it("문제 id가 겹치지 않아요", () => {
    const ids = GRAMMAR_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("활동별 문제 수와 성취기준이 맞아요", () => {
    expect(GRAMMAR_ACTIVITIES.map((a) => [a.id, a.itemIds.length])).toEqual([
      ["sentence-structure", 16],
      ["honorific", 12],
      ["agreement", 12],
    ]);
    for (const a of GRAMMAR_ACTIVITIES) {
      for (const id of a.itemIds) {
        const item = getItem(id);
        expect(item, id).toBeDefined();
        expect(item?.standardCode).toBe(a.standardCode);
      }
    }
    expect(GRAMMAR_ITEMS.length).toBe(40);
  });

  it("학년에 맞는 활동을 골라 줘요", () => {
    expect(activitiesForGrade(3).map((a) => a.id)).toEqual(["sentence-structure", "honorific"]);
    expect(activitiesForGrade(6).map((a) => a.id)).toEqual(["agreement"]);
    expect(getActivity("agreement")?.gradeBand).toBe("5-6");
    expect(getActivity("nope")).toBeUndefined();
  });

  it("validateItem이 잘못된 문제를 잡아내요", () => {
    const bad: SentenceBuildItem = { ...sb, standardCode: "없음", answers: [["a", "b"], sb.blocks.map((b) => b.id)] };
    expect(validateItem(bad).length).toBeGreaterThanOrEqual(3);
    const leak: AgreementFixItem = { ...ag, hints: [`${ag.options[ag.correctOption]} 를 써 보세요`, ag.hints[1]] };
    expect(validateItem(leak).some((p) => p.includes("hints[0]"))).toBe(true);
  });
});

describe("gradeAnswer", () => {
  it("정답 순서와 다른 정답 순서를 인정해요", () => {
    expect(gradeAnswer(sb, { type: "sentence-build", order: ["a", "b", "c", "d"] })).toEqual({ correct: true, reason: "ok" });
    expect(gradeAnswer(sb, { type: "sentence-build", order: ["b", "a", "c", "d"] })).toEqual({ correct: true, reason: "ok" });
  });
  it("틀린 순서, 빠진 블록, 겹친 블록을 구분해요", () => {
    expect(gradeAnswer(sb, { type: "sentence-build", order: ["d", "a", "b", "c"] }).reason).toBe("wrong-order");
    expect(gradeAnswer(sb, { type: "sentence-build", order: ["a", "b", "c"] }).reason).toBe("missing-blocks");
    expect(gradeAnswer(sb, { type: "sentence-build", order: ["a", "a", "b", "c"] }).reason).toBe("missing-blocks");
  });
  it("agreement-fix의 세 가지 결과", () => {
    const right = { type: "agreement-fix" as const, index: ag.wrongIndex, option: ag.correctOption };
    expect(gradeAnswer(ag, right)).toEqual({ correct: true, reason: "ok" });
    expect(gradeAnswer(ag, { ...right, index: 0 }).reason).toBe("wrong-position");
    expect(gradeAnswer(ag, { ...right, option: 1 }).reason).toBe("wrong-option");
  });
  it("문제와 답의 형식이 다르면 type-mismatch", () => {
    expect(gradeAnswer(sb, { type: "agreement-fix", index: 0, option: 0 }).reason).toBe("type-mismatch");
    expect(gradeAnswer(ag, { type: "sentence-build", order: [] }).reason).toBe("type-mismatch");
  });
});

describe("feedbackFor", () => {
  it("원리 → 힌트1 → 힌트2 → 정답 공개", () => {
    expect(feedbackFor(sb, 1)).toEqual({ level: "principle", message: sb.principle });
    expect(feedbackFor(sb, 2)).toEqual({ level: "hint1", message: sb.hints[0] });
    expect(feedbackFor(sb, 3)).toEqual({ level: "hint2", message: sb.hints[1] });
    const r = feedbackFor(sb, 4);
    expect(r.level).toBe("reveal");
    expect(r.message).toBe(sb.explanation);
    expect(r.reveal).toEqual({ type: "sentence-build", order: sb.answers[0] });
    expect(feedbackFor(sb, 9).level).toBe("reveal");
  });
  it("agreement-fix 공개 정답", () => {
    expect(feedbackFor(ag, 4).reveal).toEqual({ type: "agreement-fix", index: ag.wrongIndex, option: ag.correctOption });
  });
  it("정답 피드백은 설명을 포함하고 과장하지 않아요", () => {
    const m = correctFeedback(ag);
    expect(m).toContain(ag.explanation);
    expect(m).not.toMatch(/최고|천재|완벽/);
  });
});

describe("renderAnswer", () => {
  it("sentence-build", () => {
    expect(renderAnswer(sb, { type: "sentence-build", order: ["a", "b", "c", "d"] })).toBe("동생이 공원에서 공을 던져요.");
  });
  it("agreement-fix", () => {
    expect(renderAnswer(ag, { type: "agreement-fix", index: ag.wrongIndex, option: ag.correctOption })).toBe(
      "할머니께서 공원에서 운동을 하셨어요.",
    );
  });
  it("모든 문제의 첫 정답이 문장으로 만들어져요", () => {
    for (const i of GRAMMAR_ITEMS) {
      const s =
        i.type === "sentence-build"
          ? renderAnswer(i, { type: "sentence-build", order: i.answers[0] })
          : renderAnswer(i, { type: "agreement-fix", index: i.wrongIndex, option: i.correctOption });
      expect(s.length).toBeGreaterThan(5);
    }
  });
});

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]));
}

describe("classifyOrder", () => {
  const find = (id: string) => getItem(id) as SentenceBuildItem;
  it("자연스러움 / 어색함 / 오답", () => {
    expect(classifyOrder(find("sb-16"), ["a", "c", "b", "d"])).toBe("natural"); // 여름에는 나무에서 매미가 울어요
    expect(classifyOrder(find("sb-09"), ["b", "a", "c", "d"])).toBe("natural"); // 우리에게 할머니께서 …
    expect(classifyOrder(find("sb-05"), ["b", "c", "a", "d"])).toBe("awkward"); // 공원에서 공을 동생이 던져요
    expect(classifyOrder(find("sb-13"), ["b", "a", "c"])).toBe("awkward"); // 큰 소리로 친구가 웃어요
    expect(classifyOrder(find("sb-02"), ["c", "a", "b"])).toBe("wrong"); // 아주 우리 교실은 깨끗해요
    expect(classifyOrder(find("sb-01"), ["c", "a", "b"])).toBe("wrong");
  });
  it("어색한 순서는 오답이 아니라 awkward로 채점돼요", () => {
    const item = find("sb-05");
    expect(gradeAnswer(item, { type: "sentence-build", order: ["b", "c", "a", "d"] })).toEqual({ correct: false, reason: "awkward" });
    expect(gradeAnswer(item, { type: "sentence-build", order: ["d", "a", "b", "c"] }).reason).toBe("wrong-order");
    expect(AWKWARD_MESSAGE).toContain("어색");
  });
});

describe("sentence-build 저장된 순서 목록", () => {
  const items = GRAMMAR_ITEMS.filter((i): i is SentenceBuildItem => i.type === "sentence-build");
  const key = (o: string[]) => o.join(",");
  it.each(items.map((i) => [i.id, i] as const))("%s: answers/awkward가 classifyOrder와 정확히 같아요", (_id, item) => {
    const all = permutations(item.blocks.map((b) => b.id));
    const natural = all.filter((o) => classifyOrder(item, o) === "natural").map(key).sort();
    const awkward = all.filter((o) => classifyOrder(item, o) === "awkward").map(key).sort();
    expect(item.answers.map(key).sort()).toEqual(natural);
    expect(item.awkward.map(key).sort()).toEqual(awkward);
  });
  it("answers[0]은 '누가'로 시작해요", () => {
    for (const i of items) {
      const first = i.blocks.find((b) => b.id === i.answers[0][0]);
      expect(first?.role, i.id).toBe("subject");
    }
  });
});

describe("3~4학년 문구에 어려운 문법 용어를 쓰지 않아요", () => {
  const TERMS = ["어간", "서술어", "주어", "부사어", "주체 높임", "객체 높임", "상대 높임", "시제", "목적어"];
  it("prompt/principle/hints/explanation", () => {
    for (const i of GRAMMAR_ITEMS.filter((x) => x.grade <= 4)) {
      const text = [i.prompt, i.principle, ...i.hints, i.explanation].join(" ");
      for (const t of TERMS) expect(new RegExp(`(?<![가-힣])${t}`).test(text), `${i.id}: ${t}`).toBe(false);
    }
  });
});
