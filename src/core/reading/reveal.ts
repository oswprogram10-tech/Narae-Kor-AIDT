// 예측하며 읽기: 문단을 차례로 펼친다. 아직 풀지 않은 문제가 가리는 문단은 학생 기기로 보내지 않는다.

import { getPassage } from "./passages";
import type { Passage, ReadingItem } from "./types";

/** 문제 중 하나라도 revealUpTo가 있으면 문단을 차례로 펼치는 활동이다. */
export function isProgressive(items: readonly Pick<ReadingItem, "revealUpTo">[]): boolean {
  return items.some((i) => i.revealUpTo !== undefined);
}

/**
 * 지금 학생에게 보낼 지문. items는 활동의 문제를 순서대로, solvedIds는 푼 문제 id.
 * - 문단을 차례로 펼치는 지문: 지금 풀 문제(처음으로 안 푼 문제)의 revealUpTo 문단까지만.
 *   그 지문의 문제를 아직 시작하지 않았으면 지문 자체를 보내지 않고, 모두 풀었으면 전체를 보낸다.
 * - 그 밖의 지문: 문제가 쓰는 지문 전체(지문 순서는 문제 순서).
 * 모든 문제를 풀었으면 전체 지문.
 */
export function visiblePassages(items: readonly ReadingItem[], solvedIds: ReadonlySet<string>): Passage[] {
  const current = items.find((i) => !solvedIds.has(i.id));
  const order: string[] = [];
  for (const i of items) for (const id of i.passageIds ?? [i.passageId]) if (!order.includes(id)) order.push(id);

  const out: Passage[] = [];
  for (const id of order) {
    const passage = getPassage(id);
    if (!passage) continue;
    const own = items.filter((i) => (i.passageIds ?? [i.passageId]).includes(id));
    if (!isProgressive(own) || !current) {
      out.push(passage);
      continue;
    }
    if (own.every((i) => solvedIds.has(i.id))) {
      out.push(passage);
      continue;
    }
    if (!own.includes(current)) continue; // 아직 시작 전
    const at = current.revealUpTo === undefined ? -1 : passage.paragraphs.findIndex((p) => p.id === current.revealUpTo);
    out.push(at < 0 ? passage : { ...passage, paragraphs: passage.paragraphs.slice(0, at + 1) });
  }
  return out;
}
