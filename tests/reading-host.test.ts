import { describe, expect, it } from "vitest";
import {
  EVIDENCE_MESSAGE,
  INCOMPLETE_MESSAGE,
  READING_ACTIVITIES,
  READING_ITEMS,
  allSentences,
  getPassage,
  feedbackFor,
  getItem,
  gradeAnswer,
  type ChoiceWithEvidenceItem,
  type LabelSentencesItem,
  type ReadingChoiceItem,
  type SentencePickItem,
  type SlotParagraphsItem,
} from "@/core/reading";
import { parseReadingAnswer, studentPassages, studentReadingItems } from "@/lib/reading-rules";
import { progressSummary, summarizeAttempts, wrongAttemptCount, type AttemptRow } from "@/lib/grammar-rules";

const FORBIDDEN = [
  "correctSentenceIds",
  "answers",
  "correctOption",
  "evidenceIds",
  "explanation",
  "principle",
  "hints",
];

const pick = READING_ITEMS.find((i) => i.type === "sentence-pick" && i.paragraphId) as SentencePickItem;
const label = READING_ITEMS.find((i) => i.type === "label-sentences") as LabelSentencesItem;
const slot = READING_ITEMS.find((i) => i.type === "slot-paragraphs") as SlotParagraphsItem;
const choice = READING_ITEMS.find((i) => i.type === "choice") as ReadingChoiceItem;
const cwe = READING_ITEMS.find((i) => i.type === "choice-with-evidence") as ChoiceWithEvidenceItem;

describe("studentReadingItems: 정답 정보가 새지 않는다", () => {
  it("모든 활동의 모든 문제(형식 5종)", () => {
    const types = new Set<string>();
    for (const act of READING_ACTIVITIES) {
      const items = studentReadingItems(act.id);
      expect(items.length).toBe(act.itemIds.length);
      for (const it of items) {
        types.add(it.type);
        for (const key of FORBIDDEN) expect(it).not.toHaveProperty(key);
        const full = getItem(it.id)!;
        const json = JSON.stringify(it);
        expect(json).not.toContain(full.explanation);
        expect(json).not.toContain(full.principle);
        for (const h of full.hints) expect(json).not.toContain(h);
        if (full.type === "label-sentences") expect(json).not.toContain(JSON.stringify(full.answers));
        if (it.type === "slot-paragraphs") for (const s of it.slots) expect(Object.keys(s).sort()).toEqual(["id", "label"]);
      }
    }
    expect([...types].sort()).toEqual(["choice", "choice-with-evidence", "label-sentences", "sentence-pick", "slot-paragraphs"]);
  });
  it("문제 모양: 공개 필드만 정확히 들어 있다", () => {
    const find = (id: string) => studentReadingItems(READING_ACTIVITIES.find((a) => a.itemIds.includes(id))!.id).find((x) => x.id === id)!;
    const base = ["id", "passageId", "prompt", "standardCode", "type"];
    expect(Object.keys(find(pick.id)).sort()).toEqual([...base, "paragraphId"].sort());
    expect(Object.keys(find(label.id)).sort()).toEqual([...base, "labels", "sentenceIds"].sort());
    expect(Object.keys(find(slot.id)).sort()).toEqual([...base, "paragraphIds", "slots"].sort());
    expect(Object.keys(find(choice.id)).sort()).toEqual([...base, "options"].sort());
    expect(Object.keys(find(cwe.id)).sort()).toEqual([...base, "options"].sort());
  });
  it("지문은 활동 문제가 쓰는 것만 보낸다", () => {
    for (const act of READING_ACTIVITIES) {
      expect(studentPassages(act.id).map((p) => p.id).sort()).toEqual([...act.passageIds].sort());
    }
    expect(studentPassages("nope")).toEqual([]);
    expect(studentReadingItems("nope")).toEqual([]);
  });
});

describe("parseReadingAnswer", () => {
  const pid = pick.passageId;
  const inScope = `s${pick.paragraphId!.slice(1)}-1`;
  it("sentence-pick: 지문(범위) 안의 문장 id만", () => {
    expect(pick.paragraphId).toBeTruthy();
    expect(parseReadingAnswer(pick, { type: "sentence-pick", sentenceId: inScope })).toEqual({ type: "sentence-pick", sentenceId: inScope });
    expect(parseReadingAnswer(pick, { type: "sentence-pick", sentenceId: "zz" })).toBeNull();
    expect(parseReadingAnswer(pick, { type: "sentence-pick", sentenceId: 3 })).toBeNull();
    expect(parseReadingAnswer(pick, { type: "sentence-pick" })).toBeNull();
    expect(parseReadingAnswer(pick, { type: "choice", option: 0 })).toBeNull();
    expect(parseReadingAnswer(pick, null)).toBeNull();
    expect(parseReadingAnswer(pick, "x")).toBeNull();
    // 범위 밖 문단의 문장
    const other = READING_ITEMS.find((i) => i.passageId === pid && i.type === "sentence-pick" && i.paragraphId && i.paragraphId !== pick.paragraphId);
    if (other) expect(parseReadingAnswer(pick, { type: "sentence-pick", sentenceId: `s${(other as SentencePickItem).paragraphId!.slice(1)}-1` })).toBeNull();
  });
  it("label-sentences: 일부만 채운 답은 통과, 모르는 문장·꼬리표는 거부", () => {
    const full = Object.fromEntries(label.sentenceIds.map((id) => [id, label.labels[0]]));
    expect(parseReadingAnswer(label, { type: "label-sentences", labels: full })).toEqual({ type: "label-sentences", labels: full });
    expect(parseReadingAnswer(label, { type: "label-sentences", labels: {} })).toEqual({ type: "label-sentences", labels: {} });
    expect(parseReadingAnswer(label, { type: "label-sentences", labels: { [label.sentenceIds[0]]: label.labels[0] } })).not.toBeNull();
    expect(parseReadingAnswer(label, { type: "label-sentences", labels: { zz: label.labels[0] } })).toBeNull();
    expect(parseReadingAnswer(label, { type: "label-sentences", labels: { [label.sentenceIds[0]]: "없는꼬리표" } })).toBeNull();
    expect(parseReadingAnswer(label, { type: "label-sentences", labels: { [label.sentenceIds[0]]: 1 } })).toBeNull();
    expect(parseReadingAnswer(label, { type: "label-sentences", labels: [] })).toBeNull();
    expect(parseReadingAnswer(label, { type: "label-sentences" })).toBeNull();
    expect(parseReadingAnswer(label, { type: "slot-paragraphs", placement: {} })).toBeNull();
  });
  it("slot-paragraphs: 모르는 문단·칸은 거부", () => {
    const ok = Object.fromEntries(slot.paragraphIds.map((id) => [id, slot.slots[0].id]));
    expect(parseReadingAnswer(slot, { type: "slot-paragraphs", placement: ok })).toEqual({ type: "slot-paragraphs", placement: ok });
    expect(parseReadingAnswer(slot, { type: "slot-paragraphs", placement: {} })).toEqual({ type: "slot-paragraphs", placement: {} });
    expect(parseReadingAnswer(slot, { type: "slot-paragraphs", placement: { p99: slot.slots[0].id } })).toBeNull();
    expect(parseReadingAnswer(slot, { type: "slot-paragraphs", placement: { [slot.paragraphIds[0]]: "nope" } })).toBeNull();
    expect(parseReadingAnswer(slot, { type: "slot-paragraphs", placement: { [slot.paragraphIds[0]]: 2 } })).toBeNull();
    expect(parseReadingAnswer(slot, { type: "slot-paragraphs", placement: null })).toBeNull();
    expect(parseReadingAnswer(slot, { type: "choice", option: 0 })).toBeNull();
  });
  it("choice: 보기 범위 안의 정수만", () => {
    expect(parseReadingAnswer(choice, { type: "choice", option: 0 })).toEqual({ type: "choice", option: 0 });
    expect(parseReadingAnswer(choice, { type: "choice", option: choice.options.length })).toBeNull();
    expect(parseReadingAnswer(choice, { type: "choice", option: -1 })).toBeNull();
    expect(parseReadingAnswer(choice, { type: "choice", option: 1.5 })).toBeNull();
    expect(parseReadingAnswer(choice, { type: "choice", option: "1" })).toBeNull();
    expect(parseReadingAnswer(choice, { type: "choice-with-evidence", option: 0, sentenceId: "s1-1" })).toBeNull();
  });
  it("choice-with-evidence: 보기와 근거 문장이 둘 다 있어야", () => {
    const a = { type: "choice-with-evidence", option: 0, sentenceId: "s1-1" };
    expect(parseReadingAnswer(cwe, a)).toEqual(a);
    expect(parseReadingAnswer(cwe, { ...a, option: cwe.options.length })).toBeNull();
    expect(parseReadingAnswer(cwe, { ...a, option: 0.5 })).toBeNull();
    expect(parseReadingAnswer(cwe, { ...a, sentenceId: "zz" })).toBeNull();
    expect(parseReadingAnswer(cwe, { type: "choice-with-evidence", option: 0 })).toBeNull();
    expect(parseReadingAnswer(cwe, { type: "choice", option: 0 })).toBeNull();
  });
});

describe("틀린 횟수 규칙", () => {
  it("incomplete·type-mismatch는 세지 않고 evidence-wrong은 센다", () => {
    expect(wrongAttemptCount(["incomplete", "type-mismatch"])).toBe(0);
    expect(wrongAttemptCount(["wrong-option", "incomplete", "evidence-wrong"])).toBe(2);
    expect(wrongAttemptCount(["evidence-wrong"])).toBe(1);
  });
  it("채점 결과의 countsAsWrong과 일치한다", () => {
    const evidenceOk = { type: "choice-with-evidence", option: cwe.correctOption, sentenceId: "s1-1" } as const;
    const wrongEvidence = gradeAnswer(cwe, { ...evidenceOk, sentenceId: otherSentence(cwe) });
    expect(wrongEvidence).toMatchObject({ correct: false, reason: "evidence-wrong", countsAsWrong: true });
    const inc = gradeAnswer(label, { type: "label-sentences", labels: {} });
    expect(inc).toMatchObject({ correct: false, reason: "incomplete", countsAsWrong: false });
  });
  it("evidence-wrong은 힌트 단계가 다른 오답과 똑같이 나아가고 안내 문구가 앞에 붙는다", () => {
    expect(feedbackFor(cwe, 1, "evidence-wrong").message).toBe(`${EVIDENCE_MESSAGE} ${cwe.principle}`);
    expect(feedbackFor(cwe, 2, "evidence-wrong").message).toBe(`${EVIDENCE_MESSAGE} ${cwe.hints[0]}`);
    expect(feedbackFor(cwe, 3, "evidence-wrong").message).toBe(`${EVIDENCE_MESSAGE} ${cwe.hints[1]}`);
    const rev = feedbackFor(cwe, 4, "evidence-wrong");
    expect(rev.level).toBe("reveal");
    expect(rev.message).toBe(cwe.explanation);
    expect(INCOMPLETE_MESSAGE).toContain("다 고르지");
  });
});

function otherSentence(item: ChoiceWithEvidenceItem): string {
  const found = allSentences(getPassage(item.passageId)!).find((x) => !item.evidenceIds.includes(x.id));
  return found!.id;
}

describe("진행 요약", () => {
  const t0 = new Date("2026-01-01T00:00:00Z");
  const row = (itemId: string, attemptNo: number, correct: boolean, feedbackLevel: string | null, sec: number, reason?: string): AttemptRow => ({
    itemId,
    attemptNo,
    correct,
    feedbackLevel,
    reason,
    createdAt: new Date(t0.getTime() + sec * 1000),
  });
  it("근거 오답을 거쳐 푼 문제와 정답 공개를 센다", () => {
    const rows = [
      row("a", 1, true, null, 0, "ok"),
      row("b", 1, false, "principle", 0, "evidence-wrong"),
      row("b", 2, true, null, 20, "ok"),
      row("c", 1, false, "principle", 0, "wrong-option"),
      row("c", 2, false, "hint1", 5, "wrong-option"),
      row("c", 3, false, "hint2", 10, "evidence-wrong"),
      row("c", 4, false, "reveal", 30, "wrong-option"),
    ];
    const p = summarizeAttempts(["a", "b", "c", "d"], rows);
    expect(p[1]).toMatchObject({ solved: true, firstTryCorrect: false, secondsToSolve: 20, hintsUsed: 0 });
    expect(p[2]).toMatchObject({ solved: true, revealed: true, hintsUsed: 3 });
    expect(progressSummary(p)).toEqual({ total: 4, solved: 3, firstTry: 1, revealed: 1 });
  });
});
