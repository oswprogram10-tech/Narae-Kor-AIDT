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
import {
  isItemUnlocked,
  isProgressiveActivity,
  parseReadingAnswer,
  studentPassages,
  studentReadingItems,
  studentReadingView,
} from "@/lib/reading-rules";
import { toOriginalIndex } from "@/core/practice/shuffle";
import { SUMMARY_MAX_INPUT, type SummaryWriteItem } from "@/core/reading";
import { progressSummary, summarizeAttempts, wrongAttemptCount, type AttemptRow } from "@/lib/grammar-rules";

const FORBIDDEN = [
  "correctSentenceIds",
  "answers",
  "correctOption",
  "evidenceIds",
  "paragraphs",
  "keyGroups",
  "topicHint",
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
        if (full.type === "summary-write") {
          // 핵심 낱말·문단 힌트는 학생 기기로 가지 않는다
          for (const para of full.paragraphs) {
            expect(json).not.toContain(para.topicHint);
            for (const g of para.keyGroups) for (const w of g) expect(json, w).not.toContain(`"${w}"`);
          }
        }
        if (it.type === "slot-paragraphs") for (const s of it.slots) expect(Object.keys(s).sort()).toEqual(["id", "label"]);
      }
    }
    expect([...types].sort()).toEqual(["choice", "choice-with-evidence", "label-sentences", "sentence-pick", "slot-paragraphs", "summary-write"]);
  });
  it("문제 모양: 공개 필드만 정확히 들어 있다", () => {
    const find = (id: string) => studentReadingItems(READING_ACTIVITIES.find((a) => a.itemIds.includes(id))!.id).find((x) => x.id === id)!;
    const base = ["id", "passageId", "prompt", "standardCode", "type"];
    expect(Object.keys(find(pick.id)).sort()).toEqual([...base, "paragraphId"].sort());
    expect(Object.keys(find(label.id)).sort()).toEqual([...base, "labels", "sentenceIds"].sort());
    expect(Object.keys(find(slot.id)).sort()).toEqual([...base, "paragraphIds", "slots"].sort());
    expect(Object.keys(find(choice.id)).sort()).toEqual([...base, "options"].sort());
    expect(Object.keys(find(cwe.id)).sort()).toEqual([...base, "options"].sort());
    const summ = READING_ITEMS.find((i) => i.type === "summary-write") as SummaryWriteItem;
    expect(Object.keys(find(summ.id)).sort()).toEqual([...base, "maxChars", "minChars"].sort());
    // 지문 쌍 문제만 passageIds를 보낸다
    const pair = READING_ITEMS.find((i) => i.passageIds !== undefined)!;
    expect(find(pair.id)).toHaveProperty("passageIds", pair.passageIds);
    expect(find(pick.id)).not.toHaveProperty("passageIds");
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
    expect(parseReadingAnswer(choice, { type: "choice", option: 0 })).toEqual({ type: "choice", option: toOriginalIndex(choice.id, choice.options.length, 0) });
    expect(parseReadingAnswer(choice, { type: "choice", option: choice.options.length })).toBeNull();
    expect(parseReadingAnswer(choice, { type: "choice", option: -1 })).toBeNull();
    expect(parseReadingAnswer(choice, { type: "choice", option: 1.5 })).toBeNull();
    expect(parseReadingAnswer(choice, { type: "choice", option: "1" })).toBeNull();
    expect(parseReadingAnswer(choice, { type: "choice-with-evidence", option: 0, sentenceId: "s1-1" })).toBeNull();
  });
  it("choice-with-evidence: 보기와 근거 문장이 둘 다 있어야", () => {
    const a = { type: "choice-with-evidence", option: 0, sentenceId: "s1-1" };
    expect(parseReadingAnswer(cwe, a)).toEqual({ ...a, option: toOriginalIndex(cwe.id, cwe.options.length, 0) });
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


describe("parseReadingAnswer: 요약 쓰기", () => {
  const summ = READING_ITEMS.find((i) => i.type === "summary-write") as SummaryWriteItem;
  it("글을 다듬어(앞뒤 공백 제거) 돌려주고, 글자 수 상한을 넘으면 거부해요", () => {
    expect(parseReadingAnswer(summ, { type: "summary-write", text: "  고양이는 잠을 많이 자요.  " })).toEqual({ type: "summary-write", text: "고양이는 잠을 많이 자요." });
    expect(parseReadingAnswer(summ, { type: "summary-write", text: "" })).toEqual({ type: "summary-write", text: "" });
    expect(parseReadingAnswer(summ, { type: "summary-write", text: "가".repeat(SUMMARY_MAX_INPUT) })).not.toBeNull();
    expect(parseReadingAnswer(summ, { type: "summary-write", text: "가".repeat(SUMMARY_MAX_INPUT + 1) })).toBeNull();
    expect(SUMMARY_MAX_INPUT).toBe(1000);
  });
  it("글이 아니거나 다른 형식의 답은 거부해요", () => {
    expect(parseReadingAnswer(summ, { type: "summary-write" })).toBeNull();
    expect(parseReadingAnswer(summ, { type: "summary-write", text: 3 })).toBeNull();
    expect(parseReadingAnswer(summ, { type: "summary-write", text: ["a"] })).toBeNull();
    expect(parseReadingAnswer(summ, { type: "choice", option: 0 })).toBeNull();
    expect(parseReadingAnswer(summ, null)).toBeNull();
    expect(parseReadingAnswer(choice, { type: "summary-write", text: "x" })).toBeNull();
  });
  it("그대로 내기 표시는 참/거짓만 받아요", () => {
    expect(parseReadingAnswer(summ, { type: "summary-write", text: "글", submitAsIs: true })).toEqual({ type: "summary-write", text: "글", submitAsIs: true });
    expect(parseReadingAnswer(summ, { type: "summary-write", text: "글", submitAsIs: false })).toEqual({ type: "summary-write", text: "글" });
    expect(parseReadingAnswer(summ, { type: "summary-write", text: "글", submitAsIs: "yes" })).toBeNull();
  });
});

describe("문단을 차례로 펼치는 활동(예측하며 읽기): 보이지 않는 문단은 보내지 않는다", () => {
  const act = READING_ACTIVITIES.find((a) => a.id === "prediction")!;
  const text = (v: ReturnType<typeof studentReadingView>) => JSON.stringify(v);

  it("활동이 문단 펼치기로 인식돼요", () => {
    expect(isProgressiveActivity("prediction")).toBe(true);
    expect(isProgressiveActivity("main-idea")).toBe(false);
    expect(isProgressiveActivity("nope")).toBe(false);
  });
  it("아직 아무것도 풀지 않았으면 첫 지문의 1문단만 보내요", () => {
    const v = studentReadingView("prediction", new Set());
    expect(v.progressive).toBe(true);
    expect(v.passages.map((p) => p.id)).toEqual(["pr-jump"]);
    expect(v.passages[0].paragraphs.map((p) => p.id)).toEqual(["p1"]);
    const json = text(v);
    const jump = getPassage("pr-jump")!;
    for (const para of jump.paragraphs.slice(1)) for (const s of para.sentences) expect(json, s.id).not.toContain(s.text);
    // 두 번째 지문은 아직 보내지 않는다
    const seed = getPassage("pr-seed")!;
    for (const para of seed.paragraphs) for (const s of para.sentences) expect(json).not.toContain(s.text);
  });
  it("뒤에 올 문제는 안내·보기 없이 자리만 보내요", () => {
    const v = studentReadingView("prediction", new Set());
    const [first, ...rest] = v.items;
    expect(first).toHaveProperty("options");
    for (const it of rest) expect(it).toEqual({ id: it.id, locked: true });
    // 뒤 문제의 보기·안내 글이 어디에도 없다
    const json = text(v);
    for (const id of act.itemIds.slice(1)) {
      const full = getItem(id)!;
      expect(json).not.toContain(full.prompt);
      if (full.type === "choice" || full.type === "choice-with-evidence") for (const o of full.options) expect(json).not.toContain(o);
    }
  });
  it("문제를 하나씩 풀 때마다 한 문단씩 늘어나요", () => {
    const solved = new Set<string>();
    const jumpIds = act.itemIds.filter((id) => getItem(id)!.passageId === "pr-jump");
    jumpIds.forEach((id, i) => {
      const v = studentReadingView("prediction", solved);
      const shown = v.passages.find((p) => p.id === "pr-jump")!;
      expect(shown.paragraphs.map((p) => p.id), `풀기 전 ${id}`).toEqual(["p1", "p2", "p3", "p4", "p5"].slice(0, Math.min(i + 1, 5)));
      solved.add(id);
    });
    // 첫 지문을 다 풀면 첫 지문은 전체, 둘째 지문의 1문단이 열려요
    const v = studentReadingView("prediction", solved);
    expect(v.passages.map((p) => [p.id, p.paragraphs.length])).toEqual([["pr-jump", 5], ["pr-seed", 1]]);
    // 모두 풀면 전체
    const all = studentReadingView("prediction", new Set(act.itemIds));
    expect(all.passages.map((p) => [p.id, p.paragraphs.length])).toEqual([["pr-jump", 5], ["pr-seed", 5]]);
    expect(all.items.every((x) => !("locked" in x))).toBe(true);
  });
  it("마지막 문제(전체 내용)는 모든 문단을 풀어야 보이고, 앞 문제를 풀기 전에는 풀 수 없어요", () => {
    const ids = act.itemIds.filter((id) => getItem(id)!.passageId === "pr-jump");
    const beforeLast = new Set(ids.slice(0, -1));
    expect(studentReadingView("prediction", beforeLast).passages.find((p) => p.id === "pr-jump")!.paragraphs).toHaveLength(5);
    expect(isItemUnlocked("prediction", ids[0], new Set())).toBe(true);
    expect(isItemUnlocked("prediction", ids[1], new Set())).toBe(false);
    expect(isItemUnlocked("prediction", ids[1], new Set([ids[0]]))).toBe(true);
    expect(isItemUnlocked("prediction", "nope", new Set())).toBe(false);
    // 일반 활동은 순서 제한이 없다
    expect(isItemUnlocked("main-idea", "ma-03", new Set())).toBe(true);
  });
  it("근거 문장은 보이는 문단 안에서만 고를 수 있어요", () => {
    const item = getItem("pr-01") as ChoiceWithEvidenceItem; // 1문단까지
    expect(parseReadingAnswer(item, { type: "choice-with-evidence", option: 0, sentenceId: "s1-1" })).not.toBeNull();
    expect(parseReadingAnswer(item, { type: "choice-with-evidence", option: 0, sentenceId: "s2-1" })).toBeNull();
    expect(parseReadingAnswer(item, { type: "choice-with-evidence", option: 0, sentenceId: "s5-3" })).toBeNull();
    const item3 = getItem("pr-03") as ChoiceWithEvidenceItem;
    expect(parseReadingAnswer(item3, { type: "choice-with-evidence", option: 0, sentenceId: "s3-3" })).not.toBeNull();
    expect(parseReadingAnswer(item3, { type: "choice-with-evidence", option: 0, sentenceId: "s4-1" })).toBeNull();
  });
  it("문단을 펼치지 않는 활동은 전부 한 번에 보내요", () => {
    const v = studentReadingView("main-idea", new Set());
    expect(v.progressive).toBe(false);
    expect(v.items).toHaveLength(12);
    expect(v.passages.map((p) => p.id)).toEqual(["mi-cat", "mi-signal"]);
    expect(v.passages.every((p) => p.paragraphs.length === 4)).toBe(true);
  });
});

describe("관점 비교하기: 지문 두 편", () => {
  const act = READING_ACTIVITIES.find((a) => a.id === "perspectives")!;
  it("지문 네 편을 모두 보내고 문제마다 짝지은 두 지문을 알려 줘요", () => {
    expect(studentPassages("perspectives").map((p) => p.id)).toEqual(["pv-phone-a", "pv-phone-b", "pv-garden-a", "pv-garden-b"]);
    for (const it of studentReadingItems("perspectives")) expect(it.passageIds, it.id).toHaveLength(2);
  });
  it("두 지문 어디의 문장이든 근거로 고를 수 있고, 지문에 없는 문장은 거부해요", () => {
    const item = getItem("pv-01") as ChoiceWithEvidenceItem;
    expect(parseReadingAnswer(item, { type: "choice-with-evidence", option: 0, sentenceId: "a-s1-2" })).not.toBeNull();
    expect(parseReadingAnswer(item, { type: "choice-with-evidence", option: 0, sentenceId: "b-s1-1" })).not.toBeNull();
    expect(parseReadingAnswer(item, { type: "choice-with-evidence", option: 0, sentenceId: "s1-1" })).toBeNull();
    expect(parseReadingAnswer(item, { type: "choice-with-evidence", option: 0, sentenceId: "a-s9-9" })).toBeNull();
    const label = getItem("pv-03") as LabelSentencesItem;
    const full = Object.fromEntries(label.sentenceIds.map((id) => [id, label.labels[0]]));
    expect(parseReadingAnswer(label, { type: "label-sentences", labels: full })).not.toBeNull();
    expect(parseReadingAnswer(label, { type: "label-sentences", labels: { "a-s1-1": label.labels[0] } })).toBeNull();
  });
  it("활동 문제 수", () => {
    expect(act.itemIds).toHaveLength(8);
  });
});
