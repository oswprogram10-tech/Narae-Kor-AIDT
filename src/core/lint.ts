// 규칙 기반 맞춤법·띄어쓰기·문장 길이 점검기.
// 원칙: 오류의 "위치"와 "규칙(왜 틀렸는지 생각할 거리)"만 알려 주고, 고친 문장은 주지 않는다.
// LLM을 쓰지 않으므로 환각이 없고 비용이 들지 않는다. 오탐을 줄이기 위해 확실한 규칙만 넣는다.

export type LintLens = "word" | "sentence";

export interface LintFinding {
  start: number;
  end: number;
  lens: LintLens;
  rule: string;
  message: string;
}

interface PatternRule {
  id: string;
  re: RegExp; // 반드시 g 플래그
  lens: LintLens;
  message: string;
  // 매치 중 실제로 표시할 부분(그룹 번호). 없으면 매치 전체.
  group?: number;
}

const PATTERN_RULES: PatternRule[] = [
  { id: "dwaet", re: /됬/g, lens: "word", message: "'되었'을 줄이면 어떻게 쓸까요? 국어사전에서 확인해 보세요." },
  {
    id: "doe-dwae",
    re: /되(요|서|야|써)(?![가-힣])/g,
    lens: "word",
    message: "'되'와 '돼' 중 무엇이 맞을까요? '되어'로 바꿔 읽어서 말이 되면 '돼'예요.",
  },
  {
    id: "dwae-doe",
    re: /돼(다|고|는|면|니|게|어)(?![가-힣]*지)/g,
    lens: "word",
    message: "'되'와 '돼' 중 무엇이 맞을까요? '되어'로 바꿔 읽어서 말이 안 되면 '되'예요.",
  },
  {
    id: "an-anh",
    re: /않(?=[\s.,!?]|$)/g,
    lens: "word",
    message: "'안'과 '않' 중 무엇이 맞을까요? '않'은 '아니하'를 줄인 말이라 뒤에 '-다, -고, -아' 같은 말이 붙어요.",
  },
  {
    id: "ji-an",
    re: /지\s?(안)(아|았|고|는다|다|으면)/g,
    group: 1,
    lens: "word",
    message: "'-지' 뒤에는 '안'과 '않' 중 무엇을 쓸까요? '아니하'로 바꿔 읽어 보세요.",
  },
  { id: "myeochil", re: /몇일/g, lens: "word", message: "이 낱말의 바른 표기를 국어사전에서 찾아볼까요? (소리 나는 대로 적는 낱말이에요)" },
  { id: "geumse", re: /금새/g, lens: "word", message: "'지금 바로'라는 뜻이라면 표기를 국어사전에서 확인해 보세요. ('금시에'가 줄어든 말이에요)" },
  { id: "oraenman", re: /오랫만/g, lens: "word", message: "'오래간만'을 줄인 말이에요. 어떻게 써야 할까요?" },
  { id: "eoi", re: /어의\s?없/g, lens: "word", message: "'어처구니없다'와 비슷한 뜻의 낱말이에요. 표기를 국어사전에서 확인해 보세요." },
  { id: "seolgeoji", re: /설겆이/g, lens: "word", message: "이 낱말의 표기를 국어사전에서 확인해 보세요." },
  { id: "huihan", re: /희안/g, lens: "word", message: "'매우 드물거나 신기하다'는 뜻의 낱말 표기를 국어사전에서 확인해 보세요." },
  { id: "yeokhal", re: /역활/g, lens: "word", message: "이 낱말의 표기를 국어사전에서 확인해 보세요." },
  { id: "ilbureo", re: /일부로/g, lens: "word", message: "'일부러(어떤 목적을 가지고)'라는 뜻이라면 표기를 다시 살펴볼까요?" },
  { id: "eotteokhae", re: /어떻해/g, lens: "word", message: "'어떻게 해'를 줄인 말이에요. 어떻게 써야 할까요?" },
  { id: "waenji", re: /웬지/g, lens: "word", message: "'왜 그런지 모르게'라는 뜻이라면 표기를 다시 살펴볼까요?" },
  { id: "wenil", re: /왠(일|만큼|떡)/g, lens: "word", message: "'어찌 된, 어떠한'이라는 뜻이라면 '왠'과 '웬' 중 무엇일까요?" },
  {
    id: "lge",
    re: /(할|줄|갈|올|볼|쓸|읽을|있을|될|놀|먹을|도와줄|해줄|해 줄)께/g,
    lens: "word",
    message: "'-ㄹ게'는 소리가 [께]로 나도 어떻게 적을까요?",
  },
  { id: "naekkeo", re: /(내|니|너|우리)꺼/g, lens: "word", message: "'것'을 소리 나는 대로 적었어요. 바른 표기와 띄어쓰기를 생각해 볼까요?" },
  { id: "double-space", re: / {2,}/g, lens: "word", message: "빈칸이 두 번 이상 들어갔어요." },
  { id: "space-before-punct", re: / +(?=[.,!?])/g, lens: "word", message: "문장 부호 앞에는 띄어 쓰지 않아요." },
  // 앞뒤 글자까지 함께 표시해 눈에 잘 띄게 한다. 숫자(3.5, 1,000)는 제외.
  { id: "space-after-punct", re: /[가-힣A-Za-z][.,!?][가-힣A-Za-z]/g, lens: "word", message: "문장 부호 뒤에는 한 칸 띄어 써요." },
];

const HANGUL_BASE = 0xac00;
const JONG_COUNT = 28;
const JONG_N = 4; // ㄴ
const JONG_L = 8; // ㄹ

function jongseong(ch: string): number {
  const code = ch.charCodeAt(0) - HANGUL_BASE;
  if (code < 0 || code > 11171) return -1;
  return code % JONG_COUNT;
}

// 의존 명사 '수', '것'을 앞말과 붙여 쓴 경우: "할수있다", "먹는것", "갈것이다"
function dependentNounSpacing(text: string): LintFinding[] {
  const out: LintFinding[] = [];
  const re = /([가-힣])(수(?=\s?(있|없|도|가|는))|것)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const prev = m[1];
    const j = jongseong(prev);
    const isModifierEnding = j === JONG_N || j === JONG_L || prev === "는" || prev === "던";
    if (!isModifierEnding) continue;
    // "어떤것" 같은 관형사 + 것도 띄어 쓰지만, '것' 앞이 한 글자 낱말일 수 있어 ㄴ/ㄹ 받침 + '는/던'만 본다.
    const start = m.index;
    out.push({
      start,
      end: start + m[0].length,
      lens: "word",
      rule: "dependent-noun",
      message: `'${m[2]}'는 혼자 쓰이지 못하는 낱말(의존 명사)이에요. 앞말과 띄어 쓸까요, 붙여 쓸까요?`,
    });
  }
  return out;
}

const LONG_SENTENCE = 70;

function sentenceRules(text: string): LintFinding[] {
  const out: LintFinding[] = [];
  const re = /[^.!?\n]+[.!?]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const trimmedStart = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (body.length >= LONG_SENTENCE) {
      out.push({
        start: m.index + trimmedStart,
        end: m.index + trimmedStart + body.length,
        lens: "sentence",
        rule: "long-sentence",
        message: "문장이 꽤 길어요. 한 문장에 생각이 몇 개 들어 있나요? 나누면 더 읽기 쉬울까요?",
      });
    }
  }
  return out;
}

export function lintKorean(text: string): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const rule of PATTERN_RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text))) {
      let start = m.index;
      let end = m.index + m[0].length;
      if (rule.group !== undefined && m[rule.group] !== undefined) {
        const offset = m[0].indexOf(m[rule.group]);
        start = m.index + offset;
        end = start + m[rule.group].length;
      }
      findings.push({ start, end, lens: rule.lens, rule: rule.id, message: rule.message });
      if (m[0].length === 0) rule.re.lastIndex++;
    }
  }
  findings.push(...dependentNounSpacing(text));
  findings.push(...sentenceRules(text));
  findings.sort((a, b) => a.start - b.start || a.end - b.end);
  return findings;
}
