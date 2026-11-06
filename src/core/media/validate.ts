// 미디어 나래 자료 검증: 읽기 검증에 더해 실제 이름 검사, 가상 주소, 검색 문제 구조를 확인한다.

import { getStandard } from "@/core/data/standards";
import { getPassage, haeyoProblems, validateItem, validatePassage, type Passage } from "@/core/reading";
import { realNameProblems } from "./denylist";
import { searchEvidence } from "./search";
import type { MediaItem, SearchTaskItem } from "./types";

const stripEnd = (s: string) => s.replace(/[.?!,]+$/u, "");

/** 가상 페이지·글 검사: 읽기 지문 검사 + 가상 주소(.가상) + 실제 이름 검사 */
export function validateMediaPassage(passage: Passage): string[] {
  const p = validatePassage(passage);
  if (passage.page) {
    if (!/^[a-z0-9-]+\.가상$/u.test(passage.page.address)) p.push(`주소 '${passage.page.address}'은(는) 영문 소문자·숫자·붙임표와 '.가상'으로 이루어져야 해요`);
    p.push(...realNameProblems(`${passage.page.site} ${passage.page.address} ${passage.page.author ?? ""} ${passage.page.sourceNote ?? ""}`).map((m) => `page: ${m}`));
  }
  const texts = [passage.title, ...passage.paragraphs.flatMap((x) => x.sentences.map((s) => s.text))];
  for (const t of texts) p.push(...realNameProblems(t).map((m) => `${passage.id}: ${m}`));
  return p;
}

/** 학생에게 보이는 모든 글 */
function visibleTexts(item: MediaItem): [string, string][] {
  const out: [string, string][] = [
    ["prompt", item.prompt], ["principle", item.principle], ["hints[0]", item.hints[0]], ["hints[1]", item.hints[1]], ["explanation", item.explanation],
  ];
  if (item.type === "choice" || item.type === "choice-with-evidence") item.options.forEach((o, i) => out.push([`options[${i}]`, o]));
  if (item.type === "label-sentences") item.labels.forEach((o, i) => out.push([`labels[${i}]`, o]));
  if (item.type === "search-task") {
    out.push(["purpose", item.purpose]);
    item.queries.forEach((q, qi) => {
      out.push([`queries[${qi}]`, q.text]);
      q.results.forEach((r, ri) => {
        out.push([`queries[${qi}].results[${ri}].title`, r.title], [`queries[${qi}].results[${ri}].site`, r.site], [`queries[${qi}].results[${ri}].snippet`, r.snippet]);
      });
    });
  }
  return out;
}

export function validateMediaItem(item: MediaItem): string[] {
  const p: string[] = item.type === "search-task" ? validateSearchTask(item) : validateItem(item, getPassage(item.passageId));
  const std = getStandard(item.standardCode);
  if (std && (std.gradeBand === "3-4" ? item.grade > 4 : item.grade < 5)) p.push("학년이 성취기준의 학년군과 맞지 않아요");
  for (const [name, text] of visibleTexts(item)) p.push(...realNameProblems(text).map((m) => `${name}: ${m}`));
  return p;
}

function validateSearchTask(item: SearchTaskItem): string[] {
  const p: string[] = [];
  if (!item.id.trim()) p.push("id가 비었어요");
  if (!getStandard(item.standardCode)) p.push(`성취기준 ${item.standardCode}이(가) 없어요`);
  for (const [k, v] of [["purpose", item.purpose], ["prompt", item.prompt], ["principle", item.principle], ["explanation", item.explanation]] as const) {
    if (!v.trim()) p.push(`${k}이(가) 비었어요`);
    p.push(...haeyoProblems(v).map((m) => `${k}: ${m}`));
  }
  item.hints.forEach((h, i) => {
    if (!h.trim()) p.push(`hints[${i}]이(가) 비었어요`);
    p.push(...haeyoProblems(h).map((m) => `hints[${i}]: ${m}`));
  });
  if (item.hints[0] === item.hints[1]) p.push("두 힌트가 같아요");

  const qs = item.queries;
  if (qs.length < 3 || qs.length > 4) p.push(`검색어는 3~4개여야 해요(${qs.length}개)`);
  if (new Set(qs.map((q) => q.text)).size !== qs.length) p.push("검색어가 겹쳐요");
  if (qs.some((q) => !q.text.trim())) p.push("빈 검색어가 있어요");
  if (!Number.isInteger(item.correctQuery) || !qs[item.correctQuery]) {
    p.push("correctQuery가 범위를 벗어나요");
    return p;
  }
  const best = qs[item.correctQuery];
  if (best.results.length < 3 || best.results.length > 4) p.push(`알맞은 검색어의 결과는 3~4개여야 해요(${best.results.length}개)`);
  qs.forEach((q, qi) => {
    if (q.results.length < 2 || q.results.length > 4) p.push(`검색어 ${qi}의 결과는 2~4개여야 해요`);
    const ids = q.results.map((r) => r.id);
    if (new Set(ids).size !== ids.length) p.push(`검색어 ${qi}의 결과 id가 겹쳐요`);
    if (new Set(q.results.map((r) => r.title)).size !== q.results.length) p.push(`검색어 ${qi}의 결과 제목이 겹쳐요`);
    for (const r of q.results) {
      if (!/^r\d+$/u.test(r.id)) p.push(`결과 id ${r.id}은(는) r1, r2… 모양이어야 해요`);
      if (!r.title.trim() || !r.site.trim() || !r.snippet.trim()) p.push(`결과 ${qi}/${r.id}에 빈 칸이 있어요`);
      if (r.date !== undefined && !/^\d{4}년 \d{1,2}월 \d{1,2}일$/u.test(r.date)) p.push(`결과 ${qi}/${r.id}의 날짜 모양이 달라요`);
    }
  });
  const answer = best.results[item.correctResult];
  if (!Number.isInteger(item.correctResult) || !answer) {
    p.push("correctResult가 범위를 벗어나요");
    return p;
  }
  if (answer.isAd) p.push("정답 결과가 광고예요");
  if (item.evidenceIds.length === 0) p.push("근거 칸이 하나도 없어요");
  if (new Set(item.evidenceIds).size !== item.evidenceIds.length) p.push("근거 칸 id가 겹쳐요");
  const fields = searchEvidence(answer);
  if (item.evidenceIds.length >= fields.length) p.push("모든 칸이 근거예요");
  for (const id of item.evidenceIds) if (!fields.some((f) => f.id === id)) p.push(`근거 칸 ${id}이(가) 정답 결과에 없어요`);

  // 안내 문구에 정답(알맞은 검색어, 정답 결과의 제목, 근거 칸)이 그대로 들어 있으면 안 된다.
  const secrets: [string, string][] = [["정답 검색어", best.text], ["정답 결과 제목", answer.title]];
  for (const f of fields) if (item.evidenceIds.includes(f.id)) secrets.push([`근거 칸(${f.id})`, f.text]);
  for (const [name, text] of [["prompt", item.prompt], ["principle", item.principle], ["hints[0]", item.hints[0]], ["hints[1]", item.hints[1]]] as const) {
    for (const [label, secret] of secrets) {
      if (text.includes(stripEnd(secret))) p.push(`${name}에 ${label}이(가) 그대로 들어 있어요`);
    }
  }
  return p;
}
