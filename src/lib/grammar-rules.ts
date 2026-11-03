// 문법 활동의 호스트 쪽 순수 규칙(DB·서버 의존 없음, 단위 시험 가능).
import { getActivity, getItem, type Block, type GrammarAnswer, type GrammarItem } from "@/core/grammar";

/** 학생 화면에 보내는 문제. 정답·설명·원리·힌트는 들어 있지 않다(오답/정답 뒤 서버가 따로 보낸다). */
export type StudentItem =
  | { id: string; type: "sentence-build"; prompt: string; standardCode: string; blocks: Pick<Block, "id" | "text">[] }
  | { id: string; type: "agreement-fix"; prompt: string; standardCode: string; tokens: string[]; options: string[] };

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
  return {
    id: item.id,
    type: "agreement-fix",
    prompt: item.prompt,
    standardCode: item.standardCode,
    tokens: [...item.tokens],
    options: [...item.options],
  };
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
  if (a.type !== "agreement-fix") return null;
  const { index, option } = a;
  if (!Number.isInteger(index) || !Number.isInteger(option)) return null;
  if ((index as number) < 0 || (index as number) >= item.tokens.length) return null;
  if ((option as number) < 0 || (option as number) >= item.options.length) return null;
  return { type: "agreement-fix", index: index as number, option: option as number };
}

/** 이전 시도의 reason 목록에서 '틀린 횟수'를 센다. 정답("ok")과 어색한 순서("awkward")는 세지 않는다. */
export function wrongAttemptCount(previousReasons: readonly string[]): number {
  return previousReasons.filter((r) => r !== "ok" && r !== "awkward").length;
}

export type HintLevel = "principle" | "hint1" | "hint2" | "reveal";

const HINT_RANK: Record<string, number> = { hint1: 1, hint2: 2, reveal: 3 };

export interface AttemptRow {
  itemId: string;
  attemptNo: number;
  correct: boolean;
  feedbackLevel: string | null;
  createdAt: Date;
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
    const rows = attempts.filter((a) => a.itemId === itemId).sort((a, b) => a.attemptNo - b.attemptNo);
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
