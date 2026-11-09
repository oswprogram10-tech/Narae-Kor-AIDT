import { describe, expect, it } from "vitest";
import {
  DEBATE_LIMITS,
  DEBATE_MOTIONS,
  DEBATE_STEPS,
  INTERVIEW_LIMITS,
  METHOD_TIPS,
  checkDebate,
  checkInterview,
  debateFields,
  debateSteps,
  debateSubmitProblems,
  emptyDebate,
  emptyInterview,
  interviewSubmitProblems,
  newQuestion,
  newReason,
  sanitizeDebate,
  sanitizeInterview,
  timerState,
  withMotion,
  type DebateArtifact,
  type InterviewArtifact,
} from "@/core/speaking";
import { ARTIFACT_KINDS, emptyArtifact, fieldLabel, fieldsOf, sanitizeArtifact, scanSafety, submitProblems, withFields } from "@/core/artifact";

function goodDebate(): DebateArtifact {
  const a = emptyDebate();
  a.motion = DEBATE_MOTIONS[0].text;
  a.side = "pro";
  a.claim = "쉬는 시간을 늘리면 좋아요";
  a.reasons[0] = { id: "r1", text: "몸을 움직일 수 있어요", support: "우리 반 설문에서 20명이 찬성했어요", source: "우리 반 설문" };
  a.reasons[1] = { id: "r2", text: "친구와 더 친해져요", support: "지난 학기에 겪은 일", source: "내 경험" };
  a.rebuttals[0] = { id: "b1", expected: "수업 시간이 줄어요", answer: "점심시간을 줄이지 않고 아침 활동을 줄여요" };
  return a;
}
const kinds = (a: DebateArtifact) => checkDebate(a).map((w) => w.kind);

function goodInterview(): InterviewArtifact {
  const a = emptyInterview();
  a.purpose = "학교 건강 관리가 궁금해서";
  a.interviewee = "보건 선생님";
  a.method = "meet";
  a.questions = [
    { id: "q1", text: "보건실에서 어떤 일을 하세요?" },
    { id: "q2", text: "학생이 아플 때 무엇을 먼저 살피세요?" },
    { id: "q3", text: "이 일을 하며 왜 보람을 느끼세요?" },
  ];
  a.checklist = { appointment: true, greeting: true, permission: true, notes: true, thanks: true };
  return a;
}
const ikinds = (a: InterviewArtifact) => checkInterview(a).map((w) => w.kind);
const withQ = (text: string): InterviewArtifact => {
  const a = goodInterview();
  a.questions[0].text = text;
  return a;
};

describe("토론 절차와 타이머", () => {
  it("기본 절차: 8단계, 합계 720초", () => {
    expect(DEBATE_STEPS).toHaveLength(8);
    expect(DEBATE_STEPS.reduce((n, s) => n + s.seconds, 0)).toBe(720);
    expect(new Set(DEBATE_STEPS.map((s) => s.id)).size).toBe(8);
  });
  it("debateSteps: 시간을 30~300초로 자르고 이상한 값은 무시", () => {
    const s = debateSteps({ "pro-open": 10, "con-open": 999, plan1: 90.4, "con-rebut": Number.NaN, nope: 50 });
    expect(s[0].seconds).toBe(30);
    expect(s[1].seconds).toBe(300);
    expect(s[2].seconds).toBe(90);
    expect(s[3].seconds).toBe(120);
    expect(s).toHaveLength(8);
    expect(DEBATE_STEPS[0].seconds).toBe(120); // 원본은 그대로
    expect(debateSteps()).toEqual([...DEBATE_STEPS]);
  });
  it("timerState: 0초, 단계 경계, 끝난 뒤", () => {
    const steps = debateSteps();
    expect(timerState(steps, 0)).toMatchObject({ index: 0, remaining: 120, done: false, totalRemaining: 720 });
    expect(timerState(steps, 119)).toMatchObject({ index: 0, remaining: 1, done: false });
    expect(timerState(steps, 120)).toMatchObject({ index: 1, remaining: 120 });
    expect(timerState(steps, 299)).toMatchObject({ index: 2, remaining: 1 });
    expect(timerState(steps, 240)).toMatchObject({ index: 2, remaining: 60 });
    expect(timerState(steps, 300)).toMatchObject({ index: 3, remaining: 120 });
    expect(timerState(steps, 719)).toMatchObject({ index: 7, remaining: 1, done: false });
    expect(timerState(steps, 720)).toMatchObject({ index: 7, remaining: 0, done: true, totalRemaining: 0 });
    expect(timerState(steps, 5000).done).toBe(true);
    expect(timerState(steps, -5).index).toBe(0);
    expect(timerState(steps, 0.9).remaining).toBe(120);
    expect(timerState([], 3)).toMatchObject({ index: -1, done: true });
  });
});

describe("토론 논제", () => {
  it("논제 6개, 겹치지 않음", () => {
    expect(DEBATE_MOTIONS).toHaveLength(6);
    expect(new Set(DEBATE_MOTIONS.map((m) => m.id)).size).toBe(6);
    expect(DEBATE_MOTIONS.every((m) => m.text.length > 5 && m.text.length <= DEBATE_LIMITS.motion)).toBe(true);
  });
});

describe("토론 점검", () => {
  it("잘 쓴 준비는 경고가 없다", () => {
    expect(checkDebate(goodDebate())).toEqual([]);
    expect(debateSubmitProblems(goodDebate())).toEqual([]);
  });
  it("빈 준비: 편·주장·근거·반론 경고", () => {
    expect(kinds(emptyDebate())).toEqual(["no-side", "no-claim", "few-reasons", "no-rebuttal"]);
  });
  it("no-side / no-claim", () => {
    const a = goodDebate();
    a.side = null;
    expect(kinds(a)).toEqual(["no-side"]);
    a.side = "con";
    a.claim = "  ";
    expect(kinds(a)).toEqual(["no-claim"]);
  });
  it("few-reasons: 근거 1개면 걸리고 2개면 안 걸림", () => {
    const a = goodDebate();
    a.reasons[1].text = "";
    expect(kinds(a)).toContain("few-reasons");
    expect(kinds(goodDebate())).not.toContain("few-reasons");
  });
  it("no-support와 no-source는 서로 다른 경우", () => {
    const a = goodDebate();
    a.reasons[0].support = "";
    a.reasons[0].source = "";
    let w = checkDebate(a);
    expect(w.map((x) => x.kind)).toEqual(["no-support"]);
    expect(w[0].target).toBe("reason.r1.support");
    a.reasons[0].support = "설문 결과";
    w = checkDebate(a);
    expect(w.map((x) => x.kind)).toEqual(["no-source"]);
    expect(w[0].target).toBe("reason.r1.source");
  });
  it("no-rebuttal / rebuttal-no-answer", () => {
    const a = goodDebate();
    a.rebuttals[0].answer = "";
    const w = checkDebate(a);
    expect(w.map((x) => x.kind)).toEqual(["rebuttal-no-answer"]);
    expect(w[0].target).toBe("rebuttal.b1.answer");
    a.rebuttals[0].expected = "";
    expect(kinds(a)).toEqual(["no-rebuttal"]);
  });
  it("exaggeration: 위치(spans) 포함, 예상 반론 칸은 보지 않음", () => {
    const a = goodDebate();
    a.claim = "무조건 늘려야 해요";
    const w = checkDebate(a);
    expect(w.map((x) => x.kind)).toEqual(["exaggeration"]);
    expect(w[0].target).toBe("claim");
    expect(w[0].spans?.[0]).toMatchObject({ start: 0, word: "무조건" });
    a.claim = "쉬는 시간을 늘려요";
    a.rebuttals[0].expected = "절대 안 된대요";
    expect(kinds(a)).toEqual([]);
  });
  it("disrespect: 띄어쓰기가 달라도 걸림, 존중하는 말은 안 걸림", () => {
    const a = goodDebate();
    a.rebuttals[0].answer = "그 말은 말도 안 돼요";
    let w = checkDebate(a);
    expect(w.map((x) => x.kind)).toEqual(["disrespect"]);
    expect(w[0].message).toBe("상대의 생각을 존중하는 말로 바꿔 볼까요?");
    a.rebuttals[0].answer = "말도안돼";
    expect(kinds(a)).toEqual(["disrespect"]);
    for (const bad of ["바보 같아요", "멍청한 생각", "웃기는 소리", "한심해요", "그것도 몰라요?"]) {
      a.rebuttals[0].answer = bad;
      expect(kinds(a)).toContain("disrespect");
    }
    a.rebuttals[0].answer = "저는 다르게 생각해요";
    w = checkDebate(a);
    expect(w).toEqual([]);
  });
  it("submitProblems: 편·주장·근거만 막는다", () => {
    expect(debateSubmitProblems(emptyDebate())).toHaveLength(3);
    const a = goodDebate();
    a.reasons = [{ id: "r1", text: "근거 하나", support: "", source: "" }];
    a.rebuttals = [];
    a.claim = "무조건 바보 같아요";
    expect(debateSubmitProblems(a)).toEqual([]);
    a.reasons[0].text = " ";
    expect(debateSubmitProblems(a)).toHaveLength(1);
  });
});

describe("토론 sanitize", () => {
  it("잘못된 값은 거르고 긴 글·많은 칸을 자른다", () => {
    expect(sanitizeDebate(null)).toBeNull();
    expect(sanitizeDebate({ kind: "cardnews" })).toBeNull();
    const r = sanitizeDebate({
      kind: "debate",
      motion: "ㄱ".repeat(500),
      side: "both",
      claim: "가".repeat(500),
      reasons: Array.from({ length: 10 }, () => ({ id: "BAD ID!", text: "나".repeat(300), support: "다".repeat(300), source: "라".repeat(300) })),
      rebuttals: Array.from({ length: 10 }, (_, i) => ({ id: "x1", expected: "마".repeat(300), answer: i })),
      reflection: "바".repeat(300),
    })!;
    expect(r.side).toBeNull();
    expect(Array.from(r.motion)).toHaveLength(DEBATE_LIMITS.motion);
    expect(Array.from(r.claim)).toHaveLength(DEBATE_LIMITS.claim);
    expect(r.reasons).toHaveLength(3);
    expect(new Set(r.reasons.map((x) => x.id)).size).toBe(3);
    expect(r.reasons.every((x) => /^[a-z0-9]{1,8}$/.test(x.id))).toBe(true);
    expect(Array.from(r.reasons[0].text)).toHaveLength(DEBATE_LIMITS.reason);
    expect(Array.from(r.reasons[0].support)).toHaveLength(DEBATE_LIMITS.support);
    expect(Array.from(r.reasons[0].source)).toHaveLength(DEBATE_LIMITS.source);
    expect(r.rebuttals).toHaveLength(3);
    expect(new Set(r.rebuttals.map((x) => x.id)).size).toBe(3);
    expect(r.rebuttals[0].answer).toBe("");
    expect(Array.from(r.reflection)).toHaveLength(DEBATE_LIMITS.reflection);
  });
  it("배열이 아니거나 통제 문자가 있어도 안전", () => {
    const r = sanitizeDebate({ kind: "debate", reasons: "x", rebuttals: 3, claim: "a\u0000b" })!;
    expect(r.reasons).toEqual([]);
    expect(r.rebuttals).toEqual([]);
    expect(r.claim).toBe("ab");
  });
  it("논제: 이전 저장본이 있으면 학생 입력을 무시하고, withMotion으로 덮어쓴다", () => {
    const prev = goodDebate();
    const r = sanitizeDebate({ ...goodDebate(), motion: "내가 바꾼 논제" }, prev)!;
    expect(r.motion).toBe(prev.motion);
    const first = sanitizeDebate({ ...goodDebate(), motion: "내가 정한 논제" }, null)!;
    expect(withMotion(first, DEBATE_MOTIONS[2].text).motion).toBe(DEBATE_MOTIONS[2].text);
    expect(first.motion).toBe("내가 정한 논제"); // 원본은 그대로
  });
  it("정상 값은 그대로 왕복", () => {
    const a = goodDebate();
    expect(sanitizeDebate(a, a)).toEqual(a);
  });
  it("newReason은 3개에서 멈추고 id가 겹치지 않는다", () => {
    const a = goodDebate();
    const r = newReason(a.reasons)!;
    expect(r.id).toBe("r3");
    expect(newReason([...a.reasons, r])).toBeNull();
  });
});

describe("면담 질문 판정", () => {
  const open = ["무엇을 하세요?", "왜 이 일을 시작하셨어요?", "어떻게 준비하세요?", "어떤 점이 힘드세요?", "언제 가장 보람 있으세요?", "누구와 함께 일하세요?", "하루에 얼마나 일하세요?", "어느 때가 바쁘세요?", "무슨 일이 제일 많아요", "일하는 곳은 어디예요?"];
  const closed = ["이 일이 힘드세요?", "이 일을 좋아하세요?", "하루에 일을 많이 하세요?", "혼자 일하세요?", "점심은 드셨어요?", "재미있으세요"];
  it("열린 질문(물음말 있음)은 안 걸린다", () => {
    for (const q of open) expect(ikinds(withQ(q)), q).not.toContain("closed-question");
  });
  it("닫힌 질문은 걸린다", () => {
    for (const q of closed) {
      const w = checkInterview(withQ(q)).filter((x) => x.kind === "closed-question");
      expect(w, q).toHaveLength(1);
      expect(w[0].message).toBe("더 자세한 대답을 들을 수 있게 바꿔 볼까요?");
      expect(w[0].target).toBe("question.q1");
    }
  });
  it("'몇 살'은 곤란 질문으로만 걸린다", () => {
    const w = checkInterview(withQ("몇 살이세요?"));
    expect(w.map((x) => x.kind)).toEqual(["sensitive-question"]);
    expect(w[0].message).toBe("상대가 대답하기 곤란할 수 있어요. 꼭 필요한 질문인가요?");
  });
  it("곤란한 질문 목록", () => {
    for (const q of ["나이가 어떻게 되세요?", "사는 곳이 어디예요?", "집 주소를 알려 주세요", "전화번호가 무엇인가요?", "월급은 얼마예요?", "한 달에 버는 돈은 얼마인가요?", "돈을 얼마 받으세요?"]) {
      expect(ikinds(withQ(q)), q).toEqual(["sensitive-question"]);
    }
    expect(ikinds(withQ("보람을 느낄 때는 언제예요?"))).toEqual([]);
  });
  it("실명 같은 칸 판정", () => {
    const t = (name: string) => {
      const a = goodInterview();
      a.interviewee = name;
      return ikinds(a);
    };
    expect(t("보건 선생님")).toEqual([]);
    expect(t("빵집 사장님")).toEqual([]);
    expect(t("사서")).toEqual([]);
    expect(t("할머니")).toEqual([]);
    expect(t("소방관")).toEqual([]);
    expect(t("김민수")).toEqual(["real-name"]);
    expect(t("민수")).toEqual(["real-name"]);
    expect(t("")).toEqual([]);
    const w = checkInterview({ ...goodInterview(), interviewee: "김민수" });
    expect(w[0].message).toBe("이름 대신 ‘보건 선생님’처럼 하는 일로 적어 줘요.");
  });
  it("few-questions / duplicate-question", () => {
    const a = goodInterview();
    a.questions[2].text = "";
    expect(ikinds(a)).toEqual(["few-questions"]);
    const b = goodInterview();
    b.questions[1].text = "보건실에서  어떤 일을 하세요";
    const w = checkInterview(b);
    expect(w.map((x) => x.kind)).toEqual(["duplicate-question"]);
    expect(w[0].target).toBe("question.q2");
  });
  it("checklist: 빈 항목을 안내하고 다 채우면 없다", () => {
    const a = goodInterview();
    expect(ikinds(a)).toEqual([]);
    a.checklist.permission = false;
    const w = checkInterview(a);
    expect(w.map((x) => x.kind)).toEqual(["checklist"]);
    expect(w[0].message).toContain("기록(녹음·사진)은 허락받기");
  });
  it("METHOD_TIPS: 방법마다 안내가 있다", () => {
    expect(Object.keys(METHOD_TIPS).sort()).toEqual(["letter", "meet", "phone", "video"]);
    expect(METHOD_TIPS.phone).toContain("통화하기 편한 시간");
  });
  it("submitProblems: 목적·사람·방법·질문 3개", () => {
    expect(interviewSubmitProblems(emptyInterview())).toHaveLength(4);
    expect(interviewSubmitProblems(goodInterview())).toEqual([]);
    const a = goodInterview();
    a.checklist.thanks = false;
    a.interviewee = "김민수";
    a.questions[0].text = "네?";
    expect(interviewSubmitProblems(a)).toEqual([]);
    a.questions[2].text = " ";
    expect(interviewSubmitProblems(a)).toHaveLength(1);
  });
});

describe("면담 sanitize", () => {
  it("잘못된 값은 거르고 자른다", () => {
    expect(sanitizeInterview(undefined)).toBeNull();
    expect(sanitizeInterview({ kind: "debate" })).toBeNull();
    const r = sanitizeInterview({
      kind: "interview",
      purpose: "가".repeat(500),
      interviewee: "나".repeat(500),
      method: "fax",
      questions: Array.from({ length: 20 }, () => ({ id: "!!", text: "다".repeat(500) })),
      checklist: { appointment: "yes", greeting: true, bogus: true },
      learned: Array.from({ length: 9 }, () => "라".repeat(500)),
      wonder: "마".repeat(500),
    })!;
    expect(r.method).toBeNull();
    expect(Array.from(r.purpose)).toHaveLength(INTERVIEW_LIMITS.purpose);
    expect(Array.from(r.interviewee)).toHaveLength(INTERVIEW_LIMITS.interviewee);
    expect(r.questions).toHaveLength(8);
    expect(new Set(r.questions.map((q) => q.id)).size).toBe(8);
    expect(Array.from(r.questions[0].text)).toHaveLength(INTERVIEW_LIMITS.question);
    expect(r.checklist).toEqual({ appointment: false, greeting: true, permission: false, notes: false, thanks: false });
    expect(r.learned).toHaveLength(3);
    expect(Array.from(r.learned[0])).toHaveLength(INTERVIEW_LIMITS.learned);
    expect(Array.from(r.wonder)).toHaveLength(INTERVIEW_LIMITS.wonder);
  });
  it("정상 값은 그대로 왕복, 빈 값도 안전", () => {
    const a = goodInterview();
    expect(sanitizeInterview(a)).toEqual(a);
    expect(sanitizeInterview(emptyInterview())).toEqual(emptyInterview());
    expect(sanitizeInterview({ kind: "interview", questions: "x", learned: 5 })!.questions).toEqual([]);
  });
  it("newQuestion은 8개에서 멈춘다", () => {
    let qs = goodInterview().questions;
    while (qs.length < 8) qs = [...qs, newQuestion(qs)!];
    expect(newQuestion(qs)).toBeNull();
  });
});

describe("artifact 연결", () => {
  it("종류 목록과 빈 제작물", () => {
    expect(ARTIFACT_KINDS).toContain("debate");
    expect(ARTIFACT_KINDS).toContain("interview");
    expect(emptyArtifact("debate").kind).toBe("debate");
    expect(emptyArtifact("interview").kind).toBe("interview");
    expect(submitProblems(emptyArtifact("debate"))).toHaveLength(3);
    expect(submitProblems(emptyArtifact("interview"))).toHaveLength(4);
  });
  it("sanitizeArtifact: 다른 종류 값은 거부, 논제는 이전 저장본 유지", () => {
    expect(sanitizeArtifact("debate", goodInterview())).toBeNull();
    expect(sanitizeArtifact("interview", goodDebate())).toBeNull();
    const prev = goodDebate();
    const r = sanitizeArtifact("debate", { ...goodDebate(), motion: "바꾼 논제" }, prev);
    expect(r?.kind === "debate" && r.motion).toBe(prev.motion);
    expect(sanitizeArtifact("interview", goodInterview())).toEqual(goodInterview());
  });
  it("토론 fieldsOf/withFields 왕복, 논제는 글 칸이 아니다", () => {
    const a = goodDebate();
    const f = fieldsOf(a);
    expect(f.map((x) => x.key)).toEqual([
      "claim",
      "reason.r1.text", "reason.r1.support", "reason.r1.source",
      "reason.r2.text", "reason.r2.support", "reason.r2.source",
      "rebuttal.b1.expected", "rebuttal.b1.answer",
      "reflection",
    ]);
    expect(f.some((x) => x.text === a.motion)).toBe(false);
    expect(withFields(a, Object.fromEntries(f.map((x) => [x.key, x.text])))).toEqual(a);
    const b = withFields(a, { claim: "새 주장", "reason.r2.source": "책", "rebuttal.b1.answer": "답", reflection: "배웠어요", "reason.zz.text": "없는 칸", motion: "x" });
    expect(b.kind === "debate" && [b.claim, b.reasons[1].source, b.rebuttals[0].answer, b.reflection, b.motion]).toEqual(["새 주장", "책", "답", "배웠어요", a.motion]);
    expect(a.kind === "debate" && a.claim).toBe("쉬는 시간을 늘리면 좋아요");
    expect(debateFields(a)).toEqual(f);
  });
  it("카드 순서가 바뀌어도 같은 칸(id 기반)", () => {
    const a = goodDebate();
    const swapped: DebateArtifact = { ...a, reasons: [a.reasons[1], a.reasons[0]] };
    const b = withFields(swapped, { "reason.r1.text": "바뀐 근거" });
    expect(b.kind === "debate" && b.reasons[1].text).toBe("바뀐 근거");
  });
  it("면담 fieldsOf/withFields 왕복", () => {
    const a = goodInterview();
    a.learned = ["알게 된 것", "", ""];
    a.wonder = "더 궁금해요";
    const f = fieldsOf(a);
    expect(f.map((x) => x.key)).toEqual(["purpose", "interviewee", "question.q1", "question.q2", "question.q3", "learned.0", "learned.1", "learned.2", "wonder"]);
    expect(withFields(a, Object.fromEntries(f.map((x) => [x.key, x.text])))).toEqual(a);
    const b = withFields(a, { "question.q2": "새 질문", "learned.1": "둘째", "learned.9": "없음", wonder: "w" });
    expect(b.kind === "interview" && [b.questions[1].text, b.learned, b.wonder]).toEqual(["새 질문", ["알게 된 것", "둘째", ""], "w"]);
  });
  it("안전 점검: 개인 정보가 든 칸은 이전 글로 되돌린다", () => {
    const prev = goodDebate();
    const next = withFields(prev, { "reason.r1.support": "내 전화번호는 010-1234-5678이에요" });
    const scan = scanSafety(prev, next);
    expect(scan.hits.map((h) => h.key)).toEqual(["reason.r1.support"]);
    expect(scan.artifact).toEqual(prev);
    const iprev = goodInterview();
    const inext = withFields(iprev, { wonder: "죽고 싶어요" });
    expect(scanSafety(iprev, inext).kind).toBe("distress");
  });
  it("fieldLabel: 학생에게 보일 한글 이름", () => {
    const d = goodDebate();
    expect(fieldLabel(d, "claim")).toBe("내 주장");
    expect(fieldLabel(d, "reason.r2.support")).toBe("2번 근거 뒷받침 자료");
    expect(fieldLabel(d, "reason.r1.text")).toBe("1번 근거");
    expect(fieldLabel(d, "rebuttal.b1.answer")).toBe("1번 내 대답");
    const i = goodInterview();
    expect(fieldLabel(i, "question.q3")).toBe("3번 질문");
    expect(fieldLabel(i, "learned.1")).toBe("알게 된 것 2");
    expect(fieldLabel(i, "interviewee")).toBe("면담할 사람");
  });
});
