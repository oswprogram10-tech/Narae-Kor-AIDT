import { beforeAll, describe, expect, it } from "vitest";
import { DEBATE_STICKERS, emptyDebate, sharedDebateView, type DebateArtifact } from "@/core/speaking";

type Lib = typeof import("@/lib/artifacts");
type Dash = typeof import("@/lib/artifact-dashboard");
type Db = Awaited<ReturnType<typeof import("@/lib/db").getDb>>;
type Schema = typeof import("@/lib/db").schema;

let lib: Lib;
let dash: Dash;
let db: Db;
let schema: Schema;
let eq: typeof import("drizzle-orm").eq;
let classA: number;
let classB: number;
let debA: number;
let debB: number;
const stu: Record<string, number> = {};

const REBUTTAL_TEXT = "상대편은 비용이 너무 든다고 말할 거예요";
const ANSWER_TEXT = "그래도 한 번 투자하면 오래 쓸 수 있어요";
const REFLECTION = "토론을 하고 나니 반대 의견도 이해가 갔어요";

function filled(side: "pro" | "con", claim = "쉬는 시간을 늘려야 합니다."): DebateArtifact {
  const a = emptyDebate();
  return {
    ...a,
    side,
    claim,
    reasons: [{ id: "r1", text: "쉬면 집중이 잘돼요", support: "우리 반 설문에서 20명이 그렇게 답했어요", source: "우리 반 설문" }],
    rebuttals: [{ id: "b1", expected: REBUTTAL_TEXT, answer: ANSWER_TEXT }],
    reflection: REFLECTION,
  };
}

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
const save = async (assignmentId: number, studentId: number, raw: unknown) => {
  const { s, a } = await sub(assignmentId, studentId);
  return lib.saveArtifact(s, a, studentId, raw);
};
const submit = async (assignmentId: number, studentId: number) => {
  const { s, a } = await sub(assignmentId, studentId);
  return lib.submitArtifact(s, a, studentId);
};
const stored = async (assignmentId: number, studentId: number) => (await sub(assignmentId, studentId)).s.artifact as DebateArtifact;
const sid = async (assignmentId: number, studentId: number) => (await sub(assignmentId, studentId)).s.id;

beforeAll(async () => {
  process.env.PGLITE_DIR = "memory://";
  delete process.env.DATABASE_URL;
  const dbMod = await import("@/lib/db");
  schema = dbMod.schema;
  db = await dbMod.getDb();
  eq = (await import("drizzle-orm")).eq;
  lib = await import("@/lib/artifacts");
  dash = await import("@/lib/artifact-dashboard");
  const [t] = await db.insert(schema.teachers).values({ email: "t@example.test", displayName: "교사", passwordHash: "x" }).returning();
  const [ca] = await db.insert(schema.classes).values({ teacherId: t.id, name: "6-1", grade: 6, joinCode: "AAAA11" }).returning();
  const [cb] = await db.insert(schema.classes).values({ teacherId: t.id, name: "6-2", grade: 6, joinCode: "BBBB22" }).returning();
  classA = ca.id;
  classB = cb.id;
  teacherId = t.id;
  for (const [name, classId, number] of [["a", classA, 1], ["b", classA, 2], ["c", classA, 3], ["z", classB, 1]] as const) {
    const [s] = await db.insert(schema.students).values({ classId, number, nickname: name, pinHash: "x" }).returning();
    stu[name] = s.id;
  }
  const base = (classId: number, title: string) => ({
    classId, title, kind: "debate" as const, activityId: null, genreId: "", standardCodes: ["6국01-07"], prompt: "쉬는 시간을 늘려야 한다", organizer: [], rubric: [], coachEnabled: false,
  });
  const [x] = await db.insert(schema.assignments).values(base(classA, "토론")).returning();
  const [y] = await db.insert(schema.assignments).values(base(classB, "토론 B반")).returning();
  debA = x.id;
  debB = y.id;
});
let teacherId: number;

describe("공유 투영(핵심부)", () => {
  it("편·주장·근거만 나가고 반론·소감은 나가지 않는다", () => {
    const v = sharedDebateView(filled("pro"));
    expect(v).toEqual({
      side: "pro",
      claim: "쉬는 시간을 늘려야 합니다.",
      reasons: [{ text: "쉬면 집중이 잘돼요", support: "우리 반 설문에서 20명이 그렇게 답했어요", source: "우리 반 설문" }],
    });
    const json = JSON.stringify(v);
    for (const s of [REBUTTAL_TEXT, ANSWER_TEXT, REFLECTION]) expect(json).not.toContain(s);
  });
  it("편이 없거나 내용이 없으면 보여 줄 것이 없다", () => {
    expect(sharedDebateView(emptyDebate())).toBeNull();
    expect(sharedDebateView({ ...filled("pro"), side: null })).toBeNull();
  });
  it("스티커는 4개이고 자유 댓글은 없다", () => {
    expect(DEBATE_STICKERS.map((s) => s.id)).toEqual(["solid", "trust", "new", "prepare"]);
  });
});

describe("호스트: 갤러리·반응·잠금", () => {
  it("승인 전에는 갤러리가 비어 있다", async () => {
    for (const n of ["a", "b", "c"] as const) {
      const out = await save(debA, stu[n], filled(n === "c" ? "con" : "pro", `주장 ${n}`));
      expect(out.status).toBe(200);
      expect((await submit(debA, stu[n])).status).toBe(200);
    }
    const g = await lib.debateGalleryFor(debA, classA, stu.b);
    expect(g?.works).toEqual([]);
  });

  it("승인된 작품만 나가고, 응답 어디에도 반론·소감 글이 없다", async () => {
    expect(await lib.setShareApproved(teacherId, await sid(debA, stu.a), true)).toBe(true);
    expect(await lib.setShareApproved(teacherId, await sid(debA, stu.c), true)).toBe(true);
    const g = await lib.debateGalleryFor(debA, classA, stu.b);
    expect(g?.works.map((w) => [w.nickname, w.shared.side])).toEqual([["a", "pro"], ["c", "con"]]);
    const json = JSON.stringify(g);
    for (const s of [REBUTTAL_TEXT, ANSWER_TEXT, REFLECTION]) expect(json).not.toContain(s);
    expect(g?.works[0].shared.reasons[0].source).toBe("우리 반 설문");
  });

  it("다른 반에서는 갤러리가 없다", async () => {
    expect(await lib.debateGalleryFor(debA, classB, stu.z)).toBeNull();
    expect(await lib.debateGalleryFor(debB, classA, stu.a)).toBeNull();
  });

  it("스티커 토글: 자기 작품 불가, 승인 전·다른 반·다른 종류 스티커 불가", async () => {
    const a = await sid(debA, stu.a);
    const b = await sid(debA, stu.b);
    expect((await lib.toggleReaction(stu.a, classA, a, "solid")).status).toBe(403);
    expect((await lib.toggleReaction(stu.b, classA, b, "solid")).status).toBe(404); // 내 것이어도 승인 전이면 없는 것과 같다
    expect((await lib.toggleReaction(stu.c, classA, b, "solid")).status).toBe(404); // b는 아직 승인 전
    expect((await lib.toggleReaction(stu.z, classB, a, "solid")).status).toBe(404);
    expect((await lib.toggleReaction(stu.b, classA, a, "clear")).status).toBe(400); // 카드뉴스 스티커
    expect((await lib.toggleReaction(stu.b, classA, a, "same")).status).toBe(400); // 인상 스티커
    const on = await lib.toggleReaction(stu.b, classA, a, "solid");
    expect(on).toMatchObject({ status: 200, on: true });
    if (on.status === 200) expect(on.counts).toEqual({ solid: 1, trust: 0, new: 0, prepare: 0 });
    const off = await lib.toggleReaction(stu.b, classA, a, "solid");
    expect(off).toMatchObject({ status: 200, on: false });
    // 같은 이름 'new'·'trust'도 토론 작품에서는 토론 스티커로 센다
    const t = await lib.toggleReaction(stu.b, classA, a, "trust");
    expect(t).toMatchObject({ status: 200, on: true });
    await lib.toggleReaction(stu.c, classA, a, "prepare");
  });

  it("승인되면 편·주장·근거·반론은 고칠 수 없고, 토론 뒤 한 줄만 고칠 수 있다", async () => {
    const before = await stored(debA, stu.a);
    const tamper = { ...before, claim: "몰래 바꾼 주장", reasons: [], side: "con", rebuttals: [], reflection: "새 소감이에요" };
    expect((await save(debA, stu.a, tamper)).status).toBe(200);
    const after = await stored(debA, stu.a);
    expect(after.claim).toBe(before.claim);
    expect(after.side).toBe("pro");
    expect(after.reasons).toEqual(before.reasons);
    expect(after.rebuttals).toEqual(before.rebuttals);
    expect(after.reflection).toBe("새 소감이에요");
    // 갤러리에는 소감이 나가지 않는다
    expect(JSON.stringify(await lib.debateGalleryFor(debA, classA, stu.b))).not.toContain("새 소감");
    // 소감 칸도 안전 점검을 받는다
    const bad = await save(debA, stu.a, { ...before, reflection: "나는 죽고 싶어요" });
    expect(bad.status === 200 && bad.safety?.kind).toBe("distress");
    expect((await stored(debA, stu.a)).reflection).toBe("새 소감이에요");
    // 다시 제출은 막힌다
    const re = await submit(debA, stu.a);
    expect(re.status).toBe(409);
  });

  it("승인을 취소하면 다시 고칠 수 있다", async () => {
    expect(await lib.setShareApproved(teacherId, await sid(debA, stu.a), false)).toBe(true);
    expect((await save(debA, stu.a, { ...(await stored(debA, stu.a)), claim: "고친 주장" })).status).toBe(200);
    expect((await stored(debA, stu.a)).claim).toBe("고친 주장");
  });

  it("교사 현황과 CSV에 공유·받은 반응 수가 있다", async () => {
    const st = await dash.artifactStatus(debA, classA, "debate");
    const c = st.rows.find((r) => r.number === 3)!;
    expect(c.debate).toMatchObject({ approved: true, reactionTotal: 0 });
    const csv = (await dash.artifactCsv(debA, classA, "debate")).trim().split("\n");
    expect(csv[0]).toMatch(/shared,reactions_received,safety_alert$/);
    expect(csv[3]).toMatch(/,y,0,$/); // 3번: 승인됨, 반응 0
    expect(csv[1]).toMatch(/,n,2,distress$/); // 1번: 승인 취소됨(반응 기록은 남음)
    expect(csv.join("\n")).not.toContain(REBUTTAL_TEXT);
  });

  it("제출 전 작품은 승인할 수 없다", async () => {
    const [e] = await db.insert(schema.submissions).values({ assignmentId: debB, studentId: stu.z }).returning();
    expect(await lib.setShareApproved(teacherId, e.id, true)).toBe(false);
  });
});
