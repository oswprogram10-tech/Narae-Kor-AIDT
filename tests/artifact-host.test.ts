import { beforeAll, describe, expect, it } from "vitest";
import { emptyCardnews, type CardnewsArtifact } from "@/core/cardnews";
import { emptyDiary, emptyEntry, type DiaryArtifact } from "@/core/diary";

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
let cardnewsA: number;
let cardnewsB: number;
let diaryA: number;

const base = (kind: Asg["kind"], classId: number, title: string) => ({
  classId, title, kind, activityId: null, genreId: "", standardCodes: ["6국06-03"], prompt: "p", organizer: [], rubric: [], coachEnabled: false,
});

function filled(): CardnewsArtifact {
  const a = emptyCardnews();
  a.plan = { topic: "손 씻기", audience: "3학년 동생들", keyMessage: "비누로 손을 씻으면 세균이 줄어요", sources: [{ title: "보건 교과서", where: "책" }] };
  a.cards.forEach((c, i) => {
    c.title = `제목${i + 1}`;
    c.body = i === 0 ? "비누로 손을 씻어요." : "물로 헹궈요.";
  });
  a.confirms.audience = true;
  return a;
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
const artifactOf = async (assignmentId: number, studentId: number) => (await sub(assignmentId, studentId)).s.artifact;
const allEventsJson = async () => JSON.stringify(await db.select().from(schema.events));

beforeAll(async () => {
  process.env.PGLITE_DIR = "memory://";
  delete process.env.DATABASE_URL;
  const dbMod = await import("@/lib/db");
  schema = dbMod.schema;
  db = await dbMod.getDb(); // 마이그레이션(0003_artifacts 포함)이 PGlite에 적용된다
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
  const [x] = await db.insert(schema.assignments).values(base("cardnews", classA, "카드뉴스")).returning();
  const [y] = await db.insert(schema.assignments).values(base("cardnews", classB, "카드뉴스 B반")).returning();
  const [z] = await db.insert(schema.assignments).values(base("media-diary", classA, "일지")).returning();
  cardnewsA = x.id;
  cardnewsB = y.id;
  diaryA = z.id;
});

describe("마이그레이션", () => {
  it("PGlite에 새 열과 반응 표가 적용된다", async () => {
    const { s } = await sub(cardnewsA, stu.a);
    expect(s.artifact).toBeNull();
    expect(s.shareApproved).toBe(false);
    expect(s.reflection).toBe("");
    const [rx] = await db.insert(schema.reactions).values({ submissionId: s.id, reactorId: stu.b, stickerId: "clear" }).returning();
    expect(rx.id).toBeGreaterThan(0);
    await db.delete(schema.reactions).where(eq(schema.reactions.id, rx.id));
  });
});

describe("카드뉴스 저장·안전", () => {
  it("평범한 글은 저장되고 단계가 기록된다", async () => {
    const a = filled();
    a.step = 2;
    const out = await save(cardnewsA, stu.a, a);
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.safety).toBeUndefined();
    expect((await artifactOf(cardnewsA, stu.a)) as CardnewsArtifact).toMatchObject({ step: 2, maxStep: 2, plan: { topic: "손 씻기" } });
  });

  it("카드 본문에 힘든 일 언급: 그 칸은 저장하지 않고(이전 글 유지) 정해진 안내와 교사 알림", async () => {
    const stored = (await artifactOf(cardnewsA, stu.a)) as CardnewsArtifact;
    const next = structuredClone(stored);
    next.cards[1].body = "요즘 너무 힘들어서 죽고 싶어요";
    next.cards[2].title = "새 제목";
    const out = await save(cardnewsA, stu.a, next);
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.safety?.kind).toBe("distress");
    expect(out.safety?.reply).toContain("선생님께");
    expect(out.safety?.keys).toEqual([`card.${stored.cards[1].id}.body`]);
    const after = (await artifactOf(cardnewsA, stu.a)) as CardnewsArtifact;
    expect(after.cards[1].body).toBe("물로 헹궈요.");
    expect(JSON.stringify(after)).not.toContain("죽고");
    expect(after.cards[2].title).toBe("새 제목");
    const st = await dash.artifactStatus(cardnewsA, classA, "cardnews");
    const row = st.rows.find((r) => r.number === 1)!;
    expect(row.alert?.kind).toBe("distress");
    expect(row.alert?.fields).toEqual(["2번 카드 본문"]);
    expect(row.alert?.excerpts[0].text).toContain("죽고 싶어요");
  });

  it("개인 정보: 글을 제작물에도 이벤트에도 남기지 않는다", async () => {
    const stored = (await artifactOf(cardnewsA, stu.a)) as CardnewsArtifact;
    const next = structuredClone(stored);
    next.plan.sources = [{ title: "우리 집 전화 010-9876-5432", where: "" }];
    next.cards[3].body = "내 이메일은 kid@example.com 이에요";
    const out = await save(cardnewsA, stu.a, next);
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.safety?.kind).toBe("personal_info");
    expect(out.safety?.keys.length).toBe(2);
    const after = JSON.stringify(await artifactOf(cardnewsA, stu.a));
    expect(after).not.toContain("9876");
    expect(after).not.toContain("kid@example");
    const events = await allEventsJson();
    expect(events).not.toContain("9876");
    expect(events).not.toContain("kid@example");
    expect(events).toContain("artifact_safety");
    // 교사 화면 알림은 힘든 일 언급이 먼저
    const row = (await dash.artifactStatus(cardnewsA, classA, "cardnews")).rows.find((r) => r.number === 1)!;
    expect(row.alert?.kind).toBe("distress");
    expect(row.alert?.fields).toEqual(expect.arrayContaining(["출처", "4번 카드 본문"]));
    expect(JSON.stringify(row.alert)).not.toContain("9876");
  });

  it("지나치게 긴 글·엉뚱한 값은 서버가 고친다 / 형식이 아니면 400", async () => {
    const stored = (await artifactOf(cardnewsA, stu.a)) as CardnewsArtifact;
    const next = structuredClone(stored);
    next.cards[0].title = "가".repeat(50);
    next.cards[0].color = "hotpink";
    const out = await save(cardnewsA, stu.a, next);
    expect(out.status === 200 && (out.artifact as CardnewsArtifact).cards[0].title.length).toBe(20);
    expect((await save(cardnewsA, stu.a, { nope: 1 })).status).toBe(400);
  });

  it("칸 길이를 넘는 글의 뒷부분에 담긴 힘든 일 언급도 놓치지 않는다(자르기 전 원문 점검)", async () => {
    const stored = (await artifactOf(cardnewsA, stu.a)) as CardnewsArtifact;
    const next = structuredClone(stored);
    next.cards[0].title = `${"가".repeat(30)} 죽고 싶어요`; // 제목 칸 한도(20자) 뒤에 있는 글
    const out = await save(cardnewsA, stu.a, next);
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.safety?.kind).toBe("distress");
    expect(JSON.stringify(await artifactOf(cardnewsA, stu.a))).not.toContain("가".repeat(30));
    // 모양이 틀린 요청도 400으로 끝내기 전에 원문을 점검한다
    const bad = await save(cardnewsA, stu.a, { nope: 1, memo: "나는 죽고 싶어요" });
    expect(bad.status === 200 && bad.safety?.kind).toBe("distress");
    expect(await allEventsJson()).toContain("raw");
  });

  it("제출: 막는 문제가 있으면 400, 채우면 제출 + 경고 수 기록", async () => {
    const out0 = await save(cardnewsA, stu.b, emptyCardnews());
    expect(out0.status).toBe(200);
    const bad = await submit(cardnewsA, stu.b);
    expect(bad.status).toBe(400);

    const a = filled();
    a.cards[1].body = "가장 최고의 방법이에요";
    a.plan.sources = [];
    await save(cardnewsA, stu.b, a);
    const ok = await submit(cardnewsA, stu.b);
    expect(ok.status).toBe(200);
    const art = (await artifactOf(cardnewsA, stu.b)) as CardnewsArtifact;
    expect(art.submitWarnings).toBe(2); // 과장 표현 + 출처 없음
    expect(art.maxStep).toBe(4);
    const { s } = await sub(cardnewsA, stu.b);
    expect(s.status).toBe("submitted");
    expect(s.submittedAt).not.toBeNull();
  });

  it("제출 뒤 고치면 고친 횟수가 늘고(30초 안은 한 번), 승인되면 잠긴다", async () => {
    const stored = (await artifactOf(cardnewsA, stu.b)) as CardnewsArtifact;
    const a1 = structuredClone(stored);
    a1.cards[1].body = "깨끗하게 헹궈요";
    const o1 = await save(cardnewsA, stu.b, a1);
    expect(o1.status === 200 && (o1.artifact as CardnewsArtifact).revisions).toBe(1);
    const a2 = structuredClone(a1);
    a2.cards[1].body = "깨끗하게 헹궈요 정말";
    const o2 = await save(cardnewsA, stu.b, a2);
    expect(o2.status === 200 && (o2.artifact as CardnewsArtifact).revisions).toBe(1);
    // 내용이 같은 저장(단계만 바꿈)은 고침이 아니다
    const a3 = structuredClone(a2);
    a3.step = 3;
    expect((await save(cardnewsA, stu.b, a3)).status).toBe(200);
    expect(((await artifactOf(cardnewsA, stu.b)) as CardnewsArtifact).revisions).toBe(1);
  });
});

describe("공유 승인·갤러리·반응", () => {
  it("승인 전에는 같은 반 친구도 갤러리에서 볼 수 없고 스티커도 붙일 수 없다", async () => {
    const { s } = await sub(cardnewsA, stu.b);
    const g = await lib.galleryFor(cardnewsA, classA, stu.c);
    expect(g?.works).toEqual([]);
    const r = await lib.toggleReaction(stu.c, classA, s.id, "clear");
    expect(r.status).toBe(404);
  });

  it("제출하지 않은 작품은 승인할 수 없다", async () => {
    const { s } = await sub(cardnewsA, stu.a);
    expect(await lib.setShareApproved(teacherId, s.id, true)).toBe(false);
  });

  it("다른 교사는 승인할 수 없다", async () => {
    const { s } = await sub(cardnewsA, stu.b);
    expect(await lib.setShareApproved(teacherId + 999, s.id, true)).toBe(false);
  });

  it("교사가 승인하면 같은 반에만 보인다(다른 반·다른 과제는 안 보인다)", async () => {
    const { s } = await sub(cardnewsA, stu.b);
    expect(await lib.setShareApproved(teacherId, s.id, true)).toBe(true);
    const g = await lib.galleryFor(cardnewsA, classA, stu.c);
    expect(g?.works.map((w) => w.submissionId)).toEqual([s.id]);
    expect(g?.works[0]).toMatchObject({ nickname: "b", own: false, topic: "손 씻기" });
    expect(JSON.stringify(g)).not.toContain("confirms");
    // 다른 반 학생은 이 과제의 갤러리에 접근 못 함, 스티커도 못 붙임
    expect(await lib.galleryFor(cardnewsA, classB, stu.z)).toBeNull();
    expect((await lib.toggleReaction(stu.z, classB, s.id, "clear")).status).toBe(404);
    // 다른 반의 갤러리는 비어 있음
    expect((await lib.galleryFor(cardnewsB, classB, stu.z))?.works).toEqual([]);
  });

  it("승인된 작품은 작가도 더 고칠 수 없다", async () => {
    const stored = (await artifactOf(cardnewsA, stu.b)) as CardnewsArtifact;
    expect((await save(cardnewsA, stu.b, stored)).status).toBe(409);
    expect((await submit(cardnewsA, stu.b)).status).toBe(409);
  });

  it("스티커: 같은 스티커는 한 번만(다시 누르면 뗌), 고정 목록만, 본인 작품 금지", async () => {
    const { s } = await sub(cardnewsA, stu.b);
    const on = await lib.toggleReaction(stu.c, classA, s.id, "clear");
    expect(on.status === 200 && on.on).toBe(true);
    const more = await lib.toggleReaction(stu.c, classA, s.id, "trust");
    expect(more.status === 200 && more.counts).toMatchObject({ clear: 1, trust: 1, new: 0, icons: 0 });
    const off = await lib.toggleReaction(stu.c, classA, s.id, "clear");
    expect(off.status === 200 && off.on).toBe(false);
    expect((await lib.toggleReaction(stu.c, classA, s.id, "clear")).status).toBe(200);
    expect((await lib.toggleReaction(stu.b, classA, s.id, "clear")).status).toBe(403);
    expect((await lib.toggleReaction(stu.c, classA, s.id, "자유댓글")).status).toBe(400);
    expect((await lib.toggleReaction(stu.c, classA, "x", "clear")).status).toBe(400);
    // 데이터베이스 수준에서도 (작품, 학생, 스티커)는 하나
    await expect(db.insert(schema.reactions).values({ submissionId: s.id, reactorId: stu.c, stickerId: "clear" })).rejects.toThrow();
    const rows = await db.select().from(schema.reactions).where(eq(schema.reactions.submissionId, s.id));
    expect(rows.filter((r) => r.reactorId === stu.c).map((r) => r.stickerId).sort()).toEqual(["clear", "trust"]);
  });

  it("작가는 받은 스티커를 보고, 반응을 보고 고칠 점을 적는다 (안전 점검 포함)", async () => {
    const { s, a } = await sub(cardnewsA, stu.b);
    const mine = (await lib.galleryFor(cardnewsA, classA, stu.b))!.works.find((w) => w.own)!;
    expect(mine.counts).toMatchObject({ clear: 1, trust: 1 });
    const bad = await lib.saveReflection(s, a, stu.b, "친구 번호는 010-5555-6666이에요");
    expect(bad.status === 200 && bad.safety?.kind).toBe("personal_info");
    expect((await sub(cardnewsA, stu.b)).s.reflection).toBe("");
    expect(await allEventsJson()).not.toContain("5555-6666");
    // 한도(100자)를 넘는 글의 뒷부분에 있는 개인 정보·위험 신호도 놓치지 않는다
    const long = await lib.saveReflection(s, a, stu.b, `${"고칠 점을 길게 적어 봐요. ".repeat(12)}제 번호는 010-7777-8888이에요`);
    expect(long.status === 200 && long.safety?.kind).toBe("personal_info");
    expect(await allEventsJson()).not.toContain("7777-8888");
    expect((await sub(cardnewsA, stu.b)).s.reflection).toBe("");
    const ok = await lib.saveReflection(s, a, stu.b, "출처를 더 써야겠어요");
    expect(ok.status === 200 && ok.reflection).toBe("출처를 더 써야겠어요");
    // 승인 전 작품에는 쓸 수 없다
    const other = await sub(cardnewsA, stu.a);
    expect((await lib.saveReflection(other.s, other.a, stu.a, "x")).status).toBe(409);
  });

  it("승인 취소하면 다시 숨겨지고 다시 고칠 수 있다", async () => {
    const { s } = await sub(cardnewsA, stu.b);
    expect(await lib.setShareApproved(teacherId, s.id, false)).toBe(true);
    expect((await lib.galleryFor(cardnewsA, classA, stu.c))?.works).toEqual([]);
    const stored = (await artifactOf(cardnewsA, stu.b)) as CardnewsArtifact;
    expect((await save(cardnewsA, stu.b, stored)).status).toBe(200);
    expect(await lib.setShareApproved(teacherId, s.id, true)).toBe(true);
  });

  it("교사 현황과 CSV(글 내용 없음)", async () => {
    const st = await dash.artifactStatus(cardnewsA, classA, "cardnews");
    const b = st.rows.find((r) => r.number === 2)!.cardnews!;
    expect(b).toMatchObject({ approved: true, reactionTotal: 2, warningsAtSubmit: 2, revisions: 1 });
    const csv = await dash.artifactCsv(cardnewsA, classA, "cardnews");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("student_number,status,max_step,cards,warnings_at_submit,revisions_after_submit,shared,reactions_received,reflection_written,safety_alert");
    expect(lines.find((l) => l.startsWith("2,"))).toBe("2,submitted,4,4,2,1,y,2,y,personal_info");
    expect(lines.find((l) => l.startsWith("1,"))).toBe("1,in_progress,2,4,,0,n,0,n,distress");
    expect(csv).not.toContain("손 씻기");
    expect(csv).not.toContain("출처를 더");
  });
});

describe("매체 이용 성찰 일지", () => {
  it("저장·안전·제출·요약·CSV", async () => {
    const d: DiaryArtifact = emptyDiary();
    d.entries = [
      { ...emptyEntry(1), minutes: { video: 60, game: 30, chat: 0, study: 20, read: 0 }, longest: "video", mood: "good", note: "영상을 많이 봤어요" },
      { ...emptyEntry(2), minutes: { video: 20, game: 0, chat: 10, study: 0, read: 40 }, note: "내 번호는 010-2222-3333" },
    ];
    d.reflection = { good: "책을 읽었어요", change: "영상 줄이기", promise: "하루 30분만" };
    const out = await save(diaryA, stu.a, d);
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.safety?.kind).toBe("personal_info");
    expect(JSON.stringify(await artifactOf(diaryA, stu.a))).not.toContain("2222-3333");
    expect(await allEventsJson()).not.toContain("2222-3333");
    expect((await submit(diaryA, stu.a)).status).toBe(200);
    expect((await save(diaryA, stu.a, d)).status).toBe(409);

    const st = await dash.artifactStatus(diaryA, classA, "media-diary");
    const row = st.rows.find((r) => r.number === 1)!;
    expect(row.diary?.summary).toMatchObject({ daysLogged: 2, totalMinutes: 180, reflectionComplete: true });
    expect(row.diary?.summary.totals).toEqual({ video: 80, game: 30, chat: 10, study: 20, read: 40 });
    expect(st.classAverage?.students).toBe(1);
    expect(st.classAverage?.averages.video).toBe(40);
    const csv = await dash.artifactCsv(diaryA, classA, "media-diary");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("student_number,status,days_logged,minutes_video,minutes_game,minutes_chat,minutes_study,minutes_read,minutes_total,reflection_completed,safety_alert");
    expect(lines.find((l) => l.startsWith("1,"))).toBe("1,submitted,2,80,30,10,20,40,180,y,personal_info");
    expect(lines.find((l) => l.startsWith("2,"))).toBe("2,not_started,0,0,0,0,0,0,0,n,");
  });

  it("기록이 없으면 제출할 수 없다", async () => {
    await save(diaryA, stu.b, emptyDiary());
    expect((await submit(diaryA, stu.b)).status).toBe(400);
  });

  it("다른 종류의 과제에는 저장 못 한다", async () => {
    const { s, a } = await sub(cardnewsA, stu.c);
    expect((await lib.saveArtifact(s, a, stu.c, emptyDiary())).status).toBe(400);
  });
});
