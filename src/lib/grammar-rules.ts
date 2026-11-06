// 문법 활동의 호스트 쪽 순수 규칙(DB·서버 의존 없음, 단위 시험 가능).
import { getActivity, getItem, type Block, type GrammarAnswer, type GrammarItem } from "@/core/grammar";
import { displayOptions, toDisplayIndex, toOriginalIndex } from "@/core/practice/shuffle";

/** 학생 화면에 보내는 문제. 정답·설명·원리·힌트는 들어 있지 않다(오답/정답 뒤 서버가 따로 보낸다). */
export type StudentItem =
  | { id: string; type: "sentence-build"; prompt: string; standardCode: string; blocks: Pick<Block, "id" | "text">[] }
  | { id: string; type: "agreement-fix"; prompt: string; standardCode: string; tokens: string[]; options: string[] }
  | { id: string; type: "choice"; prompt: string; standardCode: string; context?: string; target?: string; options: string[] };

export function toStudentItem(item: GrammarItem): StudentItem {
  if (item.type === "sentence-build") {
    return {
      id: item.id,
      type: "sentence-build",
      prompt: item.prompt,
      standardCode: item.standardCode,
      blocks: item.blocks.map((b) => ({ id: b.id, text: b.text })),
    };
  }
  if (item.type === "choice") {
    return {
      id: item.id,
      type: "choice",
      prompt: item.prompt,
      standardCode: item.standardCode,
      ...(item.context !== undefined ? { context: item.context } : {}),
      ...(item.target !== undefined ? { target: item.target } : {}),
      options: displayOptions(item.id, item.options),
    };
  }
  return {
    id: item.id,
    type: "agreement-fix",
    prompt: item.prompt,
    standardCode: item.standardCode,
    tokens: [...item.tokens],
    options: displayOptions(item.id, item.options),
  };
}

/**
 * 학생에게 보내는 보기는 섞은(표시) 순서이고, parseAnswer가 받은 번호를 원래 번호로 되돌린다(저장·채점은 원래 번호).
 * 정답 공개처럼 서버가 원래 번호로 만든 답을 화면에 돌려줄 때는 이 함수로 표시 번호로 바꾼다.
 */
export function toDisplayAnswer(item: GrammarItem, answer: GrammarAnswer): GrammarAnswer {
  if (answer.type === "choice" && item.type === "choice") return { type: "choice", option: toDisplayIndex(item.id, item.options.length, answer.option) };
  if (answer.type === "agreement-fix" && item.type === "agreement-fix") {
    return { type: "agreement-fix", index: answer.index, option: toDisplayIndex(item.id, item.options.length, answer.option) };
  }
  return answer;
}

/** 활동의 문제를 정답 정보 없이 돌려준다. 없는 활동이면 빈 배열. */
export function studentItems(activityId: string): StudentItem[] {
  const activity = getActivity(activityId);
  if (!activity) return [];
  const out: StudentItem[] = [];
  for (const id of activity.itemIds) {
    const item = getItem(id);
    if (item) out.push(toStudentItem(item));
  }
  return out;
}

/** 요청으로 들어온 답안이 문제 형식에 맞는지 확인하고 정리된 답안을 돌려준다. 잘못되면 null. */
export function parseAnswer(item: GrammarItem, raw: unknown): GrammarAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (item.type === "sentence-build") {
    if (a.type !== "sentence-build" || !Array.isArray(a.order)) return null;
    if (a.order.length !== item.blocks.length) return null;
    const ids = new Set(item.blocks.map((b) => b.id));
    const seen = new Set<string>();
    for (const x of a.order) {
      if (typeof x !== "string" || !ids.has(x) || seen.has(x)) return null;
      seen.add(x);
    }
    return { type: "sentence-build", order: [...(a.order as string[])] };
  }
  if (item.type === "choice") {
    if (a.type !== "choice" || !Number.isInteger(a.option)) return null;
    const o = a.option as number;
    if (o < 0 || o >= item.options.length) return null;
    return { type: "choice", option: toOriginalIndex(item.id, item.options.length, o) };
  }
  if (a.type !== "agreement-fix") return null;
  const { index, option } = a;
  if (!Number.isInteger(index) || !Number.isInteger(option)) return null;
  if ((index as number) < 0 || (index as number) >= item.tokens.length) return null;
  if ((option as number) < 0 || (option as number) >= item.options.length) return null;
  return { type: "agreement-fix", index: index as number, option: toOriginalIndex(item.id, item.options.length, option as number) };
}

/** 틀린 횟수에 넣지 않는 reason: 정답, 어색한 순서(문법), 다 고르지 않음·형식 불일치(읽기) */
const NOT_WRONG = new Set(["ok", "awkward", "incomplete", "type-mismatch"]);

/** 이전 시도의 reason 목록에서 '틀린 횟수'를 센다. 정답("ok")과 어색한 순서("awkward")는 세지 않는다. */
export function wrongAttemptCount(previousReasons: readonly string[]): number {
  return previousReasons.filter((r) => !NOT_WRONG.has(r)).length;
}

export type HintLevel = "principle" | "hint1" | "hint2" | "reveal";

/** 요약 쓰기에서 위험 신호·개인 정보로 안내만 하고 점검하지 않은 시도의 reason. 시도 횟수·정답률에 넣지 않는다. */
export const SAFETY_REASONS: ReadonlySet<string> = new Set(["distress", "personal_info"]);

const HINT_RANK: Record<string, number> = { hint1: 1, hint2: 2, reveal: 3 };

export interface AttemptRow {
  itemId: string;
  attemptNo: number;
  correct: boolean;
  feedbackLevel: string | null;
  createdAt: Date;
  /** 채점 사유(연구용 CSV의 근거 오답 수에 쓴다). 없을 수 있다. */
  reason?: string;
  /** 제출한 답 JSON(교사 화면에서 요약 글을 보여 줄 때만 쓴다) */
  answer?: unknown;
}

export interface ItemProgress {
  itemId: string;
  attempts: number;
  solved: boolean;
  firstTryCorrect: boolean;
  revealed: boolean;
  /** 0 = 힌트 없음, 1 = 힌트 1, 2 = 힌트 2, 3 = 정답 공개 */
  hintsUsed: number;
  /** 첫 시도부터 푼 시도까지 걸린 초(풀지 못했으면 null) */
  secondsToSolve: number | null;
}

/** 한 학생의 시도 기록을 문제별 진행 상황으로 줄인다. itemIds 순서대로 돌려준다. */
export function summarizeAttempts(itemIds: readonly string[], attempts: readonly AttemptRow[]): ItemProgress[] {
  return itemIds.map((itemId) => {
    const rows = attempts
      .filter((a) => a.itemId === itemId && !SAFETY_REASONS.has(a.reason ?? ""))
      .sort((a, b) => a.attemptNo - b.attemptNo);
    const correctRow = rows.find((r) => r.correct);
    const revealRow = rows.find((r) => r.feedbackLevel === "reveal");
    const solveRow = correctRow ?? revealRow;
    const first = rows[0];
    return {
      itemId,
      attempts: rows.length,
      solved: !!solveRow,
      firstTryCorrect: !!first && first.correct,
      revealed: !correctRow && !!revealRow,
      hintsUsed: rows.reduce((m, r) => Math.max(m, HINT_RANK[r.feedbackLevel ?? ""] ?? 0), 0),
      secondsToSolve:
        solveRow && first ? Math.max(0, Math.round((solveRow.createdAt.getTime() - first.createdAt.getTime()) / 1000)) : null,
    };
  });
}

export interface ProgressSummary {
  total: number;
  solved: number;
  firstTry: number;
  revealed: number;
}

export function progressSummary(items: readonly ItemProgress[]): ProgressSummary {
  return {
    total: items.length,
    solved: items.filter((p) => p.solved).length,
    firstTry: items.filter((p) => p.firstTryCorrect).length,
    revealed: items.filter((p) => p.revealed).length,
  };
}
