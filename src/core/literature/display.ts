// 문학 나래 화면용 순수 도우미: 보기·사건 카드 섞기, 내 한 줄 점검, 마음 그래프.

import { optionOrder } from "@/core/practice/shuffle";
import { getPassage } from "@/core/reading";
import type { LiteratureAnswer, LiteratureItem, MoodPoint, MoodScaleItem, SequenceEvent, SequenceItem } from "./types";

/** 내 한 줄의 최대 글자 수 */
export const OWN_LINE_MAX = 60;

/** order[표시 번호] = 마음 낱말의 원래 번호 (섞기 키 `${id}:f`) */
export function feelingOrder(item: MoodScaleItem): number[] {
  return optionOrder(`${item.id}:f`, item.feelingOptions.length);
}

/** 마음 낱말을 표시 순서로 */
export function displayFeelings(item: MoodScaleItem): string[] {
  return feelingOrder(item).map((i) => item.feelingOptions[i]);
}

/**
 * 사건 카드를 보여 줄 순서(사건 id). 문제 id로 정해지는 결정적 섞기(키 `${id}:e`)이며,
 * 섞은 결과가 정답 순서와 같으면 한 칸 돌려서 절대 정답 순서로 보이지 않게 한다.
 */
export function displayEventIds(item: SequenceItem): string[] {
  const ids = optionOrder(`${item.id}:e`, item.events.length).map((i) => item.events[i].id);
  if (ids.length > 1 && ids.join("|") === item.correctOrder.join("|")) return [...ids.slice(1), ids[0]];
  return ids;
}

export function displayEvents(item: SequenceItem): SequenceEvent[] {
  const byId = new Map(item.events.map((e) => [e.id, e]));
  return displayEventIds(item).map((id) => byId.get(id)!);
}

export interface OwnLineCheck {
  ok: boolean;
  tooLong: boolean;
  empty: boolean;
}

/** 내 한 줄 점검: 앞뒤 공백을 뺀 글자 수가 1~60이면 ok. 안전 점검은 호스트의 몫이다. */
export function ownLineCheck(text: string): OwnLineCheck {
  const len = Array.from(text.trim()).length;
  const empty = len === 0;
  const tooLong = len > OWN_LINE_MAX;
  return { ok: !empty && !tooLong, tooLong, empty };
}

/**
 * 마음 그래프: 학생이 고른 마음 온도를 장면(문단) 순서대로 돌려준다.
 * items는 한 활동의 문제, answers는 문제 id → 학생의 (마지막) 답. 마음 온도 답이 없거나 1~5가 아니면 건너뛴다.
 */
export function moodGraph(
  items: readonly LiteratureItem[],
  answers: Readonly<Record<string, LiteratureAnswer | undefined>>,
): MoodPoint[] {
  const rows: { passageOrder: number; sceneOrder: number; seq: number; point: MoodPoint }[] = [];
  const passageOrder: string[] = [];
  items.forEach((item, seq) => {
    if (item.type !== "mood-scale") return;
    const a = answers[item.id];
    if (!a || a.type !== "mood-scale" || !Number.isInteger(a.value) || a.value < 1 || a.value > 5) return;
    let po = passageOrder.indexOf(item.passageId);
    if (po < 0) po = passageOrder.push(item.passageId) - 1;
    const so = getPassage(item.passageId)?.paragraphs.findIndex((p) => p.id === item.sceneParagraphId) ?? -1;
    rows.push({
      passageOrder: po,
      sceneOrder: so < 0 ? Number.MAX_SAFE_INTEGER : so,
      seq,
      point: { sceneParagraphId: item.sceneParagraphId, character: item.character, value: a.value },
    });
  });
  rows.sort((x, y) => x.passageOrder - y.passageOrder || x.sceneOrder - y.sceneOrder || x.seq - y.seq);
  return rows.map((r) => r.point);
}
