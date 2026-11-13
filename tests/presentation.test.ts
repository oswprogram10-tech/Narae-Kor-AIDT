import { describe, expect, it } from "vitest";
import {
  MEMO_EXPANSION,
  PRACTICE_MAX,
  PRESENTATION_LIMITS,
  SPOKEN_CHARS_PER_MINUTE,
  bandOfGrade,
  checkPresentation,
  emptyPresentation,
  estimateSeconds,
  newPoint,
  newPresentationSource,
  presentationFields,
  presentationStandardCode,
  presentationSubmitProblems,
  sanitizePresentation,
  withBand,
  type PresentationArtifact,
} from "@/core/speaking";
import { ARTIFACT_KINDS, emptyArtifact, fieldLabel, fieldsOf, sanitizeArtifact, scanSafety, submitProblems, withFields } from "@/core/artifact";
import { getStandard } from "@/core/data/standards";

const TARGET = 180;

function good(band: "3-4" | "5-6" = "5-6"): PresentationArtifact {
  const a = emptyPresentation(band);
  a.topic = "우리 동네 재활용";
  a.purpose = "inform";
  a.audience = "우리 반 친구들";
  a.sources = [{ id: "s1", name: "구청 누리집", from: "구청 누리집", keyInfo: "재활용 분리배출 방법", ...(band === "5-6" ? { trust: { who: true, when: true, evidence: false } } : {}) }];
  a.opening = "안녕하세요. 오늘은 재활용 이야기를 해요. 여러분은 쓰레기를 어떻게 버리나요?";
  a.points = [
    { id: "p1", text: "종이와 플라스틱을 따로 모아요. 깨끗이 씻어서 내놓아요. 라벨도 떼어 내면 더 좋아요.", sourceIds: ["s1"], aid: band === "5-6" ? "photo" : null },
    { id: "p2", text: "분리배출을 잘하면 쓰레기가 자원이 돼요. 우리 동네도 깨끗하게 달라져요. 그림으로 보여 줄게요.", sourceIds: ["s1"], aid: null },
  ];
  a.closing = "정리하면 깨끗이 씻어 따로 버리는 것이 중요해요. 들어 주셔서 고맙습니다.";
  return a;
}
const kinds = (a: PresentationArtifact, t = TARGET) => checkPresentation(a, t).map((w) => w.kind);

describe("발표 준비: 학년대와 성취기준", () => {
  it("3~4학년은 4국01-05, 5~6학년은 6국01-05", () => {
    for (const g of [3, 4]) expect([bandOfGrade(g), presentationStandardCode(g)]).toEqual(["3-4", "4국01-05"]);
    for (const g of [5, 6]) expect([bandOfGrade(g), presentationStandardCode(g)]).toEqual(["5-6", "6국01-05"]);
    expect(getStandard("4국01-05")).toBeTruthy();
    expect(getStandard("6국01-05")).toBeTruthy();
  });
});

describe("발표 준비: 형식 검사", () => {
  it("종류가 맞지 않으면 null이고, 빈 제작물은 안전한 기본값이다", () => {
    expect(sanitizePresentation({ kind: "debate" })).toBeNull();
    expect(sanitizePresentation(null)).toBeNull();
    const e = emptyPresentation();
    expect(sanitizePresentation(e)).toEqual(e);
    expect(ARTIFACT_KINDS).toContain("presentation");
    expect(emptyArtifact("presentation").kind).toBe("presentation");
  });
  it("글자 수·개수를 자르고 알 수 없는 값은 버린다", () => {
    const raw = {
      ...good(),
      topic: "가".repeat(100),
      purpose: "bad",
      sources: Array.from({ length: 6 }, (_, i) => ({ id: `s${i + 1}`, name: "나".repeat(99), from: "x", keyInfo: "다".repeat(99) })),
      points: Array.from({ length: 5 }, (_, i) => ({ id: `p${i + 1}`, text: "라".repeat(99), sourceIds: ["s1", "zz", "s1", 7], aid: i === 0 ? "bogus" : "table" })),
      practice: [30, 0, -4, 1.4, 5000, "x", NaN, ...Array(12).fill(60)],
      selfCheck: { volume: 9, pace: -3, eyes: 2.4, posture: "x", gesture: 1 },
      reflection: "마".repeat(300),
    };
    const out = sanitizePresentation(raw)!;
    expect(Array.from(out.topic)).toHaveLength(PRESENTATION_LIMITS.topic);
    expect(out.purpose).toBeNull();
    expect(out.sources).toHaveLength(4);
    expect(Array.from(out.sources[0].name)).toHaveLength(PRESENTATION_LIMITS.name);
    expect(Array.from(out.sources[0].keyInfo)).toHaveLength(PRESENTATION_LIMITS.keyInfo);
    expect(out.points).toHaveLength(3);
    expect(out.points[0]).toMatchObject({ sourceIds: ["s1"], aid: null });
    expect(out.points[1].aid).toBe("table");
    expect(Array.from(out.points[0].text)).toHaveLength(PRESENTATION_LIMITS.point);
    expect(out.practice).toHaveLength(PRACTICE_MAX);
    expect(out.practice.slice(0, 3)).toEqual([30, 1, 1800]);
    expect(out.selfCheck).toEqual({ volume: 3, pace: 0, eyes: 2, posture: 0, gesture: 1 });
    expect(Array.from(out.reflection)).toHaveLength(PRESENTATION_LIMITS.reflection);
  });
  it("자료 id가 겹치거나 틀리면 새로 정하고, 없는 자료를 가리키는 연결은 버린다", () => {
    const out = sanitizePresentation({
      kind: "presentation",
      band: "5-6",
      sources: [{ id: "s1" }, { id: "s1" }, { id: "BAD ID" }],
      points: [{ id: "p1", text: "내용", sourceIds: ["s1", "s2", "s9"] }],
    })!;
    expect(new Set(out.sources.map((s) => s.id)).size).toBe(3);
    expect(out.points[0].sourceIds.every((i) => out.sources.some((s) => s.id === i))).toBe(true);
    expect(out.points[0].sourceIds).not.toContain("s9");
  });
  it("학년대는 이전 저장본의 값이 이기고, withBand가 늘 덮어쓴다(3~4학년이면 5~6학년 전용 칸을 지운다)", () => {
    const upper = good("5-6");
    const forged = { ...upper, band: "3-4" };
    expect(sanitizePresentation(forged, upper)!.band).toBe("5-6");
    // 처음 저장은 입력을 받아 두지만 withBand로 덮어쓴다
    const first = sanitizePresentation({ ...upper, band: "5-6" })!;
    const lower = withBand(first, "3-4");
    expect(lower.band).toBe("3-4");
    expect(lower.sources.every((s) => s.trust === undefined)).toBe(true);
    expect(lower.points.every((p) => p.aid === null)).toBe(true);
    // 3~4학년 저장본에 5~6학년 전용 값을 넣어 보내도 버려진다
    const prev = good("3-4");
    const sent = sanitizePresentation({ ...upper, band: "5-6" }, prev)!;
    expect(sent.band).toBe("3-4");
    expect(sent.sources.every((s) => s.trust === undefined)).toBe(true);
    expect(sent.points.every((p) => p.aid === null)).toBe(true);
    // 5~6학년으로 올리면 믿을 만한가 칸이 생긴다
    expect(withBand(good("3-4"), "5-6").sources.every((s) => s.trust)).toBe(true);
  });
  it("자료·내용 칸 추가는 상한에서 null", () => {
    const a = emptyPresentation("5-6");
    a.sources = Array.from({ length: 4 }, (_, i) => ({ id: `s${i + 1}`, name: "", from: "", keyInfo: "" }));
    expect(newPresentationSource(a.sources, "5-6")).toBeNull();
    expect(newPresentationSource(a.sources.slice(0, 2), "5-6")?.id).toBe("s3");
    expect(newPoint(emptyPresentation().points)?.id).toBe("p3");
    expect(newPoint([...emptyPresentation().points, { id: "p3", text: "", sourceIds: [], aid: null }])).toBeNull();
  });
});

describe("발표 준비: 제출 조건", () => {
  it("주제·목적·내용 1개만 필수", () => {
    expect(presentationSubmitProblems(emptyPresentation())).toHaveLength(3);
    const a = emptyPresentation();
    a.topic = "주제";
    a.purpose = "share";
    a.points[0].text = "내용 하나";
    expect(presentationSubmitProblems(a)).toEqual([]);
    expect(submitProblems(a)).toEqual([]);
    expect(submitProblems(emptyPresentation())).toHaveLength(3);
  });
});

describe("발표 준비: 점검", () => {
  it("잘 만든 발표 준비는 길이 어림이 목표 안이면 경고가 없다", () => {
    const a = good();
    expect(estimateSeconds(a)).toBeGreaterThan(TARGET * 0.5);
    expect(estimateSeconds(a)).toBeLessThan(TARGET * 1.5);
    expect(kinds(a)).toEqual([]);
  });
  it("빈 제작물: 주제·목적·내용 수 안내", () => {
    expect(kinds(emptyPresentation())).toEqual(["no-topic", "no-purpose", "few-points", "no-closing"]);
  });
  it("내용에 연결된 자료가 없다 / 출처가 없다 / 안 쓴 자료", () => {
    const a = good();
    a.points[1].sourceIds = [];
    expect(kinds(a)).toContain("point-no-source");
    const b = good();
    b.sources[0].from = "";
    expect(checkPresentation(b, TARGET).find((w) => w.kind === "source-no-from")?.target).toBe("source.s1.from");
    const c = good();
    c.sources.push({ id: "s2", name: "신문 기사", from: "신문", keyInfo: "재활용률", trust: { who: false, when: false, evidence: false } });
    const unused = checkPresentation(c, TARGET).filter((w) => w.kind === "source-unused");
    expect(unused).toHaveLength(1);
    expect(unused[0].message).toContain("2번 자료");
  });
  it("끝 정리가 없으면 안내하고, 과장 표현은 위치를 알려 준다", () => {
    const a = good();
    a.closing = "";
    a.points[0].text = "분리배출은 절대 어려운 일이 아니고 모두가 반드시 해야 해요";
    const w = checkPresentation(a, TARGET);
    expect(w.map((x) => x.kind)).toEqual(expect.arrayContaining(["no-closing", "exaggeration"]));
    const ex = w.find((x) => x.kind === "exaggeration")!;
    expect(ex.target).toBe("point.p1.text");
    expect(ex.spans!.length).toBeGreaterThan(0);
  });
  it("메모로 어림한 시간이 목표의 150%를 넘을 때만 어림이라고 밝히고 권한다(짧은 메모는 원칙이라 안내 안 함)", () => {
    const short = good();
    short.opening = "안녕하세요";
    short.points = [{ id: "p1", text: "재활용은 중요해요", sourceIds: ["s1"], aid: null }, { id: "p2", text: "분리배출을 해요", sourceIds: ["s1"], aid: null }];
    short.closing = "고맙습니다";
    expect(kinds(short)).not.toContain("time-estimate");
    const w = checkPresentation(good(), 30).find((x) => x.kind === "time-estimate")!;
    expect(w.message).toMatch(/^메모로 어림해 보면 약 [0-9.]+분이에요\. 연습하며 시간을 재 볼까요\?$/);
    // 목표를 짧게 잡으면 같은 메모도 너무 긴 쪽이 된다
    expect(kinds(good(), 30)).toContain("time-estimate");
    // 공식: 공백 뺀 글자 × 3 ÷ (분당 250글자)
    const chars = [short.opening, ...short.points.map((p) => p.text), short.closing].join("").replace(/\s+/g, "").length;
    expect(estimateSeconds(short)).toBe(Math.round(((chars * MEMO_EXPANSION) / SPOKEN_CHARS_PER_MINUTE) * 60));
    // 메모가 하나도 없으면 시간 안내는 하지 않는다
    expect(kinds(emptyPresentation())).not.toContain("time-estimate");
  });
  it("마지막 연습 시간이 목표의 ±30% 밖이면 안내한다(경계는 괜찮음)", () => {
    const a = good();
    a.practice = [100];
    expect(kinds(a)).toContain("practice-time");
    a.practice = [100, 126]; // 180 × 0.7 = 126 → 경계, 안내 없음
    expect(kinds(a)).not.toContain("practice-time");
    a.practice = [100, 234]; // 180 × 1.3 = 234
    expect(kinds(a)).not.toContain("practice-time");
    a.practice = [235];
    expect(checkPresentation(a, TARGET).find((w) => w.kind === "practice-time")?.message).toContain("마지막 연습은 3분 55초");
  });
  it("모든 경고 문구는 해요체이고 탓하지 않는다", () => {
    const a = emptyPresentation();
    a.practice = [5];
    a.opening = "정말 엄청 대단한 이야기";
    a.sources = [{ id: "s1", name: "책", from: "", keyInfo: "" }];
    for (const w of checkPresentation(a, TARGET)) {
      expect(w.message).toMatch(/(요|까요)[.?]$/);
      expect(w.message).not.toMatch(/잘못|틀렸|안 했|못 했/);
    }
  });
});

describe("발표 준비: 글 칸과 안전 점검", () => {
  it("fieldsOf에 모든 글 칸이 들어 있다", () => {
    const a = good();
    a.sources.push({ id: "s2", name: "n", from: "f", keyInfo: "k", trust: { who: false, when: false, evidence: false } });
    a.reflection = "한 줄";
    expect(fieldsOf(a).map((f) => f.key)).toEqual([
      "topic",
      "audience",
      "source.s1.name",
      "source.s1.from",
      "source.s1.keyInfo",
      "source.s2.name",
      "source.s2.from",
      "source.s2.keyInfo",
      "opening",
      "point.p1.text",
      "point.p2.text",
      "closing",
      "reflection",
    ]);
    expect(presentationFields(a)).toEqual(fieldsOf(a));
  });
  it("withFields로 칸을 바꾸고, 없는 칸은 건너뛰며 원본은 그대로다", () => {
    const a = good();
    const b = withFields(a, { topic: "새 주제", "source.s1.from": "도서관", "point.p2.text": "바꾼 내용", "point.zz.text": "무시", closing: "끝" }) as PresentationArtifact;
    expect([b.topic, b.sources[0].from, b.points[1].text, b.closing]).toEqual(["새 주제", "도서관", "바꾼 내용", "끝"]);
    expect(a.topic).toBe("우리 동네 재활용");
  });
  it("모든 글 칸에서 위험 신호·개인 정보를 걸러 이전 글로 되돌린다", () => {
    const prev = good();
    for (const key of ["topic", "audience", "source.s1.name", "source.s1.from", "source.s1.keyInfo", "opening", "point.p1.text", "closing", "reflection"]) {
      const next = withFields(prev, { [key]: "요즘 너무 힘들어서 죽고 싶어요" });
      const scan = scanSafety(prev, next);
      expect(scan.kind, key).toBe("distress");
      expect(scan.hits.map((h) => h.key)).toEqual([key]);
      expect(JSON.stringify(scan.artifact)).not.toContain("죽고 싶어요");
    }
    const phone = withFields(prev, { "source.s1.from": "전화번호 010-1234-5678" });
    expect(scanSafety(prev, phone).kind).toBe("personal_info");
  });
  it("칸 이름은 한글이다", () => {
    const a = good();
    expect(fieldLabel(a, "topic")).toBe("발표 주제");
    expect(fieldLabel(a, "source.s1.keyInfo")).toBe("1번 자료 핵심 정보");
    expect(fieldLabel(a, "point.p2.text")).toBe("가운데 2번 내용");
    expect(fieldLabel(a, "closing")).toBe("끝 메모");
  });
  it("sanitizeArtifact가 발표 준비를 다룬다", () => {
    expect(sanitizeArtifact("presentation", good(), null)?.kind).toBe("presentation");
    expect(sanitizeArtifact("presentation", { kind: "debate" })).toBeNull();
  });
});
