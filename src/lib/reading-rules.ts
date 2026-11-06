// 읽기 활동의 호스트 쪽 순수 규칙(DB·서버 의존 없음, 단위 시험 가능).
// 진행 요약·시도 집계는 문법 활동과 같은 함수(grammar-rules)를 쓴다.
import {
  SUMMARY_MAX_INPUT,
  allSentences,
  getPassage,
  isProgressive,
  itemPassages,
  visiblePassages,
  visibleSentences,
  type Passage,
  type ReadingAnswer,
  type ReadingItem,
} from "@/core/reading";
import { displayOptions, toDisplayIndex, toOriginalIndex } from "@/core/practice/shuffle";
import { displayQueries, displayResults, searchEvidence, type EvidenceField, type MediaAnswer, type MediaItem, type SearchTaskItem } from "@/core/media";
import {
  OWN_LINE_MAX,
  displayEvents,
  displayFeelings,
  feelingOrder,
  type LiteratureAnswer,
  type MoodPoint,
  type RelationEdge,
} from "@/core/literature";
import { activityItemsOf, type HostItem } from "@/lib/activities";

/** 학생 화면에 보내는 읽기 문제. 정답·근거 목록·원리·힌트·설명은 들어 있지 않다(오답/정답 뒤 서버가 따로 보낸다). */
interface StudentBase {
  id: string;
  prompt: string;
  standardCode: string;
  passageId: string;
  /** 지문 둘을 함께 읽는 문제(관점 비교)일 때만 */
  passageIds?: string[];
}
/**
 * 검색 실험실 문제. 검색어는 섞은(표시) 순서로 글만 보낸다.
 * 검색 결과는 처음에 보내지 않는다(학생이 고른 검색어의 결과만 답을 보낸 뒤 서버가 따로 보낸다).
 */
export interface StudentSearchItem {
  id: string;
  type: "search-task";
  prompt: string;
  standardCode: string;
  purpose: string;
  queries: { text: string }[];
}

/** 학생에게 보이는 검색 결과 한 줄(정답 정보 없음). fields는 근거로 누를 수 있는 칸(화면 순서) */
export interface StudentSearchResult {
  id: string;
  title: string;
  site: string;
  snippet: string;
  date?: string;
  isAd: boolean;
  fields: EvidenceField[];
}

/** 학생이 고른 검색어의 결과. query는 표시 번호, results는 표시 순서(배열 위치가 표시 번호) */
export interface StudentSearchView {
  query: number;
  results: StudentSearchResult[];
}

export type StudentReadingItem =
  | (StudentBase & { type: "sentence-pick"; paragraphId?: string })
  | (StudentBase & { type: "label-sentences"; sentenceIds: string[]; labels: string[] })
  | (StudentBase & { type: "slot-paragraphs"; paragraphIds: string[]; slots: { id: string; label: string }[] })
  | (StudentBase & { type: "choice"; options: string[] })
  | (StudentBase & { type: "choice-with-evidence"; options: string[] })
  /** 요약 쓰기: 핵심 낱말·문단 힌트는 보내지 않는다(글자 수 범위만) */
  | (StudentBase & { type: "summary-write"; minChars: number; maxChars: number });

/** 문단을 차례로 펼치는 활동에서 아직 풀 차례가 아닌 문제: 내용(안내·보기)을 보내지 않는다. */
/**
 * 문학 활동의 새 문제 형식. 정답 범위(minOk·maxOk)·정답 마음 낱말·근거 목록·정답 순서는 들어 있지 않다.
 * 마음 낱말·사건 카드는 섞은(표시) 순서로 보낸다.
 */
export type StudentLiteratureItem =
  /** 마음 온도: 장면 문단 id는 문제 글에도 나오는 정보(근거를 그 문단에서 고르게 한다) */
  | (StudentBase & { type: "mood-scale"; character: string; sceneParagraphId: string; feelings: string[] })
  | (StudentBase & { type: "sequence"; events: { id: string; text: string }[] })
  /** 내 한 줄: 최대 글자 수만 보낸다 */
  | (StudentBase & { type: "own-line"; maxChars: number });

/** 문학 활동 화면에 곁들이는 그림 재료: 마음 그래프(푼 장면의 학생 값)와 인물 관계도(푼 관계 문제의 정답 관계) */
export interface LiteratureExtras {
  mood: MoodPoint[];
  /** 인물 관계도: 가운데 인물(main)과 푼 관계 문제의 선. 푼 것이 없으면 edges는 빈 배열 */
  relations: { main: string; edges: RelationEdge[] };
}

/** 읽기·매체·문학 활동 화면의 문제 */
export type StudentMediaItem = StudentReadingItem | StudentSearchItem | StudentLiteratureItem;

export interface LockedReadingItem {
  id: string;
  locked: true;
}

export function toStudentReadingItem(item: ReadingItem): StudentReadingItem;
export function toStudentReadingItem(item: HostItem): StudentMediaItem;
export function toStudentReadingItem(item: HostItem): StudentMediaItem {
  if (item.type === "search-task") {
    return {
      id: item.id,
      type: "search-task",
      prompt: item.prompt,
      standardCode: item.standardCode,
      purpose: item.purpose,
      queries: displayQueries(item).map(({ query }) => ({ text: query.text })),
    };
  }
  const base: StudentBase = {
    id: item.id,
    prompt: item.prompt,
    standardCode: item.standardCode,
    passageId: item.passageId,
    ...(item.passageIds !== undefined ? { passageIds: [...item.passageIds] } : {}),
  };
  switch (item.type) {
    case "sentence-pick":
      return { ...base, type: "sentence-pick", ...(item.paragraphId !== undefined ? { paragraphId: item.paragraphId } : {}) };
    case "label-sentences":
      return { ...base, type: "label-sentences", sentenceIds: [...item.sentenceIds], labels: [...item.labels] };
    case "slot-paragraphs":
      return {
        ...base,
        type: "slot-paragraphs",
        paragraphIds: [...item.paragraphIds],
        slots: item.slots.map((s) => ({ id: s.id, label: s.label })),
      };
    case "choice":
      return { ...base, type: "choice", options: displayOptions(item.id, item.options) };
    case "choice-with-evidence":
      return { ...base, type: "choice-with-evidence", options: displayOptions(item.id, item.options) };
    case "summary-write":
      return { ...base, type: "summary-write", minChars: item.minChars, maxChars: item.maxChars };
    case "mood-scale":
      return { ...base, type: "mood-scale", character: item.character, sceneParagraphId: item.sceneParagraphId, feelings: displayFeelings(item) };
    case "sequence":
      return { ...base, type: "sequence", events: displayEvents(item).map((e) => ({ id: e.id, text: e.text })) };
    case "own-line":
      return { ...base, type: "own-line", maxChars: OWN_LINE_MAX };
  }
}

/** 활동의 문제를 정답 정보 없이 돌려준다. 없는 활동이면 빈 배열. */
export function studentMediaItems(activityId: string): StudentMediaItem[] {
  return activityItemsOf(activityId).map((item) => toStudentReadingItem(item));
}

/** 읽기 문제 형식만(검색 실험실·문학 새 형식 문제는 studentMediaItems) */
export function studentReadingItems(activityId: string): StudentReadingItem[] {
  return studentMediaItems(activityId).filter(
    (i): i is StudentReadingItem => i.type !== "search-task" && i.type !== "mood-scale" && i.type !== "sequence" && i.type !== "own-line",
  );
}

/** 학생이 고른 검색어(원래 번호)의 결과를 표시 순서로. 범위 밖이면 undefined */
export function searchViewFor(item: SearchTaskItem, originalQuery: number): StudentSearchView | undefined {
  const rows = displayResults(item, originalQuery);
  if (rows.length === 0) return undefined;
  return {
    query: toDisplayIndex(`${item.id}:q`, item.queries.length, originalQuery),
    results: rows.map(({ result }) => ({
      id: result.id,
      title: result.title,
      site: result.site,
      snippet: result.snippet,
      ...(result.date !== undefined ? { date: result.date } : {}),
      isAd: result.isAd === true,
      fields: searchEvidence(result),
    })),
  };
}

/** 활동의 문제가 쓰는 지문만(읽을 글이라 학생에게 보낸다). 문단을 차례로 펼치는 활동은 studentReadingView를 쓴다. */
export function studentPassages(activityId: string): Passage[] {
  const used = new Set(studentMediaItems(activityId).flatMap((i) => (i.type === "search-task" ? [] : (i.passageIds ?? [i.passageId]))));
  const out: Passage[] = [];
  for (const id of used) {
    const p = getPassage(id);
    if (p) out.push(p);
  }
  return out;
}

export interface ReadingView {
  items: (StudentMediaItem | LockedReadingItem)[];
  passages: Passage[];
  /** 문단을 차례로 펼치는 활동인가 */
  progressive: boolean;
}

/**
 * 학생에게 지금 보낼 문제와 지문. 문단을 차례로 펼치는 활동(예측하며 읽기)은
 * 지금 풀 문제(처음으로 안 푼 문제)가 보여 주는 문단까지만 보내고, 뒤의 문제는 내용 없이 자리만 보낸다.
 * 푼 문제 하나가 늘면 서버가 이 함수로 다시 계산해 새 문단과 다음 문제를 보낸다.
 */
export function studentReadingView(activityId: string, solvedIds: ReadonlySet<string>): ReadingView {
  const full = activityItemsOf(activityId);
  if (!isProgressive(readingOnly(full))) return { items: full.map((i) => toStudentReadingItem(i)), passages: studentPassages(activityId), progressive: false };
  const firstOpen = full.findIndex((i) => !solvedIds.has(i.id));
  return {
    items: full.map((i, idx) => (firstOpen !== -1 && idx > firstOpen && !solvedIds.has(i.id) ? { id: i.id, locked: true as const } : toStudentReadingItem(i))),
    passages: visiblePassages(readingOnly(full), solvedIds),
    progressive: true,
  };
}

/**
 * 보기는 섞은(표시) 순서로 보내고 parseReadingAnswer가 원래 번호로 되돌린다(채점·저장은 원래 번호).
 * 정답 공개처럼 원래 번호로 만든 답을 화면에 돌려줄 때는 이 함수로 표시 번호로 바꾼다.
 */
export function toDisplayAnswer(item: HostItem, answer: MediaAnswer | LiteratureAnswer): MediaAnswer | LiteratureAnswer {
  if (item.type === "mood-scale") {
    if (answer.type !== "mood-scale") return answer;
    // 마음 낱말은 섞어서 보여 주므로 원래 번호를 표시 번호로 바꾼다
    return { ...answer, feeling: feelingOrder(item).indexOf(answer.feeling) };
  }
  if (item.type === "search-task") {
    if (answer.type !== "search-task") return answer;
    const results = item.queries[answer.query]?.results;
    return {
      type: "search-task",
      query: toDisplayIndex(`${item.id}:q`, item.queries.length, answer.query),
      ...(answer.result !== undefined && results ? { result: toDisplayIndex(`${item.id}:r`, results.length, answer.result) } : {}),
      ...(answer.evidenceId !== undefined ? { evidenceId: answer.evidenceId } : {}),
    };
  }
  if (answer.type === "choice" && item.type === "choice") return { type: "choice", option: toDisplayIndex(item.id, item.options.length, answer.option) };
  if (answer.type === "choice-with-evidence" && item.type === "choice-with-evidence") {
    return { ...answer, option: toDisplayIndex(item.id, item.options.length, answer.option) };
  }
  return answer;
}

const readingOnly = (items: readonly HostItem[]): ReadingItem[] =>
  items.filter((i): i is ReadingItem => i.type !== "search-task" && i.type !== "mood-scale" && i.type !== "sequence" && i.type !== "own-line");

export function isProgressiveActivity(activityId: string): boolean {
  return isProgressive(readingOnly(activityItemsOf(activityId)));
}

/** 이 문제를 풀 차례인지: 문단을 차례로 펼치는 활동에서는 앞 문제를 모두 풀어야 한다. */
export function isItemUnlocked(activityId: string, itemId: string, solvedIds: ReadonlySet<string>): boolean {
  const full = activityItemsOf(activityId);
  if (!isProgressive(readingOnly(full))) return true;
  const firstOpen = full.findIndex((i) => !solvedIds.has(i.id));
  const at = full.findIndex((i) => i.id === itemId);
  return at >= 0 && (firstOpen === -1 || at <= firstOpen);
}

const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/**
 * 요청으로 들어온 답안이 문제 형식에 맞는지 확인하고 정리된 답안을 돌려준다. 잘못되면 null.
 * label-sentences·slot-paragraphs는 일부만 채운 답도 통과시킨다(채점에서 incomplete로 안내만 한다).
 * 하지만 문제에 없는 문장·문단·꼬리표·칸이 들어 있으면 null.
 */
export function parseReadingAnswer(item: ReadingItem, raw: unknown): ReadingAnswer | null;
export function parseReadingAnswer(item: MediaItem, raw: unknown): MediaAnswer | null;
export function parseReadingAnswer(item: HostItem, raw: unknown): MediaAnswer | LiteratureAnswer | null;
export function parseReadingAnswer(item: HostItem, raw: unknown): MediaAnswer | LiteratureAnswer | null {
  if (!isRecord(raw) || raw.type !== item.type) return null;
  if (item.type === "search-task") return parseSearchAnswer(item, raw);
  const passage = itemPassages(item)[0];
  if (!passage) return null;
  // 고를 수 있는 문장: 학생에게 보이는 문장(지문 쌍이면 둘 다, 문단을 차례로 펼치면 펼친 문단까지)
  const sentenceIds = new Set(visibleSentences(item).map((s) => s.id));
  if (item.type === "mood-scale") {
    // 마음 온도 1~5(정수), 마음 낱말은 표시 번호 → 원래 번호, 근거 문장은 보이는 문장
    const { value, feeling, evidenceId } = raw;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) return null;
    if (typeof feeling !== "number" || !Number.isInteger(feeling) || feeling < 0 || feeling >= item.feelingOptions.length) return null;
    if (typeof evidenceId !== "string" || !sentenceIds.has(evidenceId)) return null;
    return { type: "mood-scale", value, feeling: feelingOrder(item)[feeling], evidenceId };
  }
  if (item.type === "sequence") {
    // 놓은 사건 id 목록: 문제의 사건만, 겹치지 않게(일부만 놓은 답은 채점에서 incomplete로 안내한다)
    if (!Array.isArray(raw.order) || raw.order.length > item.events.length) return null;
    const known = new Set(item.events.map((e) => e.id));
    const seen = new Set<string>();
    for (const id of raw.order) {
      if (typeof id !== "string" || !known.has(id) || seen.has(id)) return null;
      seen.add(id);
    }
    return { type: "sequence", order: [...(raw.order as string[])] };
  }
  if (item.type === "own-line") {
    // 내 한 줄: 요약 쓰기처럼 1000자까지 받는다. 60자 제한은 안전 점검(위험 신호·개인 정보) 뒤에 기록 경로가 안내한다.
    // 길이로 먼저 거부하면 긴 글에 담긴 위험 신호를 놓치기 때문이다.
    if (typeof raw.text !== "string" || raw.text.length > SUMMARY_MAX_INPUT) return null;
    return { type: "own-line", text: raw.text.trim() };
  }
  if (item.type === "summary-write") {
    const text = raw.text;
    if (typeof text !== "string" || text.length > SUMMARY_MAX_INPUT) return null;
    if (raw.submitAsIs !== undefined && typeof raw.submitAsIs !== "boolean") return null;
    return { type: "summary-write", text: text.trim(), ...(raw.submitAsIs === true ? { submitAsIs: true } : {}) };
  }
  const validOption = (n: unknown, len: number): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < len;

  if (item.type === "sentence-pick") {
    const id = raw.sentenceId;
    if (typeof id !== "string" || !sentenceIds.has(id)) return null;
    if (item.paragraphId) {
      const inParagraph = allSentences(passage).some((s) => s.id === id && s.paragraphId === item.paragraphId);
      if (!inParagraph) return null;
    }
    return { type: "sentence-pick", sentenceId: id };
  }
  if (item.type === "label-sentences") {
    if (!isRecord(raw.labels)) return null;
    const labels: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.labels)) {
      if (!item.sentenceIds.includes(k) || typeof v !== "string" || !item.labels.includes(v)) return null;
      labels[k] = v;
    }
    return { type: "label-sentences", labels };
  }
  if (item.type === "slot-paragraphs") {
    if (!isRecord(raw.placement)) return null;
    const slotIds = new Set(item.slots.map((s) => s.id));
    const placement: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.placement)) {
      if (!item.paragraphIds.includes(k) || typeof v !== "string" || !slotIds.has(v)) return null;
      placement[k] = v;
    }
    return { type: "slot-paragraphs", placement };
  }
  if (item.type === "choice") {
    if (!validOption(raw.option, item.options.length)) return null;
    return { type: "choice", option: toOriginalIndex(item.id, item.options.length, raw.option) };
  }
  if (item.type !== "choice-with-evidence") return null;
  if (!validOption(raw.option, item.options.length)) return null;
  const sid = raw.sentenceId;
  if (typeof sid !== "string" || !sentenceIds.has(sid)) return null;
  return { type: "choice-with-evidence", option: toOriginalIndex(item.id, item.options.length, raw.option), sentenceId: sid };
}

/**
 * 검색 실험실 답: 검색어·결과는 표시 번호로 받아 원래 번호로 되돌린다(결과 번호는 그 검색어의 결과 안에서).
 * 결과·근거는 없어도 된다(1단계: 검색어만 고름). 근거만 있고 결과가 없으면 거부한다.
 * 근거 칸 id가 고른 결과의 칸이 아니면 채점에서 incomplete로 안내한다.
 */
function parseSearchAnswer(item: SearchTaskItem, raw: Record<string, unknown>): MediaAnswer | null {
  const valid = (n: unknown, len: number): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < len;
  if (!valid(raw.query, item.queries.length)) return null;
  const query = toOriginalIndex(`${item.id}:q`, item.queries.length, raw.query);
  const results = item.queries[query].results;
  let result: number | undefined;
  if (raw.result !== undefined) {
    if (!valid(raw.result, results.length)) return null;
    result = toOriginalIndex(`${item.id}:r`, results.length, raw.result);
  }
  let evidenceId: string | undefined;
  if (raw.evidenceId !== undefined) {
    if (typeof raw.evidenceId !== "string" || raw.evidenceId.length > 40 || result === undefined) return null;
    evidenceId = raw.evidenceId;
  }
  return {
    type: "search-task",
    query,
    ...(result !== undefined ? { result } : {}),
    ...(evidenceId !== undefined ? { evidenceId } : {}),
  };
}
