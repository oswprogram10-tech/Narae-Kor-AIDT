// 보기 순서 섞기: 정답이 늘 앞쪽에 오는 쏠림을 막는다. 문제 id로 정해지므로 새로 고침해도 같은 순서다(결정적).
// 학생 화면에는 섞은(표시) 순서로 보내고, 서버가 받은 번호를 원래 번호로 되돌려 채점한다.
// 저장하는 시도 기록(answer JSON)은 항상 원래 번호를 쓴다(연구 자료를 문제 사이에서 비교할 수 있게).

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** order[표시 번호] = 원래 번호. 문제 id와 보기 수로만 정해진다. */
export function optionOrder(itemId: string, n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const rnd = mulberry32(hash(`options:${itemId}:${n}`));
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** 표시 번호 → 원래 번호 */
export const toOriginalIndex = (itemId: string, n: number, displayed: number): number => optionOrder(itemId, n)[displayed];
/** 원래 번호 → 표시 번호 */
export const toDisplayIndex = (itemId: string, n: number, original: number): number => optionOrder(itemId, n).indexOf(original);
/** 보기를 표시 순서로 */
export const displayOptions = (itemId: string, options: readonly string[]): string[] =>
  optionOrder(itemId, options.length).map((i) => options[i]);
