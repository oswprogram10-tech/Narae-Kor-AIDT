import { describe, expect, it } from "vitest";
import {
  addOpinion, againTurn, balanceHint, choose, createDiscussion, csvCell, discussionCsv, groupOpinions,
  nextTurn, personalInfoWarnings, removeOpinion, sanitizeDiscussion, setNotes, setPhase, setTopic, signalOf,
  skipTurn, turnPhase, ungroup, updateOpinion, type DiscussionState,
} from "@/core/discussion";

function make(nums = [3, 7, 12, 20], sec = 60): DiscussionState {
  const r = createDiscussion("점심시간에 무엇을 할까요", nums, sec);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe("createDiscussion", () => {
  it("정상 입력", () => {
    const s = make();
    expect(s.members).toEqual([{ no: 3, turns: 0 }, { no: 7, turns: 0 }, { no: 12, turns: 0 }, { no: 20, turns: 0 }]);
    expect(s.order).toEqual([3, 7, 12, 20]);
    expect(s.phase).toBe("share");
  });
  it("주제를 80자로 자름", () => {
    const r = createDiscussion("가".repeat(200), [1, 2], 30);
    expect(r.ok && r.state.topic.length).toBe(80);
  });
  it("중복·범위·인원·시간 검사", () => {
    expect(createDiscussion("a", [1, 1], 60).ok).toBe(false);
    expect(createDiscussion("a", [0, 2], 60).ok).toBe(false);
    expect(createDiscussion("a", [1, 41], 60).ok).toBe(false);
    expect(createDiscussion("a", [1.5, 2], 60).ok).toBe(false);
    expect(createDiscussion("a", [1], 60).ok).toBe(false);
    expect(createDiscussion("a", [1, 2, 3, 4, 5, 6, 7], 60).ok).toBe(false);
    expect(createDiscussion("a", [1, 2], 29).ok).toBe(false);
    expect(createDiscussion("a", [1, 2], 121).ok).toBe(false);
    expect(createDiscussion("a", [1, 2, 3, 4, 5, 6], 120).ok).toBe(true);
  });
});

describe("차례", () => {
  it("돌고 횟수 올림, 기록", () => {
    let s = make([3, 7, 12]);
    s = nextTurn(s, 40, 100000);
    expect(s.current).toBe(1);
    expect(s.members[0].turns).toBe(1);
    expect(s.log[0]).toEqual({ no: 3, startedAt: 60000, seconds: 40, skipped: false });
    s = nextTurn(s, 10, 200000);
    s = nextTurn(s, 10, 300000);
    expect(s.current).toBe(0);
    expect(s.members.map((m) => m.turns)).toEqual([1, 1, 1]);
  });
  it("건너뛰기는 횟수를 올리지 않음", () => {
    let s = make([3, 7]);
    s = skipTurn(s, 1000);
    expect(s.current).toBe(1);
    expect(s.members[0].turns).toBe(0);
    expect(s.log[0].skipped).toBe(true);
  });
  it("한 번 더는 같은 사람", () => {
    let s = make([3, 7]);
    s = againTurn(s, 20, 50000);
    expect(s.current).toBe(0);
    expect(s.members[0].turns).toBe(1);
    expect(s.log).toHaveLength(1);
  });
  it("기록은 200개까지", () => {
    let s = make([1, 2]);
    for (let i = 0; i < 250; i++) s = nextTurn(s, 1, i);
    expect(s.log).toHaveLength(200);
  });
});

describe("signalOf", () => {
  it("초록·노랑·빨강", () => {
    const s = nextTurn(make([3, 7, 12, 20]), 5, 1);
    expect(signalOf(s)).toEqual({ 3: "red", 7: "green", 12: "yellow", 20: "red" });
  });
  it("2명이면 초록·노랑", () => {
    expect(signalOf(make([3, 7]))).toEqual({ 3: "green", 7: "yellow" });
  });
  it("마지막 사람 다음은 처음 사람", () => {
    const s = nextTurn(nextTurn(make([3, 7, 12]), 1, 1), 1, 2);
    expect(signalOf(s)).toEqual({ 3: "yellow", 7: "red", 12: "green" });
  });
});

describe("turnPhase", () => {
  it("경계", () => {
    expect(turnPhase(0, 60)).toBe("ok");
    expect(turnPhase(47.9, 60)).toBe("ok"); // 남은 12.1초(20%는 12초)
    expect(turnPhase(48, 60)).toBe("almost");
    expect(turnPhase(59.9, 60)).toBe("almost");
    expect(turnPhase(60, 60)).toBe("over");
    expect(turnPhase(70, 60)).toBe("over");
    // 120초: 20%는 24초
    expect(turnPhase(95, 120)).toBe("ok");
    expect(turnPhase(96, 120)).toBe("almost");
    // 30초: 10초가 기준(20%는 6초)
    expect(turnPhase(19, 30)).toBe("ok");
    expect(turnPhase(20, 30)).toBe("almost");
  });
});

describe("balanceHint", () => {
  it("말하지 않은 번호만 안내", () => {
    let s = make([3, 7, 12]);
    expect(balanceHint(s).message).toBe("아직 말하지 않은 친구가 있어요: 3번, 7번, 12번");
    s = nextTurn(s, 5, 1);
    s = skipTurn(s, 2);
    expect(balanceHint(s).silent).toEqual([7, 12]);
    s = nextTurn(s, 5, 3);
    s = nextTurn(s, 5, 4);
    s = nextTurn(s, 5, 5);
    expect(balanceHint(s).message).toBeNull();
  });
  it("탓하는 말이 없음", () => {
    const m = balanceHint(make()).message ?? "";
    expect(m).not.toMatch(/너무|많이|그만/);
  });
});

describe("의견 카드", () => {
  it("추가·수정·삭제·한도", () => {
    let s = make();
    s = addOpinion(s, { no: 3, text: "  놀이터에서 놀아요  " });
    expect(s.opinions[0]).toMatchObject({ id: "o1", no: 3, text: "놀이터에서 놀아요", chosen: false });
    s = addOpinion(s, { no: 99, text: "교실에서 쉬어요" });
    expect(s.opinions[1].no).toBeUndefined();
    expect(addOpinion(s, { text: "   " })).toBe(s);
    s = updateOpinion(s, "o1", { text: "운동장에서 놀아요", no: 7 });
    expect(s.opinions[0]).toMatchObject({ text: "운동장에서 놀아요", no: 7 });
    s = updateOpinion(s, "o1", { no: null });
    expect(s.opinions[0].no).toBeUndefined();
    s = setNotes(s, "o1", { good: "x".repeat(100), worry: "걱정" });
    expect(s.opinions[0].good).toHaveLength(40);
    s = removeOpinion(s, "o2");
    expect(s.opinions).toHaveLength(1);
    s = addOpinion(s, { text: "가".repeat(100) });
    expect(s.opinions[1].text).toHaveLength(60);
    expect(s.opinions[1].id).toBe("o2");
    for (let i = 0; i < 20; i++) s = addOpinion(s, { text: `의견${i}` });
    expect(s.opinions).toHaveLength(12);
  });
  it("묶기·풀기·고르기", () => {
    let s = make();
    for (const t of ["가", "나", "다", "라"]) s = addOpinion(s, { text: t });
    expect(groupOpinions(s, ["o1"])).toBe(s);
    s = groupOpinions(s, ["o1", "o2"]);
    expect(s.opinions[0].group).toBe("g1");
    expect(s.opinions[1].group).toBe("g1");
    s = groupOpinions(s, ["o2", "o3"]); // 합쳐짐
    expect(s.opinions.filter((o) => o.group === "g2")).toHaveLength(3);
    s = ungroup(s, "g2");
    expect(s.opinions.every((o) => o.group === undefined)).toBe(true);
    s = groupOpinions(s, ["o1", "o2"]);
    s = removeOpinion(s, "o1"); // 하나 남으면 풀림
    expect(s.opinions.every((o) => o.group === undefined)).toBe(true);
    s = choose(s, "o2");
    expect(s.opinions.find((o) => o.id === "o2")?.chosen).toBe(true);
    s = choose(s, "o2");
    expect(s.opinions.find((o) => o.id === "o2")?.chosen).toBe(false);
  });
  it("주제 고치기", () => {
    expect(setTopic(make(), "가".repeat(99)).topic).toHaveLength(80);
  });
  it("단계 이동", () => {
    const s = setPhase(make(), "adjust");
    expect(s.phase).toBe("adjust");
  });
});

describe("sanitizeDiscussion", () => {
  it("정상 값은 그대로(JSON 왕복)", () => {
    let s = make();
    s = addOpinion(s, { no: 3, text: "의견" });
    s = nextTurn(s, 5, 1000);
    expect(sanitizeDiscussion(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it("틀린 형식은 null", () => {
    for (const bad of [null, 1, "x", [], {}, { topic: "a", members: [], turnSeconds: 60 },
      { topic: "a", members: [{ no: 1, turns: 0 }, { no: 1, turns: 0 }], turnSeconds: 60 },
      { topic: "a", members: [{ no: 1, turns: 0 }, { no: 99, turns: 0 }], turnSeconds: 60 },
      { topic: "a", members: [{ no: 1, turns: 0 }, { no: 2, turns: 0 }], turnSeconds: "60" },
      { topic: 3, members: [{ no: 1, turns: 0 }, { no: 2, turns: 0 }], turnSeconds: 60 }]) {
      expect(sanitizeDiscussion(bad)).toBeNull();
    }
  });
  it("길이·개수 자르기와 어긋난 값 고치기", () => {
    const raw = {
      topic: "가".repeat(500),
      members: [{ no: 1, turns: -4 }, { no: 2, turns: 1.5 }],
      turnSeconds: 9999,
      order: [1, 1, 5],
      current: 9,
      phase: "bogus",
      opinions: Array.from({ length: 30 }, (_, i) => ({ id: `o${i}`, text: "나".repeat(200), good: "다".repeat(200), worry: 3, no: 77, chosen: "yes" })),
      log: [{ no: 0 } as never, ...Array.from({ length: 300 }, (_, i) => ({ no: 1, startedAt: i, seconds: 3, skipped: false }))],
    };
    const s = sanitizeDiscussion(raw)!;
    expect(s.topic).toHaveLength(80);
    expect(s.members.map((m) => m.turns)).toEqual([0, 0]);
    expect(s.turnSeconds).toBe(120);
    expect(s.order).toEqual([1, 2]);
    expect(s.current).toBe(0);
    expect(s.phase).toBe("share");
    expect(s.opinions).toHaveLength(12);
    expect(s.opinions[0].text).toHaveLength(60);
    expect(s.opinions[0].good).toHaveLength(40);
    expect(s.opinions[0].worry).toBe("");
    expect(s.opinions[0].no).toBeUndefined();
    expect(s.opinions[0].chosen).toBe(false);
    expect(s.log).toHaveLength(200);
  });
});

describe("CSV", () => {
  it("칸 이스케이프", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('말 "안녕"')).toBe('"말 ""안녕"""');
    expect(csvCell("줄\n바꿈")).toBe('"줄\n바꿈"');
    expect(csvCell("보통")).toBe("보통");
  });
  it("수식 주입 방지", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@a")).toBe("'@a");
    expect(csvCell('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
  });
  it("내용", () => {
    let s = make([3, 7]);
    s = nextTurn(s, 30, 1000);
    s = skipTurn(s, 2000);
    s = addOpinion(s, { no: 3, text: "=cmd, 안녕" });
    s = addOpinion(s, { text: "나" });
    s = groupOpinions(s, ["o1", "o2"]);
    s = choose(s, "o2");
    const csv = discussionCsv(s);
    expect(csv).toContain("순서,번호,말한 초,건너뜀\n1,3,30,\n2,7,0,예");
    expect(csv).toContain("번호,의견,좋은 점,걱정,묶음,함께 정함");
    expect(csv).toContain(`3,"'=cmd, 안녕",,,g1,`);
    expect(csv).toContain(",나,,,g1,예");
  });
});

describe("개인 정보 경고", () => {
  it("전화번호가 든 칸을 찾음", () => {
    const s = createDiscussion("우리 모둠 이야기", [1, 2], 60);
    if (!s.ok) throw new Error();
    let st = addOpinion(s.state, { text: "010-1234-5678로 연락해요" });
    st = addOpinion(st, { text: "공원에 가요" });
    st = setNotes(st, "o2", { worry: "내 전화는 010-9999-8888" });
    expect(personalInfoWarnings(st)).toEqual([
      { field: "text", opinionId: "o1" },
      { field: "worry", opinionId: "o2" },
    ]);
    expect(personalInfoWarnings(s.state)).toEqual([]);
  });
  it("주제도 검사", () => {
    const r = createDiscussion("전화 010-1234-5678", [1, 2], 60);
    expect(r.ok && personalInfoWarnings(r.state)).toEqual([{ field: "topic" }]);
  });
});
