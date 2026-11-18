import { getImpressionWork, impressionWorks, sentenceInWork, type GradeBand } from "./works";

export interface SentenceGroup<T> {
  workId: string;
  workTitle: string;
  sentenceId: string;
  /** 고른 문장 */
  text: string;
  items: T[];
}

/**
 * 같은 문장을 고른 작품끼리 모은다. 모둠은 작품 목록 순서, 그다음 작품 안의 문장 순서로 늘어놓고,
 * 모둠 안의 순서는 들어온 순서를 지킨다. 목록에 없는 작품·문장은 뺀다.
 */
export function groupBySentence<T extends { workId: string; sentenceId: string }>(works: readonly T[], bands?: readonly GradeBand[]): SentenceGroup<T>[] {
  const order = impressionWorks(bands).map((w) => w.id);
  const groups = new Map<string, SentenceGroup<T> & { rank: number; pos: number }>();
  for (const w of works) {
    const work = getImpressionWork(w.workId, bands);
    const s = work ? sentenceInWork(work, w.sentenceId) : undefined;
    if (!work || !s) continue;
    const key = `${work.id}/${s.id}`;
    let g = groups.get(key);
    if (!g) {
      g = { workId: work.id, workTitle: work.title, sentenceId: s.id, text: s.text, items: [], rank: order.indexOf(work.id), pos: s.order };
      groups.set(key, g);
    }
    g.items.push(w);
  }
  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank || a.pos - b.pos)
    .map((g) => ({ workId: g.workId, workTitle: g.workTitle, sentenceId: g.sentenceId, text: g.text, items: g.items }));
}
