import { beforeAll, describe, expect, it } from "vitest";
import { emptyImpression, getImpressionWork, type ImpressionArtifact } from "@/core/impression";

type Lib = typeof import("@/lib/artifacts");
type Dash = typeof import("@/lib/artifact-dashboard");
type Db = Awaited<ReturnType<typeof import("@/lib/db").getDb>>;
type Schema = typeof import("@/lib/db").schema;
type Sub = Schema["submissions"]["$inferSelect"];
type Asg = Schema["assignments"]["$inferSelect"];

let lib: Lib;
let dash: Dash;
let db: Db;
let schema: Schema;
let eq: typeof import("drizzle-orm").eq;

let teacherId: number;
let classA: number;
let classB: number;
const stu: Record<string, number> = {};
let impA: number;
let impB: number;
let cardA: number;

const base = (kind: Asg["kind"], classId: number, title: string) => ({
  classId, title, kind, activityId: null, genreId: "", standardCodes: ["6국05-04"], prompt: "p", organizer: [], rubric: [], coachEnabled: false,
});

const WHY = "연이 바람을 타고 높이 올라가는 모습이 시원해서 마음에 오래 남았어요.";
const LIFE = "나도 처음 자전거를 탔을 때 이런 기분이었어요.";

function filled(sentenceId = "s1-1", why = WHY, life = LIFE): ImpressionArtifact {
  const a = emptyImpression();
  return { ...a, step: 3, workId: "lt-kite", sentenceId, why, life };
}

async function sub(assignmentId: number, studentId: number): Promise<{ s: Sub; a: Asg }> {
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
const artifactOf = async (assignmentId: number, studentId: number) => (await sub(assignmentId, studentId)).s.artifact as ImpressionArtifact | null;
const allEventsJson = async () => JSON.stringify(await db.select().from(schema.events));

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
  teacherId = t.id;
  const [ca] = await db.insert(schema.classes).values({ teacherId, name: "6-1", grade: 6, joinCode: "AAAA11" }).returning();
  const [cb] = await db.insert(schema.classes).values({ teacherId, name: "6-2", grade: 6, joinCode: "BBBB22" }).returning();
  classA = ca.id;
  classB = cb.id;
  for (const [name, classId, number] of [["a", classA, 1], ["b", classA, 2], ["c", classA, 3], ["z", classB, 1]] as const) {
    const [s] = await db.insert(schema.students).values({ classId, number, nickname: name, pinHash: "x" }).returning();
    stu[name] = s.id;
  }
  const [x] = await db.insert(schema.assignments).values(base("impression", classA, "인상적인 부분")).returning();
  const [y] = await db.insert(schema.assignments).values(base("impression", classB, "인상적인 부분 B반")).returning();
  const [z] = await db.insert(schema.assignments).values(base("cardnews", classA, "카드뉴스")).returning();
  impA = x.id;
  impB = y.id;
  cardA = z.id;
});

describe("저장·안전", () => {
  it("평범한 글은 저장되고 단계가 기록된다", async () => {
    const out = await save(impA, stu.a, filled());
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.safety).toBeUndefined();
    expect(await artifactOf(impA, stu.a)).toMatchObject({ workId: "lt-kite", sentenceId: "s1-1", why: WHY, maxStep: 3 });
    expect((await sub(impA, stu.a)).s.stage).toBe("step3");
  });

  it("힘든 일 언급: 그 칸은 이전 글 유지, 정해진 안내, 교사 알림에는 짧은 발췌", async () => {
    const out = await save(impA, stu.a, filled("s1-1", WHY, "요즘 너무 힘들어서 죽고 싶어요"));
    expect(out.status === 200 && out.safety?.kind).toBe("distress");
    expect(out.status === 200 && out.safety?.keys).toEqual(["life"]);
    expect((await artifactOf(impA, stu.a))?.life).toBe(LIFE);
    const row = (await dash.artifactStatus(impA, classA, "impression")).rows.find((r) => r.number === 1)!;
    expect(row.alert).toMatchObject({ kind: "distress", fields: ["내 삶과 이어 본 생각"] });
    expect(row.alert?.excerpts[0].text).toContain("죽고 싶어요");
  });

  it("200자를 넘는 긴 글의 뒷부분에 있는 힘든 일 언급도 자르기 전에 먼저 잡는다", async () => {
    const long = `${"책을 읽고 느낀 점을 길게 길게 써 봐요. ".repeat(10)}죽고 싶어요`;
    expect(Array.from(long).length).toBeGreaterThan(200);
    const out = await save(impA, stu.a, filled("s1-1", long, LIFE));
    expect(out.status === 200 && out.safety?.kind).toBe("distress");
    expect(JSON.stringify(await artifactOf(impA, stu.a))).not.toContain("죽고");
    expect((await artifactOf(impA, stu.a))?.why).toBe(WHY);
    // 모양이 틀린 요청에 담긴 글도 400보다 먼저 점검한다
    const bad = await save(impA, stu.a, { nope: 1, memo: "나는 죽고 싶어요" });
    expect(bad.status === 200 && bad.safety?.kind).toBe("distress");
    expect(JSON.stringify(await db.select().from(schema.events))).toContain("raw");
    expect(await dash.artifactStatus(impA, classA, "impression").then((s) => s.rows.find((r) => r.number === 1)!.alert?.count)).toBe(3);
  });

  it("개인 정보는 제작물에도 이벤트에도 남지 않는다", async () => {
    const out = await save(impA, stu.a, filled("s1-1", `${WHY} 010-9876-5432`, LIFE));
    expect(out.status === 200 && out.safety?.kind).toBe("personal_info");
    expect(JSON.stringify(await artifactOf(impA, stu.a))).not.toContain("9876");
    expect(await allEventsJson()).not.toContain("9876");
  });

  it("엉뚱한 작품·문장은 서버가 비운다 / 형식이 아니면 400 / 다른 종류는 400", async () => {
    const out = await save(impA, stu.c, { ...filled(), workId: "lt-stage", sentenceId: "s1-1" });
    expect(out.status === 200 && out.artifact).toMatchObject({ workId: "", sentenceId: "" });
    const out2 = await save(impA, stu.c, { ...filled(), sentenceId: "s99-9" });
    expect(out2.status === 200 && out2.artifact).toMatchObject({ workId: "lt-kite", sentenceId: "" });
    expect((await save(impA, stu.c, { nope: 1 })).status).toBe(400);
    const { s, a } = await sub(impA, stu.c);
    expect((await lib.saveArtifact(s, a, stu.c, { kind: "cardnews" })).status).toBe(400);
  });
});

describe("제출·승인·갤러리·반응", () => {
  it("문장을 안 골랐거나 글이 짧으면 제출할 수 없다", async () => {
    await save(impA, stu.c, filled("", WHY, LIFE));
    const out = await submit(impA, stu.c);
    expect(out.status).toBe(400);
    await save(impA, stu.c, filled("s1-1", "짧아요", LIFE));
    expect((await submit(impA, stu.c)).status).toBe(400);
  });

  it("같은 문장을 고른 두 학생이 제출하고, 승인 전에는 갤러리에 보이지 않는다", async () => {
    expect((await submit(impA, stu.a)).status).toBe(200);
    await save(impA, stu.b, filled("s1-1", "나는 이 문장을 읽고 하늘을 나는 기분이 들어서 좋았어요.", "나도 연날리기를 해 본 적이 있어요."));
    expect((await submit(impA, stu.b)).status).toBe(200);
    const art = await artifactOf(impA, stu.b);
    expect(art).toMatchObject({ step: 3, maxStep: 3 });
    const { s: sa } = await sub(impA, stu.a);
    expect(sa.status).toBe("submitted");
    expect((await lib.impressionGalleryFor(impA, classA, stu.c))?.works).toEqual([]);
    expect((await lib.toggleReaction(stu.c, classA, sa.id, "same")).status).toBe(404);
  });

  it("제출하지 않은 작품·다른 교사는 승인할 수 없다", async () => {
    const { s: sc } = await sub(impA, stu.c);
    expect(await lib.setShareApproved(teacherId, sc.id, true)).toBe(false);
    const { s: sa } = await sub(impA, stu.a);
    expect(await lib.setShareApproved(teacherId + 999, sa.id, true)).toBe(false);
  });

  it("승인하면 같은 반에만 보이고 같은 문장끼리 모인다", async () => {
    const { s: sa } = await sub(impA, stu.a);
    const { s: sb } = await sub(impA, stu.b);
    expect(await lib.setShareApproved(teacherId, sa.id, true)).toBe(true);
    expect(await lib.setShareApproved(teacherId, sb.id, true)).toBe(true);
    const g = await lib.impressionGalleryFor(impA, classA, stu.c);
    expect(g?.works.map((w) => w.nickname)).toEqual(["a", "b"]);
    const { groupBySentence } = await import("@/core/impression");
    const groups = groupBySentence(g!.works);
    expect(groups.length).toBe(1);
    expect(groups[0].items.length).toBe(2);
    expect(groups[0].text).toBe(getImpressionWork("lt-kite")!.paragraphs[0].sentences[0].text);
    expect(JSON.stringify(g)).not.toContain("studentId");
    // 다른 반은 접근 못 함, 카드뉴스 과제는 이 갤러리로 열리지 않음
    expect(await lib.impressionGalleryFor(impA, classB, stu.z)).toBeNull();
    expect(await lib.impressionGalleryFor(cardA, classA, stu.c)).toBeNull();
    expect(await lib.galleryFor(impA, classA, stu.c)).toBeNull();
    expect((await lib.toggleReaction(stu.z, classB, sa.id, "same")).status).toBe(404);
    expect((await lib.impressionGalleryFor(impB, classB, stu.z))?.works).toEqual([]);
  });

  it("승인된 글은 작가도 더 고칠 수 없다", async () => {
    expect((await save(impA, stu.a, filled())).status).toBe(409);
    expect((await submit(impA, stu.a)).status).toBe(409);
  });

  it("스티커: 고정 네 가지만, 같은 스티커는 한 번(다시 누르면 뗌), 본인 글 금지, 카드뉴스 스티커 id 금지", async () => {
    const { s: sa } = await sub(impA, stu.a);
    const on = await lib.toggleReaction(stu.c, classA, sa.id, "same");
    expect(on.status === 200 && on.on).toBe(true);
    const more = await lib.toggleReaction(stu.c, classA, sa.id, "reason");
    expect(more.status === 200 && more.counts).toEqual({ same: 1, rethink: 0, memory: 0, reason: 1 });
    expect((await lib.toggleReaction(stu.b, classA, sa.id, "memory")).status).toBe(200);
    const off = await lib.toggleReaction(stu.c, classA, sa.id, "same");
    expect(off.status === 200 && off.on).toBe(false);
    expect((await lib.toggleReaction(stu.a, classA, sa.id, "same")).status).toBe(403);
    expect((await lib.toggleReaction(stu.c, classA, sa.id, "clear")).status).toBe(400); // 카드뉴스 스티커
    expect((await lib.toggleReaction(stu.c, classA, sa.id, "자유댓글")).status).toBe(400);
    const mine = (await lib.impressionGalleryFor(impA, classA, stu.a))!.works.find((w) => w.own)!;
    expect(mine.counts).toEqual({ same: 0, rethink: 0, memory: 1, reason: 1 });
  });

  it("카드뉴스에 impression 스티커 id는 붙지 않는다", async () => {
    const [cs] = await db.insert(schema.submissions).values({ assignmentId: cardA, studentId: stu.a, status: "submitted", shareApproved: true }).returning();
    expect((await lib.toggleReaction(stu.c, classA, cs.id, "same")).status).toBe(400);
    expect((await lib.toggleReaction(stu.c, classA, cs.id, "clear")).status).toBe(200);
  });

  it("작가는 '친구 반응을 보고 더 생각한 점'을 적는다(안전 점검 포함, 승인 전 금지)", async () => {
    const { s, a } = await sub(impA, stu.a);
    const bad = await lib.saveReflection(s, a, stu.a, "친구 번호는 010-5555-6666이에요");
    expect(bad.status === 200 && bad.safety?.kind).toBe("personal_info");
    expect((await sub(impA, stu.a)).s.reflection).toBe("");
    expect(await allEventsJson()).not.toContain("5555-6666");
    const long = await lib.saveReflection(s, a, stu.a, `${"더 생각한 점을 길게 적어 봐요. ".repeat(12)}제 번호는 010-7777-8888이에요`);
    expect(long.status === 200 && long.safety?.kind).toBe("personal_info");
    const ok = await lib.saveReflection(s, a, stu.a, "다른 친구도 같은 부분이 좋았다니 신기해요");
    expect(ok.status === 200 && ok.reflection).toBe("다른 친구도 같은 부분이 좋았다니 신기해요");
    const other = await sub(impA, stu.c);
    expect((await lib.saveReflection(other.s, other.a, stu.c, "x")).status).toBe(409);
  });

  it("교사 현황과 CSV(글 내용 없음)", async () => {
    const st = await dash.artifactStatus(impA, classA, "impression");
    const a = st.rows.find((r) => r.number === 1)!.impression!;
    expect(a).toMatchObject({ approved: true, reactionTotal: 2, workTitle: "바람을 타는 연" });
    expect(a.sentenceText.length).toBeGreaterThan(0);
    expect(a.whyChars).toBe(Array.from(WHY).length);
    const csv = await dash.artifactCsv(impA, classA, "impression");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("student_number,status,max_step,work_id,sentence_id,why_chars,life_chars,shared,reactions_received,reflection_written,safety_alert");
    expect(lines.find((l) => l.startsWith("1,"))).toBe(`1,submitted,3,lt-kite,s1-1,${Array.from(WHY).length},${Array.from(LIFE).length},y,2,y,distress`);
    expect(lines.find((l) => l.startsWith("2,"))?.startsWith("2,submitted,3,lt-kite,s1-1,")).toBe(true);
    expect(csv).not.toContain("연이 바람을");
    expect(csv).not.toContain("다른 친구도");
  });

  it("승인 취소하면 다시 숨겨지고 다시 고칠 수 있다", async () => {
    const { s } = await sub(impA, stu.b);
    expect(await lib.setShareApproved(teacherId, s.id, false)).toBe(true);
    expect((await lib.impressionGalleryFor(impA, classA, stu.c))?.works.map((w) => w.nickname)).toEqual(["a"]);
    const stored = await artifactOf(impA, stu.b);
    expect((await save(impA, stu.b, stored)).status).toBe(200);
  });

  it("5학년 미만 학급에서는 만들 수 없는 종류다(과제 종류 게이트)", async () => {
    const { artifactActivitiesForGrade } = await import("@/core/artifact");
    expect(artifactActivitiesForGrade(4).some((x) => x.kind === "impression")).toBe(false);
  });
});
