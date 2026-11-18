import { beforeAll, describe, expect, it } from "vitest";
import {
  LITERATURE_ACTIVITIES,
  LITERATURE_ITEMS,
  OWN_LINE_MAX,
  RELATION_ITEM_IDS,
  displayEvents,
  displayFeelings,
  feelingOrder,
  getLiteratureItem,
  relationEdges,
  type MoodScaleItem,
  type OwnLineItem,
  type SequenceItem,
} from "@/core/literature";
import { toDisplayIndex } from "@/core/practice/shuffle";
import { parseReadingAnswer, studentMediaItems, toDisplayAnswer } from "@/lib/reading-rules";
import { findActivity, findItem, isReadingHostKind } from "@/lib/activities";

const FORBIDDEN = [
  "minOk", "maxOk", "correctFeeling", "feelingOptions", "evidenceIds", "correctOrder", "correctOption", "correctSentenceIds", "answers",
  "principle", "hints", "explanation",
];
const mood = (id: string) => getLiteratureItem(id) as MoodScaleItem;
const seq = (id: string) => getLiteratureItem(id) as SequenceItem;
const own = (id: string) => getLiteratureItem(id) as OwnLineItem;
const moodItems = LITERATURE_ITEMS.filter((i): i is MoodScaleItem => i.type === "mood-scale");
const seqItems = LITERATURE_ITEMS.filter((i): i is SequenceItem => i.type === "sequence");

describe("활동 조회", () => {
  it("문학 활동·문제를 찾고 과제 종류로 인정한다", () => {
    expect(findActivity("mood-thermometer")?.title).toBe("마음 온도계로 이야기 따라가기");
    expect(findActivity("character-map")).toBeDefined();
    expect(findItem("mt-01")?.type).toBe("mood-scale");
    expect(findItem("mt-06")?.type).toBe("sequence");
    expect(findItem("sn-05")?.type).toBe("own-line");
    expect(findItem("fg-01")?.type).toBe("sentence-pick");
    expect(isReadingHostKind("literature")).toBe(true);
    expect(isReadingHostKind("writing")).toBe(false);
  });
});

describe("문학 활동 학생 화면: 정답 정보가 새지 않는다", () => {
  it("모든 문학 활동의 모든 문제", () => {
    for (const act of LITERATURE_ACTIVITIES) {
      const items = studentMediaItems(act.id);
      expect(items.length).toBe(act.itemIds.length);
      for (const it of items) {
        for (const key of FORBIDDEN) expect(it).not.toHaveProperty(key);
        const full = findItem(it.id)!;
        const json = JSON.stringify(it);
        expect(json).not.toContain(full.explanation);
        expect(json).not.toContain(full.principle);
        for (const h of full.hints) expect(json).not.toContain(h);
      }
    }
  });

  it("마음 온도: 인물·장면·마음 낱말(표시 순서)만", () => {
    for (const m of moodItems) {
      const s = studentMediaItems("mood-thermometer").find((i) => i.id === m.id)!;
      if (s.type !== "mood-scale") throw new Error("mood-scale");
      expect(Object.keys(s).sort()).toEqual(["character", "feelings", "id", "passageId", "prompt", "sceneParagraphId", "standardCode", "type"]);
      expect(s.feelings).toEqual(displayFeelings(m));
      expect([...s.feelings].sort()).toEqual([...m.feelingOptions].sort());
    }
  });

  it("순서 놓기: 사건 카드는 표시 순서이고 정답 순서가 아니다", () => {
    for (const q of seqItems) {
      const act = LITERATURE_ACTIVITIES.find((a) => a.itemIds.includes(q.id))!;
      const s = studentMediaItems(act.id).find((i) => i.id === q.id)!;
      if (s.type !== "sequence") throw new Error("sequence");
      expect(Object.keys(s).sort()).toEqual(["events", "id", "passageId", "prompt", "standardCode", "type"]);
      expect(s.events).toEqual(displayEvents(q));
      expect(s.events.map((e) => e.id)).not.toEqual(q.correctOrder);
      for (const e of s.events) expect(Object.keys(e).sort()).toEqual(["id", "text"]);
    }
  });

  it("내 한 줄: 안내와 최대 글자 수만", () => {
    const s = studentMediaItems("sensory").find((i) => i.id === "sn-05")!;
    expect(Object.keys(s).sort()).toEqual(["id", "maxChars", "passageId", "prompt", "standardCode", "type"]);
    if (s.type !== "own-line") throw new Error("own-line");
    expect(s.maxChars).toBe(OWN_LINE_MAX);
  });
});

describe("parseReadingAnswer: 문학 새 형식", () => {
  const m = mood("mt-01");
  const ok = { type: "mood-scale", value: 3, feeling: 0, evidenceId: "s1-3" };

  it("마음 온도: 1~5 정수, 낱말 번호 범위, 보이는 근거 문장", () => {
    expect(parseReadingAnswer(m, ok)).not.toBeNull();
    for (const v of [0, 6, 2.5, "3", null, undefined, NaN, -1]) expect(parseReadingAnswer(m, { ...ok, value: v })).toBeNull();
    for (const f of [-1, 4, 1.5, "0", null, undefined]) expect(parseReadingAnswer(m, { ...ok, feeling: f })).toBeNull();
    for (const e of ["zz", "", 3, null, undefined]) expect(parseReadingAnswer(m, { ...ok, evidenceId: e })).toBeNull();
    expect(parseReadingAnswer(m, { type: "choice", option: 0 })).toBeNull();
    expect(parseReadingAnswer(m, null)).toBeNull();
  });

  it("마음 온도: 낱말은 표시 번호 → 원래 번호, 정답 공개는 원래 → 표시로 왕복한다", () => {
    for (const item of moodItems) {
      const order = feelingOrder(item);
      item.feelingOptions.forEach((_, original) => {
        const d = toDisplayIndex(`${item.id}:f`, item.feelingOptions.length, original);
        expect(order[d]).toBe(original);
        expect(displayFeelings(item)[d]).toBe(item.feelingOptions[original]);
        const parsed = parseReadingAnswer(item, { type: "mood-scale", value: 4, feeling: d, evidenceId: item.evidenceIds[0] });
        expect(parsed).toEqual({ type: "mood-scale", value: 4, feeling: original, evidenceId: item.evidenceIds[0] });
        const shown = toDisplayAnswer(item, parsed!);
        expect(shown).toMatchObject({ type: "mood-scale", feeling: d });
      });
    }
  });

  it("순서 놓기: 문제의 사건만, 겹치지 않게(일부만은 통과)", () => {
    const q = seq("mt-06");
    expect(parseReadingAnswer(q, { type: "sequence", order: ["e1", "e2", "e3", "e4"] })).toEqual({ type: "sequence", order: ["e1", "e2", "e3", "e4"] });
    expect(parseReadingAnswer(q, { type: "sequence", order: ["e1", "e2"] })).not.toBeNull();
    expect(parseReadingAnswer(q, { type: "sequence", order: ["e1", "e1"] })).toBeNull();
    expect(parseReadingAnswer(q, { type: "sequence", order: ["e1", "e9"] })).toBeNull();
    expect(parseReadingAnswer(q, { type: "sequence", order: ["e1", "e2", "e3", "e4", "e1"] })).toBeNull();
    expect(parseReadingAnswer(q, { type: "sequence", order: [1, 2] })).toBeNull();
    expect(parseReadingAnswer(q, { type: "sequence", order: "e1" })).toBeNull();
    expect(parseReadingAnswer(q, { type: "sequence" })).toBeNull();
  });

  it("내 한 줄: 1000자까지 받는다(60자 제한은 안전 점검 뒤)", () => {
    const o = own("sn-05");
    expect(parseReadingAnswer(o, { type: "own-line", text: "  빗소리가 후두둑 들려요  " })).toEqual({ type: "own-line", text: "빗소리가 후두둑 들려요" });
    expect(parseReadingAnswer(o, { type: "own-line", text: "가".repeat(60) })).not.toBeNull();
    expect(parseReadingAnswer(o, { type: "own-line", text: "  " + "가".repeat(60) + "  " })).not.toBeNull();
    // 61자 이상도 1000자까지는 통과(안전 점검이 먼저), 1000자를 넘으면 거부
    expect(parseReadingAnswer(o, { type: "own-line", text: "가".repeat(120) })).not.toBeNull();
    expect(parseReadingAnswer(o, { type: "own-line", text: "가".repeat(1000) })).not.toBeNull();
    expect(parseReadingAnswer(o, { type: "own-line", text: "가".repeat(1001) })).toBeNull();
    expect(parseReadingAnswer(o, { type: "own-line", text: 5 })).toBeNull();
    expect(parseReadingAnswer(o, { type: "own-line" })).toBeNull();
    expect(parseReadingAnswer(o, { type: "choice", option: 0 })).toBeNull();
    // 빈 글은 통과해 기록 경로에서 안내만 한다
    expect(parseReadingAnswer(o, { type: "own-line", text: "   " })).toEqual({ type: "own-line", text: "" });
  });
});

describe("인물 관계도 재료", () => {
  it("푼 관계 문제의 선만 나온다", () => {
    expect(relationEdges([])).toEqual([]);
    expect(relationEdges(["cm-02", "mt-01"]).map((e) => e.itemId)).toEqual(["cm-02"]);
    expect(relationEdges(RELATION_ITEM_IDS)).toHaveLength(4);
  });
  it("관계 문제는 인물 관계도 활동의 선택+근거 문제이고 문제 글에 그 인물이 나온다", () => {
    const act = LITERATURE_ACTIVITIES.find((a) => a.id === "character-map")!;
    for (const e of relationEdges(RELATION_ITEM_IDS)) {
      const it = getLiteratureItem(e.itemId)!;
      expect(act.itemIds).toContain(it.id);
      expect(it.type).toBe("choice-with-evidence");
      expect(it.prompt).toContain(e.other);
    }
  });
});

// ───────── 서버 흐름(내장 DB, 메모리) ─────────
describe("문학 활동 서버 흐름", () => {
  type Rec = typeof import("@/lib/reading");
  type Sub = typeof import("@/lib/db").schema.submissions.$inferSelect;
  let rec: Rec;
  let dash: typeof import("@/lib/grammar-dashboard");
  let newSub: (activityId: string) => Promise<{ sub: Sub; studentId: number; assignmentId: number; number: number }>;
  let attemptsOf: (subId: number, itemId?: string) => Promise<{ itemId: string; reason: string | null; correct: boolean; feedbackLevel: string | null; answer: unknown }[]>;
  let allText: (subId: number) => Promise<string>;
  let classId: number;
  let n = 0;

  beforeAll(async () => {
    process.env.PGLITE_DIR = "memory://";
    delete process.env.DATABASE_URL;
    const { getDb, schema } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    rec = await import("@/lib/reading");
    dash = await import("@/lib/grammar-dashboard");
    const db = await getDb();
    const [t] = await db.insert(schema.teachers).values({ email: "t@example.test", displayName: "교사", passwordHash: "x" }).returning();
    const [c] = await db.insert(schema.classes).values({ teacherId: t.id, name: "4-1", grade: 4, joinCode: "ZZZZ2" }).returning();
    classId = c.id;
    newSub = async (activityId) => {
      n++;
      const [st] = await db.insert(schema.students).values({ classId: c.id, number: n, nickname: `별${n}`, pinHash: "x" }).returning();
      const [a] = await db
        .insert(schema.assignments)
        .values({
          classId: c.id, title: "문학", kind: "literature", activityId, genreId: "", standardCodes: ["4국05-01"],
          prompt: "p", organizer: [], rubric: [], coachEnabled: false,
        })
        .returning();
      const [sub] = await db.insert(schema.submissions).values({ assignmentId: a.id, studentId: st.id }).returning();
      return { sub, studentId: st.id, assignmentId: a.id, number: n };
    };
    attemptsOf = async (subId, itemId) =>
      (await db.select().from(schema.grammarAttempts).where(eq(schema.grammarAttempts.submissionId, subId)))
        .filter((r) => !itemId || r.itemId === itemId)
        .sort((x, y) => x.attemptNo - y.attemptNo);
    // 이 제출물과 관련된 모든 표(시도, 이벤트, 제출물)의 글을 한 덩어리로
    allText = async (subId) => {
      const attempts = await db.select().from(schema.grammarAttempts).where(eq(schema.grammarAttempts.submissionId, subId));
      const events = await db.select().from(schema.events);
      const subs = await db.select().from(schema.submissions).where(eq(schema.submissions.id, subId));
      return JSON.stringify({ attempts, events, subs });
    };
  });

  const send = async (ctx: { sub: Sub; studentId: number }, activityId: string, itemId: string, answer: unknown) => {
    const item = findItem(itemId)!;
    const parsed = parseReadingAnswer(item, answer);
    if (!parsed) throw new Error("parse");
    const out = await rec.recordReadingAnswer(ctx.sub, activityId, ctx.studentId, item, parsed);
    if (out.status !== 200) throw new Error(`status ${out.status}`);
    return out;
  };
  const moodAnswer = (item: MoodScaleItem, value: number, feeling = item.correctFeeling, evidenceId = item.evidenceIds[0]) => ({
    type: "mood-scale",
    value,
    feeling: toDisplayIndex(`${item.id}:f`, item.feelingOptions.length, feeling),
    evidenceId,
  });

  it("마음 온도: 범위 밖 값은 wrong-scale 안내, 범위 안이면 정답이고 마음 그래프 재료가 따라온다", async () => {
    const ctx = await newSub("mood-thermometer");
    const m = mt1();
    const bad = await send(ctx, "mood-thermometer", m.id, moodAnswer(m, 5));
    expect(bad.correct).toBe(false);
    expect(bad.feedback?.level).toBe("principle");
    expect(bad.feedback?.message).toContain("마음 온도를 다시 생각해 봐요");
    expect(bad.literature).toBeUndefined();
    const json = JSON.stringify(bad);
    for (const key of ["minOk", "maxOk", "correctFeeling", "evidenceIds"]) expect(json).not.toContain(key);
    // 낱말이 틀리면 wrong-option
    const otherFeeling = m.feelingOptions.findIndex((_, i) => i !== m.correctFeeling);
    const bad2 = await send(ctx, "mood-thermometer", m.id, moodAnswer(m, 2, otherFeeling));
    expect(bad2.correct).toBe(false);
    const good = await send(ctx, "mood-thermometer", m.id, moodAnswer(m, 2));
    expect(good.correct).toBe(true);
    expect(good.explanation).toContain(m.explanation);
    expect(good.literature?.mood).toEqual([{ sceneParagraphId: "p1", character: "하준", value: 2 }]);
    expect(good.literature?.relations.edges).toEqual([]);
    expect((await attemptsOf(ctx.sub.id, m.id)).map((r) => r.reason)).toEqual(["wrong-scale", "wrong-option", "ok"]);
    // 두 번째 장면까지 풀면 그래프가 장면 순서대로 둘
    const m2 = mood("mt-02");
    const out2 = await send(ctx, "mood-thermometer", m2.id, moodAnswer(m2, 1));
    expect(out2.literature?.mood.map((p) => [p.sceneParagraphId, p.value])).toEqual([["p1", 2], ["p2", 1]]);
    // 이미 푼 문제는 다시 풀 수 없다
    const item = findItem(m.id)!;
    const again = await rec.recordReadingAnswer(ctx.sub, "mood-thermometer", ctx.studentId, item, parseReadingAnswer(item, moodAnswer(m, 2))!);
    expect(again.status).toBe(409);
  });
  const mt1 = () => mood("mt-01");

  it("마음 온도: 네 번 틀리면 정답 공개(표시 번호로)이고 그래프에는 공개된 값이 들어간다", async () => {
    const ctx = await newSub("mood-thermometer");
    const m = mood("mt-03");
    let out;
    for (let i = 0; i < 4; i++) out = await send(ctx, "mood-thermometer", m.id, moodAnswer(m, 1));
    expect(out!.feedback?.level).toBe("reveal");
    const ans = out!.feedback!.reveal!.answer;
    if (ans.type !== "mood-scale") throw new Error("mood-scale");
    expect(ans.feeling).toBe(toDisplayIndex(`${m.id}:f`, m.feelingOptions.length, m.correctFeeling));
    expect(ans.value).toBeGreaterThanOrEqual(m.minOk);
    expect(ans.value).toBeLessThanOrEqual(m.maxOk);
    expect(m.evidenceIds).toContain(ans.evidenceId);
    expect(out!.literature?.mood).toEqual([{ sceneParagraphId: "p3", character: "하준", value: ans.value }]);
    expect(out!.rendered).toContain("마음 온도");
    // 다시 접속했을 때(literatureExtras)도 같다
    expect((await rec.literatureExtras(ctx.sub.id, "mood-thermometer")).mood).toEqual(out!.literature!.mood);
  });

  it("순서 놓기: 일부만 → 안내만(기록 없음), 틀린 순서 → 오답, 맞는 순서 → 정답", async () => {
    const ctx = await newSub("mood-thermometer");
    const q = seq("mt-06");
    const part = await send(ctx, "mood-thermometer", q.id, { type: "sequence", order: ["e1", "e2"] });
    expect(part.incomplete).toBe(true);
    expect(await attemptsOf(ctx.sub.id, q.id)).toHaveLength(0);
    const wrong = await send(ctx, "mood-thermometer", q.id, { type: "sequence", order: ["e2", "e1", "e3", "e4"] });
    expect(wrong.correct).toBe(false);
    expect(wrong.incomplete).toBeUndefined();
    expect(wrong.feedback?.level).toBe("principle");
    expect(JSON.stringify(wrong)).not.toContain("correctOrder");
    const right = await send(ctx, "mood-thermometer", q.id, { type: "sequence", order: [...q.correctOrder] });
    expect(right.correct).toBe(true);
    expect((await attemptsOf(ctx.sub.id, q.id)).map((r) => r.reason)).toEqual(["wrong-order", "ok"]);
  });

  it("인물 관계도: 관계 문제를 풀 때마다 선이 하나씩 늘어난다", async () => {
    const ctx = await newSub("character-map");
    const edges: number[] = [];
    for (const id of ["cm-01", "cm-02", "cm-03", "cm-04"]) {
      const item = getLiteratureItem(id)!;
      if (item.type !== "choice-with-evidence") throw new Error("cwe");
      const wrongOpt = item.options.findIndex((_, i) => i !== item.correctOption);
      const bad = await send(ctx, "character-map", id, {
        type: "choice-with-evidence", option: toDisplayIndex(id, item.options.length, wrongOpt), sentenceId: item.evidenceIds[0],
      });
      expect(bad.literature).toBeUndefined();
      const out = await send(ctx, "character-map", id, {
        type: "choice-with-evidence", option: toDisplayIndex(id, item.options.length, item.correctOption), sentenceId: item.evidenceIds[0],
      });
      expect(out.correct).toBe(true);
      edges.push(out.literature!.relations.edges.length);
      expect(out.literature!.mood).toEqual([]);
    }
    expect(edges).toEqual([1, 2, 3, 4]);
    const extras = await rec.literatureExtras(ctx.sub.id, "character-map");
    expect(extras.relations.main).toBe("지우");
    expect(extras.relations.edges.map((e) => e.other)).toEqual(["할머니", "서린이", "달수 할아버지", "도윤이"]);
    // 관계 문제가 아닌 문제는 그림 재료를 보내지 않는다
    const cm05 = getLiteratureItem("cm-05")!;
    if (cm05.type !== "choice-with-evidence") throw new Error("cwe");
    const o = await send(ctx, "character-map", "cm-05", {
      type: "choice-with-evidence", option: toDisplayIndex("cm-05", cm05.options.length, cm05.correctOption), sentenceId: cm05.evidenceIds[0],
    });
    expect(o.correct).toBe(true);
    expect(o.literature).toBeUndefined();
  });

  it("내 한 줄: 보통 글은 채점 없이 완료로 기록하고 글을 남긴다", async () => {
    const ctx = await newSub("sensory");
    const o = own("sn-05");
    const empty = await send(ctx, "sensory", o.id, { type: "own-line", text: "   " });
    expect(empty.incomplete).toBe(true);
    expect(await attemptsOf(ctx.sub.id, o.id)).toHaveLength(0);
    const out = await send(ctx, "sensory", o.id, { type: "own-line", text: "  비 냄새가 코끝에 시원하게 닿아요  " });
    expect(out.correct).toBe(true);
    expect(out.safety).toBeUndefined();
    expect(out.explanation).toContain("한 줄로 잘 표현했어요");
    const rows = await attemptsOf(ctx.sub.id, o.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ correct: true, reason: "ok", answer: { type: "own-line", text: "비 냄새가 코끝에 시원하게 닿아요" } });
  });

  it("내 한 줄: 힘든 일 언급은 돌봄 안내 + 알림, 글은 교사 맥락용으로만 남기고 완료로 세지 않는다", async () => {
    const ctx = await newSub("sensory");
    const o = own("sn-05");
    const out = await send(ctx, "sensory", o.id, { type: "own-line", text: "비가 오면 나는 죽고 싶어요" });
    expect(out.safety).toBe("distress");
    expect(out.correct).toBe(false);
    expect(out.message).toBeTruthy();
    const rows = await attemptsOf(ctx.sub.id, o.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ correct: false, reason: "distress", answer: { type: "own-line", text: "비가 오면 나는 죽고 싶어요", safety: "distress" } });
    // 알림은 교사 현황에 나온다
    const status = await dash.grammarStatus(ctx.assignmentId, classId, "sensory", "literature");
    const row = status.students.find((s) => s.studentId === ctx.studentId)!;
    expect(row.alert).toBe("distress");
    expect(row.solved).toBe(0);
    const line = status.summaries.find((s) => s.studentId === ctx.studentId && s.itemId === o.id)!;
    expect(line.kind).toBe("own-line");
    expect(line.attempts[0]).toMatchObject({ safety: "distress", text: "비가 오면 나는 죽고 싶어요" });
    // 고쳐 쓰면 완료
    const again = await send(ctx, "sensory", o.id, { type: "own-line", text: "비 오는 날 우산 소리가 좋아요" });
    expect(again.correct).toBe(true);
  });

  it("내 한 줄: 개인 정보는 안내만 하고 글을 어디에도 저장하지 않는다", async () => {
    const ctx = await newSub("sensory");
    const o = own("sn-05");
    const phone = "010-1234-5678";
    const text = `내 전화번호는 ${phone} 이에요`;
    const out = await send(ctx, "sensory", o.id, { type: "own-line", text });
    expect(out.safety).toBe("personal_info");
    expect(out.correct).toBe(false);
    expect(JSON.stringify(out)).not.toContain(phone);
    const rows = await attemptsOf(ctx.sub.id, o.id);
    expect(rows[0]).toMatchObject({ correct: false, reason: "personal_info", answer: { type: "own-line", text: "", safety: "personal_info" } });
    const dump = await allText(ctx.sub.id);
    expect(dump).not.toContain(phone);
    expect(dump).not.toContain("전화번호는");
    const status = await dash.grammarStatus(ctx.assignmentId, classId, "sensory", "literature");
    expect(status.students.find((s) => s.studentId === ctx.studentId)!.alert).toBe("personal_info");
    expect(JSON.stringify(status)).not.toContain(phone);
  });

  it("내 한 줄: 120자 힘든 일 글도 안전 점검이 먼저라 돌봄 안내 + 알림", async () => {
    const ctx = await newSub("sensory");
    const o = own("sn-05");
    const text = `${"비가 오는 날에는 괜히 마음이 무거워서 하루 종일 아무것도 하고 싶지 않아요. ".repeat(3)}그냥 죽고 싶어요`;
    expect(Array.from(text).length).toBeGreaterThan(100);
    const out = await send(ctx, "sensory", o.id, { type: "own-line", text });
    expect(out.safety).toBe("distress");
    expect(out.correct).toBe(false);
    expect((await attemptsOf(ctx.sub.id, o.id))[0]).toMatchObject({ reason: "distress", correct: false });
    const status = await dash.grammarStatus(ctx.assignmentId, classId, "sensory", "literature");
    expect(status.students.find((s) => s.studentId === ctx.studentId)!.alert).toBe("distress");
  });

  it("내 한 줄: 120자 개인 정보 글은 안내만 하고 저장하지 않는다", async () => {
    const ctx = await newSub("sensory");
    const phone = "010-9876-5432";
    const text = `${"비 오는 날 시장에 다녀온 이야기를 쓰고 싶어요. ".repeat(3)}제 전화번호는 ${phone} 이에요`;
    const out = await send(ctx, "sensory", "sn-05", { type: "own-line", text });
    expect(out.safety).toBe("personal_info");
    expect(await allText(ctx.sub.id)).not.toContain(phone);
  });

  it("내 한 줄: 안전한 120자 글은 too-long 안내만 하고 저장하지 않는다(틀린 횟수에도 안 센다)", async () => {
    const ctx = await newSub("sensory");
    const text = "비 오는 날 시장 골목에서 맡은 냄새와 들은 소리를 아주 길게 풀어서 쓰고 있어요 ".repeat(3);
    expect(Array.from(text.trim()).length).toBeGreaterThan(OWN_LINE_MAX);
    const out = await send(ctx, "sensory", "sn-05", { type: "own-line", text });
    expect(out.correct).toBe(false);
    expect(out.incomplete).toBe(true);
    expect(out.safety).toBeUndefined();
    expect(out.message).toBe("60자 안으로 줄여 써 볼까요?");
    expect(await attemptsOf(ctx.sub.id, "sn-05")).toHaveLength(0);
    expect(await allText(ctx.sub.id)).not.toContain("시장 골목");
  });

  it("교사 현황·CSV: scale_wrong_attempts, own_line_chars 열", async () => {
    const ctx = await newSub("mood-thermometer");
    const m = mood("mt-01");
    await send(ctx, "mood-thermometer", m.id, moodAnswer(m, 5));
    await send(ctx, "mood-thermometer", m.id, moodAnswer(m, 5));
    await send(ctx, "mood-thermometer", m.id, moodAnswer(m, 3));
    const csv = await dash.grammarCsv(ctx.assignmentId, classId, "mood-thermometer", "literature");
    const [header, ...lines] = csv.trim().split("\n");
    expect(header).toBe(
      "student_number,item_id,standard_code,attempts,first_try_correct,revealed,max_hint_level,seconds_to_solve,evidence_wrong_attempts,summary_coverage,summary_chars,scale_wrong_attempts,own_line_chars",
    );
    const cols = header.split(",");
    const rowOf = (id: string) => lines.map((l) => l.split(",")).find((c) => c[0] === String(ctx.number) && c[1] === id)!;
    expect(rowOf("mt-01")[cols.indexOf("scale_wrong_attempts")]).toBe("2");
    expect(rowOf("mt-01")[cols.indexOf("own_line_chars")]).toBe("");
    expect(rowOf("mt-06")[cols.indexOf("scale_wrong_attempts")]).toBe(""); // 마음 온도 문제가 아니다
    // 내 한 줄 글자 수(글 내용은 CSV에 없다)
    const s2 = await newSub("sensory");
    await send(s2, "sensory", "sn-05", { type: "own-line", text: "빗소리가 후두둑 들려요" });
    const csv2 = await dash.grammarCsv(s2.assignmentId, classId, "sensory", "literature");
    const c2 = csv2.trim().split("\n")[0].split(",");
    const r2 = csv2.trim().split("\n").slice(1).map((l) => l.split(",")).find((c) => c[0] === String(s2.number) && c[1] === "sn-05")!;
    expect(r2[c2.indexOf("own_line_chars")]).toBe("12");
    expect(r2[c2.indexOf("scale_wrong_attempts")]).toBe("");
    expect(csv2).not.toContain("빗소리");
    // 읽기 CSV에는 문학 전용 열이 없다
    const reading = await dash.grammarCsv(ctx.assignmentId, classId, "mood-thermometer", "reading");
    expect(reading.split("\n")[0]).not.toContain("scale_wrong_attempts");
  });
});
