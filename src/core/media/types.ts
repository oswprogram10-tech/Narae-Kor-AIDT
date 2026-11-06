// 미디어 나래(매체) 자료 형식. 읽기 핵심부의 지문·문제 형식을 그대로 쓰고, 검색 실험실 형식 하나만 더한다.
// 모든 페이지·검색 결과는 연습용 가상 자료다(실제 기관·회사·사이트 이름을 쓰지 않는다).

import type { ItemBase, ReadingActivity, ReadingAnswer, ReadingItem } from "@/core/reading";

/** 가상 검색 결과 한 줄. 보이는 칸(제목·사이트·요약·날짜·광고 표시)이 모두 근거로 고를 수 있는 '문장'이다. */
export interface SearchResult {
  /** 검색어 안에서 겹치지 않는 번호. 예: "r2" (근거 칸 id는 "r2-title" 같은 모양, searchEvidence 참고) */
  id: string;
  title: string;
  /** 사이트 이름(지어낸 이름) */
  site: string;
  /** 한 줄 요약 */
  snippet: string;
  isAd?: boolean;
  /** 예: "2026년 4월 2일" */
  date?: string;
}

export interface SearchQuery {
  /** 학생에게 보이는 검색어 */
  text: string;
  /** 이 검색어로 찾았을 때 보이는 가상 결과 */
  results: SearchResult[];
}

/**
 * 검색 실험실 문제: 목적에 맞는 검색어를 고르고(1단계), 그 결과에서 가장 알맞은 결과와 근거 칸을 고른다(2단계).
 * 정답 필드: correctQuery, correctResult, evidenceIds(그리고 principle·hints·explanation은 단계에 맞게 나중에 보여 준다).
 * 번호(query, result)는 모두 '원래 번호'다. 보기 순서 섞기는 shuffle.ts의 optionOrder를 `${id}:q`, `${id}:r` 키로 쓴다.
 */
export interface SearchTaskItem extends Omit<ItemBase, "passageId" | "passageIds" | "revealUpTo"> {
  type: "search-task";
  /** 학생이 이루려는 목적(해요체) */
  purpose: string;
  /** 검색어 보기(3~4개) */
  queries: SearchQuery[];
  correctQuery: number;
  /** 알맞은 검색어의 결과 중 정답 번호 */
  correctResult: number;
  /** 근거로 인정하는 칸 id(정답 결과의 칸만). 예: ["r1-site", "r1-date"] */
  evidenceIds: string[];
}

export type MediaItem = ReadingItem | SearchTaskItem;

/** query: 고른 검색어, result: 고른 결과(검색어가 알맞을 때), evidenceId: 근거 칸 id */
export interface SearchTaskAnswer {
  type: "search-task";
  query: number;
  result?: number;
  evidenceId?: string;
}

export type MediaAnswer = ReadingAnswer | SearchTaskAnswer;

export type MediaFamily = "source-detective" | "search-lab" | "fact-check" | "media-ethics";

export interface MediaActivity extends ReadingActivity {
  family: MediaFamily;
}
