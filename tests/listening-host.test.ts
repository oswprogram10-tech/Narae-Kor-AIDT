import { beforeAll, describe, expect, it } from "vitest";
import { LISTENING_ACTIVITIES, LISTENING_ITEMS, correctListeningAnswerOf } from "@/core/listening";
import { toDisplayIndex } from "@/core/practice/shuffle";
import { parseReadingAnswer, studentMediaItems, studentPassages } from "@/lib/reading-rules";
import { findActivity, findItem, isReadingHostKind } from "@/lib/activities";
import { EMPTY_USAGE, USAGE_MAX, parseListeningUsage, sumListeningUsage } from "@/lib/listening-rules";

const FORBIDDEN = ["correctOption", "correctSentenceIds", "evidenceIds", "answers", "principle", "hints", "explanation"];

describe("듣기 활동 조회", () => {
  it("활동·문제를 찾고 읽기 화면을 쓰는 과제 종류로 인정한다", () => {
    for (const a of LISTENING_ACTIVITIES) {
      expect(findActivity(a.id)?.title).toBe(a.title);
      for (const id of a.itemIds) expect(findItem(id)).toBeDefined();
    }
    expect(isReadingHostKind("listening")).toBe(true);
    expect(isReadingHostKind("debate")).toBe(false);
  });
});

describe("듣기 활동 학생 화면: 정답 정보가 새지 않는다", () => {
  it("모든 활동의 모든 문제", () => {
    for (const act of LISTENING_ACTIVITIES) {
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

  it("보기는 섞은 순서로 가고, 답은 표시 번호에서 원래 번호로 되돌린다", () => {
    for (const item of LISTENING_ITEMS) {
      if (item.type !== "choice" && item.type !== "choice-with-evidence") continue;
      const shown = studentMediaItems(LISTENING_ACTIVITIES.find((a) => a.itemIds.includes(item.id))!.id).find((i) => i.id === item.id)!;
      if (shown.type !== "choice" && shown.type !== "choice-with-evidence") throw new Error("choice");
      expect([...shown.options].sort()).toEqual([...item.options].sort());
      const d = toDisplayIndex(item.id, item.options.length, item.correctOption);
      expect(shown.options[d]).toBe(item.options[item.correctOption]);
      const raw = item.type === "choice" ? { type: "choice", option: d } : { type: "choice-with-evidence", option: d, sentenceId: item.evidenceIds[0] };
      const parsed = parseReadingAnswer(item, raw);
      expect(parsed).toMatchObject({ option: item.correctOption });
    }
  });

  it("듣기 자료(지문)에는 말한 사람이 들어 있다", () => {
    for (const act of LISTENING_ACTIVITIES) {
      const passages = studentPassages(act.id);
      expect(passages.length).toBe(act.passageIds.length);
      for (const p of passages) for (const para of p.paragraphs) expect(para.speaker).toBeTruthy();
    }
  });

  it("정답으로 만든 답은 형식 검사를 통과한다", () => {
    for (const item of LISTENING_ITEMS) {
      const ans = correctListeningAnswerOf(item);
      if (ans.type === "choice" || ans.type === "choice-with-evidence") {
        const d = toDisplayIndex(item.id, (item as { options: string[] }).options.length, ans.option);
        expect(parseReadingAnswer(item, { ...ans, option: d })).not.toBeNull();
      } else {
        expect(parseReadingAnswer(item, ans)).not.toBeNull();
      }
    }
  });
});

describe("듣기 연구 기록 검사", () => {
  it("숫자만 받고 0~1000으로 자른다", () => {
    expect(parseListeningUsage({ listen_plays: 3, line_replays: 2, transcript_views: 1 })).toEqual({ listen_plays: 3, line_replays: 2, transcript_views: 1 });
    expect(parseListeningUsage({ listen_plays: 5000, line_replays: -4, transcript_views: 2.9 })).toEqual({ listen_plays: USAGE_MAX, line_replays: 0, transcript_views: 2 });
    expect(parseListeningUsage({ listen_plays: "9", line_replays: null, transcript_views: NaN })).toBeNull();
    expect(parseListeningUsage({ listen_plays: Infinity, line_replays: 1 })).toEqual({ listen_plays: 0, line_replays: 1, transcript_views: 0 });
    for (const bad of [null, undefined, 3, "x", [], [1, 2]]) expect(parseListeningUsage(bad)).toBeNull();
    expect(parseListeningUsage({})).toBeNull();
  });

  it("증가분을 더하되 한 칸은 1000을 넘기지 않고, 문제를 고를 수 있다", () => {
    const metas = [
      { itemId: "a", listen_plays: 1, line_replays: 2, transcript_views: 0 },
      { itemId: "b", listen_plays: 4, line_replays: 0, transcript_views: 1 },
      { itemId: "a", listen_plays: 600, line_replays: 0, transcript_views: 0 },
      null,
    ];
    expect(sumListeningUsage(metas, "a")).toEqual({ listen_plays: 601, line_replays: 2, transcript_views: 0 });
    expect(sumListeningUsage(metas, "b")).toEqual({ listen_plays: 4, line_replays: 0, transcript_views: 1 });
    expect(sumListeningUsage(metas).listen_plays).toBe(605);
    expect(sumListeningUsage([{ itemId: "a", listen_plays: 900 }, { itemId: "a", listen_plays: 900 }]).listen_plays).toBe(USAGE_MAX);
    expect(sumListeningUsage([])).toEqual(EMPTY_USAGE);
  });
});

describe("듣기 활동 교사 현황·CSV", () => {
  type Dash = typeof import("@/lib/grammar-dashboard");
  let dash: Dash;
  let rec: typeof import("@/lib/reading");
  let log: typeof import("@/lib/events").logEvent;
  let classId: number;
  let assignmentId: number;
  const subs: { id: number; studentId: number; number: number }[] = [];
  const ACT = LISTENING_ACTIVITIES[2]; // listen-infer

  beforeAll(async () => {
    process.env.PGLITE_DIR = "memory://";
    delete process.env.DATABASE_URL;
    const { getDb, schema } = await import("@/lib/db");
    dash = await import("@/lib/grammar-dashboard");
    rec = await import("@/lib/reading");
    log = (await import("@/lib/events")).logEvent;
    const db = await getDb();
    const [t] = await db.insert(schema.teachers).values({ email: "t@example.test", displayName: "교사", passwordHash: "x" }).returning();
    const [c] = await db.insert(schema.classes).values({ teacherId: t.id, name: "6-1", grade: 6, joinCode: "LLLL11" }).returning();
    classId = c.id;
    const [a] = await db
      .insert(schema.assignments)
      .values({ classId, title: "듣기", kind: "listening", activityId: ACT.id, genreId: "", standardCodes: [ACT.standardCode], prompt: "p", organizer: [], rubric: [], coachEnabled: false })
      .returning();
    assignmentId = a.id;
    for (const number of [1, 2]) {
      const [st] = await db.insert(schema.students).values({ classId, number, nickname: `별${number}`, pinHash: "x" }).returning();
      const [sub] = await db.insert(schema.submissions).values({ assignmentId, studentId: st.id }).returning();
      subs.push({ id: sub.id, studentId: st.id, number });
    }
  });

  it("채점은 읽기와 같고, 정답이면 푼 문제로 센다", async () => {
    const { getDb, schema } = await import("@/lib/db");
    const db = await getDb();
    const [sub] = await db.select().from(schema.submissions).where((await import("drizzle-orm")).eq(schema.submissions.id, subs[0].id));
    const item = findItem(ACT.itemIds[0])!;
    const ans = correctListeningAnswerOf(item as (typeof LISTENING_ITEMS)[number]);
    const shown = ans.type === "choice" || ans.type === "choice-with-evidence" ? { ...ans, option: toDisplayIndex(item.id, (item as { options: string[] }).options.length, ans.option) } : ans;
    const out = await rec.recordReadingAnswer(sub, ACT.id, subs[0].studentId, item, parseReadingAnswer(item, shown)!);
    expect(out.status).toBe(200);
    if (out.status === 200) expect(out.correct).toBe(true);
  });

  it("학생별 들은 횟수·글로 보기가 현황에 나오고, CSV에는 문제별 세 열이 붙는다", async () => {
    const first = ACT.itemIds[0];
    const second = ACT.itemIds[1];
    await log("student:1", "listening_usage", "submission", subs[0].id, { itemId: first, listen_plays: 2, line_replays: 3, transcript_views: 1 });
    await log("student:1", "listening_usage", "submission", subs[0].id, { itemId: first, listen_plays: 1, line_replays: 0, transcript_views: 0 });
    await log("student:1", "listening_usage", "submission", subs[0].id, { itemId: second, listen_plays: 0, line_replays: 4, transcript_views: 2 });

    const status = await dash.grammarStatus(assignmentId, classId, ACT.id, "listening");
    const s1 = status.students.find((s) => s.number === 1)!;
    const s2 = status.students.find((s) => s.number === 2)!;
    expect(s1.listening).toEqual({ heard: 10, plays: 3, replays: 7, views: 3 });
    expect(s2.listening).toEqual({ heard: 0, plays: 0, replays: 0, views: 0 });

    const csv = await dash.grammarCsv(assignmentId, classId, ACT.id, "listening");
    const [header, ...lines] = csv.trim().split("\n");
    const cols = header.split(",");
    expect(cols.slice(-3)).toEqual(["listen_plays", "line_replays", "transcript_views"]);
    const row = (n: number, id: string) => lines.map((l) => l.split(",")).find((c) => c[0] === String(n) && c[1] === id)!;
    expect(row(1, first).slice(-3)).toEqual(["3", "3", "1"]);
    expect(row(1, second).slice(-3)).toEqual(["0", "4", "2"]);
    expect(row(2, first).slice(-3)).toEqual(["0", "0", "0"]);
  });

  it("읽기 활동의 CSV에는 듣기 열이 없다", async () => {
    const csv = await dash.grammarCsv(assignmentId, classId, ACT.id, "reading");
    expect(csv.split("\n")[0]).not.toContain("listen_plays");
    const st = await dash.grammarStatus(assignmentId, classId, ACT.id, "reading");
    expect(st.students[0].listening).toBeUndefined();
  });
});
