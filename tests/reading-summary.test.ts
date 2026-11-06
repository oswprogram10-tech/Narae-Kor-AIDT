import { describe, expect, it } from "vitest";
import { DISTRESS_TEXT, PERSONAL_TEXT } from "./reading-summary-fixtures";
import {
  READING_ITEMS,
  SUMMARY_HELP_AFTER,
  copiedSentenceCount,
  countChars,
  evaluateSummary,
  getItem,
  getPassage,
  gradeAnswer,
  groupMatches,
  normalizeText,
  paragraphCovered,
  renderAnswer,
  summaryFeedback,
  summaryGate,
  validateItem,
  type SummaryWriteItem,
} from "@/core/reading";
import { DISTRESS_REPLY, PERSONAL_INFO_REPLY } from "@/core/coach/guard";

const item = (id: string) => getItem(id) as SummaryWriteItem;
const run = (id: string, text: string) => evaluateSummary(item(id), text);

describe("요약 쓰기 문제 구성", () => {
  it("네 지문에 하나씩, 각 지문 문제의 맨 끝에 있어요", () => {
    const list = READING_ITEMS.filter((i): i is SummaryWriteItem => i.type === "summary-write");
    expect(list.map((i) => [i.id, i.passageId])).toEqual([
      ["ma-11", "mi-cat"],
      ["ma-12", "mi-signal"],
      ["ts-11", "ts-lunch"],
      ["ts-12", "ts-neck"],
    ]);
    for (const i of list) {
      expect(validateItem(i), i.id).toEqual([]);
      expect(i.paragraphs.length).toBe(i.id.startsWith("ma") ? 4 : 5);
      expect(i.maxChars).toBeGreaterThan(i.minChars);
    }
  });
});

describe("정규화·낱말 묶음", () => {
  it("띄어쓰기·문장부호·ㅋㅋ를 지워 비교해요", () => {
    expect(normalizeText("고양이는, 수 염을!! 봐요ㅋㅋ ㅠㅠ~")).toBe("고양이는수염을봐요");
    expect(countChars("가 나\n다")).toBe(3);
  });
  it("묶음은 낱말이 모두 있어야 맞고, 문단은 묶음 하나만 맞아도 반영돼요", () => {
    const t = normalizeText("혀로 털을 핥아요");
    expect(groupMatches(["혀", "털"], t)).toBe(true);
    expect(groupMatches(["혀", "수염"], t)).toBe(false);
    expect(groupMatches([], t)).toBe(false);
    expect(paragraphCovered({ keyGroups: [["수염"], ["혀", "핥"]] }, t)).toBe(true);
    expect(paragraphCovered({ keyGroups: [["수염"], ["발톱"]] }, t)).toBe(false);
  });
});

// 아이들이 실제로 쓸 법한 요약(좋은 글, 한 문단이 빠진 글, 베낀 글, 너무 긴 글, 오타·붙여 쓴 글)으로 낱말 묶음이 알맞은지 본다.
describe("고양이 글(ma-11) 요약", () => {
  const goods = [
    "고양이는 하루에 열두 시간 넘게 잠을 자요. 수염으로 좁은 틈을 가늠하며 주변을 살펴요. 발톱은 걸을 때는 숨기고 나무에 오를 때만 꺼내요. 혀로 털을 핥아 스스로 몸을 깨끗이 해요.",
    "고양이는 잠을 많이 잔다. 수염은 주변을 살피는 도구다. 발톱은 필요할 때만 나온다. 혀로 털을 가꿔서 깨끗하게 한다.",
    "고양이는 많이 자고, 수염으로 길을 알아보고, 발톱을 숨겼다 꺼내고, 그루밍으로 털을 관리합니다.",
    "고양이는 낮잠을 자주 자고 수염으로 틈을 재 보고 발톱은 안 쓸 때 넣어 두고 혀로 몸을 핥아서 깨끗하게 해요.",
  ];
  it.each(goods.map((t, i) => [i, t] as const))("잘 쓴 요약 %i는 끝났어요", (_i, t) => {
    const r = run("ma-11", t);
    expect(r, t).toMatchObject({ done: true, coverage: 1, missing: [], copied: false, reason: "ok" });
    expect(r.length).toBeGreaterThanOrEqual(40);
    expect(r.length).toBeLessThanOrEqual(180);
  });
  it("오타나 붙여 쓴 글도 알아봐요", () => {
    expect(run("ma-11", "고양이는 잠을 마니 자고 수염으로 주변을 살피고 발통을 숨기고 혀로 털을 핥아서 깨끗하게 하고 일어나요").done).toBe(true);
    expect(run("ma-11", "고양이는잠을많이자요.수염으로주변을살펴요.발톱은필요할때만꺼내요.혀로털을핥아요.").done).toBe(true);
    expect(run("ma-11", "고양이는 잠을 많이 자요ㅋㅋ 수염으로 주변을 살펴요ㅋㅋ 발톱은 숨겼다 꺼내요ㅋㅋ 혀로 털을 핥아요ㅋㅋ").done).toBe(true);
  });
  it("3문단(발톱)이 빠지면 3문단을 물어요", () => {
    const r = run("ma-11", "고양이는 잠을 많이 자요. 수염으로 주변을 살펴요. 혀로 털을 핥아서 몸을 깨끗하게 해요. 그리고 정말 귀여워요.");
    expect(r).toMatchObject({ done: false, coverage: 0.75, missing: [3], reason: "missing-paragraph" });
    const msg = summaryFeedback(item("ma-11"), r, 1);
    expect(msg).toContain("3문단은 무엇에 대한 이야기였나요?");
    expect(msg).toContain("4개 문단 중 3개");
    // 빠진 문단의 내용(핵심 낱말)을 알려 주지 않는다
    expect(msg).not.toMatch(/발톱|발통/);
  });
  it("여러 문단이 빠지면 가장 앞의 문단부터 물어요", () => {
    const r = run("ma-11", "고양이는 수염으로 주변을 살피고 고양이는 정말 귀엽고 사랑스럽고 예쁜 동물이라서 모두가 좋아해요 그래서 좋아요");
    expect(r.missing).toEqual([1, 3, 4]);
    expect(summaryFeedback(item("ma-11"), r, 1)).toContain("1문단은 무엇에 대한 이야기였나요?");
  });
  it("너무 짧거나 비었으면 길이를 안내해요", () => {
    expect(run("ma-11", "").reason).toBe("too-short");
    expect(summaryFeedback(item("ma-11"), run("ma-11", ""), 1)).toContain("먼저 글을 읽고");
    const r = run("ma-11", "고양이는 잠을 많이 자요.");
    expect(r).toMatchObject({ done: false, reason: "too-short" });
    expect(summaryFeedback(item("ma-11"), r, 1)).toMatch(/40자에서 180자/);
    // 길이 안내가 문단 안내보다 먼저
    expect(r.missing.length).toBeGreaterThan(0);
  });
  it("지문 문장을 그대로 옮겨 쓴 문장이 둘 이상이면 자기 말로 쓰라고 해요", () => {
    const copied =
      "고양이는 하루의 많은 시간을 잠으로 보냅니다. 고양이의 얼굴 양옆에는 길고 빳빳한 수염이 나 있습니다. 발톱은 필요할 때만 나와요. 혀로 털을 핥아 깨끗이 해요.";
    const r = run("ma-11", copied);
    expect(r).toMatchObject({ done: false, copied: true, coverage: 1, reason: "copied" });
    expect(r.copiedCount).toBeGreaterThanOrEqual(2);
    expect(summaryFeedback(item("ma-11"), r, 1)).toContain("자기 말로 줄여 써 볼까요?");
    // 하나만 베낀 것은 괜찮아요
    const one =
      "고양이는 하루의 많은 시간을 잠으로 보냅니다. 수염으로 주변을 살펴요. 발톱은 필요할 때만 나와요. 혀로 털을 핥아 깨끗이 해요.";
    expect(run("ma-11", one)).toMatchObject({ done: true, copied: false });
  });
  it("띄어쓰기를 바꾸거나 문장부호를 빼고 베껴도 베낀 것으로 봐요", () => {
    const sneaky =
      "고양이는하루의많은시간을잠으로보냅니다 고양이의얼굴양옆에는길고빳빳한수염이나있습니다 발톱은필요할때만나와요 혀로털을핥아깨끗이해요";
    expect(run("ma-11", sneaky).copied).toBe(true);
  });
  it("너무 길면 줄이라고 해요", () => {
    const long =
      "고양이는 하루에 열두 시간이 넘게 잠을 자는 동물이라서 햇볕이 잘 드는 창가나 푹신한 곳에서 몸을 동그랗게 말고 자는 모습을 쉽게 볼 수 있다고 해요. " +
      "고양이는 얼굴 양쪽에 길고 뻣뻣한 수염이 있어서 어디를 지나갈 수 있을지 미리 재어 보고 주변이 어떤지도 살펴본다고 해요. " +
      "또 발톱은 평소에는 발가락 안에 넣어 두었다가 나무에 오르거나 먹이를 잡을 때만 밖으로 쭉 꺼내서 쓰기 때문에 걸을 때 소리가 안 난다고 해요. " +
      "마지막으로 혀는 까칠까칠해서 털을 핥으면 먼지가 떨어지고 엉킨 털도 풀려서 스스로 깨끗하게 관리할 수 있다고 해요.";
    const r = run("ma-11", long);
    expect(r.length).toBeGreaterThan(180);
    expect(r).toMatchObject({ done: false, copied: false, coverage: 1, reason: "too-long" });
    expect(summaryFeedback(item("ma-11"), r, 1)).toContain("조금 길어요");
  });
});

describe("신호등 글(ma-12) 요약", () => {
  it("잘 쓴 요약", () => {
    for (const t of [
      "신호등은 자동차와 사람이 부딪히지 않게 차례를 알려 줘요. 자동차 신호등은 빨간불, 초록불, 노란불로 알려 줘요. 걷는 사람용 신호등은 사람 모양과 숫자로 알려 줘요. 소리가 나는 신호등도 있어요.",
      "신호등은 사고를 막으려고 건널 차례를 알려 줘요. 자동차 신호등은 세 가지 색깔로 알려 줘요. 걸어가는 사람 신호등은 깜박이면 기다려야 해요. 눈이 안 보이는 사람을 위해 삑삑 소리도 나요.",
      "신호등은 안전하게 길을 건너게 해 준다. 빨간불은 멈추고 초록불은 간다. 사람 신호등은 남은 시간을 보여 준다. 소리로 알려 주는 신호등도 있다.",
      "신호등은 자동차랑 사람이 서로 안 다치게 차레를 알려줘요 빨간불 초록불 노란불이 있고 사람 모양 신호등도 있고 소리 나는 것도 있어요",
    ]) {
      expect(run("ma-12", t), t).toMatchObject({ done: true, coverage: 1 });
    }
  });
  it("3문단(걷는 사람)이 빠지면 3문단을 물어요", () => {
    const r = run("ma-12", "신호등은 사고가 나지 않게 해요. 빨간불은 멈추고 초록불은 가라는 뜻이에요. 소리가 나는 신호등도 있어요. 정말 중요해요.");
    expect(r).toMatchObject({ done: false, missing: [3], reason: "missing-paragraph" });
    expect(summaryFeedback(item("ma-12"), r, 1)).toContain("3문단은 무엇에 대한 이야기였나요?");
  });
  it("지문 문장을 두 개 베끼면 알려 줘요", () => {
    const t =
      "신호등은 자동차와 사람이 서로 부딪히지 않도록 길을 건널 차례를 알려 줍니다. 빨간 사람은 서서 기다리라는 뜻이고, 초록 사람은 건너도 좋다는 뜻입니다. 자동차는 빨간불 초록불로 알려요. 사람 모양도 있고 소리도 나요.";
    expect(run("ma-12", t)).toMatchObject({ done: false, copied: true, reason: "copied" });
  });
  it("지문을 한 문장도 안 베끼는 한 줄 요약은 너무 짧다고 해요", () => {
    expect(run("ma-12", "신호등은 안전해요.").reason).toBe("too-short");
  });
});

describe("급식 글(ts-11) 요약", () => {
  it("잘 쓴 요약", () => {
    for (const t of [
      "급식을 남기지 않고 끝까지 먹어야 해요. 음식을 남기면 쓰레기가 늘어 환경이 나빠져요. 음식에는 농부와 조리사의 정성이 담겨 있어요. 골고루 먹어야 몸이 튼튼해져요. 그래서 먹을 만큼만 받아서 다 먹어야 해요.",
      "급식을 남기면 환경오염이 생기고, 음식에 담긴 정성을 무시하는 것이고, 영양을 놓칠 수 있습니다. 그러므로 오늘부터 급식을 남기지 말고 다 먹어야 합니다.",
      "급식을 남기지 않아야 한다. 음식물 쓰레기가 환경을 해친다. 농부 아저씨와 조리사 선생님의 정성이 들어 있다. 골고루 먹으면 건강해진다. 앞으로 다 먹도록 실천하자.",
      "급식을 남기지 말자!! 쓰레기가 많아져서 환경이 나빠져요~ 농부 아저씨들이 정성을 담아 키웠어요ㅠㅠ 골고루 먹으면 튼튼해져요. 먹을 만큼만 받아요",
    ]) {
      expect(run("ts-11", t), t).toMatchObject({ done: true, coverage: 1 });
    }
  });
  it("4문단(건강)이 빠지면 4문단을 물어요", () => {
    const r = run("ts-11", "급식을 남기지 말아야 해요. 음식물 쓰레기가 생기면 환경에 안 좋아요. 농부와 조리사의 정성이 담겨 있어요. 그러니까 오늘부터 다 먹어요.");
    expect(r).toMatchObject({ done: false, missing: [4], reason: "missing-paragraph", coverage: 0.8 });
    expect(summaryFeedback(item("ts-11"), r, 1)).toContain("4문단은 무엇에 대한 이야기였나요?");
  });
  it("문장을 두 개 베끼면 자기 말로 쓰라고 해요", () => {
    const t =
      "급식을 남기지 말아야 해요. 남은 음식은 음식물 쓰레기가 되는데, 이것을 처리하려면 많은 에너지가 들고 냄새와 오염도 생깁니다. 농부와 조리사의 정성이 담겨 있어요. 급식은 영양사가 몸에 필요한 영양을 고려해 짠 식단입니다. 오늘부터 다 먹어요.";
    expect(run("ts-11", t)).toMatchObject({ done: false, copied: true, reason: "copied" });
  });
  it("너무 길면 줄이라고 해요", () => {
    const t =
      "급식을 남기지 않고 끝까지 먹는 것이 중요하다고 생각해요 왜냐하면 급식을 남기면 잔반통에 음식물 쓰레기가 많이 쌓이고 그것을 치우려면 에너지가 많이 들어서 환경이 나빠지기 때문이에요 " +
      "또 우리가 먹는 음식에는 농부 아저씨와 조리사 선생님이 땀을 흘리며 정성을 담아서 만든 것이라서 함부로 버리면 그분들의 노력을 모르는 것과 같아요 " +
      "그리고 급식은 영양사 선생님이 영양을 생각해서 짠 것이라 골고루 먹어야 우리 몸이 튼튼해지고 건강해질 수 있어요 그러니까 오늘부터 먹을 만큼만 받아서 끝까지 먹도록 실천해요";
    expect(run("ts-11", t)).toMatchObject({ done: false, reason: "too-long", coverage: 1, copied: false });
  });
});

describe("목 아픔 글(ts-12) 요약", () => {
  it("잘 쓴 요약", () => {
    for (const t of [
      "목이 아픈 이유는 고개를 숙이는 자세에서 머리가 무겁기 때문이고 오래 앉아 있어서도 아파요. 책이나 화면을 눈높이로 올리고 삼십 분마다 일어나 몸을 풀면 좋아요.",
      "목과 어깨가 아파서 불편한 어린이가 많아요. 고개를 숙이면 머리가 무거워서 근육이 힘들어요. 가만히 오래 있어도 몸이 굳어요. 책상과 의자 높이를 맞추고 화면을 올려요. 가끔 일어나서 목을 돌려 줘요.",
      "어린이들이 목이 아픈 문제가 있습니다. 머리가 무거워 고개를 숙이면 힘들고, 계속 앉아 있는 것도 원인입니다. 의자 높이를 바꾸고 30분마다 스트레칭을 하면 좋습니다.",
    ]) {
      expect(run("ts-12", t), t).toMatchObject({ done: true, coverage: 1 });
    }
  });
  it("3문단(오래 앉기)이 빠지면 3문단을 물어요", () => {
    const r = run("ts-12", "목이 아픈 어린이가 많아요. 고개를 숙이면 머리가 무거워서 아파요. 의자 높이를 맞추고 화면을 올려요. 30분마다 일어나 스트레칭을 해요.");
    expect(r).toMatchObject({ done: false, missing: [3], reason: "missing-paragraph" });
    expect(summaryFeedback(item("ts-12"), r, 1)).toContain("3문단은 무엇에 대한 이야기였나요?");
  });
  it("문장을 두 개 베끼면 알려 줘요", () => {
    const t =
      "목이나 어깨가 뻐근하다고 말하는 어린이가 적지 않습니다. 사람의 머리는 생각보다 무거워서, 고개를 숙이면 목과 어깨의 근육이 머리를 떠받치느라 힘을 더 많이 써야 합니다. 오래 앉아 있어도 아파요. 책상 높이를 맞춰요. 30분마다 일어나요.";
    expect(run("ts-12", t)).toMatchObject({ done: false, copied: true, reason: "copied" });
  });
});

describe("지문을 통째로 베끼면 문단은 다 들어 있지만 베낀 글이에요", () => {
  it("긴 글이면 길이보다 베끼기를 먼저 안내해요", () => {
    const full = "급식을 남기지 않고 끝까지 먹어야 한다고 생각합니다. 남은 음식은 음식물 쓰레기가 되는데, 이것을 처리하려면 많은 에너지가 들고 냄새와 오염도 생깁니다. 농부는 여러 달 동안 땀 흘려 곡식과 채소를 키우고, 조리사는 이른 아침부터 음식을 만듭니다. 급식은 영양사가 몸에 필요한 영양을 고려해 짠 식단입니다. 그러므로 우리는 오늘부터 먹을 만큼만 받아서 끝까지 먹도록 노력해야 합니다.";
    expect(run("ts-11", full)).toMatchObject({ done: false, copied: true });
  });
  it("copiedSentenceCount: 짧은 문장은 세지 않고, 옮긴 글자 수가 70%·15글자 이상이어야 세요", () => {
    expect(copiedSentenceCount("mi-cat", normalizeText("고양이는 하루의 많은 시간을 잠으로 보냅니다."))).toBe(1);
    // 70% 미만
    expect(copiedSentenceCount("mi-cat", normalizeText("고양이는 하루의 많은 시간"))).toBe(0);
    expect(copiedSentenceCount("mi-cat", "")).toBe(0);
    expect(copiedSentenceCount("없는지문", "가나다")).toBe(0);
    // 12글자 문장은 15글자 조건 때문에 세지 않는다
    expect(copiedSentenceCount("mi-signal", normalizeText("빨간불은 멈추라는 뜻입니다."))).toBe(0);
  });
});

describe("gradeAnswer·renderAnswer·피드백 단계", () => {
  it("요약은 끝났으면 정답 처리, 아니면 고쳐 쓰기(오답 횟수에 넣는 사유)로 돌려줘요", () => {
    const good = "고양이는 잠을 많이 잔다. 수염은 주변을 살피는 도구다. 발톱은 필요할 때만 나온다. 혀로 털을 가꿔서 깨끗하게 한다.";
    expect(gradeAnswer(item("ma-11"), { type: "summary-write", text: good })).toEqual({ correct: true, reason: "ok", countsAsWrong: false });
    expect(gradeAnswer(item("ma-11"), { type: "summary-write", text: "고양이" })).toMatchObject({ correct: false, reason: "too-short" });
    expect(gradeAnswer(item("ma-11"), { type: "choice", option: 0 })).toMatchObject({ reason: "type-mismatch" });
    expect(renderAnswer(item("ma-11"), { type: "summary-write", text: good })).toBe(good);
  });
  it("단계별 힌트가 없고, 같은 글이면 같은 안내예요", () => {
    const a = summaryFeedback(item("ma-11"), run("ma-11", "고양이는 잠을 많이 자요."), 1);
    expect(a).toBe(summaryFeedback(item("ma-11"), run("ma-11", "고양이는 잠을 많이 자요."), 1));
    const r = run("ma-11", "고양이는 잠을 많이 자요.");
    expect(summaryFeedback(item("ma-11"), r, 2)).toContain(item("ma-11").hints[0]);
    expect(summaryFeedback(item("ma-11"), r, 3)).toContain(item("ma-11").hints[1]);
    expect(summaryFeedback(item("ma-11"), r, 1)).not.toContain(item("ma-11").hints[0]);
  });
  it(`${SUMMARY_HELP_AFTER}번 고쳐 써도 안 되면 격려하고 그대로 내도 된다고 알려 줘요`, () => {
    const r = run("ma-11", "고양이는 잠을 많이 자요.");
    expect(summaryFeedback(item("ma-11"), r, SUMMARY_HELP_AFTER)).toContain("선생님께 그대로 내도 괜찮아요");
    expect(summaryFeedback(item("ma-11"), r, SUMMARY_HELP_AFTER - 1)).not.toContain("그대로 내도");
  });
  it("성공 안내는 문단 내용을 알려 주지 않고 설명을 덧붙여요", () => {
    const good = "고양이는 잠을 많이 잔다. 수염은 주변을 살피는 도구다. 발톱은 필요할 때만 나온다. 혀로 털을 가꿔서 깨끗하게 한다.";
    const msg = summaryFeedback(item("ma-11"), run("ma-11", good), 1);
    expect(msg).toContain("잘 간추렸어요");
    expect(msg).toContain(item("ma-11").explanation);
  });
});

describe("안전 경로(summaryGate)", () => {
  it("힘든 일을 말하면 쓰기 코치와 같은 돌봄 안내를 하고, 요약은 점검하지 않아요", () => {
    const g = summaryGate(DISTRESS_TEXT);
    expect(g).toEqual({ kind: "distress", reply: DISTRESS_REPLY.reply });
  });
  it("개인 정보가 있으면 쓰기 코치와 같은 안내를 해요", () => {
    expect(summaryGate(PERSONAL_TEXT)).toEqual({ kind: "personal_info", reply: PERSONAL_INFO_REPLY.reply });
  });
  it("힘든 일과 개인 정보가 함께면 힘든 일이 먼저예요", () => {
    expect(summaryGate(`${DISTRESS_TEXT} ${PERSONAL_TEXT}`).kind).toBe("distress");
  });
  it("정상적인 요약 글은 걸리지 않아요(이 파일의 모든 잘 쓴 요약 포함)", () => {
    const texts = [
      "고양이는 잠을 많이 자요. 수염으로 주변을 살펴요. 발톱은 필요할 때만 꺼내요. 혀로 털을 핥아 깨끗이 해요.",
      "목과 어깨가 아파서 불편한 어린이가 많아요. 고개를 숙이면 머리가 무거워서 근육이 힘들어요. 가만히 오래 있어도 몸이 굳어요.",
      "급식을 남기지 않아야 한다. 음식물 쓰레기가 환경을 해친다. 농부 아저씨와 조리사 선생님의 정성이 들어 있다.",
      "신호등은 사고를 막으려고 건널 차례를 알려 줘요. 빨간불은 멈추고 초록불은 가요.",
    ];
    for (const t of texts) expect(summaryGate(t), t).toEqual({ kind: null });
    // 지문을 통째로 옮겨 쓴 글도 걸리지 않아요(안전 점검이 지문 낱말에 잘못 걸리면 안 돼요)
    for (const id of ["mi-cat", "mi-signal", "ts-lunch", "ts-neck"]) {
      const text = getPassage(id)!.paragraphs.flatMap((p) => p.sentences.map((x) => x.text)).join(" ");
      expect(summaryGate(text), id).toEqual({ kind: null });
    }
  });
});

describe("validateItem: 요약 쓰기 문제의 낱말 묶음 검사", () => {
  const base = item("ma-11");
  const withPara = (i: number, patch: Partial<SummaryWriteItem["paragraphs"][number]>): SummaryWriteItem => ({
    ...base,
    paragraphs: base.paragraphs.map((p, j) => (j === i ? { ...p, ...patch } : p)),
  });
  it("문단이 빠졌거나 순서가 다르면 잡아요", () => {
    expect(validateItem({ ...base, paragraphs: base.paragraphs.slice(1) }).some((m) => m.includes("모든 문단"))).toBe(true);
    expect(validateItem({ ...base, paragraphs: [...base.paragraphs].reverse() }).some((m) => m.includes("모든 문단"))).toBe(true);
  });
  it("한 글자 낱말이 홀로 있거나, 빈 묶음이 있거나, 묶음이 겹치면 잡아요", () => {
    expect(validateItem(withPara(1, { keyGroups: [["수"]] })).some((m) => m.includes("너무 짧아요"))).toBe(true);
    expect(validateItem(withPara(1, { keyGroups: [] })).some((m) => m.includes("묶음이 없어요"))).toBe(true);
    expect(validateItem(withPara(1, { keyGroups: [["수염"], ["수 염"]] })).some((m) => m.includes("겹쳐요"))).toBe(true);
    expect(validateItem(withPara(1, { keyGroups: [["수염", ""]] })).some((m) => m.includes("빈 낱말"))).toBe(true);
  });
  it("그 문단 글과 맞지 않는 낱말만 있으면 잡아요", () => {
    expect(validateItem(withPara(1, { keyGroups: [["코끼리"]] })).some((m) => m.includes("그 문단 글과 맞지 않아요"))).toBe(true);
  });
  it("다른 문단 글만으로도 채워지는 낱말 묶음(너무 흔한 낱말)을 잡아요", () => {
    // '털'은 4문단뿐 아니라 다른 문단에서도 나올 수 있어 홀로 쓰면 안 돼요: 1문단 묶음에 3문단에 있는 '발톱'을 넣는다
    expect(validateItem(withPara(0, { keyGroups: [["잠을"], ["발톱"]] })).some((m) => m.includes("다른 문단 글만으로도"))).toBe(true);
  });
  it("문단 힌트나 안내 글에 핵심 낱말이 들어 있으면 잡아요", () => {
    expect(validateItem(withPara(1, { topicHint: "고양이의 수염에 대한 이야기예요." })).some((m) => m.includes("topicHint에 들어 있어요"))).toBe(true);
    expect(validateItem({ ...base, prompt: "수염을 떠올리며 간추려 써 보세요." }).some((m) => m.includes("prompt에 들어 있어요"))).toBe(true);
    expect(validateItem(withPara(1, { topicHint: "고양이 얼굴의 한 부분이다." })).some((m) => m.includes("해요체"))).toBe(true);
  });
  it("글자 수 범위가 이상하면 잡아요", () => {
    expect(validateItem({ ...base, minChars: 10 }).some((m) => m.includes("글자 수 범위"))).toBe(true);
    expect(validateItem({ ...base, maxChars: base.minChars }).some((m) => m.includes("글자 수 범위"))).toBe(true);
    expect(validateItem({ ...base, maxChars: 380 }).some((m) => m.includes("maxChars"))).toBe(true);
  });
  it("지문 쌍에는 쓸 수 없어요", () => {
    expect(validateItem({ ...base, passageIds: ["mi-cat", "mi-signal"] }).some((m) => m.includes("지문 쌍에 쓸 수 없어요"))).toBe(true);
  });
});

// 연결 낱말·딴 문단·딴 이야기만으로 문단이 반영되면 안 돼요(문단마다 그 문단의 내용 낱말이 있어야 해요).
describe("낱말 묶음이 너무 느슨하지 않아요(부정 사례)", () => {
  const filler = "그러므로 따라서 결론적으로 앞으로 그러니까 그래서 우리는 모두 정말 열심히 해야 하고 서로 도우면서 오래오래 생각해 보는 것이 아주 좋다고 생각해요 그리고 또 그렇습니다";
  const cases: [string, string, number[], string][] = [
    ["ma-11", filler, [1, 2, 3, 4], "연결 낱말만"],
    ["ma-11", "오늘 학교에서 하루 종일 공부하고 자세히 살펴보고 자주 놀았어요 그리고 집에 와서 숙제를 했고 저녁에는 가족과 밥을 먹었어요", [1, 2, 3, 4], "딴 이야기"],
    ["ma-12", filler, [1, 2, 3, 4], "연결 낱말만"],
    ["ma-12", "친구와 서로 모양이 다른 그림을 그렸고 소리 내어 책도 읽었어요 오래 생각하고 있어요 하지만 오늘은 비가 많이 와서 집에 있었어요", [1, 2, 3], "딴 이야기(소리 낱말만 4문단으로 반영돼요)"],
    ["ts-11", filler, [1, 2, 3, 4, 5], "연결 낱말만"],
    ["ts-11", "급식을 남기지 않아야 해요 음식물 쓰레기가 많아지면 환경이 나빠져요 농부와 조리사의 정성이 담겨 있어요 골고루 먹으면 몸이 튼튼해져요 정말 그래요 그래서 그렇습니다", [5], "5문단 낱말 없이 1~4문단만"],
    ["ts-12", filler, [1, 2, 3, 4, 5], "연결 낱말만"],
    ["ts-12", "의자에 오래 앉아서 책상에서 공부하면 몸이 굳어요 가만히 있으면 힘들어요 어린이는 머리가 크고 멀리 뛰는 것을 좋아해요 그래서 그렇습니다 정말 그래요 오래오래요", [1, 2, 4, 5], "딴 문단(3문단) 내용과 흔한 낱말"],
  ];
  it.each(cases)("%s: %s", (id, text, mustMiss, label) => {
    void label;
    const r = run(id, text);
    for (const n of mustMiss) expect(r.missing, `${id} ${n}문단`).toContain(n);
    expect(r.done).toBe(false);
  });
});
