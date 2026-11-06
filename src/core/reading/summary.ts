// 학생이 직접 쓴 요약의 규칙 기반 점검과 피드백(AI 없음, 같은 글이면 늘 같은 결과).
// 문단 반영: 검수자가 정한 핵심 낱말 묶음이 글에 들어 있는지. 베껴 쓰기: 지문 문장을 거의 그대로 옮겼는지. 길이.
// 피드백은 문단 내용을 알려 주지 않고 '무엇에 대한 이야기였나요?'처럼 묻기만 한다.

import { classifyInput, DISTRESS_REPLY, PERSONAL_INFO_REPLY } from "@/core/coach/guard";
import { allSentences, getPassage } from "./passages";
import type { SummaryParagraphSpec, SummaryWriteItem } from "./types";

/** 서버가 받는 요약 글자 수 상한(공백 포함). 이보다 길면 요청을 거부한다. */
export const SUMMARY_MAX_INPUT = 1000;
/** 이만큼 고쳐 써도 안 되면 '선생님께 그대로 내기'를 보여 준다. */
export const SUMMARY_HELP_AFTER = 4;

/** 비교용 정규화: 글자와 숫자만 남기고 띄어쓰기·문장부호·ㅋㅋ/ㅠㅠ 같은 자음·모음 글자를 모두 지운다. */
export function normalizeText(s: string): string {
  return s.replace(/[\u3131-\u3163]/g, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

/** 글자 수(공백 제외) */
export function countChars(text: string): number {
  return text.replace(/\s/g, "").length;
}

/** 묶음 안의 낱말이 모두 들어 있는가(normalizedText는 normalizeText를 거친 글) */
export function groupMatches(group: readonly string[], normalizedText: string): boolean {
  const words = group.map(normalizeText).filter((w) => w.length > 0);
  return words.length > 0 && words.every((w) => normalizedText.includes(w));
}

/** 이 문단이 반영됐는가: 묶음 하나라도 맞으면 된다 */
export function paragraphCovered(spec: Pick<SummaryParagraphSpec, "keyGroups">, normalizedText: string): boolean {
  return spec.keyGroups.some((g) => groupMatches(g, normalizedText));
}

/** 두 글에서 겹치는 가장 긴 연속 글자 수 */
function longestCommonRun(a: string, b: string): number {
  if (!a || !b) return 0;
  let best = 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

/** 지문 문장 중 학생 글에 거의 그대로(문장의 70% 이상이면서 15글자 이상 이어서) 들어 있는 문장 수 */
export function copiedSentenceCount(passageId: string, normalizedText: string): number {
  const passage = getPassage(passageId);
  if (!passage) return 0;
  let count = 0;
  for (const s of allSentences(passage)) {
    const n = normalizeText(s.text);
    const need = Math.max(Math.ceil(n.length * 0.7), 15);
    if (n.length >= need && longestCommonRun(normalizedText, n) >= need) count++;
  }
  return count;
}

export type SummaryReason = "ok" | "too-short" | "missing-paragraph" | "copied" | "too-long";

export interface SummaryResult {
  done: boolean;
  /** 반영된 문단 수 / 전체 문단 수 (0~1) */
  coverage: number;
  covered: number;
  total: number;
  /** 빠진 문단 번호(1부터, 지문 순서) */
  missing: number[];
  /** 지문 문장을 거의 그대로 옮긴 문장이 둘 이상인가 */
  copied: boolean;
  copiedCount: number;
  /** 글자 수(공백 제외) */
  length: number;
  reason: SummaryReason;
}

export function evaluateSummary(item: SummaryWriteItem, text: string): SummaryResult {
  const norm = normalizeText(text);
  const length = countChars(text);
  const passage = getPassage(item.passageId);
  const missing: number[] = [];
  item.paragraphs.forEach((spec) => {
    if (!paragraphCovered(spec, norm)) {
      const at = passage?.paragraphs.findIndex((p) => p.id === spec.paragraphId) ?? -1;
      missing.push(at + 1);
    }
  });
  const total = item.paragraphs.length;
  const covered = total - missing.length;
  const copiedCount = copiedSentenceCount(item.passageId, norm);
  const copied = copiedCount >= 2;
  const reason: SummaryReason =
    length < item.minChars
      ? "too-short"
      : missing.length > 0
        ? "missing-paragraph"
        : copied
          ? "copied"
          : length > item.maxChars
            ? "too-long"
            : "ok";
  return {
    done: reason === "ok",
    coverage: total ? covered / total : 0,
    covered,
    total,
    missing,
    copied,
    copiedCount,
    length,
    reason,
  };
}

/** 학생에게 보이는 말. 문단 내용은 알려 주지 않는다. tries: 이번을 포함해 점검받은 횟수 */
export function summaryFeedback(item: SummaryWriteItem, r: SummaryResult, tries: number): string {
  const range = `${item.minChars}자에서 ${item.maxChars}자 사이로 써요.`;
  let message: string;
  switch (r.reason) {
    case "ok":
      return `잘 간추렸어요! 모든 문단의 중요한 내용이 들어 있고 길이도 알맞아요. ${item.explanation}`;
    case "too-short":
      message =
        r.length === 0
          ? `먼저 글을 읽고 내 말로 요약을 써 보세요. ${range}`
          : `조금 더 써 볼까요? 지금은 ${r.length}자예요. ${range}`;
      break;
    case "missing-paragraph": {
      const first = r.missing[0];
      const spec = item.paragraphs[first - 1];
      message = `${r.total}개 문단 중 ${r.covered}개가 들어 있어요. ${first}문단은 무엇에 대한 이야기였나요? ${spec?.topicHint ?? ""} 다시 읽고 한 부분으로 넣어 볼까요?`;
      break;
    }
    case "copied":
      message = "지문에 있는 문장을 거의 그대로 옮겨 썼어요. 자기 말로 줄여 써 볼까요?";
      break;
    case "too-long":
      message = `조금 길어요. 지금은 ${r.length}자예요. ${item.maxChars}자 안으로 가장 중요한 내용만 남겨 줄여 볼까요?`;
      break;
  }
  message = message.replace(/\s+/g, " ").trim();
  if (tries === 2) message += ` ${item.hints[0]}`;
  else if (tries === 3) message += ` ${item.hints[1]}`;
  else if (tries >= SUMMARY_HELP_AFTER) {
    message += " 여러 번 고쳐 쓰느라 애썼어요. 마음에 들면 지금 쓴 글을 선생님께 그대로 내도 괜찮아요.";
  }
  return message;
}

export interface SummaryGate {
  kind: "distress" | "personal_info" | null;
  /** kind가 있을 때 학생에게 보여 줄 말(쓰기 코치와 같은 정해진 안내) */
  reply?: string;
}

/**
 * 요약을 점검하기 전에 먼저 돌린다. 힘든 일을 말했거나 개인 정보가 있으면 요약은 점검하지 않고
 * 쓰기 코치와 같은 안내를 한다. 호스트는 이 결과를 기록해 교사에게 알린다.
 */
export function summaryGate(text: string): SummaryGate {
  const flags = classifyInput(text);
  if (flags.distress) return { kind: "distress", reply: DISTRESS_REPLY.reply };
  if (flags.personalInfo) return { kind: "personal_info", reply: PERSONAL_INFO_REPLY.reply };
  return { kind: null };
}
