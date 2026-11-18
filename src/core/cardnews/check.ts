// 스스로 점검: 규칙으로 돌리는 순수 함수. AI는 쓰지 않는다.
import type { Card, CardnewsArtifact } from "./types";

export type WarningKind = "key-message" | "too-long" | "empty" | "sources" | "exaggeration" | "audience";

export interface Span {
  start: number;
  end: number;
  word: string;
}

export interface Warning {
  id: string;
  kind: WarningKind;
  /** 어느 카드에 대한 경고인지(없으면 계획 전체) */
  cardId?: string;
  field?: "title" | "body";
  message: string;
  /** 과장 표현의 위치(글자 위치, field 글 기준) */
  spans?: Span[];
}

/** 과장 표현 목록. 정규식 하나가 낱말 하나(또는 같은 뜻의 표기들)다. */
export const EXAGGERATION_PATTERNS: readonly RegExp[] = [
  /가장(?!자리)/g,
  /최고/g,
  /100\s?%|백\s?퍼센트/g,
  /무조건/g,
  /절대/g,
  /모든\s?사람/g,
  /누구나/g,
  /완벽/g,
  /반드시/g,
  /아무도/g,
  /항상/g,
  /전부/g,
];

/** 글 안의 과장 표현 위치(겹치지 않게, 앞에서부터) */
export function findExaggerations(text: string): Span[] {
  const spans: Span[] = [];
  for (const re of EXAGGERATION_PATTERNS) {
    for (const m of text.matchAll(new RegExp(re.source, "g"))) {
      spans.push({ start: m.index, end: m.index + m[0].length, word: m[0] });
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Span[] = [];
  for (const s of spans) if (!out.length || s.start >= out[out.length - 1].end) out.push(s);
  return out;
}

const JOSA = /(으로|에서|에게|까지|부터|처럼|보다|이랑|하고|은|는|이|가|을|를|에|의|도|로|과|와|만)$/;

/** 핵심 문장에서 '핵심 낱말'을 뽑는다: 두 글자 이상 낱말, 끝의 조사는 떼어서 비교한다. */
export function keyWordsOf(keyMessage: string): string[] {
  const words = keyMessage.split(/[^가-힣A-Za-z0-9]+/).filter((w) => w.length >= 2);
  const stems = words.map((w) => {
    const stem = w.replace(JOSA, "");
    return stem.length >= 2 ? stem : w;
  });
  return Array.from(new Set(stems));
}

/** 표지에 핵심 문장의 낱말이 3분의 1 이상 들어 있는가(문장을 그대로 옮기지 않아도 된다. 어림 점검이라 학생이 직접 확인할 수 있다) */
export function coverHasKeyMessage(cover: Pick<Card, "title" | "body">, keyMessage: string): boolean {
  const words = keyWordsOf(keyMessage);
  if (words.length === 0) return false;
  const text = `${cover.title} ${cover.body}`.replace(/\s+/g, "");
  const hit = words.filter((w) => text.includes(w.replace(/\s+/g, ""))).length;
  return hit >= Math.max(1, Math.ceil(words.length / 3));
}

export const TOO_LONG_BODY = 70;
export const TOO_LONG_TITLE = 14;
export const MAX_SENTENCES = 2;

const sentenceCount = (s: string) => s.split(/[.!?。]+/).filter((x) => x.trim()).length;

const WARNING_ORDER: Record<WarningKind, number> = { empty: 0, "key-message": 1, "too-long": 2, exaggeration: 3, sources: 4, audience: 5 };

/** 카드뉴스 점검 결과. 제출을 막지 않는다(제출을 막는 것은 submitProblems). */
export function checkCardnews(a: CardnewsArtifact): Warning[] {
  const out: Warning[] = [];
  const cover = a.cards[0];
  if (!a.plan.keyMessage.trim()) {
    out.push({ id: "key-empty", kind: "key-message", message: "계획에서 전하고 싶은 핵심 한 문장을 먼저 적어 보세요." });
  } else if (cover && !a.confirms.keyMessage && !coverHasKeyMessage(cover, a.plan.keyMessage)) {
    out.push({
      id: "key-cover",
      kind: "key-message",
      cardId: cover.id,
      message: "표지에서 핵심 문장의 낱말을 찾기 어려워요. 표지에 핵심 메시지가 드러나는지 다시 봐요.",
    });
  }
  a.cards.forEach((c, i) => {
    const no = i + 1;
    if (!c.title.trim() || !c.body.trim()) {
      out.push({ id: `empty-${c.id}`, kind: "empty", cardId: c.id, message: `${no}번 카드에 비어 있는 칸이 있어요.` });
    }
    if (c.body.length > TOO_LONG_BODY || sentenceCount(c.body) > MAX_SENTENCES) {
      out.push({
        id: `long-body-${c.id}`,
        kind: "too-long",
        cardId: c.id,
        field: "body",
        message: `${no}번 카드 본문이 길어요. 카드 한 장에는 한 가지 생각만 담아 보세요.`,
      });
    }
    if (c.title.length > TOO_LONG_TITLE) {
      out.push({ id: `long-title-${c.id}`, kind: "too-long", cardId: c.id, field: "title", message: `${no}번 카드 제목이 길어요. 더 짧게 줄여 볼까요?` });
    }
    for (const field of ["title", "body"] as const) {
      const spans = findExaggerations(c[field]);
      if (spans.length) {
        out.push({
          id: `exag-${c.id}-${field}`,
          kind: "exaggeration",
          cardId: c.id,
          field,
          spans,
          message: `${no}번 카드에 과장처럼 들릴 수 있는 말(${spans.map((s) => `‘${s.word}’`).join(", ")})이 있어요. 확인할 수 있는 사실인가요?`,
        });
      }
    }
  });
  if (!a.plan.sources.some((s) => s.title.trim())) {
    out.push({ id: "sources", kind: "sources", message: "참고한 자료(출처)를 적지 않았어요. 어디에서 알게 된 내용인지 밝혀 주세요." });
  }
  if (!a.confirms.audience) {
    out.push({ id: "audience", kind: "audience", message: "읽을 사람이 이해할 수 있는 낱말인지 직접 확인하고 체크해 주세요." });
  }
  return out.sort((x, y) => WARNING_ORDER[x.kind] - WARNING_ORDER[y.kind]);
}
