import { beforeAll, describe, expect, it } from "vitest";
import {
  MEDIA_ACTIVITIES,
  MEDIA_ITEMS,
  displayQueries,
  displayResults,
  getMediaItem,
  mediaActivitiesForGrade,
  type SearchTaskItem,
} from "@/core/media";
import { optionOrder, toDisplayIndex } from "@/core/practice/shuffle";
import {
  parseReadingAnswer,
  searchViewFor,
  studentMediaItems,
  studentPassages,
  studentReadingView,
  toDisplayAnswer,
} from "@/lib/reading-rules";
import { findActivity, findItem } from "@/lib/activities";

const searchItems = MEDIA_ITEMS.filter((i): i is SearchTaskItem => i.type === "search-task");
const sl = getMediaItem("sl-01") as SearchTaskItem;
const FORBIDDEN = [
  "correctQuery", "correctResult", "evidenceIds", "correctSentenceIds", "answers", "correctOption",
  "principle", "hints", "explanation", "results", "paragraphs", "keyGroups", "topicHint",
];

describe("활동 조회", () => {
  it("읽기 활동과 매체 활동을 모두 찾는다", () => {
    expect(findActivity("source-detective")?.title).toBe("출처 탐정단");
    expect(findActivity("main-idea")).toBeDefined();
    expect(findItem("sl-01")?.type).toBe("search-task");
    expect(findItem("sd-01")).toBeDefined();
    expect(findItem("ma-01")).toBeDefined();
    expect(findItem("nope")).toBeUndefined();
  });
  it("학년별 매체 활동 목록", () => {
    expect(mediaActivitiesForGrade(4).map((a) => a.id)).toEqual(["source-detective", "search-lab-34", "media-ethics"]);
    expect(mediaActivitiesForGrade(6).map((a) => a.id)).toEqual(["search-lab-56", "fact-check"]);
  });
});

describe("매체 활동 학생 화면: 정답 정보가 새지 않는다", () => {
  it("모든 매체 활동의 모든 문제", () => {
    for (const act of MEDIA_ACTIVITIES) {
      const items = studentMediaItems(act.id);
      expect(items.length).toBe(act.itemIds.length);
      for (const it of items) {
        for (const key of FORBIDDEN) expect(it).not.toHaveProperty(key);
        const full = findItem(it.id)!;
        const json = JSON.stringify(it);
        expect(json).not.toContain(full.explanation);
        expect(json).not.toContain(full.principle);
        for (const h of full.hints) expect(json).not.toContain(h);
        if (full.type === "search-task") {
          // 검색 결과 글은 처음에 하나도 보내지 않는다(검색어 글만)
          for (const q of full.queries) for (const r of q.results) {
            expect(json).not.toContain(r.title);
            expect(json).not.toContain(r.snippet);
          }
          expect(json).not.toMatch(/r\d-(title|site|snippet|date|ad)/);
        }
      }
      const view = studentReadingView(act.id, new Set());
      expect(JSON.stringify(view.items)).not.toContain("evidenceIds");
    }
  });

  it("검색 실험실 문제 모양: 목적·안내·검색어(표시 순서)만", () => {
    for (const it of searchItems) {
      const s = studentMediaItems(findActivityOf(it.id))[studentIndex(it.id)];
      expect(Object.keys(s).sort()).toEqual(["id", "prompt", "purpose", "queries", "standardCode", "type"]);
      if (s.type !== "search-task") throw new Error("search-task");
      expect(s.queries.map((q) => q.text)).toEqual(displayQueries(it).map((d) => d.query.text));
      for (const q of s.queries) expect(Object.keys(q)).toEqual(["text"]);
    }
  });

  it("지문은 문제가 쓰는 가상 페이지·이야기만 보낸다(검색 실험실은 지문 없음)", () => {
    expect(studentPassages("search-lab-34")).toEqual([]);
    expect(studentPassages("source-detective").map((p) => p.id).sort()).toEqual(
      ["sd-frog-a", "sd-frog-b", "sd-frog-c", "sd-leaf-a", "sd-leaf-b", "sd-leaf-c"],
    );
    for (const p of studentPassages("source-detective")) expect(p.page).toBeDefined();
    for (const p of studentPassages("media-ethics")) expect(p.page).toBeUndefined();
  });
});

function findActivityOf(itemId: string): string {
  return MEDIA_ACTIVITIES.find((a) => a.itemIds.includes(itemId))!.id;
}
function studentIndex(itemId: string): number {
  return MEDIA_ACTIVITIES.find((a) => a.itemIds.includes(itemId))!.itemIds.indexOf(itemId);
}

describe("검색 실험실: 표시 번호 ↔ 원래 번호", () => {
  it("검색어와 결과의 섞기는 `${id}:q`, `${id}:r` 키를 쓰고 왕복해도 같다", () => {
    for (const it of searchItems) {
      const qOrder = optionOrder(`${it.id}:q`, it.queries.length);
      it.queries.forEach((q, original) => {
        const d = toDisplayIndex(`${it.id}:q`, it.queries.length, original);
        expect(qOrder[d]).toBe(original);
        // 표시 번호로 보낸 검색어가 원래 번호로 돌아온다
        const parsed = parseReadingAnswer(it, { type: "search-task", query: d });
        expect(parsed).toEqual({ type: "search-task", query: original });
        q.results.forEach((_, ro) => {
          const rd = toDisplayIndex(`${it.id}:r`, q.results.length, ro);
          expect(displayResults(it, original)[rd].index).toBe(ro);
          expect(parseReadingAnswer(it, { type: "search-task", query: d, result: rd })).toEqual({ type: "search-task", query: original, result: ro });
        });
      });
    }
  });

  it("toDisplayAnswer는 원래 번호의 정답을 표시 번호로 바꾼다", () => {
    for (const it of searchItems) {
      const shown = toDisplayAnswer(it, { type: "search-task", query: it.correctQuery, result: it.correctResult, evidenceId: it.evidenceIds[0] });
      if (shown.type !== "search-task") throw new Error("search-task");
      const back = parseReadingAnswer(it, { type: "search-task", query: shown.query, result: shown.result, evidenceId: shown.evidenceId });
      expect(back).toEqual({ type: "search-task", query: it.correctQuery, result: it.correctResult, evidenceId: it.evidenceIds[0] });
    }
  });
});

describe("parseReadingAnswer: 검색 실험실", () => {
  const n = sl.queries.length;
  it("검색어만(1단계)은 통과", () => {
    expect(parseReadingAnswer(sl, { type: "search-task", query: 0 })).not.toBeNull();
  });
  it("범위 밖·정수가 아닌 번호는 거부", () => {
    for (const bad of [-1, n, 99, 1.5, "1", null, undefined, NaN]) {
      expect(parseReadingAnswer(sl, { type: "search-task", query: bad })).toBeNull();
    }
    const m = sl.queries[0].results.length;
    for (const bad of [-1, m + 5, 0.5, "0", null]) {
      expect(parseReadingAnswer(sl, { type: "search-task", query: 0, result: bad })).toBeNull();
    }
  });
  it("근거는 결과를 고른 뒤에만, 글이어야 한다", () => {
    expect(parseReadingAnswer(sl, { type: "search-task", query: 0, evidenceId: "r1-site" })).toBeNull();
    expect(parseReadingAnswer(sl, { type: "search-task", query: 0, result: 0, evidenceId: 3 })).toBeNull();
    expect(parseReadingAnswer(sl, { type: "search-task", query: 0, result: 0, evidenceId: "x".repeat(60) })).toBeNull();
    expect(parseReadingAnswer(sl, { type: "search-task", query: 0, result: 0, evidenceId: "zz" })).not.toBeNull(); // 채점에서 incomplete
  });
  it("다른 형식의 답·값은 거부", () => {
    expect(parseReadingAnswer(sl, { type: "choice", option: 0 })).toBeNull();
    expect(parseReadingAnswer(sl, null)).toBeNull();
    expect(parseReadingAnswer(sl, "x")).toBeNull();
    const ch = findItem("ma-01")!;
    expect(parseReadingAnswer(ch, { type: "search-task", query: 0 })).toBeNull();
  });
});

describe("searchViewFor: 고른 검색어의 결과만", () => {
  it("그 검색어의 결과만 표시 순서로, 정답 정보 없이", () => {
    for (const it of searchItems) {
      it.queries.forEach((q, original) => {
        const v = searchViewFor(it, original)!;
        expect(v.query).toBe(toDisplayIndex(`${it.id}:q`, it.queries.length, original));
        expect(v.results.map((r) => r.id)).toEqual(displayResults(it, original).map((d) => d.result.id));
        const json = JSON.stringify(v);
        for (const key of ["correctQuery", "correctResult", "evidenceIds", "principle", "hints", "explanation"]) expect(json).not.toContain(key);
        // 보내는 글은 모두 이 검색어의 결과에서 온 것이다(다른 검색어의 결과는 없다)
        const own = new Set(q.results.map((r) => r.title));
        for (const r of v.results) expect(own.has(r.title)).toBe(true);
        expect(v.results).toHaveLength(q.results.length);
        for (const r of v.results) expect(r.fields.length).toBeGreaterThanOrEqual(3);
      });
    }
    expect(searchViewFor(sl, 99)).toBeUndefined();
  });
});

// ───────── 서버 흐름(내장 DB, 메모리) ─────────
describe("검색 실험실 서버 흐름", () => {
  type Rec = typeof import("@/lib/reading");
  let rec: Rec;
  let subm: typeof import("@/lib/db").schema.submissions.$inferSelect;
  let studentId: number;
  let attemptsOf: (itemId: string) => Promise<{ reason: string | null; correct: boolean; feedbackLevel: string | null; answer: unknown }[]>;

  beforeAll(async () => {
    process.env.PGLITE_DIR = "memory://";
    delete process.env.DATABASE_URL;
    const { getDb, schema } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    rec = await import("@/lib/reading");
    const db = await getDb();
    const [t] = await db.insert(schema.teachers).values({ email: "t@example.test", displayName: "교사", passwordHash: "x" }).returning();
    const [c] = await db.insert(schema.classes).values({ teacherId: t.id, name: "4-1", grade: 4, joinCode: "ZZZZ1" }).returning();
    const [st] = await db.insert(schema.students).values({ classId: c.id, number: 1, nickname: "별", pinHash: "x" }).returning();
    studentId = st.id;
    const [a] = await db
      .insert(schema.assignments)
      .values({
        classId: c.id, title: "검색", kind: "media", activityId: "search-lab-34", genreId: "", standardCodes: ["4국06-01"],
        prompt: "p", organizer: [], rubric: [], coachEnabled: false,
      })
      .returning();
    [subm] = await db.insert(schema.submissions).values({ assignmentId: a.id, studentId: st.id }).returning();
    attemptsOf = async (itemId) =>
      (await db.select().from(schema.grammarAttempts).where(eq(schema.grammarAttempts.submissionId, subm.id)))
        .filter((r) => r.itemId === itemId)
        .sort((x, y) => x.attemptNo - y.attemptNo);
  });

  const send = (item: SearchTaskItem, answer: unknown) => {
    const parsed = parseReadingAnswer(item, answer);
    if (!parsed) throw new Error("parse");
    return rec.recordReadingAnswer(subm, "search-lab-34", studentId, item, parsed);
  };
  const dq = (item: SearchTaskItem, original: number) => toDisplayIndex(`${item.id}:q`, item.queries.length, original);
  const dr = (item: SearchTaskItem, q: number, original: number) => toDisplayIndex(`${item.id}:r`, item.queries[q].results.length, original);

  it("알맞지 않은 검색어: 그 검색어의 결과만 돌려주고 틀린 횟수에 센다", async () => {
    const item = getMediaItem("sl-01") as SearchTaskItem;
    const wrongQ = item.queries.findIndex((_, i) => i !== item.correctQuery);
    const out = await send(item, { type: "search-task", query: dq(item, wrongQ) });
    if (out.status !== 200) throw new Error("200");
    expect(out.correct).toBe(false);
    expect(out.incomplete).toBeUndefined();
    expect(out.feedback?.level).toBe("principle");
    expect(out.feedback?.message).toContain("결과가 내 목적과 맞나요?");
    const titles = out.search!.results.map((r) => r.title).sort();
    expect(titles).toEqual(item.queries[wrongQ].results.map((r) => r.title).sort());
    expect(out.search!.query).toBe(dq(item, wrongQ));
    const json = JSON.stringify(out);
    expect(json).not.toContain(item.explanation);
    expect(json).not.toContain("evidenceIds");
    const rows = await attemptsOf(item.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("wrong-query");
    expect((rows[0].answer as { query: number }).query).toBe(wrongQ); // 원래 번호로 저장
  });

  it("알맞은 검색어인데 결과를 안 골랐으면: 알맞은 검색어의 결과, 시도로 세지 않는다", async () => {
    const item = getMediaItem("sl-01") as SearchTaskItem;
    const before = (await attemptsOf(item.id)).length;
    const out = await send(item, { type: "search-task", query: dq(item, item.correctQuery) });
    if (out.status !== 200) throw new Error("200");
    expect(out.incomplete).toBe(true);
    expect(out.correct).toBe(false);
    expect(out.feedback).toBeUndefined();
    expect(out.search!.results.map((r) => r.title).sort()).toEqual(item.queries[item.correctQuery].results.map((r) => r.title).sort());
    expect(await attemptsOf(item.id)).toHaveLength(before);
  });

  it("알맞은 결과인데 근거 칸이 틀리면 evidence-wrong, 결과가 틀리면 wrong-result", async () => {
    const item = getMediaItem("sl-01") as SearchTaskItem;
    const q = item.correctQuery;
    const badResult = item.queries[q].results.findIndex((_, i) => i !== item.correctResult);
    let out = await send(item, { type: "search-task", query: dq(item, q), result: dr(item, q, badResult), evidenceId: `${item.queries[q].results[badResult].id}-site` });
    if (out.status !== 200) throw new Error("200");
    expect(out.correct).toBe(false);
    expect(out.feedback?.level).toBe("hint1");
    expect(out.search).toBeUndefined();
    const good = item.queries[q].results[item.correctResult];
    const wrongField = `${good.id}-title`;
    expect(item.evidenceIds).not.toContain(wrongField);
    out = await send(item, { type: "search-task", query: dq(item, q), result: dr(item, q, item.correctResult), evidenceId: wrongField });
    if (out.status !== 200) throw new Error("200");
    expect(out.correct).toBe(false);
    expect(out.feedback?.level).toBe("hint2");
    const reasons = (await attemptsOf(item.id)).map((r) => r.reason);
    expect(reasons).toEqual(["wrong-query", "wrong-result", "evidence-wrong"]);
  });

  it("끝까지 맞으면 정답 처리", async () => {
    const item = getMediaItem("sl-01") as SearchTaskItem;
    const q = item.correctQuery;
    const out = await send(item, {
      type: "search-task", query: dq(item, q), result: dr(item, q, item.correctResult), evidenceId: item.evidenceIds[0],
    });
    if (out.status !== 200) throw new Error("200");
    expect(out.correct).toBe(true);
    expect(out.explanation).toContain(item.explanation);
    const again = await send(item, { type: "search-task", query: 0 });
    expect(again.status).toBe(409);
  });

  it("네 번 틀리면 정답 공개: 알맞은 검색어의 결과와 표시 번호의 정답을 준다", async () => {
    const item = getMediaItem("sl-02") as SearchTaskItem;
    const wrongQ = item.queries.findIndex((_, i) => i !== item.correctQuery);
    let out;
    for (let i = 0; i < 4; i++) out = await send(item, { type: "search-task", query: dq(item, wrongQ) });
    if (!out || out.status !== 200) throw new Error("200");
    expect(out.feedback?.level).toBe("reveal");
    expect(out.search!.query).toBe(dq(item, item.correctQuery));
    expect(out.search!.results.map((r) => r.title).sort()).toEqual(item.queries[item.correctQuery].results.map((r) => r.title).sort());
    const ans = out.feedback!.reveal!.answer;
    if (ans.type !== "search-task") throw new Error("search-task");
    expect(ans.query).toBe(dq(item, item.correctQuery));
    expect(ans.result).toBe(dr(item, item.correctQuery, item.correctResult));
    expect(item.evidenceIds).toContain(ans.evidenceId);
    // 표시 번호의 결과 카드가 정답 결과다
    expect(out.search!.results[ans.result!].id).toBe(item.queries[item.correctQuery].results[item.correctResult].id);
    expect((await attemptsOf(item.id)).at(-1)!.feedbackLevel).toBe("reveal");
  });
});
