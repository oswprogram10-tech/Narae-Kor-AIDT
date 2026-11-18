import { describe, expect, it } from "vitest";
import { getPassage, allSentences, type ReadingAnswer } from "@/core/reading";
import {
  LISTENING_ACTIVITIES,
  LISTENING_ITEMS,
  LISTENING_PASSAGES,
  correctListeningAnswerOf,
  getListeningActivity,
  getListeningItem,
  gradeListeningAnswer,
  listeningActivitiesForGrade,
  listeningScript,
  speakerVoice,
  validateListeningItem,
  validateListeningPassage,
} from "@/core/listening";

type Item = (typeof LISTENING_ITEMS)[number];

/** 일부러 틀린 답 */
function wrongAnswer(item: Item): ReadingAnswer {
  const passage = getPassage(item.passageId)!;
  switch (item.type) {
    case "choice":
      return { type: "choice", option: (item.correctOption + 1) % item.options.length };
    case "choice-with-evidence":
      return { type: "choice-with-evidence", option: (item.correctOption + 1) % item.options.length, sentenceId: item.evidenceIds[0] };
    case "sentence-pick": {
      const s = allSentences(passage).find((x) => !item.correctSentenceIds.includes(x.id))!;
      return { type: "sentence-pick", sentenceId: s.id };
    }
    case "label-sentences": {
      const labels: Record<string, string> = {};
      for (const id of item.sentenceIds) labels[id] = item.labels.find((l) => l !== item.answers[id])!;
      return { type: "label-sentences", labels };
    }
  }
}

describe("듣기 자료", () => {
  it("모든 지문이 검증을 통과해요", () => {
    expect(LISTENING_PASSAGES.flatMap((p) => validateListeningPassage(p).map((m) => `${p.id}: ${m}`))).toEqual([]);
  });
  it("지문 8편이고 id가 겹치지 않으며 읽기 핵심부에서 찾을 수 있어요", () => {
    expect(LISTENING_PASSAGES).toHaveLength(8);
    expect(new Set(LISTENING_PASSAGES.map((p) => p.id)).size).toBe(8);
    for (const p of LISTENING_PASSAGES) expect(getPassage(p.id), p.id).toBe(p);
  });
  it("모든 문제가 검증을 통과해요", () => {
    expect(LISTENING_ITEMS.flatMap((i) => validateListeningItem(i).map((m) => `${i.id}: ${m}`))).toEqual([]);
    expect(new Set(LISTENING_ITEMS.map((i) => i.id)).size).toBe(LISTENING_ITEMS.length);
  });
});

describe("활동", () => {
  it("활동 4개, 문제는 활동마다 5~6개이고 총 22~24개예요", () => {
    expect(LISTENING_ACTIVITIES.map((a) => a.id)).toEqual(["listen-main", "polite-talk", "listen-infer", "argument-check"]);
    for (const a of LISTENING_ACTIVITIES) {
      expect(a.itemIds.length, a.id).toBeGreaterThanOrEqual(5);
      expect(a.itemIds.length, a.id).toBeLessThanOrEqual(6);
      for (const id of a.itemIds) expect(getListeningItem(id)!.standardCode).toBe(a.standardCode);
      for (const id of a.passageIds) expect(getPassage(id)!.gradeBand).toBe(a.gradeBand);
    }
    expect(LISTENING_ITEMS.length).toBeGreaterThanOrEqual(22);
    expect(LISTENING_ITEMS.length).toBeLessThanOrEqual(24);
  });
  it("활동 조회와 학년별 목록", () => {
    expect(getListeningActivity("polite-talk")?.standardCode).toBe("4국01-04");
    expect(getListeningActivity("nope")).toBeUndefined();
    expect(listeningActivitiesForGrade(3).map((a) => a.id)).toEqual(["listen-main", "polite-talk"]);
    expect(listeningActivitiesForGrade(6).map((a) => a.id)).toEqual(["listen-infer", "argument-check"]);
  });
  it("문제 접두사가 활동과 맞아요", () => {
    const prefix: Record<string, string> = { "listen-main": "lm-", "polite-talk": "pt-", "listen-infer": "li-", "argument-check": "ac-" };
    for (const a of LISTENING_ACTIVITIES) for (const id of a.itemIds) expect(id.startsWith(prefix[a.id])).toBe(true);
  });
  it("정답 원래 번호가 한쪽으로 쏠리지 않아요", () => {
    const counts = [0, 0, 0, 0];
    let total = 0;
    for (const i of LISTENING_ITEMS) {
      if (i.type === "choice" || i.type === "choice-with-evidence") {
        counts[i.correctOption]++;
        total++;
      }
    }
    for (const c of counts) expect(c / total).toBeLessThan(0.6);
  });
  it("타당성 꼬리표 문제와 문장 고르기 문제가 들어 있어요", () => {
    expect(LISTENING_ITEMS.some((i) => i.id.startsWith("ac-") && i.type === "label-sentences")).toBe(true);
    expect(LISTENING_ITEMS.some((i) => i.id.startsWith("pt-") && i.type === "sentence-pick")).toBe(true);
  });
});

describe("채점", () => {
  it("정답으로 채점하면 정답, 틀린 답으로 채점하면 오답이에요", () => {
    for (const i of LISTENING_ITEMS) {
      expect(gradeListeningAnswer(i, correctListeningAnswerOf(i)).correct, `${i.id} 정답`).toBe(true);
      expect(gradeListeningAnswer(i, wrongAnswer(i)).correct, `${i.id} 오답`).toBe(false);
    }
  });
});

describe("소리 내기", () => {
  const dialogue = getPassage("ls-polite-poster")!;
  it("같은 사람은 늘 같은 값이고 결정적이에요", () => {
    expect(speakerVoice(dialogue, "지호")).toEqual(speakerVoice(dialogue, "지호"));
    expect(speakerVoice(dialogue, "수아")).toEqual(speakerVoice(dialogue, "수아"));
  });
  it("사람이 다르면 목소리가 달라요", () => {
    const names = [...new Set(dialogue.paragraphs.map((p) => p.speaker!))];
    const keys = names.map((n) => JSON.stringify(speakerVoice(dialogue, n)));
    expect(new Set(keys).size).toBe(names.length);
  });
  it("값이 정해진 범위 안이에요", () => {
    for (const p of LISTENING_PASSAGES) {
      for (const para of p.paragraphs) {
        const v = speakerVoice(p, para.speaker!);
        expect(v.pitch).toBeGreaterThanOrEqual(0.8);
        expect(v.pitch).toBeLessThanOrEqual(1.25);
        expect(v.rate).toBeGreaterThanOrEqual(0.9);
        expect(v.rate).toBeLessThanOrEqual(1.0);
      }
    }
  });
  it("listeningScript는 문단 수와 같고 문장을 이어 붙여요", () => {
    for (const p of LISTENING_PASSAGES) {
      const script = listeningScript(p);
      expect(script).toHaveLength(p.paragraphs.length);
      script.forEach((line, i) => {
        expect(line.paragraphId).toBe(p.paragraphs[i].id);
        expect(line.speaker).toBe(p.paragraphs[i].speaker);
        expect(line.text).toBe(p.paragraphs[i].sentences.map((s) => s.text).join(" "));
      });
    }
  });
});
