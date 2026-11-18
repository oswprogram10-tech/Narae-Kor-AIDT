import {
  CARD_COLORS,
  CARD_ICONS,
  CARD_MAX,
  CARD_MIN,
  COLOR_IDS,
  LIMITS,
  MAX_SOURCES,
  type Card,
  type CardLayout,
  type CardnewsArtifact,
  type SourceCard,
  type StepNo,
  type CardPlan,
} from "./types";

const clampStr = (x: unknown, max: number): string =>
  typeof x === "string" ? Array.from(x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")).slice(0, max).join("") : "";
const asRecord = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const asStep = (x: unknown, fallback: StepNo): StepNo => (x === 1 || x === 2 || x === 3 || x === 4 ? x : fallback);

/** 카드 위치에 따른 틀 */
export function layoutAt(index: number, total: number): CardLayout {
  if (index === 0) return "cover";
  return index === total - 1 ? "closing" : "content";
}

export const LAYOUT_LABELS: Record<CardLayout, string> = { cover: "표지", content: "내용", closing: "마무리" };

const ID_RE = /^[a-z0-9]{1,8}$/;

function blankCard(id: string, n: number): Card {
  return { id, layout: "content", title: "", body: "", color: COLOR_IDS[n % COLOR_IDS.length], icon: CARD_ICONS[(n * 5) % CARD_ICONS.length] };
}

/** 처음 시작하는 카드뉴스: 빈 카드 4장 */
export function emptyCardnews(): CardnewsArtifact {
  const cards = [0, 1, 2, 3].map((n) => blankCard(`c${n + 1}`, n));
  cards.forEach((c, i) => (c.layout = layoutAt(i, cards.length)));
  return {
    kind: "cardnews",
    step: 1,
    maxStep: 1,
    plan: { topic: "", audience: "", keyMessage: "", sources: [] },
    cards,
    confirms: { keyMessage: false, audience: false },
    submitWarnings: null,
    revisions: 0,
    lastRevisionAt: null,
  };
}

/** 새 카드를 만든다(고른 id가 겹치지 않게). */
export function newCard(existing: readonly Card[]): Card {
  const used = new Set(existing.map((c) => c.id));
  let n = existing.length + 1;
  while (used.has(`c${n}`)) n++;
  return blankCard(`c${n}`, existing.length);
}

/**
 * 밖에서 들어온 값을 안전한 카드뉴스 형식으로 고친다(글자 수·개수·고정 목록 검사).
 * 호스트가 정하는 값(제출 때 경고 수, 고친 횟수)은 prev에서 가져오고 입력은 무시한다.
 */
export function sanitizeCardnews(raw: unknown, prev?: CardnewsArtifact | null): CardnewsArtifact | null {
  const r = asRecord(raw);
  if (r.kind !== "cardnews" || !Array.isArray(r.cards)) return null;
  const plan = asRecord(r.plan);
  const sources = (Array.isArray(plan.sources) ? plan.sources : []).slice(0, MAX_SOURCES).map((s) => {
    const o = asRecord(s);
    return { title: clampStr(o.title, LIMITS.sourceTitle), where: clampStr(o.where, LIMITS.sourceWhere) };
  });
  const cleanPlan: CardPlan = {
    topic: clampStr(plan.topic, LIMITS.topic),
    audience: clampStr(plan.audience, LIMITS.audience),
    keyMessage: clampStr(plan.keyMessage, LIMITS.keyMessage),
    sources,
  };
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const c of r.cards.slice(0, CARD_MAX)) {
    const o = asRecord(c);
    let id = typeof o.id === "string" && ID_RE.test(o.id) && !seen.has(o.id) ? o.id : "";
    for (let n = cards.length + 1; !id; n++) if (!seen.has(`c${n}`)) id = `c${n}`;
    seen.add(id);
    cards.push({
      id,
      layout: "content",
      title: clampStr(o.title, LIMITS.cardTitle),
      body: clampStr(o.body, LIMITS.cardBody),
      color: typeof o.color === "string" && COLOR_IDS.includes(o.color) ? o.color : COLOR_IDS[0],
      icon: typeof o.icon === "string" && CARD_ICONS.includes(o.icon) ? o.icon : CARD_ICONS[0],
    });
  }
  if (cards.length === 0) return null;
  cards.forEach((c, i) => (c.layout = layoutAt(i, cards.length)));
  const conf = asRecord(r.confirms);
  const step = asStep(r.step, 1);
  const prevMax = prev?.maxStep ?? 1;
  return {
    kind: "cardnews",
    step,
    maxStep: Math.max(prevMax, step) as StepNo,
    plan: cleanPlan,
    cards,
    confirms: { keyMessage: conf.keyMessage === true, audience: conf.audience === true },
    submitWarnings: prev?.submitWarnings ?? null,
    revisions: prev?.revisions ?? 0,
    lastRevisionAt: prev?.lastRevisionAt ?? null,
  };
}

/** 제출 전에 꼭 채워야 하는 것(막는 문제). 점검 경고와는 다르다. */
export function submitProblems(a: CardnewsArtifact): string[] {
  const out: string[] = [];
  if (!a.plan.topic.trim()) out.push("계획에서 주제를 적어 주세요.");
  if (!a.plan.audience.trim()) out.push("계획에서 읽을 사람을 적어 주세요.");
  if (!a.plan.keyMessage.trim()) out.push("계획에서 전하고 싶은 핵심 한 문장을 적어 주세요.");
  if (a.cards.length < CARD_MIN) out.push(`카드는 ${CARD_MIN}장 이상 만들어 주세요.`);
  a.cards.forEach((c, i) => {
    if (!c.title.trim() || !c.body.trim()) out.push(`${i + 1}번 카드의 제목과 본문을 모두 써 주세요.`);
  });
  return out;
}

/** 마지막 장에 자동으로 붙는 출처 카드 */
export function sourceCardOf(plan: CardPlan): SourceCard {
  const lines = plan.sources
    .filter((s) => s.title.trim())
    .map((s) => (s.where.trim() ? `${s.title.trim()} (${s.where.trim()})` : s.title.trim()));
  return { title: "참고한 자료", lines: lines.length ? lines : ["적어 둔 출처가 없어요"] };
}

export const colorOf = (id: string) => CARD_COLORS.find((c) => c.id === id) ?? CARD_COLORS[0];
