import { describe, expect, it } from "vitest";
import {
  CARD_COLORS,
  CARD_ICONS,
  CARD_MAX,
  CARD_MIN,
  LIMITS,
  STICKERS,
  checkCardnews,
  coverHasKeyMessage,
  emptyCardnews,
  findExaggerations,
  keyWordsOf,
  newCard,
  sanitizeCardnews,
  sourceCardOf,
  submitProblems,
  type CardnewsArtifact,
} from "@/core/cardnews";
import { fieldsOf, scanSafety, sanitizeArtifact, withFields, emptyArtifact, classifyField, fieldLabel } from "@/core/artifact";

function filled(): CardnewsArtifact {
  const a = emptyCardnews();
  a.plan = { topic: "손 씻기", audience: "3학년 동생들", keyMessage: "비누로 손을 씻으면 세균이 줄어요", sources: [{ title: "보건 교과서", where: "책" }] };
  a.cards.forEach((c, i) => {
    c.title = i === 0 ? "손 씻기 약속" : `알아 둘 것 ${i}`;
    c.body = i === 0 ? "비누로 손을 씻어요." : "물로 헹궈요.";
  });
  a.confirms.audience = true;
  return a;
}

describe("카드뉴스 형식", () => {
  it("빈 카드뉴스: 카드 4장, 표지·내용·마무리 틀", () => {
    const a = emptyCardnews();
    expect(a.cards.map((c) => c.layout)).toEqual(["cover", "content", "content", "closing"]);
    expect(new Set(a.cards.map((c) => c.id)).size).toBe(4);
    expect(sanitizeCardnews(a)).toEqual(a);
  });

  it("고정 목록: 색 8개, 그림 기호 24개, 반응 스티커 4개", () => {
    expect(CARD_COLORS.length).toBe(8);
    expect(CARD_ICONS.length).toBe(24);
    expect(STICKERS.map((s) => s.id)).toEqual(["clear", "new", "icons", "trust"]);
    expect(STICKERS.map((s) => s.label)).toEqual(["이해가 잘 돼요", "새로 알게 됐어요", "그림 기호가 잘 어울려요", "출처가 믿음직해요"]);
  });

  it("글자 수·개수·고정 목록을 서버에서 고친다", () => {
    const raw = {
      ...filled(),
      cards: Array.from({ length: 9 }, (_, i) => ({ id: "same", title: "가".repeat(40), body: "나".repeat(200), color: "red", icon: "💣", layout: "closing", n: i })),
      plan: { topic: "주".repeat(99), audience: "읽".repeat(99), keyMessage: "핵".repeat(99), sources: Array.from({ length: 9 }, () => ({ title: "t".repeat(99), where: "w".repeat(99) })) },
    };
    const a = sanitizeCardnews(raw)!;
    expect(a.cards.length).toBe(CARD_MAX);
    expect(new Set(a.cards.map((c) => c.id)).size).toBe(CARD_MAX);
    for (const c of a.cards) {
      expect(c.title.length).toBe(LIMITS.cardTitle);
      expect(c.body.length).toBe(LIMITS.cardBody);
      expect(c.color).toBe(CARD_COLORS[0].id);
      expect(CARD_ICONS).toContain(c.icon);
    }
    expect(a.cards.map((c) => c.layout)).toEqual(["cover", "content", "content", "content", "content", "closing"]);
    expect(a.plan.topic.length).toBe(LIMITS.topic);
    expect(a.plan.keyMessage.length).toBe(LIMITS.keyMessage);
    expect(a.plan.sources.length).toBe(5);
    expect(a.plan.sources[0].title.length).toBe(LIMITS.sourceTitle);
  });

  it("엉뚱한 값은 거부하고, 호스트가 정하는 값은 입력을 무시한다", () => {
    expect(sanitizeCardnews(null)).toBeNull();
    expect(sanitizeCardnews({ kind: "media-diary" })).toBeNull();
    expect(sanitizeCardnews({ kind: "cardnews", cards: [] })).toBeNull();
    const prev = { ...filled(), submitWarnings: 2, revisions: 3, lastRevisionAt: 5, maxStep: 3 as const };
    const a = sanitizeCardnews({ ...filled(), submitWarnings: 99, revisions: 99, lastRevisionAt: 99, step: 2, maxStep: 4 }, prev)!;
    expect(a.submitWarnings).toBe(2);
    expect(a.revisions).toBe(3);
    expect(a.lastRevisionAt).toBe(5);
    expect(a.maxStep).toBe(3);
  });

  it("카드를 더하면 겹치지 않는 id", () => {
    const a = emptyCardnews();
    expect(a.cards.some((c) => c.id === newCard(a.cards).id)).toBe(false);
  });

  it("제출 전에 막는 문제: 계획, 카드 4장 이상, 카드마다 제목·본문", () => {
    expect(submitProblems(filled())).toEqual([]);
    expect(submitProblems(emptyCardnews()).length).toBeGreaterThan(3);
    const a = filled();
    a.cards = a.cards.slice(0, CARD_MIN - 1);
    expect(submitProblems(a).join()).toContain("4장 이상");
  });

  it("출처 카드는 계획의 출처 목록에서 저절로 만든다", () => {
    expect(sourceCardOf(filled().plan).lines).toEqual(["보건 교과서 (책)"]);
    expect(sourceCardOf(emptyCardnews().plan).lines).toEqual(["적어 둔 출처가 없어요"]);
  });
});

describe("스스로 점검(규칙)", () => {
  it("모두 괜찮으면 경고가 없다", () => {
    expect(checkCardnews(filled())).toEqual([]);
  });

  it("과장 표현을 위치와 함께 찾는다", () => {
    expect(findExaggerations("가장 최고의 방법, 100% 무조건!")).toEqual([
      { start: 0, end: 2, word: "가장" },
      { start: 3, end: 5, word: "최고" },
      { start: 11, end: 15, word: "100%" },
      { start: 16, end: 19, word: "무조건" },
    ]);
    expect(findExaggerations("누구나, 절대, 모든 사람이 해요").map((s) => s.word)).toEqual(["누구나", "절대", "모든 사람"]);
    expect(findExaggerations("길 가장자리로 걸어요")).toEqual([]);
    expect(findExaggerations("손을 씻어요")).toEqual([]);
  });

  it("카드 안의 과장 표현은 카드·칸·위치를 알려 준다", () => {
    const a = filled();
    a.cards[1].body = "가장 최고예요";
    const w = checkCardnews(a).find((x) => x.kind === "exaggeration")!;
    expect(w.cardId).toBe(a.cards[1].id);
    expect(w.field).toBe("body");
    expect(w.spans?.map((s) => s.word)).toEqual(["가장", "최고"]);
  });

  it("표지에 핵심 메시지 낱말이 있는지(조사는 떼어서 비교)", () => {
    expect(keyWordsOf("비누로 손을 씻으면 세균이 줄어요")).toEqual(["비누", "손을", "씻으면", "세균", "줄어요"]);
    expect(coverHasKeyMessage({ title: "손 씻기", body: "비누로 씻으면 세균이 줄어요" }, "비누로 손을 씻으면 세균이 줄어요")).toBe(true);
    expect(coverHasKeyMessage({ title: "안녕", body: "오늘은 좋은 날" }, "비누로 손을 씻으면 세균이 줄어요")).toBe(false);
  });

  it("표지에 핵심 메시지가 없으면 경고, 학생이 확인하면 사라진다", () => {
    const a = filled();
    a.cards[0].title = "안녕하세요";
    a.cards[0].body = "오늘의 소식";
    expect(checkCardnews(a).map((w) => w.id)).toContain("key-cover");
    a.confirms.keyMessage = true;
    expect(checkCardnews(a).map((w) => w.id)).not.toContain("key-cover");
  });

  it("길이 경고(글이 길거나 문장이 셋 이상)", () => {
    const a = filled();
    a.cards[1].body = "가".repeat(71);
    a.cards[2].body = "하나예요. 둘이에요. 셋이에요.";
    a.cards[3].title = "제목이 아주아주 길어요 길어요";
    const ids = checkCardnews(a).filter((w) => w.kind === "too-long").map((w) => w.id);
    expect(ids).toEqual(expect.arrayContaining([`long-body-${a.cards[1].id}`, `long-body-${a.cards[2].id}`, `long-title-${a.cards[3].id}`]));
  });

  it("출처가 없으면 경고, 읽을 사람 확인을 안 하면 경고", () => {
    const a = filled();
    a.plan.sources = [{ title: "", where: "책" }];
    a.confirms.audience = false;
    const kinds = checkCardnews(a).map((w) => w.kind);
    expect(kinds).toContain("sources");
    expect(kinds).toContain("audience");
  });

  it("비어 있는 칸 경고", () => {
    const a = filled();
    a.cards[2].title = "";
    expect(checkCardnews(a).some((w) => w.kind === "empty" && w.cardId === a.cards[2].id)).toBe(true);
  });
});

describe("제작물 안전 점검(순수)", () => {
  it("위험 신호가 있는 칸은 새 글을 저장하지 않고 이전 글로 되돌린다", () => {
    const prev = filled();
    const next = structuredClone(prev);
    next.cards[1].body = "요즘 너무 힘들어서 죽고 싶어요";
    next.cards[2].title = "새 제목";
    const scan = scanSafety(prev, next);
    expect(scan.kind).toBe("distress");
    expect(scan.hits).toEqual([{ key: `card.${prev.cards[1].id}.body`, kind: "distress" }]);
    expect(scan.reply).toContain("선생님께");
    const a = scan.artifact as CardnewsArtifact;
    expect(a.cards[1].body).toBe(prev.cards[1].body);
    expect(a.cards[2].title).toBe("새 제목");
  });

  it("개인 정보도 되돌린다(새 카드면 빈 글)", () => {
    const prev = filled();
    const next = structuredClone(prev);
    next.plan.sources = [...prev.plan.sources, { title: "전화번호 010-1234-5678", where: "" }];
    const scan = scanSafety(prev, next);
    expect(scan.kind).toBe("personal_info");
    expect(JSON.stringify(scan.artifact)).not.toContain("010-1234");
    expect((scan.artifact as CardnewsArtifact).plan.sources.map((x) => x.title)).toEqual(["보건 교과서", ""]);
  });

  it("바뀌지 않은 칸과 평범한 글은 건드리지 않는다", () => {
    const prev = filled();
    const next = structuredClone(prev);
    next.cards[1].body = "물에 헹구면 거품이 없어져요";
    const scan = scanSafety(prev, next);
    expect(scan.kind).toBeNull();
    expect(scan.artifact).toBe(next);
    expect(classifyField("손을 깨끗이 씻어요")).toBeNull();
  });

  it("카드 순서를 바꿔도 같은 카드의 칸 이름은 그대로(카드 id 기준)", () => {
    const a = filled();
    const keys = fieldsOf(a).map((f) => f.key);
    const swapped = { ...a, cards: [a.cards[0], a.cards[2], a.cards[1], a.cards[3]] };
    expect(new Set(fieldsOf(swapped).map((f) => f.key))).toEqual(new Set(keys));
    expect((withFields(a, { [`card.${a.cards[1].id}.title`]: "바뀜" }) as CardnewsArtifact).cards.map((c) => c.title)).toEqual([a.cards[0].title, "바뀜", a.cards[2].title, a.cards[3].title]);
    expect(fieldLabel(a, `card.${a.cards[2].id}.body`)).toBe("3번 카드 본문");
  });

  it("종류별 빈 제작물과 형식 고르기", () => {
    expect(emptyArtifact("cardnews").kind).toBe("cardnews");
    expect(emptyArtifact("media-diary").kind).toBe("media-diary");
    expect(sanitizeArtifact("cardnews", emptyArtifact("media-diary"))).toBeNull();
  });
});
