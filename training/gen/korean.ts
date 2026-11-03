// 한국어 조사 선택(받침 유무) 도우미: josa("책장", "을/를") → "책장을"
const HANGUL_BASE = 0xac00;

export function hasBatchim(word: string): boolean {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - HANGUL_BASE;
  if (code < 0 || code > 11171) return /[136780LMNRlmnr]$/.test(last); // 숫자·영문 근사
  return code % 28 !== 0;
}

function hasRieulBatchim(word: string): boolean {
  const code = word.trim().slice(-1).charCodeAt(0) - HANGUL_BASE;
  return code >= 0 && code <= 11171 && code % 28 === 8;
}

const PAIRS: Record<string, [string, string]> = {
  "을/를": ["을", "를"],
  "이/가": ["이", "가"],
  "은/는": ["은", "는"],
  "과/와": ["과", "와"],
  "이나/나": ["이나", "나"],
  "이라고/라고": ["이라고", "라고"],
  "아/야": ["아", "야"],
};

export function josa(word: string, pair: keyof typeof PAIRS | "으로/로"): string {
  if (pair === "으로/로") return word + (hasBatchim(word) && !hasRieulBatchim(word) ? "으로" : "로");
  const [withB, without] = PAIRS[pair];
  return word + (hasBatchim(word) ? withB : without);
}

// "{topic:을/를}" 같은 자리 표시를 채운다.
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)(?::([^}]+))?\}/g, (_, key: string, pair?: string) => {
    const v = vars[key];
    if (v === undefined) throw new Error(`빈 자리: ${key} in "${template}"`);
    if (!pair) return v;
    if (pair in PAIRS || pair === "으로/로") return josa(v, pair as keyof typeof PAIRS);
    return v + pair; // 받침과 관계없는 조사(에, 에서, 에게 등)
  });
}
