import { describe, expect, it } from "vitest";
import {
  DEFAULT_BANDS,
  IMPRESSION_STICKERS,
  IMPRESSION_STICKER_IDS,
  LIMITS,
  MIN_CHARS,
  emptyImpression,
  getImpressionWork,
  groupBySentence,
  impressionWorks,
  isImpressionStickerId,
  isValidChoice,
  sanitizeImpression,
  sentenceInWork,
  submitProblems,
  type ImpressionArtifact,
} from "@/core/impression";
import { STICKER_IDS } from "@/core/cardnews";
import {
  ARTIFACT_KINDS,
  artifactActivitiesForGrade,
  classifyField,
  emptyArtifact,
  fieldLabel,
  fieldsOf,
  sanitizeArtifact,
  scanSafety,
  submitProblems as artifactProblems,
  withFields,
} from "@/core/artifact";

const WHY = "연이 바람을 타고 높이 올라가는 모습이 시원해서 마음에 오래 남았어요.";
const LIFE = "나도 처음 자전거를 탔을 때 이런 기분이었어요.";

function filled(): ImpressionArtifact {
  const a = emptyImpression();
  a.workId = "lt-kite";
  a.sentenceId = "s1-1";
  a.why = WHY;
  a.life = LIFE;
  a.step = 3;
  a.maxStep = 3;
  return a;
}

describe("작품 목록", () => {
  it("기본은 5~6학년의 동화·시·이야기이고 문학 작품과 읽기 이야기 지문을 함께 쓴다", () => {
    expect(DEFAULT_BANDS).toEqual(["5-6"]);
    const works = impressionWorks();
    expect(works.map((w) => w.id)).toEqual(expect.arrayContaining(["lt-kite", "lt-grandma-hand", "in-umbrella"]));
    expect(works.every((w) => w.gradeBand === "5-6" && ["동화", "시", "이야기"].includes(w.genre))).toBe(true);
    expect(works.find((w) => w.id === "in-umbrella")?.genre).toBe("이야기");
    expect(works.some((w) => w.id === "lt-stage")).toBe(false);
  });

  it("학년군을 바꿀 수 있다", () => {
    const all = impressionWorks(["3-4", "5-6"]);
    expect(all.map((w) => w.id)).toEqual(expect.arrayContaining(["lt-stage", "lt-rain-market", "pr-jump", "lt-kite"]));
    expect(new Set(all.map((w) => w.id)).size).toBe(all.length);
    expect(getImpressionWork("lt-stage")).toBeUndefined();
    expect(getImpressionWork("lt-stage", ["3-4"])?.title).toBe("하준이의 리코더");
  });

  it("문장 찾기·작품 안 문장 확인", () => {
    const kite = getImpressionWork("lt-kite")!;
    expect(sentenceInWork(kite, "s1-1")).toMatchObject({ id: "s1-1", paragraphId: "p1", order: 0 });
    expect(sentenceInWork(kite, "s99-1")).toBeUndefined();
    expect(isValidChoice("lt-kite", "s1-1")).toBe(true);
    expect(isValidChoice("lt-kite", "nope")).toBe(false);
    expect(isValidChoice("lt-stage", "s1-1")).toBe(false); // 3~4학년 작품은 기본 목록에 없다
    expect(isValidChoice("lt-stage", "s1-1", ["3-4"])).toBe(true);
  });
});

describe("형식 고치기", () => {
  it("빈 형식은 그대로 통과한다", () => {
    const a = emptyImpression();
    expect(sanitizeImpression(a)).toEqual(a);
  });

  it("글자 수 제한, 제어 문자 제거, 단계 보정", () => {
    const raw = { ...filled(), why: "가".repeat(300), life: "나\u0007".repeat(250), step: 9 };
    const out = sanitizeImpression(raw)!;
    expect(Array.from(out.why).length).toBe(LIMITS.why);
    expect(out.life).toBe("나".repeat(LIMITS.life));
    expect(out.step).toBe(1);
  });

  it("없는 작품이면 작품과 문장을 비우고, 작품에 없는 문장이면 문장만 비운다", () => {
    expect(sanitizeImpression({ ...filled(), workId: "hack" })).toMatchObject({ workId: "", sentenceId: "" });
    expect(sanitizeImpression({ ...filled(), sentenceId: "s99-9" })).toMatchObject({ workId: "lt-kite", sentenceId: "" });
    expect(sanitizeImpression({ ...filled(), workId: "lt-stage" })).toMatchObject({ workId: "", sentenceId: "" });
    expect(sanitizeImpression({ ...filled(), workId: 3, sentenceId: {} })).toMatchObject({ workId: "", sentenceId: "" });
  });

  it("종류가 틀리거나 객체가 아니면 null, 가장 멀리 간 단계는 줄지 않는다", () => {
    expect(sanitizeImpression({ kind: "cardnews" })).toBeNull();
    expect(sanitizeImpression("x")).toBeNull();
    const prev = { ...filled(), maxStep: 3 as const };
    expect(sanitizeImpression({ ...filled(), step: 1 }, prev)?.maxStep).toBe(3);
  });
});

describe("제출 조건", () => {
  it("작품·문장·까닭(20자)·삶(10자)이 모두 있어야 한다", () => {
    expect(submitProblems(emptyImpression()).length).toBe(3);
    expect(submitProblems(emptyImpression())[0]).toContain("작품");
    const noSentence = { ...filled(), sentenceId: "" };
    expect(submitProblems(noSentence)[0]).toContain("문장");
    expect(submitProblems({ ...filled(), why: "가".repeat(MIN_CHARS.why - 1) })).toEqual([expect.stringContaining("까닭")]);
    expect(submitProblems({ ...filled(), why: "가".repeat(MIN_CHARS.why) })).toEqual([]);
    expect(submitProblems({ ...filled(), life: "나".repeat(MIN_CHARS.life - 1) })).toEqual([expect.stringContaining("삶")]);
    expect(submitProblems({ ...filled(), life: "나".repeat(MIN_CHARS.life) })).toEqual([]);
    // 공백만으로는 글자 수를 채울 수 없다
    expect(submitProblems({ ...filled(), why: " ".repeat(40) }).length).toBe(1);
    expect(submitProblems(filled())).toEqual([]);
  });
});

describe("반응 스티커", () => {
  it("네 개, 고정 id·이름이고 카드뉴스 스티커와 겹치지 않는다", () => {
    expect(IMPRESSION_STICKERS.map((s) => s.label)).toEqual([
      "나도 그 부분이 좋았어요",
      "새롭게 생각하게 됐어요",
      "내 경험이 떠올랐어요",
      "까닭이 잘 드러나요",
    ]);
    expect(IMPRESSION_STICKER_IDS).toEqual(["same", "rethink", "memory", "reason"]);
    expect(IMPRESSION_STICKER_IDS.some((id) => STICKER_IDS.includes(id))).toBe(false);
    expect(isImpressionStickerId("same")).toBe(true);
    expect(isImpressionStickerId("clear")).toBe(false);
    expect(isImpressionStickerId("자유댓글")).toBe(false);
  });
});

describe("같은 문장끼리 모으기", () => {
  it("작품 순서·문장 순서로 모둠을 만들고 모둠 안은 들어온 순서를 지킨다", () => {
    const items = [
      { workId: "lt-kite", sentenceId: "s2-1", n: 1 },
      { workId: "in-umbrella", sentenceId: "s1-1", n: 2 },
      { workId: "lt-kite", sentenceId: "s1-1", n: 3 },
      { workId: "lt-kite", sentenceId: "s2-1", n: 4 },
      { workId: "lt-stage", sentenceId: "s1-1", n: 5 }, // 목록에 없는 작품
      { workId: "lt-kite", sentenceId: "zz", n: 6 }, // 없는 문장
    ];
    const groups = groupBySentence(items);
    expect(groups.map((g) => `${g.workId}/${g.sentenceId}`)).toEqual(["lt-kite/s1-1", "lt-kite/s2-1", "in-umbrella/s1-1"]);
    expect(groups[1].items.map((x) => x.n)).toEqual([1, 4]);
    expect(groups[0]).toMatchObject({ workTitle: "바람을 타는 연" });
    expect(groups[0].text).toBe(getImpressionWork("lt-kite")!.paragraphs[0].sentences[0].text);
    expect(groupBySentence([])).toEqual([]);
  });
});

describe("제작물 공통 처리에 연결", () => {
  it("종류 목록·5학년 이상 활동", () => {
    expect(ARTIFACT_KINDS).toContain("impression");
    expect(artifactActivitiesForGrade(4).some((x) => x.kind === "impression")).toBe(false);
    expect(artifactActivitiesForGrade(5).find((x) => x.kind === "impression")?.standardCode).toBe("6국05-04");
    expect(artifactActivitiesForGrade(6).some((x) => x.kind === "impression")).toBe(true);
  });

  it("빈 제작물·고치기·제출 문제·글 칸·이름", () => {
    expect(emptyArtifact("impression")).toEqual(emptyImpression());
    expect(sanitizeArtifact("impression", filled())).toEqual(filled());
    expect(sanitizeArtifact("impression", { kind: "cardnews" })).toBeNull();
    expect(artifactProblems(filled())).toEqual([]);
    expect(fieldsOf(filled()).map((f) => f.key)).toEqual(["why", "life"]);
    expect(fieldLabel(filled(), "why")).toBe("고른 까닭");
    expect(fieldLabel(filled(), "life")).toBe("내 삶과 이어 본 생각");
    const w = withFields(filled(), { why: "바꾼 글", nope: "x" });
    expect(w).toMatchObject({ kind: "impression", why: "바꾼 글", life: LIFE });
  });

  it("안전 점검: 걸린 칸은 이전 글로 되돌린다", () => {
    expect(classifyField("요즘 너무 힘들어서 죽고 싶어요")).toBe("distress");
    const prev = filled();
    const next = { ...prev, life: "요즘 너무 힘들어서 죽고 싶어요", why: `${WHY} 더 썼어요.` };
    const scan = scanSafety(prev, next);
    expect(scan.kind).toBe("distress");
    expect(scan.hits.map((h) => h.key)).toEqual(["life"]);
    expect(scan.artifact).toMatchObject({ life: LIFE, why: `${WHY} 더 썼어요.` });
    expect(scan.reply).toContain("선생님께");
  });
});
