// 읽기 활동의 호스트 쪽 순수 규칙(DB·서버 의존 없음, 단위 시험 가능).
// 진행 요약·시도 집계는 문법 활동과 같은 함수(grammar-rules)를 쓴다.
import {
  getActivity,
  getItem,
  getPassage,
  allSentences,
  type Passage,
  type ReadingAnswer,
  type ReadingItem,
} from "@/core/reading";

/** 학생 화면에 보내는 읽기 문제. 정답·근거 목록·원리·힌트·설명은 들어 있지 않다(오답/정답 뒤 서버가 따로 보낸다). */
interface StudentBase {
  id: string;
  prompt: string;
  standardCode: string;
  passageId: string;
}
export type StudentReadingItem =
  | (StudentBase & { type: "sentence-pick"; paragraphId?: string })
  | (StudentBase & { type: "label-sentences"; sentenceIds: string[]; labels: string[] })
  | (StudentBase & { type: "slot-paragraphs"; paragraphIds: string[]; slots: { id: string; label: string }[] })
  | (StudentBase & { type: "choice"; options: string[] })
  | (StudentBase & { type: "choice-with-evidence"; options: string[] });

export function toStudentReadingItem(item: ReadingItem): StudentReadingItem {
  const base: StudentBase = {
    id: item.id,
    prompt: item.prompt,
    standardCode: item.standardCode,
    passageId: item.passageId,
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
      return { ...base, type: "choice", options: [...item.options] };
    case "choice-with-evidence":
      return { ...base, type: "choice-with-evidence", options: [...item.options] };
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

/** 활동의 문제가 쓰는 지문만(읽을 글이라 학생에게 보낸다). */
export function studentPassages(activityId: string): Passage[] {
  const used = new Set(studentReadingItems(activityId).map((i) => i.passageId));
  const out: Passage[] = [];
  for (const id of used) {
    const p = getPassage(id);
    if (p) out.push(p);
  }
  return out;
}

const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/**
 * 요청으로 들어온 답안이 문제 형식에 맞는지 확인하고 정리된 답안을 돌려준다. 잘못되면 null.
 * label-sentences·slot-paragraphs는 일부만 채운 답도 통과시킨다(채점에서 incomplete로 안내만 한다).
 * 하지만 문제에 없는 문장·문단·꼬리표·칸이 들어 있으면 null.
 */
export function parseReadingAnswer(item: ReadingItem, raw: unknown): ReadingAnswer | null {
  if (!isRecord(raw) || raw.type !== item.type) return null;
  const passage = getPassage(item.passageId);
  if (!passage) return null;
  const sentenceIds = new Set(allSentences(passage).map((s) => s.id));
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
    return { type: "choice", option: raw.option };
  }
  if (!validOption(raw.option, item.options.length)) return null;
  const sid = raw.sentenceId;
  if (typeof sid !== "string" || !sentenceIds.has(sid)) return null;
  return { type: "choice-with-evidence", option: raw.option, sentenceId: sid };
}
