// 검색 실험실 도우미: 검색어별 결과, 근거 칸, 보기 순서 섞기.

import { optionOrder } from "@/core/practice/shuffle";
import type { SearchQuery, SearchResult, SearchTaskItem } from "./types";

/** 검색 결과의 보이는 칸이 근거 '문장'이 된다. id는 `${result.id}-title|site|snippet|date|ad` */
export interface EvidenceField {
  id: string;
  text: string;
}

/** 결과의 보이는 칸(제목·사이트·요약·날짜·광고 표시)을 근거 문장으로 펼친다. 화면 순서와 같다. */
export function searchEvidence(result: SearchResult): EvidenceField[] {
  const out: EvidenceField[] = [
    { id: `${result.id}-title`, text: result.title },
    { id: `${result.id}-site`, text: `사이트: ${result.site}` },
  ];
  if (result.date !== undefined) out.push({ id: `${result.id}-date`, text: `날짜: ${result.date}` });
  if (result.isAd) out.push({ id: `${result.id}-ad`, text: "광고" });
  out.push({ id: `${result.id}-snippet`, text: result.snippet });
  return out;
}

/**
 * 학생이 고른 검색어(원래 번호)의 가상 결과. 알맞지 않은 검색어를 골랐을 때도 그 검색어의 결과를 실제로 보여 주려고 쓴다.
 * 범위 밖 번호면 undefined. 결과는 원래 순서(화면에 보일 순서는 displayResults).
 */
export function resultsFor(item: SearchTaskItem, queryIndex: number): readonly SearchResult[] | undefined {
  if (!Number.isInteger(queryIndex)) return undefined;
  return item.queries[queryIndex]?.results;
}

/** 정답 결과 */
export function correctResultOf(item: SearchTaskItem): SearchResult {
  return item.queries[item.correctQuery].results[item.correctResult];
}

/** 검색어 보기를 화면에 보일 순서로(키 `${id}:q`). index는 원래 번호 */
export function displayQueries(item: SearchTaskItem): { index: number; query: SearchQuery }[] {
  return optionOrder(`${item.id}:q`, item.queries.length).map((index) => ({ index, query: item.queries[index] }));
}

/** 검색어 하나의 결과를 화면에 보일 순서로(키 `${id}:r`). index는 그 검색어 안에서의 원래 번호 */
export function displayResults(item: SearchTaskItem, queryIndex: number): { index: number; result: SearchResult }[] {
  const results = resultsFor(item, queryIndex);
  if (!results) return [];
  return optionOrder(`${item.id}:r`, results.length).map((index) => ({ index, result: results[index] }));
}
