import { describe, expect, it } from "vitest";
import { feedbackLevel } from "@/core/practice/feedback";
import {
  EVIDENCE_MESSAGE,
  READING_ACTIVITIES,
  READING_ITEMS,
  READING_PASSAGES,
  activitiesForGrade,
  allSentences,
  correctAnswerOf,
  correctFeedback,
  feedbackFor,
  getActivity,
  getItem,
  getPassage,
  gradeAnswer,
  renderAnswer,
  validateItem,
  validatePassage,
  type ChoiceWithEvidenceItem,
  type LabelSentencesItem,
  type ReadingChoiceItem,
  type SentencePickItem,
  type SlotParagraphsItem,
} from "@/core/reading";

const pick = getItem("ma-02") as SentencePickItem;
const label = getItem("fo-01") as LabelSentencesItem;
const slot = getItem("ts-01") as SlotParagraphsItem;
const choice = getItem("ma-05") as ReadingChoiceItem;
const ev = getItem("in-04") as ChoiceWithEvidenceItem;

describe("지문", () => {
  it("모든 지문이 구조 검사를 통과해요", () => {
    const problems = READING_PASSAGES.flatMap((p) => validatePassage(p).map((m) => `${p.id}: ${m}`));
    expect(problems).toEqual([]);
  });
  it("지문 id가 겹치지 않고, 문장 id가 지문 안에서 유일해요", () => {
    expect(new Set(READING_PASSAGES.map((p) => p.id)).size).toBe(READING_PASSAGES.length);
    for (const p of READING_PASSAGES) {
      const ids = allSentences(p).map((s) => s.id);
      expect(new Set(ids).size, p.id).toBe(ids.length);
    }
  });
  it("문단마다 문장이 둘 이상이고 ids가 규칙을 따라요", () => {
    for (const p of READING_PASSAGES) {
      p.paragraphs.forEach((para, pi) => {
        expect(para.id).toBe(`p${pi + 1}`);
        expect(para.sentences.length, `${p.id}/${para.id}`).toBeGreaterThanOrEqual(2);
        para.sentences.forEach((s, si) => expect(s.id).toBe(`s${pi + 1}-${si + 1}`));
      });
    }
  });
  it("지문 길이와 문장 수가 설계에 맞아요", () => {
    for (const p of READING_PASSAGES) {
      const n = allSentences(p).length;
      if (p.id.startsWith("fo-")) expect(n, p.id).toBeGreaterThanOrEqual(6);
      if (p.id.startsWith("fo-")) expect(n, p.id).toBeLessThanOrEqual(8);
      if (p.id.startsWith("mi-")) {
        expect(p.paragraphs, p.id).toHaveLength(4);
        for (const para of p.paragraphs) {
          expect(para.sentences.length).toBeGreaterThanOrEqual(3);
          expect(para.sentences.length).toBeLessThanOrEqual(4);
        }
      }
      if (p.id.startsWith("ts-")) {
        expect(p.paragraphs.length).toBeGreaterThanOrEqual(4);
        expect(p.paragraphs.length).toBeLessThanOrEqual(5);
      }
    }
    expect(getPassage("nope")).toBeUndefined();
  });
});

describe("문제 은행", () => {
  it("모든 문제가 validateItem을 통과해요", () => {
    const problems = READING_ITEMS.flatMap((i) => validateItem(i).map((m) => `${i.id}: ${m}`));
    if (problems.length) console.log(problems.join("\n"));
    expect(problems).toEqual([]);
  });
  it("문제 id가 겹치지 않고 지문이 있어요", () => {
    const ids = READING_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of READING_ITEMS) expect(getPassage(i.passageId), i.id).toBeDefined();
  });
  it("validateItem이 잘못된 문제를 잡아내요", () => {
    const bad: SentencePickItem = { ...pick, standardCode: "없음", paragraphId: "p9", correctSentenceIds: ["s1-1"] };
    expect(validateItem(bad).length).toBeGreaterThanOrEqual(2);
    const wrongScope: SentencePickItem = { ...pick, correctSentenceIds: ["s1-1"] };
    expect(validateItem(wrongScope).some((m) => m.includes("그 문단"))).toBe(true);
    const leak: ChoiceWithEvidenceItem = { ...ev, hints: [`${ev.options[ev.correctOption]} 를 떠올려 봐요.`, ev.hints[1]] };
    expect(validateItem(leak).some((m) => m.includes("hints[0]"))).toBe(true);
    const noEvidence: ChoiceWithEvidenceItem = { ...ev, evidenceIds: [] };
    expect(validateItem(noEvidence).length).toBeGreaterThan(0);
    const fakeEvidence: ChoiceWithEvidenceItem = { ...ev, evidenceIds: ["s9-9"] };
    expect(validateItem(fakeEvidence).some((m) => m.includes("s9-9"))).toBe(true);
    const sameLabels: LabelSentencesItem = { ...label, answers: { "s1-1": "사실", "s1-3": "사실", "s2-1": "사실", "s2-2": "사실" } };
    expect(validateItem(sameLabels).some((m) => m.includes("모두 같아요"))).toBe(true);
    const badSlot: SlotParagraphsItem = { ...slot, slots: [slot.slots[0], { ...slot.slots[1], paragraphIds: ["p2", "p3"] }, slot.slots[2]] };
    expect(validateItem(badSlot).length).toBeGreaterThan(0);
    const banmal: SentencePickItem = { ...pick, prompt: "찾아라." };
    expect(validateItem(banmal).some((m) => m.includes("해요체"))).toBe(true);
    const missingPassage: SentencePickItem = { ...pick, passageId: "없음" };
    expect(validateItem(missingPassage).some((m) => m.includes("지문"))).toBe(true);
  });
});

describe("활동 구성", () => {
  it("활동별 성취기준·학년군·지문·문제 수가 맞아요", () => {
    const want: Record<string, [string, string, number, number]> = {
      "main-idea": ["4국02-02", "3-4", 2, 10],
      "fact-opinion": ["4국02-04", "3-4", 2, 8],
      "text-structure": ["6국02-01", "5-6", 2, 10],
      inference: ["6국02-02", "5-6", 2, 12],
    };
    expect(READING_ACTIVITIES.map((a) => a.id)).toEqual(Object.keys(want));
    for (const [id, [code, band, passages, items]] of Object.entries(want)) {
      const a = getActivity(id)!;
      expect(a.standardCode).toBe(code);
      expect(a.gradeBand).toBe(band);
      expect(a.passageIds).toHaveLength(passages);
      expect(a.itemIds).toHaveLength(items);
      for (const pid of a.passageIds) expect(getPassage(pid)?.gradeBand, pid).toBe(band);
      for (const itemId of a.itemIds) {
        const item = getItem(itemId)!;
        expect(item.standardCode, itemId).toBe(code);
        expect(a.passageIds, itemId).toContain(item.passageId);
        expect(band === "3-4" ? item.grade <= 4 : item.grade >= 5, itemId).toBe(true);
      }
    }
    expect(READING_ITEMS.length).toBe(40);
    const inActivities = READING_ACTIVITIES.flatMap((a) => a.itemIds);
    expect(new Set(inActivities).size).toBe(READING_ITEMS.length);
  });
  it("활동별 문제 형식이 설계와 같아요", () => {
    const types = (id: string) => getActivity(id)!.itemIds.map((i) => getItem(i)!.type);
    expect(types("main-idea").filter((t) => t === "sentence-pick")).toHaveLength(8);
    expect(types("main-idea").filter((t) => t === "choice")).toHaveLength(2);
    expect(types("fact-opinion").filter((t) => t === "label-sentences")).toHaveLength(4);
    expect(types("text-structure").filter((t) => t === "slot-paragraphs")).toHaveLength(4);
    expect(new Set(types("inference"))).toEqual(new Set(["choice-with-evidence"]));
    // 중심 문장 문제는 문단마다 하나씩, 문단 안으로 범위를 좁혀요
    for (const pid of ["mi-cat", "mi-signal"]) {
      const picks = READING_ITEMS.filter((i): i is SentencePickItem => i.type === "sentence-pick" && i.passageId === pid);
      expect(picks.map((p) => p.paragraphId)).toEqual(["p1", "p2", "p3", "p4"]);
    }
  });
  it("학년에 맞는 활동을 골라 줘요", () => {
    expect(activitiesForGrade(3).map((a) => a.id)).toEqual(["main-idea", "fact-opinion"]);
    expect(activitiesForGrade(4).map((a) => a.id)).toEqual(["main-idea", "fact-opinion"]);
    expect(activitiesForGrade(5).map((a) => a.id)).toEqual(["text-structure", "inference"]);
    expect(activitiesForGrade(6).map((a) => a.id)).toEqual(["text-structure", "inference"]);
    expect(getActivity("nope")).toBeUndefined();
  });
});

describe("gradeAnswer", () => {
  it("모든 문제의 정답이 정답으로 채점돼요", () => {
    for (const i of READING_ITEMS) {
      expect(gradeAnswer(i, correctAnswerOf(i)), i.id).toEqual({ correct: true, reason: "ok", countsAsWrong: false });
    }
  });
  it("sentence-pick: 정답, 다른 문장, 문단 밖 문장, 지문에 없는 id", () => {
    expect(gradeAnswer(pick, { type: "sentence-pick", sentenceId: "s2-3" }).correct).toBe(true);
    expect(gradeAnswer(pick, { type: "sentence-pick", sentenceId: "s2-1" })).toEqual({ correct: false, reason: "wrong-sentence", countsAsWrong: true });
    expect(gradeAnswer(pick, { type: "sentence-pick", sentenceId: "s1-1" }).reason).toBe("wrong-sentence");
    expect(gradeAnswer(pick, { type: "sentence-pick", sentenceId: "s9-9" })).toEqual({ correct: false, reason: "incomplete", countsAsWrong: false });
    expect(gradeAnswer(pick, { type: "choice", option: 0 })).toEqual({ correct: false, reason: "type-mismatch", countsAsWrong: false });
  });
  it("sentence-pick: 정답이 둘 이상이면 어느 쪽이든 맞아요", () => {
    const two: SentencePickItem = { ...pick, correctSentenceIds: ["s2-1", "s2-3"] };
    expect(gradeAnswer(two, { type: "sentence-pick", sentenceId: "s2-1" }).correct).toBe(true);
    expect(gradeAnswer(two, { type: "sentence-pick", sentenceId: "s2-3" }).correct).toBe(true);
    expect(gradeAnswer(two, { type: "sentence-pick", sentenceId: "s2-2" }).correct).toBe(false);
  });
  it("label-sentences: 모두 맞아야 정답, 비어 있으면 틀린 횟수에 넣지 않아요", () => {
    const right = { type: "label-sentences" as const, labels: { ...label.answers } };
    expect(gradeAnswer(label, right).correct).toBe(true);
    const oneWrong = { type: "label-sentences" as const, labels: { ...label.answers, "s1-1": "의견" } };
    expect(gradeAnswer(label, oneWrong)).toEqual({ correct: false, reason: "wrong-labels", countsAsWrong: true });
    const allWrong = { type: "label-sentences" as const, labels: Object.fromEntries(label.sentenceIds.map((id) => [id, label.answers[id] === "사실" ? "의견" : "사실"])) };
    // 몇 개가 틀렸는지 결과로 구별되지 않아요
    expect(gradeAnswer(label, allWrong)).toEqual(gradeAnswer(label, oneWrong));
    const partial = { type: "label-sentences" as const, labels: { "s1-1": "사실" } };
    expect(gradeAnswer(label, partial)).toEqual({ correct: false, reason: "incomplete", countsAsWrong: false });
    const odd = { type: "label-sentences" as const, labels: { ...label.answers, "s1-1": "모르겠음" } };
    expect(gradeAnswer(label, odd).reason).toBe("incomplete");
  });
  it("slot-paragraphs: 한 칸에 여러 문단, 틀린 배치, 빠진 문단", () => {
    const right = correctAnswerOf(slot);
    expect(gradeAnswer(slot, right).correct).toBe(true);
    if (right.type !== "slot-paragraphs") throw new Error("type");
    expect(gradeAnswer(slot, { ...right, placement: { ...right.placement, p2: "seo", p1: "bon" } })).toEqual({ correct: false, reason: "wrong-slots", countsAsWrong: true });
    const { p3: _p3, ...rest } = right.placement;
    void _p3;
    expect(gradeAnswer(slot, { type: "slot-paragraphs", placement: rest })).toEqual({ correct: false, reason: "incomplete", countsAsWrong: false });
    expect(gradeAnswer(slot, { type: "slot-paragraphs", placement: { ...right.placement, p3: "없는칸" } }).reason).toBe("incomplete");
  });
  it("choice: 정답, 오답, 범위 밖", () => {
    expect(gradeAnswer(choice, { type: "choice", option: choice.correctOption }).correct).toBe(true);
    expect(gradeAnswer(choice, { type: "choice", option: (choice.correctOption + 1) % 3 })).toEqual({ correct: false, reason: "wrong-option", countsAsWrong: true });
    expect(gradeAnswer(choice, { type: "choice", option: 9 }).reason).toBe("incomplete");
    expect(gradeAnswer(choice, { type: "choice", option: -1 }).reason).toBe("incomplete");
  });
  it("choice-with-evidence: 답과 근거가 모두 맞아야 정답이에요", () => {
    const other = ev.options.findIndex((_, i) => i !== ev.correctOption);
    const okEvidence = ev.evidenceIds[ev.evidenceIds.length - 1];
    expect(gradeAnswer(ev, { type: "choice-with-evidence", option: ev.correctOption, sentenceId: okEvidence }).correct).toBe(true);
    expect(gradeAnswer(ev, { type: "choice-with-evidence", option: other, sentenceId: okEvidence })).toEqual({ correct: false, reason: "wrong-option", countsAsWrong: true });
    expect(gradeAnswer(ev, { type: "choice-with-evidence", option: other, sentenceId: "s1-1" }).reason).toBe("wrong-option");
    expect(gradeAnswer(ev, { type: "choice-with-evidence", option: ev.correctOption, sentenceId: "s1-1" })).toEqual({ correct: false, reason: "evidence-wrong", countsAsWrong: true });
    expect(gradeAnswer(ev, { type: "choice-with-evidence", option: ev.correctOption, sentenceId: "s9-9" }).reason).toBe("incomplete");
  });
  it("근거 목록의 모든 문장이 근거로 인정돼요", () => {
    for (const i of READING_ITEMS) {
      if (i.type !== "choice-with-evidence") continue;
      for (const sid of i.evidenceIds) {
        expect(gradeAnswer(i, { type: "choice-with-evidence", option: i.correctOption, sentenceId: sid }).correct, `${i.id}/${sid}`).toBe(true);
      }
    }
  });
  it("모든 문제에서 보기·문장 하나씩만 정답이에요(정답이 하나로 분명해요)", () => {
    for (const i of READING_ITEMS) {
      if (i.type === "choice" || i.type === "choice-with-evidence") {
        const sid = i.type === "choice-with-evidence" ? i.evidenceIds[0] : "";
        const hits = i.options.filter((_, o) =>
          i.type === "choice"
            ? gradeAnswer(i, { type: "choice", option: o }).correct
            : gradeAnswer(i, { type: "choice-with-evidence", option: o, sentenceId: sid }).correct,
        );
        expect(hits, i.id).toHaveLength(1);
      }
    }
  });
});

describe("feedbackFor (찍기 방지)", () => {
  it("공통 단계 계산", () => {
    expect([0, 1, 2, 3, 4, 7].map(feedbackLevel)).toEqual(["principle", "principle", "hint1", "hint2", "reveal", "reveal"]);
  });
  it("원리 → 힌트1 → 힌트2 → 정답 공개 순서예요", () => {
    for (const i of READING_ITEMS) {
      expect(feedbackFor(i, 1)).toEqual({ level: "principle", message: i.principle });
      expect(feedbackFor(i, 2)).toEqual({ level: "hint1", message: i.hints[0] });
      expect(feedbackFor(i, 3)).toEqual({ level: "hint2", message: i.hints[1] });
      const r = feedbackFor(i, 4);
      expect(r.level).toBe("reveal");
      expect(r.message).toBe(i.explanation);
      expect(r.reveal).toEqual(correctAnswerOf(i));
      expect(feedbackFor(i, 9).level).toBe("reveal");
    }
  });
  it("정답 공개 전에는 reveal이 없어요", () => {
    for (const n of [1, 2, 3]) {
      expect(feedbackFor(label, n).reveal).toBeUndefined();
      expect(feedbackFor(ev, n, "evidence-wrong").reveal).toBeUndefined();
    }
  });
  it("evidence-wrong은 별도 안내를 앞에 붙이되 단계는 그대로 나아가요", () => {
    expect(feedbackFor(ev, 1, "evidence-wrong")).toEqual({ level: "principle", message: `${EVIDENCE_MESSAGE} ${ev.principle}` });
    expect(feedbackFor(ev, 2, "evidence-wrong").message).toBe(`${EVIDENCE_MESSAGE} ${ev.hints[0]}`);
    expect(feedbackFor(ev, 3, "evidence-wrong").level).toBe("hint2");
    const reveal = feedbackFor(ev, 4, "evidence-wrong");
    expect(reveal.message).toBe(ev.explanation);
    expect(reveal.message).not.toContain(EVIDENCE_MESSAGE);
    // 다른 이유의 오답에는 붙지 않아요
    expect(feedbackFor(ev, 1, "wrong-option").message).toBe(ev.principle);
    expect(EVIDENCE_MESSAGE).toBe("답은 맞았어요. 지문에서 그렇게 생각한 문장을 다시 찾아봐요.");
  });
  it("label-sentences는 공개 전에 어느 문장이 틀렸는지 알려 주지 않아요", () => {
    const wrongResult = gradeAnswer(label, { type: "label-sentences", labels: { ...label.answers, "s1-1": "의견" } });
    expect(Object.keys(wrongResult).sort()).toEqual(["correct", "countsAsWrong", "reason"]);
    const passage = getPassage(label.passageId)!;
    const texts = allSentences(passage).filter((s) => label.sentenceIds.includes(s.id)).map((s) => s.text);
    for (const n of [1, 2, 3]) {
      const fb = feedbackFor(label, n, wrongResult.reason);
      expect(Object.keys(fb)).not.toContain("reveal");
      for (const id of label.sentenceIds) expect(fb.message.includes(id)).toBe(false);
      for (const t of texts) expect(fb.message.includes(t)).toBe(false);
    }
    // 같은 이유의 어떤 오답이든 같은 안내를 받아요
    const other = gradeAnswer(label, { type: "label-sentences", labels: Object.fromEntries(label.sentenceIds.map((id) => [id, label.answers[id] === "사실" ? "의견" : "사실"])) });
    expect(feedbackFor(label, 1, other.reason)).toEqual(feedbackFor(label, 1, wrongResult.reason));
    // 정답 공개 때는 정답 꼬리표가 들어 있어요
    expect(feedbackFor(label, 4).reveal).toEqual({ type: "label-sentences", labels: label.answers });
  });
  it("정답 뒤 피드백에 설명이 들어 있어요", () => {
    for (const i of READING_ITEMS) expect(correctFeedback(i)).toContain(i.explanation);
  });
});

describe("renderAnswer", () => {
  it("sentence-pick은 문장 글을 돌려줘요", () => {
    expect(renderAnswer(pick, { type: "sentence-pick", sentenceId: "s2-3" })).toBe("이처럼 수염은 고양이가 주변을 살피는 데 쓰는 중요한 도구입니다.");
    expect(renderAnswer(pick, { type: "sentence-pick", sentenceId: "s9-9" })).toBe("");
  });
  it("label-sentences는 문장과 꼬리표를 줄마다 돌려줘요", () => {
    const text = renderAnswer(label, correctAnswerOf(label));
    const lines = text.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("우리 반 교실 뒤에는 책장이 하나 있고, 책이 마흔 권 꽂혀 있습니다. → 사실");
    expect(lines[1].endsWith("→ 의견")).toBe(true);
    expect(renderAnswer(label, { type: "label-sentences", labels: {} })).toContain("→ ?");
  });
  it("slot-paragraphs는 칸마다 문단 번호를 돌려줘요", () => {
    expect(renderAnswer(slot, correctAnswerOf(slot))).toBe("서론: 1문단\n본론: 2문단, 3문단, 4문단\n결론: 5문단");
    expect(renderAnswer(slot, { type: "slot-paragraphs", placement: {} })).toBe("서론: -\n본론: -\n결론: -");
  });
  it("choice와 choice-with-evidence", () => {
    expect(renderAnswer(choice, { type: "choice", option: 1 })).toBe(choice.options[1]);
    const t = renderAnswer(ev, correctAnswerOf(ev));
    expect(t).toContain(ev.options[ev.correctOption]);
    expect(t).toContain("(근거)");
    expect(renderAnswer(ev, { type: "choice", option: 0 })).toBe("");
  });
});

describe("내용 점검", () => {
  const studentTexts = (i: (typeof READING_ITEMS)[number]) => [i.prompt, i.principle, ...i.hints, i.explanation];

  it("학생에게 보이는 글이 해요체로 끝나요", () => {
    for (const i of READING_ITEMS) {
      for (const t of studentTexts(i)) expect(/요[.?!]$/.test(t.trim()), `${i.id}: ${t}`).toBe(true);
    }
  });
  it("힌트와 원리에 정답 보기·정답 문장이 그대로 들어 있지 않아요", () => {
    for (const i of READING_ITEMS) {
      const passage = getPassage(i.passageId)!;
      const text = new Map(allSentences(passage).map((s) => [s.id, s.text]));
      const secrets: string[] = [];
      if (i.type === "choice" || i.type === "choice-with-evidence") secrets.push(i.options[i.correctOption]);
      if (i.type === "sentence-pick") secrets.push(...i.correctSentenceIds.map((id) => text.get(id)!));
      if (i.type === "choice-with-evidence") secrets.push(...i.evidenceIds.map((id) => text.get(id)!));
      if (i.type === "label-sentences") secrets.push(...i.sentenceIds.map((id) => text.get(id)!));
      for (const h of [i.prompt, i.principle, ...i.hints]) {
        for (const s of secrets) expect(h.includes(s.replace(/[.?!,]+$/u, "")), `${i.id}: ${h}`).toBe(false);
      }
    }
  });
  it("원리와 힌트 두 개가 서로 달라요", () => {
    for (const i of READING_ITEMS) expect(new Set([i.principle, ...i.hints]).size, i.id).toBe(3);
  });
  it("보기가 서로 달라요", () => {
    for (const i of READING_ITEMS) {
      if (i.type === "choice" || i.type === "choice-with-evidence") expect(new Set(i.options).size, i.id).toBe(i.options.length);
    }
  });
  it("사실/의견 문제는 두 꼬리표가 모두 쓰이고, 지문마다 문장을 빠짐없이 다뤄요", () => {
    for (const pid of ["fo-library", "fo-hallway"]) {
      const labels = READING_ITEMS.filter((i): i is LabelSentencesItem => i.type === "label-sentences" && i.passageId === pid);
      expect(labels).toHaveLength(2);
      const covered = labels.flatMap((l) => l.sentenceIds);
      expect(new Set(covered).size).toBe(allSentences(getPassage(pid)!).length);
      for (const l of labels) {
        expect(l.labels).toEqual(["사실", "의견"]);
        expect(new Set(Object.values(l.answers))).toEqual(new Set(["사실", "의견"]));
      }
    }
  });
  it("추론 문제는 지문마다 여섯 개, 근거 목록이 비지 않아요", () => {
    for (const pid of ["in-umbrella", "in-mudflat"]) {
      const list = READING_ITEMS.filter((i): i is ChoiceWithEvidenceItem => i.type === "choice-with-evidence" && i.passageId === pid);
      expect(list).toHaveLength(6);
      for (const i of list) expect(i.evidenceIds.length, i.id).toBeGreaterThan(0);
    }
  });
  it("글의 짜임 문제 칸 이름이 설계에 맞아요", () => {
    const labels = (id: string) => (getItem(id) as SlotParagraphsItem).slots.map((s) => s.label);
    expect(labels("ts-01")).toEqual(["서론", "본론", "결론"]);
    expect(labels("ts-06")).toEqual(["문제", "원인", "해결"]);
    expect(getPassage("ts-lunch")!.genre).toBe("논설문");
    expect(getPassage("ts-neck")!.genre).toBe("설명하는 글");
  });
});
