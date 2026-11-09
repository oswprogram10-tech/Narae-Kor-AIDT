// 낭독 어절 맞춤 채점. 원문(읽을 글)과 음성 인식 결과를 어절 단위로 맞춰 본다.
// 같은 알고리즘이 training/asr/fluency.py 에 있고, 두 구현은 tests/fixtures/fluency-align.json 을 함께 통과해야 한다.
// 순수 함수만 둔다(브라우저·노드 어디서든 같은 결과).

export type AlignOp = "match" | "sub" | "del";

export interface AlignedEojeol {
  /** 원문 어절(문장부호를 뺀 모양) */
  ref: string;
  /** 인식 결과에서 짝지어진 어절. 빠뜨린 어절(del)에는 없다 */
  hyp?: string;
  op: AlignOp;
}

export interface Insertion {
  /** 이 번호의 원문 어절 앞에 끼어든 말(원문 길이와 같으면 맨 끝) */
  at: number;
  hyp: string;
}

export interface Alignment {
  items: AlignedEojeol[];
  insertions: Insertion[];
}

export interface AlignOptions {
  /** 같은 어절로 보아 줄 글자 오류율의 상한(0~1). 기본 0 — 정확히 같을 때만 같음 */
  maxCer?: number;
}

export interface FluencyScore {
  /** 1분 동안 바르게 읽은 어절 수(대치·삭제를 뺀 어절 ÷ 걸린 분) */
  wcpm: number;
  /** 바르게 읽은 어절 ÷ 원문 어절 수(0~1) */
  accuracy: number;
  /** 오류(대치·삭제)로 센 원문 어절 번호 */
  errors: number[];
  total: number;
  correct: number;
}

/** 글자 단위로 남기는 것: 글자(L)·숫자(N)·결합 기호(M). 나머지(문장부호·기호)는 지운다. */
const DROP = /[^\p{L}\p{N}\p{M}\s]/gu;

/** 문장부호를 지우고 공백을 하나로 줄인 문자열. 숫자는 그대로 둔다. */
export function normalizeEojeol(text: string): string {
  return splitEojeols(text).join(" ");
}

/** 정규화한 어절 목록(문장부호만 있던 덩어리는 빠진다). */
export function splitEojeols(text: string): string[] {
  const out: string[] = [];
  for (const tok of text.normalize("NFC").split(/\s+/)) {
    const t = tok.replace(DROP, "");
    if (t) out.push(t);
  }
  return out;
}

function levenshtein(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 글자 오류율: 편집 거리 ÷ 원문 글자 수(원문이 비면 1로 나눈다) */
export function charErrorRate(ref: string, hyp: string): number {
  const a = Array.from(ref);
  return levenshtein(a, Array.from(hyp)) / Math.max(a.length, 1);
}

/** 원문 어절을 인식 결과 어절과 맞춰 본다(레벤시테인, 같은 비용이면 일치 > 대치 > 삭제 > 삽입 순). */
export function alignEojeol(reference: string, hypothesis: string, options: AlignOptions = {}): Alignment {
  const maxCer = options.maxCer ?? 0;
  const ref = splitEojeols(reference);
  const hyp = splitEojeols(hypothesis);
  const same = (a: string, b: string): boolean => a === b || (maxCer > 0 && charErrorRate(a, b) <= maxCer);
  const n = ref.length;
  const m = hyp.length;
  // dp[i][j] = ref[i:] 와 hyp[j:] 를 맞추는 최소 비용(뒤에서부터 채운다)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n; i >= 0; i--) {
    for (let j = m; j >= 0; j--) {
      if (i === n) dp[i][j] = m - j;
      else if (j === m) dp[i][j] = n - i;
      else dp[i][j] = Math.min(dp[i + 1][j + 1] + (same(ref[i], hyp[j]) ? 0 : 1), dp[i + 1][j] + 1, dp[i][j + 1] + 1);
    }
  }
  const items: AlignedEojeol[] = [];
  const insertions: Insertion[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && same(ref[i], hyp[j]) && dp[i][j] === dp[i + 1][j + 1]) {
      items.push({ ref: ref[i], hyp: hyp[j], op: "match" });
      i++;
      j++;
    } else if (i < n && j < m && dp[i][j] === dp[i + 1][j + 1] + 1) {
      items.push({ ref: ref[i], hyp: hyp[j], op: "sub" });
      i++;
      j++;
    } else if (i < n && dp[i][j] === dp[i + 1][j] + 1) {
      items.push({ ref: ref[i], op: "del" });
      i++;
    } else {
      insertions.push({ at: i, hyp: hyp[j] });
      j++;
    }
  }
  return { items, insertions };
}

/**
 * 낭독 유창성 점수. CBM 관례를 따른다: 대치·삭제만 오류로 세고,
 * 끼워 넣은 말과 되풀이는 오류로 세지 않는다(읽는 시간이 늘어 wcpm이 낮아지는 것으로 반영된다).
 * 원문이 비면 accuracy와 wcpm은 0이다. seconds가 0 이하여도 wcpm은 0이다.
 */
export function fluencyScore(reference: string, hypothesis: string, seconds: number, options: AlignOptions = {}): FluencyScore {
  const { items } = alignEojeol(reference, hypothesis, options);
  const errors: number[] = [];
  items.forEach((it, idx) => {
    if (it.op !== "match") errors.push(idx);
  });
  const total = items.length;
  const correct = total - errors.length;
  return {
    wcpm: seconds > 0 ? correct / (seconds / 60) : 0,
    accuracy: total > 0 ? correct / total : 0,
    errors,
    total,
    correct,
  };
}
