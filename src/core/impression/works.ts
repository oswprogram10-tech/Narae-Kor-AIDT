// 고를 수 있는 작품: 문학 활동의 동화·시 + 읽기 지문 중 이야기. 학년군은 바꿀 수 있고, 이 활동의 기본은 5~6학년이다.
import { LITERATURE_PASSAGES } from "@/core/literature";
import { READING_PASSAGES, type Genre, type Passage } from "@/core/reading";

export type GradeBand = Passage["gradeBand"];

export const IMPRESSION_GENRES: readonly Genre[] = ["동화", "시", "이야기"];

/** 이 활동에서 기본으로 보여 주는 학년군(필요하면 impressionWorks의 인자로 바꾼다) */
export const DEFAULT_BANDS: readonly GradeBand[] = ["5-6"];

/** 작품 목록(문학 작품 먼저, 읽기 이야기 지문 뒤). 같은 id는 한 번만. */
export function impressionWorks(bands: readonly GradeBand[] = DEFAULT_BANDS): Passage[] {
  const seen = new Set<string>();
  const out: Passage[] = [];
  for (const p of [...LITERATURE_PASSAGES, ...READING_PASSAGES]) {
    if (!IMPRESSION_GENRES.includes(p.genre) || !bands.includes(p.gradeBand) || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export const getImpressionWork = (id: string, bands: readonly GradeBand[] = DEFAULT_BANDS): Passage | undefined =>
  impressionWorks(bands).find((p) => p.id === id);

export interface SentenceInfo {
  id: string;
  text: string;
  paragraphId: string;
  /** 작품 전체에서 몇 번째 문장인가(0부터) */
  order: number;
}

/** 작품 안의 문장을 찾는다(없으면 undefined). */
export function sentenceInWork(work: Passage, sentenceId: string): SentenceInfo | undefined {
  let order = 0;
  for (const p of work.paragraphs) {
    for (const s of p.sentences) {
      if (s.id === sentenceId) return { id: s.id, text: s.text, paragraphId: p.id, order };
      order++;
    }
  }
  return undefined;
}

/** 작품 id와 문장 id가 모두 맞는가 */
export function isValidChoice(workId: string, sentenceId: string, bands: readonly GradeBand[] = DEFAULT_BANDS): boolean {
  const work = getImpressionWork(workId, bands);
  return !!work && !!sentenceInWork(work, sentenceId);
}
