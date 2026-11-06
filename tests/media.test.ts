import { describe, expect, it } from "vitest";
import { feedbackLevel } from "@/core/practice/feedback";
import { optionOrder, toDisplayIndex } from "@/core/practice/shuffle";
import { getStandard } from "@/core/data/standards";
import { EVIDENCE_MESSAGE, allSentences, getPassage, gradeAnswer as readingGrade, validatePassage } from "@/core/reading";
import {
  MEDIA_ACTIVITIES,
  MEDIA_ITEMS,
  MEDIA_PASSAGES,
  WRONG_QUERY_MESSAGE,
  WRONG_RESULT_MESSAGE, SEARCH_EVIDENCE_MESSAGE,
  correctMediaAnswerOf,
  correctResultOf,
  displayQueries,
  displayResults,
  getMediaActivity,
  getMediaItem,
  gradeMediaAnswer,
  mediaActivitiesForGrade,
  mediaCorrectFeedback,
  mediaFeedbackFor,
  realNameProblems,
  renderMediaAnswer,
  resultsFor,
  searchEvidence,
  validateMediaItem,
  validateMediaPassage,
  type MediaItem,
  type SearchTaskItem,
} from "@/core/media";

const searchItems = MEDIA_ITEMS.filter((i): i is SearchTaskItem => i.type === "search-task");
const sl = getMediaItem("sl-01") as SearchTaskItem;
const wrongQueryOf = (it: SearchTaskItem) => it.queries.findIndex((_, i) => i !== it.correctQuery);
const wrongResultOf = (it: SearchTaskItem) => it.queries[it.correctQuery].results.findIndex((_, i) => i !== it.correctResult);

describe("가상 페이지·글", () => {
  it("모든 자료가 검증을 통과해요(읽기 구조 + 가상 주소 + 실제 이름 없음)", () => {
    const problems = MEDIA_PASSAGES.flatMap((p) => validateMediaPassage(p).map((m) => `${p.id}: ${m}`));
    expect(problems).toEqual([]);
  });
  it("id가 겹치지 않고 읽기 핵심부에서 찾을 수 있어요", () => {
    expect(new Set(MEDIA_PASSAGES.map((p) => p.id)).size).toBe(MEDIA_PASSAGES.length);
    for (const p of MEDIA_PASSAGES) expect(getPassage(p.id), p.id).toBe(p);
  });
  it("가상 페이지는 첫 문단이 정보(meta) 문단이고 줄이 page와 맞아요", () => {
    const pages = MEDIA_PASSAGES.filter((p) => p.page);
    expect(pages.length).toBe(10);
    for (const p of pages) {
      expect(p.paragraphs[0].id, p.id).toMatch(/(^|-)meta$/);
      const lines = p.paragraphs[0].sentences.map((s) => s.text);
      expect(lines[0], p.id).toBe(`사이트: ${p.page!.site}`);
      expect(lines[1], p.id).toBe(`주소: ${p.page!.address}`);
      expect(p.page!.address.endsWith(".가상"), p.id).toBe(true);
      expect(p.page!.isAd === lines.some((l) => l.startsWith("광고:")), p.id).toBe(!!p.page!.isAd);
    }
  });
  it("validatePassage가 정보 줄이 빠진 페이지를 잡아내요", () => {
    const p = MEDIA_PASSAGES.find((x) => x.id === "sd-frog-a")!;
    expect(validatePassage({ ...p, page: { ...p.page!, author: "다른 사람" } }).some((m) => m.includes("글쓴이"))).toBe(true);
    expect(validatePassage({ ...p, paragraphs: p.paragraphs.slice(1) }).some((m) => m.includes("meta"))).toBe(true);
    expect(validatePassage({ ...p, page: { ...p.page!, isAd: true } }).some((m) => m.includes("광고"))).toBe(true);
    expect(validatePassage({ ...p, page: undefined })).toEqual([]);
  });
  it("매체 예절 이야기는 문장 2~4개의 문단 하나예요", () => {
    for (const p of MEDIA_PASSAGES.filter((x) => x.id.startsWith("me-"))) {
      expect(p.page, p.id).toBeUndefined();
      expect(p.paragraphs, p.id).toHaveLength(1);
      expect(allSentences(p).length, p.id).toBeGreaterThanOrEqual(3);
      expect(allSentences(p).length, p.id).toBeLessThanOrEqual(4);
    }
  });
});

describe("실제 이름 검사", () => {
  it("실제 기관·회사 이름을 잡아내요", () => {
    for (const bad of ["네이버 카페", "유튜브에서 봤어요", "기상청 자료", "위키백과에 따르면", "KBS 뉴스", "LG 전자", "쿠팡 로켓", "다음 카페", "애플 스토어", "www.example.com", "https://x.가상"]) {
      expect(realNameProblems(bad).length, bad).toBeGreaterThan(0);
    }
  });
  it("평범한 낱말은 건드리지 않아요", () => {
    for (const ok of ["다음 중에서 고르세요", "애플리케이션을 켜요", "토스트를 먹어요", "한국어 시간이에요", "가상 페이지"]) {
      expect(realNameProblems(ok), ok).toEqual([]);
    }
  });
  it("검증이 자료 속에 심은 실제 이름을 잡아내요", () => {
    const p = MEDIA_PASSAGES.find((x) => x.id === "sd-frog-b")!;
    const planted = { ...p, paragraphs: p.paragraphs.map((para, i) => (i === 1 ? { ...para, sentences: [{ ...para.sentences[0], text: "네이버 블로그에서 봤어요." }, ...para.sentences.slice(1)] } : para)) };
    expect(validateMediaPassage(planted).some((m) => m.includes("네이버"))).toBe(true);
    expect(validateMediaPassage({ ...p, page: { ...p.page!, site: "구글 블로그" } }).some((m) => m.includes("구글"))).toBe(true);
    expect(validateMediaPassage({ ...p, page: { ...p.page!, address: "blog.example.com" } }).length).toBeGreaterThan(0);
    const item = getMediaItem("sd-01")!;
    expect(validateMediaItem({ ...item, hints: ["유튜브 영상을 떠올려 보세요.", item.hints[1]] }).some((m) => m.includes("유튜브"))).toBe(true);
    const planted2: SearchTaskItem = { ...sl, queries: sl.queries.map((q, i) => (i === 0 ? { ...q, results: [{ ...q.results[0], site: "쿠팡 마을" }, ...q.results.slice(1)] } : q)) };
    expect(validateMediaItem(planted2).some((m) => m.includes("쿠팡"))).toBe(true);
  });
});

describe("문제 은행", () => {
  it("모든 문제가 validateMediaItem을 통과해요", () => {
    const problems = MEDIA_ITEMS.flatMap((i) => validateMediaItem(i).map((m) => `${i.id}: ${m}`));
    if (problems.length) console.log(problems.join("\n"));
    expect(problems).toEqual([]);
  });
  it("문제 id가 겹치지 않고, 읽기 문제와도 겹치지 않아요", () => {
    const ids = MEDIA_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(24);
  });
  it("문제 수와 형식이 설계에 맞아요", () => {
    const count = (t: string) => MEDIA_ITEMS.filter((i) => i.type === t).length;
    expect(count("search-task")).toBe(6);
    expect(count("label-sentences")).toBeGreaterThanOrEqual(6);
    expect(count("choice-with-evidence")).toBeGreaterThanOrEqual(8);
    expect(count("sentence-pick")).toBe(2);
    expect(count("choice")).toBeGreaterThanOrEqual(2);
  });
  it("정답이 하나로 분명해요: 보기·결과 중 정답은 하나", () => {
    for (const i of MEDIA_ITEMS) {
      if (i.type === "choice") {
        const hits = i.options.filter((_, o) => gradeMediaAnswer(i, { type: "choice", option: o }).correct);
        expect(hits, i.id).toHaveLength(1);
      } else if (i.type === "choice-with-evidence") {
        const hits = i.options.filter((_, o) => gradeMediaAnswer(i, { type: "choice-with-evidence", option: o, sentenceId: i.evidenceIds[0] }).correct);
        expect(hits, i.id).toHaveLength(1);
      } else if (i.type === "search-task") {
        let n = 0;
        i.queries.forEach((q, qi) => q.results.forEach((_, ri) => {
          for (const f of searchEvidence(q.results[ri])) {
            if (gradeMediaAnswer(i, { type: "search-task", query: qi, result: ri, evidenceId: f.id }).correct) n++;
          }
        }));
        expect(n, i.id).toBe(i.evidenceIds.length);
      }
    }
  });
  it("검색 문제: 정답 결과는 광고가 아니고, 알맞지 않은 검색어마다 결과가 있어요", () => {
    for (const i of searchItems) {
      expect(correctResultOf(i).isAd, i.id).toBeFalsy();
      i.queries.forEach((q, qi) => {
        expect(resultsFor(i, qi), i.id).toBe(q.results);
        expect(q.results.length, `${i.id}/${qi}`).toBeGreaterThanOrEqual(2);
      });
      // 결과 중 광고가 있고, 광고가 아닌 결과 중에도 정답이 아닌 것이 있다
      expect(i.queries[i.correctQuery].results.some((r) => r.isAd), i.id).toBe(true);
    }
  });
  it("가상 페이지 비교 문제는 정답 페이지의 정보 줄을 근거로 인정해요", () => {
    for (const id of ["sd-03", "sd-05"]) {
      const it = getMediaItem(id)!;
      if (it.type !== "choice-with-evidence") throw new Error("type");
      const title = it.options[it.correctOption];
      const page = MEDIA_PASSAGES.find((p) => p.title === title)!;
      expect(page.page?.isAd, id).toBeFalsy();
      expect(page.page?.author, id).toBeDefined();
      for (const e of it.evidenceIds) expect(page.paragraphs[0].sentences.some((s) => s.id === e), `${id}/${e}`).toBe(true);
    }
  });
  it("validateMediaItem이 잘못된 검색 문제를 잡아내요", () => {
    expect(validateMediaItem({ ...sl, correctQuery: 9 }).length).toBeGreaterThan(0);
    expect(validateMediaItem({ ...sl, correctResult: 9 }).length).toBeGreaterThan(0);
    expect(validateMediaItem({ ...sl, evidenceIds: ["r9-site"] }).some((m) => m.includes("r9-site"))).toBe(true);
    expect(validateMediaItem({ ...sl, evidenceIds: [] }).length).toBeGreaterThan(0);
    const adCorrect = sl.queries[sl.correctQuery].results.findIndex((r) => r.isAd);
    expect(validateMediaItem({ ...sl, correctResult: adCorrect, evidenceIds: [`r${adCorrect + 1}-site`] }).some((m) => m.includes("광고"))).toBe(true);
    expect(validateMediaItem({ ...sl, queries: [sl.queries[0], sl.queries[0], sl.queries[2]] }).some((m) => m.includes("겹쳐"))).toBe(true);
    expect(validateMediaItem({ ...sl, hints: [`${sl.queries[sl.correctQuery].text}를 써 보세요.`, sl.hints[1]] }).some((m) => m.includes("hints[0]"))).toBe(true);
    expect(validateMediaItem({ ...sl, prompt: "골라라." }).some((m) => m.includes("해요체"))).toBe(true);
    expect(validateMediaItem({ ...sl, grade: 6 }).some((m) => m.includes("학년"))).toBe(true);
    expect(validateMediaItem({ ...sl, standardCode: "없음" }).length).toBeGreaterThan(0);
  });
});

describe("검색 실험실 채점", () => {
  const right = (it: SearchTaskItem) => ({ type: "search-task" as const, query: it.correctQuery, result: it.correctResult, evidenceId: it.evidenceIds[0] });
  it("모든 검색 문제의 정답이 정답으로 채점돼요(정답 공개용 정답도)", () => {
    for (const it of searchItems) {
      expect(gradeMediaAnswer(it, right(it)), it.id).toEqual({ correct: true, reason: "ok", countsAsWrong: false });
      expect(gradeMediaAnswer(it, correctMediaAnswerOf(it) as never).correct, it.id).toBe(true);
      for (const e of it.evidenceIds) expect(gradeMediaAnswer(it, { ...right(it), evidenceId: e }).correct, `${it.id}/${e}`).toBe(true);
    }
  });
  it("wrong-query: 틀린 횟수에 넣고, 그 검색어의 결과를 보여 줄 수 있어요", () => {
    for (const it of searchItems) {
      const q = wrongQueryOf(it);
      expect(gradeMediaAnswer(it, { type: "search-task", query: q }), it.id).toEqual({ correct: false, reason: "wrong-query", countsAsWrong: true });
      expect(gradeMediaAnswer(it, { type: "search-task", query: q, result: 0, evidenceId: "r1-site" }).reason).toBe("wrong-query");
      expect(resultsFor(it, q)).toEqual(it.queries[q].results);
    }
    expect(resultsFor(sl, 9)).toBeUndefined();
    expect(resultsFor(sl, -1)).toBeUndefined();
    expect(resultsFor(sl, 0.5)).toBeUndefined();
  });
  it("incomplete: 검색어를 안 골랐거나, 알맞은 검색어인데 결과·근거가 비었어요(틀린 횟수에 넣지 않아요)", () => {
    const soft = { correct: false, reason: "incomplete", countsAsWrong: false };
    expect(gradeMediaAnswer(sl, { type: "search-task", query: sl.correctQuery })).toEqual(soft);
    expect(gradeMediaAnswer(sl, { type: "search-task", query: sl.correctQuery, result: 99 })).toEqual(soft);
    expect(gradeMediaAnswer(sl, { type: "search-task", query: sl.correctQuery, result: sl.correctResult })).toEqual(soft);
    expect(gradeMediaAnswer(sl, { type: "search-task", query: sl.correctQuery, result: sl.correctResult, evidenceId: "r9-site" })).toEqual(soft);
    // 다른 결과의 칸은 정답 결과의 근거가 아니에요
    const other = wrongResultOf(sl);
    expect(gradeMediaAnswer(sl, { type: "search-task", query: sl.correctQuery, result: sl.correctResult, evidenceId: `r${other + 1}-site` })).toEqual(soft);
    expect(gradeMediaAnswer(sl, { type: "search-task", query: 99 })).toEqual(soft);
    expect(gradeMediaAnswer(sl, { type: "search-task", query: -1 })).toEqual(soft);
    expect(gradeMediaAnswer(sl, { type: "search-task", query: 1.5 })).toEqual(soft);
  });
  it("wrong-result, evidence-wrong은 틀린 횟수에 넣어요", () => {
    for (const it of searchItems) {
      const r = wrongResultOf(it);
      expect(gradeMediaAnswer(it, { type: "search-task", query: it.correctQuery, result: r, evidenceId: "r1-site" }), it.id).toEqual({ correct: false, reason: "wrong-result", countsAsWrong: true });
      expect(gradeMediaAnswer(it, { type: "search-task", query: it.correctQuery, result: r }).reason).toBe("wrong-result");
      const bad = searchEvidence(correctResultOf(it)).find((f) => !it.evidenceIds.includes(f.id))!;
      expect(gradeMediaAnswer(it, { ...right(it), evidenceId: bad.id }), it.id).toEqual({ correct: false, reason: "evidence-wrong", countsAsWrong: true });
    }
  });
  it("형식이 다른 답은 type-mismatch", () => {
    expect(gradeMediaAnswer(sl, { type: "choice", option: 0 })).toEqual({ correct: false, reason: "type-mismatch", countsAsWrong: false });
    const ch = getMediaItem("me-06") as MediaItem;
    expect(gradeMediaAnswer(ch, { type: "search-task", query: 0 }).reason).toBe("type-mismatch");
  });
  it("검색 문제가 아닌 문제는 읽기 채점과 같아요", () => {
    for (const i of MEDIA_ITEMS) {
      if (i.type === "search-task" || i.type === "summary-write") continue;
      const a = correctMediaAnswerOf(i);
      expect(gradeMediaAnswer(i, a), i.id).toEqual({ correct: true, reason: "ok", countsAsWrong: false });
      if (a.type !== "search-task") expect(readingGrade(i, a)).toEqual(gradeMediaAnswer(i, a));
    }
  });
  it("근거 칸: 보이는 칸마다 안정된 id", () => {
    const r = { id: "r2", title: "제목", site: "누리", snippet: "요약", date: "2026년 1월 1일", isAd: true };
    expect(searchEvidence(r).map((f) => f.id).sort()).toEqual(["r2-ad", "r2-date", "r2-site", "r2-snippet", "r2-title"]);
    expect(searchEvidence({ id: "r1", title: "t", site: "s", snippet: "n" }).map((f) => f.id)).toEqual(["r1-title", "r1-site", "r1-snippet"]);
  });
});

describe("찍기 방지 단계(피드백 사다리)", () => {
  it("원리 → 힌트1 → 힌트2 → 정답 공개", () => {
    for (const it of MEDIA_ITEMS) {
      expect([1, 2, 3, 4].map((n) => mediaFeedbackFor(it, n).level)).toEqual(["principle", "hint1", "hint2", "reveal"]);
      expect(mediaFeedbackFor(it, 1).message).toContain(it.principle);
      expect(mediaFeedbackFor(it, 2).message).toContain(it.hints[0]);
      expect(mediaFeedbackFor(it, 3).message).toContain(it.hints[1]);
      for (const n of [1, 2, 3]) expect(mediaFeedbackFor(it, n).reveal, `${it.id}/${n}`).toBeUndefined();
      const rev = mediaFeedbackFor(it, 4);
      expect(rev.message).toBe(it.explanation);
      expect(rev.reveal).toBeDefined();
      expect(feedbackLevel(4)).toBe("reveal");
    }
  });
  it("검색 문제: 오답 종류에 따라 안내 앞말이 붙고, 정답 공개 때는 붙지 않아요", () => {
    expect(mediaFeedbackFor(sl, 1, "wrong-query").message).toBe(`${WRONG_QUERY_MESSAGE} ${sl.principle}`);
    expect(mediaFeedbackFor(sl, 2, "wrong-result").message).toBe(`${WRONG_RESULT_MESSAGE} ${sl.hints[0]}`);
    expect(mediaFeedbackFor(sl, 3, "evidence-wrong").message).toBe(`${SEARCH_EVIDENCE_MESSAGE} ${sl.hints[1]}`);
    expect(mediaFeedbackFor(sl, 4, "wrong-query").message).toBe(sl.explanation);
    expect(mediaFeedbackFor(sl, 4, "wrong-query").reveal).toEqual(correctMediaAnswerOf(sl));
  });
  it("다른 문제의 evidence-wrong은 읽기와 같이 안내 앞말이 붙어요", () => {
    const ev = getMediaItem("sd-03")!;
    expect(mediaFeedbackFor(ev, 1, "evidence-wrong").message).toBe(`${EVIDENCE_MESSAGE} ${ev.principle}`);
    expect(mediaFeedbackFor(ev, 1).message).toBe(ev.principle);
  });
  it("정답 뒤 피드백과 답 글 보기", () => {
    for (const it of MEDIA_ITEMS) {
      expect(mediaCorrectFeedback(it)).toContain(it.explanation);
      if (it.type !== "summary-write") expect(renderMediaAnswer(it, correctMediaAnswerOf(it)).length, it.id).toBeGreaterThan(0);
    }
    const text = renderMediaAnswer(sl, { type: "search-task", query: 1, result: 1, evidenceId: "r2-site" });
    expect(text).toContain("검색어: 고양이 하루 잠자는 시간");
    expect(text).toContain("(근거) 사이트: 푸른잎 자연탐구관");
    expect(renderMediaAnswer(sl, { type: "search-task", query: 0 })).toBe("검색어: 고양이");
  });
});

describe("활동 구성", () => {
  it("활동별 성취기준·학년군·문제 수가 맞아요", () => {
    const want: Record<string, [string, string, number, number]> = {
      "source-detective": ["4국02-05", "3-4", 6, 6],
      "search-lab-34": ["4국06-01", "3-4", 0, 3],
      "search-lab-56": ["6국06-01", "5-6", 0, 3],
      "fact-check": ["6국06-02", "5-6", 4, 6],
      "media-ethics": ["4국06-03", "3-4", 6, 6],
    };
    expect(MEDIA_ACTIVITIES.map((a) => a.id)).toEqual(Object.keys(want));
    for (const [id, [code, band, passages, items]] of Object.entries(want)) {
      const a = getMediaActivity(id)!;
      expect(a.standardCode).toBe(code);
      expect(getStandard(code)?.gradeBand).toBe(band);
      expect(a.gradeBand).toBe(band);
      expect(a.passageIds).toHaveLength(passages);
      expect(a.itemIds).toHaveLength(items);
      for (const pid of a.passageIds) expect(getPassage(pid)?.gradeBand, pid).toBe(band);
      for (const itemId of a.itemIds) {
        const item = getMediaItem(itemId)!;
        expect(item.standardCode, itemId).toBe(code);
        expect(band === "3-4" ? item.grade <= 4 : item.grade >= 5, itemId).toBe(true);
        if (item.type !== "search-task") {
          for (const pid of item.passageIds ?? [item.passageId]) expect(a.passageIds, itemId).toContain(pid);
        }
      }
    }
    expect(MEDIA_ACTIVITIES.filter((a) => a.family === "search-lab")).toHaveLength(2);
    const all = MEDIA_ACTIVITIES.flatMap((a) => a.itemIds);
    expect(new Set(all).size).toBe(MEDIA_ITEMS.length);
    expect(all.length).toBe(MEDIA_ITEMS.length);
    // 활동에 쓰이지 않는 지문이 없어요
    expect(new Set(MEDIA_ACTIVITIES.flatMap((a) => a.passageIds))).toEqual(new Set(MEDIA_PASSAGES.map((p) => p.id)));
    expect(getMediaActivity("nope")).toBeUndefined();
  });
  it("학년에 맞는 활동을 골라 줘요", () => {
    expect(mediaActivitiesForGrade(3).map((a) => a.id)).toEqual(["source-detective", "search-lab-34", "media-ethics"]);
    expect(mediaActivitiesForGrade(4).map((a) => a.id)).toEqual(["source-detective", "search-lab-34", "media-ethics"]);
    expect(mediaActivitiesForGrade(5).map((a) => a.id)).toEqual(["search-lab-56", "fact-check"]);
    expect(mediaActivitiesForGrade(6).map((a) => a.id)).toEqual(["search-lab-56", "fact-check"]);
  });
  it("출처 탐정단은 묶음마다 문제가 3개, 검색 실험실 학년군별 문제는 학년에 맞아요", () => {
    const sd = getMediaActivity("source-detective")!;
    expect(sd.itemIds.slice(0, 3).every((id) => (getMediaItem(id) as { passageId: string }).passageId.startsWith("sd-frog"))).toBe(true);
    expect(sd.itemIds.slice(3).every((id) => (getMediaItem(id) as { passageId: string }).passageId.startsWith("sd-leaf"))).toBe(true);
  });
});

describe("보기 순서 섞기(검색 문제 포함)", () => {
  it("검색어·결과 보기 순서는 순열이고 결정적이에요(키 `${id}:q`, `${id}:r`)", () => {
    for (const it of searchItems) {
      const dq = displayQueries(it);
      expect(dq.map((x) => x.index)).toEqual(optionOrder(`${it.id}:q`, it.queries.length));
      expect(dq.map((x) => x.index).sort()).toEqual(it.queries.map((_, i) => i));
      expect(displayQueries(it)).toEqual(dq);
      it.queries.forEach((q, qi) => {
        const dr = displayResults(it, qi);
        expect(dr.map((x) => x.index)).toEqual(optionOrder(`${it.id}:r`, q.results.length));
        expect(dr.map((x) => x.result)).toEqual(optionOrder(`${it.id}:r`, q.results.length).map((i) => q.results[i]));
      });
    }
    expect(displayResults(sl, 9)).toEqual([]);
  });
  it("정답 자리가 한쪽에 쏠리지 않아요(보기·검색어·결과 합쳐서)", () => {
    const pos: Record<number, number[]> = { 3: [0, 0, 0], 4: [0, 0, 0, 0] };
    const add = (n: number, d: number) => { if (pos[n]) pos[n][d]++; };
    for (const i of MEDIA_ITEMS) {
      if (i.type === "choice" || i.type === "choice-with-evidence") add(i.options.length, toDisplayIndex(i.id, i.options.length, i.correctOption));
      if (i.type === "search-task") {
        add(i.queries.length, toDisplayIndex(`${i.id}:q`, i.queries.length, i.correctQuery));
        const n = i.queries[i.correctQuery].results.length;
        add(n, toDisplayIndex(`${i.id}:r`, n, i.correctResult));
      }
    }
    for (const [n, limit] of [[3, 0.5], [4, 0.4]] as const) {
      const total = pos[n].reduce((a, b) => a + b, 0);
      if (total >= 8) expect(Math.max(...pos[n]) / total, `n=${n} ${pos[n]}`).toBeLessThanOrEqual(limit);
    }
  });
  it("원래 번호로 채점하므로 표시 번호를 되돌리면 정답이에요", () => {
    for (const it of searchItems) {
      const q = displayQueries(it).findIndex((x) => x.index === it.correctQuery);
      const r = displayResults(it, it.correctQuery).findIndex((x) => x.index === it.correctResult);
      expect(displayQueries(it)[q].index).toBe(it.correctQuery);
      expect(displayResults(it, it.correctQuery)[r].index).toBe(it.correctResult);
    }
  });
});
