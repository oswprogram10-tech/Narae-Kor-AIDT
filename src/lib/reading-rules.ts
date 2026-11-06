// 읽기 활동의 호스트 쪽 순수 규칙(DB·서버 의존 없음, 단위 시험 가능).
// 진행 요약·시도 집계는 문법 활동과 같은 함수(grammar-rules)를 쓴다.
import {
  SUMMARY_MAX_INPUT,
  allSentences,
  getActivity,
  getItem,
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

/** 학생 화면에 보내는 읽기 문제. 정답·근거 목록·원리·힌트·설명은 들어 있지 않다(오답/정답 뒤 서버가 따로 보낸다). */
interface StudentBase {
  id: string;
  prompt: string;
  standardCode: string;
  passageId: string;
  /** 지문 둘을 함께 읽는 문제(관점 비교)일 때만 */
  passageIds?: string[];
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
export interface LockedReadingItem {
  id: string;
  locked: true;
}

export function toStudentReadingItem(item: ReadingItem): StudentReadingItem {
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
  }
}

/** 활동의 문제를 정답 정보 없이 돌려준다. 없는 활동이면 빈 배열. */
export function studentReadingItems(activityId: string): StudentReadingItem[] {
  const activity = getActivity(activityId);
  if (!activity) return [];
  const out: StudentReadingItem[] = [];
  for (const id of activity.itemIds) {
    const item = getItem(id);
    if (item) out.push(toStudentReadingItem(item));
  }
  return out;
}

/** 활동의 문제가 쓰는 지문만(읽을 글이라 학생에게 보낸다). 문단을 차례로 펼치는 활동은 studentReadingView를 쓴다. */
export function studentPassages(activityId: string): Passage[] {
  const used = new Set(studentReadingItems(activityId).flatMap((i) => i.passageIds ?? [i.passageId]));
  const out: Passage[] = [];
  for (const id of used) {
    const p = getPassage(id);
    if (p) out.push(p);
  }
  return out;
}

export interface ReadingView {
  items: (StudentReadingItem | LockedReadingItem)[];
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
  const activity = getActivity(activityId);
  const full = (activity?.itemIds ?? []).map((id) => getItem(id)).filter((x): x is ReadingItem => !!x);
  if (!isProgressive(full)) return { items: full.map(toStudentReadingItem), passages: studentPassages(activityId), progressive: false };
  const firstOpen = full.findIndex((i) => !solvedIds.has(i.id));
  return {
    items: full.map((i, idx) => (firstOpen !== -1 && idx > firstOpen && !solvedIds.has(i.id) ? { id: i.id, locked: true as const } : toStudentReadingItem(i))),
    passages: visiblePassages(full, solvedIds),
    progressive: true,
  };
}

/**
 * 보기는 섞은(표시) 순서로 보내고 parseReadingAnswer가 원래 번호로 되돌린다(채점·저장은 원래 번호).
 * 정답 공개처럼 원래 번호로 만든 답을 화면에 돌려줄 때는 이 함수로 표시 번호로 바꾼다.
 */
export function toDisplayAnswer(item: ReadingItem, answer: ReadingAnswer): ReadingAnswer {
  if (answer.type === "choice" && item.type === "choice") return { type: "choice", option: toDisplayIndex(item.id, item.options.length, answer.option) };
  if (answer.type === "choice-with-evidence" && item.type === "choice-with-evidence") {
    return { ...answer, option: toDisplayIndex(item.id, item.options.length, answer.option) };
  }
  return answer;
}

export function isProgressiveActivity(activityId: string): boolean {
  const activity = getActivity(activityId);
  return isProgressive((activity?.itemIds ?? []).map((id) => getItem(id)).filter((x): x is ReadingItem => !!x));
}

/** 이 문제를 풀 차례인지: 문단을 차례로 펼치는 활동에서는 앞 문제를 모두 풀어야 한다. */
export function isItemUnlocked(activityId: string, itemId: string, solvedIds: ReadonlySet<string>): boolean {
  const activity = getActivity(activityId);
  const full = (activity?.itemIds ?? []).map((id) => getItem(id)).filter((x): x is ReadingItem => !!x);
  if (!isProgressive(full)) return true;
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
export function parseReadingAnswer(item: ReadingItem, raw: unknown): ReadingAnswer | null {
  if (!isRecord(raw) || raw.type !== item.type) return null;
  const passage = itemPassages(item)[0];
  if (!passage) return null;
  // 고를 수 있는 문장: 학생에게 보이는 문장(지문 쌍이면 둘 다, 문단을 차례로 펼치면 펼친 문단까지)
  const sentenceIds = new Set(visibleSentences(item).map((s) => s.id));
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
