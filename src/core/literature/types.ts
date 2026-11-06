// 상상·울림 나래(문학) 자료 형식. 읽기 핵심부의 지문·문제 형식을 그대로 쓰고, 새 형식 셋(마음 온도, 순서 놓기, 내 한 줄)만 더한다.
// 시는 한 행이 '문장'이고 한 연이 '문단'이다(id는 읽기와 같은 p1/s1-1 약속).

import type { ItemBase, ReadingActivity, ReadingAnswer, ReadingItem } from "@/core/reading";

/** 마음 온도: 인물·장면(문단)을 정하고 마음 온도(1 아주 차가움 ~ 5 아주 따뜻함)와 마음 낱말, 근거 문장을 고른다. */
export interface MoodScaleItem extends ItemBase {
  type: "mood-scale";
  /** 마음을 살필 인물 */
  character: string;
  /** 장면에 해당하는 문단 id. 근거 문장은 이 문단 안에 있어야 한다. */
  sceneParagraphId: string;
  /** 정답으로 인정하는 마음 온도 범위(1~5, 폭은 2 이하). 글 속 근거로 방향이 분명한 장면에만 쓴다. */
  minOk: number;
  maxOk: number;
  /** 마음 낱말 보기(3~4개, 정답 하나). 섞기 키는 `${id}:f` */
  feelingOptions: string[];
  correctFeeling: number;
  /** 근거로 인정하는 문장 id(장면 문단 안) */
  evidenceIds: string[];
}

export interface SequenceEvent {
  id: string;
  text: string;
}

/** 순서 놓기: 사건 카드 3~5장을 일어난 순서대로 놓는다. 순서가 하나로 분명한 사건만 쓴다. 섞기 키는 `${id}:e` */
export interface SequenceItem extends ItemBase {
  type: "sequence";
  events: SequenceEvent[];
  /** 사건 id를 일어난 순서대로 */
  correctOrder: string[];
}

/** 내 한 줄 쓰기: 채점하지 않는다. 비어 있지 않고 길이(60자) 안이면 '다 했어요'. 안전 점검(classifyInput)은 호스트가 한다. */
export interface OwnLineItem extends ItemBase {
  type: "own-line";
}

export type LiteratureItem = ReadingItem | MoodScaleItem | SequenceItem | OwnLineItem;

/** value: 마음 온도(1~5), feeling: 고른 마음 낱말의 원래 번호, evidenceId: 근거 문장 id */
export interface MoodScaleAnswer {
  type: "mood-scale";
  value: number;
  feeling: number;
  evidenceId: string;
}

export interface SequenceAnswer {
  type: "sequence";
  /** 사건 id를 학생이 놓은 순서대로 */
  order: string[];
}

export interface OwnLineAnswer {
  type: "own-line";
  text: string;
}

export type LiteratureAnswer = ReadingAnswer | MoodScaleAnswer | SequenceAnswer | OwnLineAnswer;

export type LiteratureActivity = ReadingActivity;

/** 마음 그래프의 점 하나 */
export interface MoodPoint {
  sceneParagraphId: string;
  character: string;
  value: number;
}
