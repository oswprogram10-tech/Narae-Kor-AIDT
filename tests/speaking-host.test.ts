import { beforeAll, describe, expect, it } from "vitest";
import { emptyDebate, emptyInterview, emptyPresentation, type DebateArtifact, type InterviewArtifact, type PresentationArtifact } from "@/core/speaking";
import { artifactActivity, artifactActivitiesForGrade, isArtifactKind } from "@/core/artifact";
import { cleanDebateSeconds, cleanPresentationSeconds, debateSecondsOf, presentationSecondsOf } from "@/lib/assignment-settings";
import { DEBATE_CSV_HEADER, INTERVIEW_CSV_HEADER, PRESENTATION_CSV_HEADER, debateCsvCells, debateStats, interviewCsvCells, interviewStats, presentationCsvCells, presentationStats } from "@/lib/speaking-rules";

type Lib = typeof import("@/lib/artifacts");
type Dash = typeof import("@/lib/artifact-dashboard");
type Db = Awaited<ReturnType<typeof import("@/lib/db").getDb>>;
type Schema = typeof import("@/lib/db").schema;

describe("과제 설정(토론 시간)", () => {
  it("알 수 없는 단계·숫자가 아닌 값은 버리고 30~300초로 자른다", () => {
    expect(cleanDebateSeconds({ "pro-open": 90, plan1: 10, "con-open": 999, nope: 60, "pro-close": "50", "con-close": NaN })).toEqual({ "pro-open": 90, plan1: 30, "con-open": 300 });
    expect(cleanDebateSeconds({ "pro-open": 45.6 })).toEqual({ "pro-open": 46 });
    for (const bad of [null, undefined, 5, "x", [], {}, { nope: 60 }]) expect(cleanDebateSeconds(bad)).toBeUndefined();
  });
  it("저장된 설정에서 꺼낼 때도 같은 검사를 한다", () => {
    expect(debateSecondsOf({ debateSeconds: { "pro-open": 5 } })).toEqual({ "pro-open": 30 });
    expect(debateSecondsOf(null)).toBeUndefined();
    expect(debateSecondsOf({})).toBeUndefined();
  });
});

describe("말하기 준비 도구 계산", () => {
  it("토론 통계와 CSV 칸", () => {
    const a = emptyDebate();
    expect(debateCsvCells(null)).toHaveLength(DEBATE_CSV_HEADER.length - 3);
    a.side = "pro";
    a.claim = "쉬는 시간을 늘려야 합니다";
    a.reasons[0] = { id: "r1", text: "쉬어야 집중이 잘 돼요", support: "우리 반 설문", source: "설문" };
    a.reasons[1] = { id: "r2", text: "친구와 놀 시간이 필요해요", support: "", source: "" };
    a.rebuttals[0] = { id: "b1", expected: "수업이 줄어요", answer: "" };
    expect(debateStats(a)).toMatchObject({ side: "pro", reasons: 2, withSupport: 1, withSource: 1, rebuttals: 1 });
    expect(debateStats(a).warnings).toBeGreaterThan(0);
    expect(debateCsvCells(a).slice(0, 5)).toEqual(["pro", 2, 1, 1, 1]);
  });
  it("면담 통계와 CSV 칸", () => {
    const a = emptyInterview();
    a.questions[0].text = "급식은 언제 만드나요?";
    a.questions[1].text = "급식이 맛있나요";
    a.questions[2].text = "전화번호가 어떻게 되나요?";
    a.checklist.thanks = true;
    a.learned[0] = "새벽에 시작해요";
    expect(interviewStats(a)).toMatchObject({ questions: 3, closedQuestions: 1, sensitiveQuestions: 1, checklistDone: 1, learned: 1 });
    expect(interviewCsvCells(a).slice(0, 5)).toEqual([3, 1, 1, 1, 1]);
    expect(interviewCsvCells(null)).toHaveLength(INTERVIEW_CSV_HEADER.length - 3);
  });
});

describe("제작 활동 목록", () => {
  it("토론·면담은 5~6학년, 발표 준비는 3~6학년 제작 활동이다", () => {
    expect(isArtifactKind("debate")).toBe(true);
    expect(artifactActivity("debate")?.standardCode).toBe("6국01-07");
    expect(artifactActivity("interview")?.standardCode).toBe("6국01-04");
    expect(artifactActivitiesForGrade(4).map((x) => x.kind)).toEqual(["presentation"]);
    expect(artifactActivitiesForGrade(5).map((x) => x.kind)).toEqual(expect.arrayContaining(["debate", "interview"]));
  });
});

describe("토론·면담 저장·제출·현황", () => {
  let lib: Lib;
  let dash: Dash;
  let db: Db;
  let schema: Schema;
  let eq: typeof import("drizzle-orm").eq;
  let classId: number;
  let debateId: number;
  let interviewId: number;
  const stu: Record<string, number> = {};
  const MOTION = "쉬는 시간을 20분으로 늘려야 한다";

  async function sub(assignmentId: number, studentId: number) {
    const rows = await db
      .select({ s: schema.submissions, a: schema.assignments })
      .from(schema.submissions)
      .innerJoin(schema.assignments, eq(schema.submissions.assignmentId, schema.assignments.id));
    const row = rows.find((r) => r.s.assignmentId === assignmentId && r.s.studentId === studentId);
    if (row) return row;
    await db.insert(schema.submissions).values({ assignmentId, studentId });
    return sub(assignmentId, studentId);
  }
  const save = async (aid: number, sid: number, raw: unknown) => {
    const { s, a } = await sub(aid, sid);
    return lib.saveArtifact(s, a, sid, raw);
  };
  const submit = async (aid: number, sid: number) => {
    const { s, a } = await sub(aid, sid);
    return lib.submitArtifact(s, a, sid);
  };
  const stored = async (aid: number, sid: number) => (await sub(aid, sid)).s.artifact;

  beforeAll(async () => {
    process.env.PGLITE_DIR = "memory://";
    delete process.env.DATABASE_URL;
    const dbMod = await import("@/lib/db");
    schema = dbMod.schema;
    db = await dbMod.getDb(); // 마이그레이션 0005(assignments.settings)까지 적용된다
    eq = (await import("drizzle-orm")).eq;
    lib = await import("@/lib/artifacts");
    dash = await import("@/lib/artifact-dashboard");
    const [t] = await db.insert(schema.teachers).values({ email: "t@example.test", displayName: "교사", passwordHash: "x" }).returning();
    const [c] = await db.insert(schema.classes).values({ teacherId: t.id, name: "6-1", grade: 6, joinCode: "SPEAK1" }).returning();
    classId = c.id;
    for (const [name, number] of [["a", 1], ["b", 2], ["c", 3]] as const) {
      const [s] = await db.insert(schema.students).values({ classId, number, nickname: name, pinHash: "x" }).returning();
      stu[name] = s.id;
    }
    const base = { classId, activityId: null, genreId: "", organizer: [], rubric: [], coachEnabled: false };
    const [d] = await db
      .insert(schema.assignments)
      .values({ ...base, title: "토론", kind: "debate", standardCodes: ["6국01-07"], prompt: MOTION, settings: { debateSeconds: { "pro-open": 45 } } })
      .returning();
    const [i] = await db.insert(schema.assignments).values({ ...base, title: "면담", kind: "interview", standardCodes: ["6국01-04"], prompt: "면담 안내" }).returning();
    debateId = d.id;
    interviewId = i.id;
  });

  it("settings 열: 기본은 null이고 토론 시간이 저장된다", async () => {
    const [i] = await db.select().from(schema.assignments).where(eq(schema.assignments.id, interviewId));
    expect(i.settings).toBeNull();
    const [d] = await db.select().from(schema.assignments).where(eq(schema.assignments.id, debateId));
    expect(debateSecondsOf(d.settings)).toEqual({ "pro-open": 45 });
  });

  it("토론: 학생이 논제를 바꿔 보내도 서버가 과제의 논제로 덮어쓴다(처음 저장·다시 저장 모두)", async () => {
    const a: DebateArtifact = { ...emptyDebate(), motion: "내가 바꾼 논제", side: "con", claim: "지금이 좋아요" };
    a.reasons[0].text = "수업 시간이 줄지 않아요";
    const out = await save(debateId, stu.a, a);
    expect(out.status).toBe(200);
    expect((await stored(debateId, stu.a)) as DebateArtifact).toMatchObject({ motion: MOTION, side: "con", claim: "지금이 좋아요" });
    const again = await save(debateId, stu.a, { ...a, motion: "또 바꾼 논제" });
    expect(again.status).toBe(200);
    expect(((await stored(debateId, stu.a)) as DebateArtifact).motion).toBe(MOTION);
    // 현황에서도 교사가 정한 논제와 시간이 보인다
    const st = await dash.artifactStatus(debateId, classId, "debate");
    expect(st.debate).toEqual({ motion: MOTION, seconds: { "pro-open": 45 } });
  });

  it("토론: 위험 신호 글은 저장하지 않고 교사 알림을 남긴다(길이 검사보다 먼저)", async () => {
    const prev = (await stored(debateId, stu.a)) as DebateArtifact;
    const next = structuredClone(prev);
    next.reasons[1].text = "요즘 너무 힘들어서 죽고 싶어요";
    const out = await save(debateId, stu.a, next);
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.safety?.kind).toBe("distress");
    expect(JSON.stringify(await stored(debateId, stu.a))).not.toContain("죽고 싶어요");
    const st = await dash.artifactStatus(debateId, classId, "debate");
    expect(st.rows.find((r) => r.number === 1)?.alert?.kind).toBe("distress");
    // 칸 길이를 넘는 글의 뒷부분에 있어도 놓치지 않는다
    const long = structuredClone(prev);
    long.claim = `${"가".repeat(80)} 죽고 싶어요`;
    const out2 = await save(debateId, stu.a, long);
    expect(out2.status === 200 && out2.safety?.kind).toBe("distress");
    expect(JSON.stringify(await stored(debateId, stu.a))).not.toContain("죽고 싶어요");
  });

  it("토론: 논제 칸에 담긴 글은 덮어써 버리므로 저장을 막지 않는다", async () => {
    const prev = (await stored(debateId, stu.a)) as DebateArtifact;
    const out = await save(debateId, stu.a, { ...prev, motion: "전화번호 010-1234-5678", claim: "고친 주장" });
    expect(out.status === 200 && out.safety).toBeFalsy();
    expect(JSON.stringify(await stored(debateId, stu.a))).not.toContain("010-1234");
  });

  it("토론: 필수 항목이 빠지면 제출을 막고, 채우면 제출된다(제출한 뒤에도 고쳐서 다시 낼 수 있다)", async () => {
    const blank = await submit(debateId, stu.b);
    expect(blank.status).toBe(400);
    const ok = await submit(debateId, stu.a);
    expect(ok.status).toBe(200);
    expect(ok.status === 200 && ok.submitted).toBe(true);
    const edit = await save(debateId, stu.a, { ...((await stored(debateId, stu.a)) as DebateArtifact), reflection: "다음에는 자료를 더 모을래요" });
    expect(edit.status).toBe(200);
    expect(((await stored(debateId, stu.a)) as DebateArtifact).reflection).toBe("다음에는 자료를 더 모을래요");
  });

  it("토론: 교사 CSV 열", async () => {
    const csv = await dash.artifactCsv(debateId, classId, "debate");
    const [header, ...lines] = csv.trim().split("\n");
    expect(header).toBe([...DEBATE_CSV_HEADER.slice(0, -1), "shared", "reactions_received", "safety_alert"].join(","));
    expect(header).toBe("student_number,status,side,reasons,with_support,with_source,rebuttals,warnings,shared,reactions_received,safety_alert");
    const r1 = lines.map((l) => l.split(",")).find((c) => c[0] === "1")!;
    expect(r1.slice(0, 4)).toEqual(["1", "submitted", "con", "1"]);
    expect(csv).not.toContain("수업 시간이 줄지");
  });

  it("면담: 저장·제출·CSV", async () => {
    const a: InterviewArtifact = { ...emptyInterview(), purpose: "급식 알아보기", interviewee: "영양 선생님", method: "meet" };
    a.questions[0].text = "급식은 어떻게 만드나요?";
    a.questions[1].text = "급식이 맛있나요";
    a.questions[2].text = "급식 만드는 일이 힘들지 않나요?";
    a.checklist.appointment = true;
    expect((await save(interviewId, stu.a, a)).status).toBe(200);
    const out = await submit(interviewId, stu.a);
    expect(out.status === 200 && out.submitted).toBe(true);
    // 질문이 3개 미만이면 제출을 막는다
    const few: InterviewArtifact = { ...a, questions: a.questions.slice(0, 2) };
    expect((await save(interviewId, stu.b, few)).status).toBe(200);
    expect((await submit(interviewId, stu.b)).status).toBe(400);
    const csv = await dash.artifactCsv(interviewId, classId, "interview");
    const [header, ...lines] = csv.trim().split("\n");
    expect(header).toBe("student_number,status,questions,closed_questions,sensitive_questions,checklist_done,learned,warnings,safety_alert");
    const r1 = lines.map((l) => l.split(",")).find((c) => c[0] === "1")!;
    expect(r1.slice(0, 6)).toEqual(["1", "submitted", "3", "2", "0", "1"]);
  });

  it("면담: 개인 정보(전화번호)는 저장하지 않고 안내만 한다", async () => {
    const a = (await stored(interviewId, stu.a)) as InterviewArtifact;
    const next = structuredClone(a);
    next.questions[2].text = "제 전화번호는 010-1234-5678이에요";
    const out = await save(interviewId, stu.a, next);
    expect(out.status === 200 && out.safety?.kind).toBe("personal_info");
    expect(JSON.stringify(await stored(interviewId, stu.a))).not.toContain("010-1234");
    const st = await dash.artifactStatus(interviewId, classId, "interview");
    expect(st.rows.find((r) => r.number === 1)?.alert?.kind).toBe("personal_info");
  });
});

describe("발표 준비 저장·제출·현황", () => {
  let lib: Lib;
  let dash: Dash;
  let db: Db;
  let schema: Schema;
  let eq: typeof import("drizzle-orm").eq;
  let classId4: number;
  let classId6: number;
  let aid4: number;
  let aid6: number;
  const stu: Record<string, number> = {};

  async function sub(assignmentId: number, studentId: number) {
    const rows = await db
      .select({ s: schema.submissions, a: schema.assignments })
      .from(schema.submissions)
      .innerJoin(schema.assignments, eq(schema.submissions.assignmentId, schema.assignments.id));
    const row = rows.find((r) => r.s.assignmentId === assignmentId && r.s.studentId === studentId);
    if (row) return row;
    await db.insert(schema.submissions).values({ assignmentId, studentId });
    return sub(assignmentId, studentId);
  }
  const save = async (aid: number, sid: number, raw: unknown) => {
    const { s, a } = await sub(aid, sid);
    return lib.saveArtifact(s, a, sid, raw);
  };
  const submit = async (aid: number, sid: number) => {
    const { s, a } = await sub(aid, sid);
    return lib.submitArtifact(s, a, sid);
  };
  const stored = async (aid: number, sid: number) => (await sub(aid, sid)).s.artifact as PresentationArtifact;

  function work(band: "3-4" | "5-6"): PresentationArtifact {
    const a = emptyPresentation(band);
    a.topic = "우리 동네 재활용";
    a.purpose = "inform";
    a.sources[0] = { id: "s1", name: "구청 누리집", from: "구청 누리집", keyInfo: "분리배출 방법", ...(band === "5-6" ? { trust: { who: true, when: false, evidence: true } } : {}) };
    a.points[0] = { id: "p1", text: "종이와 플라스틱을 따로 모아요", sourceIds: ["s1"], aid: "photo" };
    return a;
  }

  beforeAll(async () => {
    process.env.PGLITE_DIR = "memory://";
    delete process.env.DATABASE_URL;
    const dbMod = await import("@/lib/db");
    schema = dbMod.schema;
    db = await dbMod.getDb();
    eq = (await import("drizzle-orm")).eq;
    lib = await import("@/lib/artifacts");
    dash = await import("@/lib/artifact-dashboard");
    const [t] = await db.insert(schema.teachers).values({ email: "p@example.test", displayName: "교사", passwordHash: "x" }).returning();
    const [c4] = await db.insert(schema.classes).values({ teacherId: t.id, name: "4-1", grade: 4, joinCode: "PRES04" }).returning();
    const [c6] = await db.insert(schema.classes).values({ teacherId: t.id, name: "6-1", grade: 6, joinCode: "PRES06" }).returning();
    classId4 = c4.id;
    classId6 = c6.id;
    for (const [name, number, classId] of [["a4", 1, classId4], ["b4", 2, classId4], ["a6", 1, classId6]] as const) {
      const [s] = await db.insert(schema.students).values({ classId, number, nickname: name, pinHash: "x" }).returning();
      stu[name] = s.id;
    }
    const base = { activityId: null, genreId: "", organizer: [], rubric: [], coachEnabled: false, kind: "presentation" as const, prompt: "발표 준비" };
    const [x4] = await db.insert(schema.assignments).values({ ...base, classId: classId4, title: "발표4", standardCodes: ["4국01-05"], settings: { presentationSeconds: 120 } }).returning();
    const [x6] = await db.insert(schema.assignments).values({ ...base, classId: classId6, title: "발표6", standardCodes: ["6국01-05"] }).returning();
    aid4 = x4.id;
    aid6 = x6.id;
  });

  it("목표 시간 설정: 60~300초로 자르고 없으면 180초", () => {
    expect(presentationSecondsOf({ presentationSeconds: 120 })).toBe(120);
    expect(presentationSecondsOf({ presentationSeconds: 10 })).toBe(60);
    expect(presentationSecondsOf({ presentationSeconds: 9999 })).toBe(300);
    expect(cleanPresentationSeconds(150.4)).toBe(150);
    for (const bad of [null, undefined, {}, { presentationSeconds: "90" }, { presentationSeconds: NaN }]) expect(presentationSecondsOf(bad)).toBe(180);
    expect(cleanPresentationSeconds("x")).toBeUndefined();
  });

  it("학년대는 학급 학년으로 서버가 늘 덮어쓴다(위조해도 소용없다)", async () => {
    const forged = { ...work("5-6"), band: "5-6" as const };
    expect((await save(aid4, stu.a4, forged)).status).toBe(200);
    const s4 = await stored(aid4, stu.a4);
    expect(s4.band).toBe("3-4");
    expect(s4.sources.every((s) => s.trust === undefined)).toBe(true);
    expect(s4.points.every((p) => p.aid === null)).toBe(true);
    // 다시 저장해도 마찬가지
    expect((await save(aid4, stu.a4, { ...s4, band: "5-6", points: [{ ...s4.points[0], aid: "graph" }, s4.points[1]] })).status).toBe(200);
    expect((await stored(aid4, stu.a4)).points[0].aid).toBeNull();
    // 6학년은 3-4로 위조해도 5-6
    expect((await save(aid6, stu.a6, { ...work("5-6"), band: "3-4" })).status).toBe(200);
    const s6 = await stored(aid6, stu.a6);
    expect(s6.band).toBe("5-6");
    expect(s6.sources[0].trust).toEqual({ who: true, when: false, evidence: true });
    expect(s6.points[0].aid).toBe("photo");
  });

  it("연습 기록은 숫자만 저장하고 최대 10개", async () => {
    const cur = await stored(aid4, stu.a4);
    expect((await save(aid4, stu.a4, { ...cur, practice: [95, 130, "x", 0, 99999, ...Array(10).fill(60)] })).status).toBe(200);
    const p = (await stored(aid4, stu.a4)).practice;
    expect(p).toHaveLength(10);
    expect(p.slice(0, 3)).toEqual([95, 130, 1800]);
  });

  it("위험 신호·개인 정보 글은 저장하지 않고 교사 알림을 남긴다(길이 검사보다 먼저)", async () => {
    const cur = await stored(aid4, stu.a4);
    const out = await save(aid4, stu.a4, { ...cur, closing: "요즘 너무 힘들어서 죽고 싶어요" });
    expect(out.status === 200 && out.safety?.kind).toBe("distress");
    expect(JSON.stringify(await stored(aid4, stu.a4))).not.toContain("죽고 싶어요");
    // 칸 길이를 넘는 글 뒷부분
    const long = await save(aid4, stu.a4, { ...cur, topic: `${"가".repeat(80)} 죽고 싶어요` });
    expect(long.status === 200 && long.safety?.kind).toBe("distress");
    expect(JSON.stringify(await stored(aid4, stu.a4))).not.toContain("죽고 싶어요");
    const phone = await save(aid4, stu.a4, { ...cur, sources: [{ ...cur.sources[0], from: "010-1234-5678" }] });
    expect(phone.status === 200 && phone.safety?.kind).toBe("personal_info");
    const st = await dash.artifactStatus(aid4, classId4, "presentation");
    expect(st.rows.find((r) => r.number === 1)?.alert?.kind).toBe("distress");
    expect(st.presentation).toEqual({ targetSeconds: 120 });
  });

  it("필수가 빠지면 제출을 막고, 채우면 제출되며, 제출 뒤에도 고쳐서 다시 낼 수 있다", async () => {
    expect((await submit(aid4, stu.b4)).status).toBe(400);
    const ok = await submit(aid4, stu.a4);
    expect(ok.status === 200 && ok.submitted).toBe(true);
    const cur = await stored(aid4, stu.a4);
    expect((await save(aid4, stu.a4, { ...cur, reflection: "다음엔 천천히 말할래요" })).status).toBe(200);
    expect((await stored(aid4, stu.a4)).reflection).toBe("다음엔 천천히 말할래요");
    const again = await submit(aid4, stu.a4);
    expect(again.status === 200 && again.submitted).toBe(true);
  });

  it("교사 CSV: 열, 값, 학생 글 내용 없음", async () => {
    await save(aid6, stu.a6, { ...(await stored(aid6, stu.a6)), practice: [150, 200], selfCheck: { volume: 3, pace: 2, eyes: 0, posture: 1, gesture: 2 } });
    const csv6 = await dash.artifactCsv(aid6, classId6, "presentation");
    const [header, ...lines] = csv6.trim().split("\n");
    expect(header).toBe(PRESENTATION_CSV_HEADER.join(","));
    expect(header).toBe(
      "student_number,status,purpose,sources,sources_with_from,points,points_with_source,aids,practice_runs,last_practice_s,target_s,self_volume,self_pace,self_eyes,self_posture,self_gesture,warnings,safety_alert",
    );
    const r = lines[0].split(",");
    expect(r.slice(0, 16)).toEqual(["1", "in_progress", "inform", "1", "1", "1", "1", "1", "2", "200", "180", "3", "2", "0", "1", "2"]);
    expect(r).toHaveLength(PRESENTATION_CSV_HEADER.length);
    expect(csv6).not.toContain("구청 누리집");
    expect(csv6).not.toContain("재활용");
    // 3~4학년 학급: aids 칸은 비고, 시작 전 학생은 빈 값/0
    const csv4 = await dash.artifactCsv(aid4, classId4, "presentation");
    const rows4 = csv4.trim().split("\n").slice(1).map((l) => l.split(","));
    const a4 = rows4.find((c) => c[0] === "1")!;
    expect(a4.slice(0, 3)).toEqual(["1", "submitted", "inform"]);
    expect(a4[7]).toBe("");
    expect(a4[10]).toBe("120");
    expect(rows4.every((c) => c.length === PRESENTATION_CSV_HEADER.length)).toBe(true);
  });

  it("교사 현황 통계", async () => {
    const st = await dash.artifactStatus(aid6, classId6, "presentation");
    const row = st.rows[0].presentation!;
    expect(row.stats).toMatchObject({ practiceRuns: 2, lastPractice: 200, targetSeconds: 180, aids: 1, selfCheckAverage: 2 });
    expect(presentationStats(row.artifact, 180).warnings).toBe(row.stats.warnings);
    expect(presentationCsvCells(null, 180)).toHaveLength(PRESENTATION_CSV_HEADER.length - 3);
  });
});
