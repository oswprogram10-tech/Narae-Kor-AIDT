import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getItem } from "@/core/grammar";
import { activityItems, attemptsFor } from "@/lib/grammar";
import { readingActivityItems } from "@/lib/reading";
import { findItem } from "@/lib/activities";
import { SAFETY_REASONS, summarizeAttempts, type AttemptRow, type ItemProgress } from "@/lib/grammar-rules";

export interface GrammarStudentRow {
  studentId: number;
  number: number;
  nickname: string;
  submissionId: number | null;
  status: string | null;
  solved: number;
  total: number;
  firstTry: number;
  revealed: number;
  /** 힌트(힌트 1 이상)를 본 문제 수 */
  hintItems: number;
  updatedAt: string | null;
  /** 읽기 요약 쓰기에서 위험 신호·개인 정보가 감지됐는지(쓰기 코치의 알림과 같은 뜻). 가장 심한 것 하나 */
  alert: "distress" | "personal_info" | null;
}

/** 요약 쓰기 한 번의 제출(교사만 본다) */
export interface SummaryAttemptView {
  no: number;
  reason: string;
  text: string;
  /** 위험 신호·개인 정보로 점검하지 않은 제출이면 그 종류 */
  safety: "distress" | "personal_info" | null;
  coverage: number | null;
  length: number | null;
  copied: boolean;
  submittedAsIs: boolean;
  at: string;
}

export interface SummaryStudentRow {
  studentId: number;
  number: number;
  nickname: string;
  itemId: string;
  /** 활동 안에서의 문제 번호(1부터) */
  no: number;
  solved: boolean;
  /** 여러 번 고쳐 쓴 뒤 그대로 낸 경우 */
  helped: boolean;
  attempts: SummaryAttemptView[];
}

export interface GrammarItemRow {
  itemId: string;
  /** 활동 안에서의 문제 번호(1부터) */
  no: number;
  students: number;
  firstTryRate: number | null;
  avgAttempts: number | null;
  revealed: number;
}

export interface GrammarStatus {
  students: GrammarStudentRow[];
  items: GrammarItemRow[];
  /** 읽기 활동의 요약 쓰기 제출(없으면 빈 배열) */
  summaries: SummaryStudentRow[];
}

/** 문법·읽기·매체 활동이 같은 화면·계산을 쓴다. kind로 문제 은행만 고른다(매체는 읽기 문제 은행 + 검색 실험실). */
export type ActivityKind = "grammar" | "reading" | "media";

const itemIdsOf = (kind: ActivityKind, activityId: string | null): string[] =>
  (kind !== "grammar" ? readingActivityItems(activityId) : activityItems(activityId)).map((i) => i.id);

async function collect(assignmentId: number, classId: number, activityId: string | null, kind: ActivityKind) {
  const db = await getDb();
  const students = await db.select().from(schema.students).where(eq(schema.students.classId, classId)).orderBy(schema.students.number);
  const subs = await db.select().from(schema.submissions).where(eq(schema.submissions.assignmentId, assignmentId));
  const itemIds = itemIdsOf(kind, activityId);
  const attempts = await attemptsFor(subs.map((s) => s.id));
  const rows = students.map((st) => {
    const sub = subs.find((s) => s.studentId === st.id) ?? null;
    const prog = summarizeAttempts(itemIds, sub ? attempts.filter((a) => a.submissionId === sub.id) : []);
    return { st, sub, prog };
  });
  return { itemIds, rows, attempts };
}

const asRecord = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** 제출한 요약 답 JSON을 교사 화면용으로 풀어 준다. */
function summaryAttemptView(a: AttemptRow): SummaryAttemptView {
  const ans = asRecord(a.answer);
  const safety = a.reason === "distress" || a.reason === "personal_info" ? a.reason : null;
  return {
    no: a.attemptNo,
    reason: a.reason ?? "",
    text: typeof ans.text === "string" ? ans.text : "",
    safety,
    coverage: num(ans.coverage),
    length: num(ans.length),
    copied: ans.copied === true,
    submittedAsIs: ans.submitAsIs === true,
    at: a.createdAt.toISOString(),
  };
}

/** 문제 id 목록 중 요약 쓰기 문제의 id */
const summaryItemIds = (kind: ActivityKind, itemIds: string[]): Set<string> =>
  new Set(kind !== "grammar" ? itemIds.filter((id) => findItem(id)?.type === "summary-write") : []);

export async function grammarStatus(
  assignmentId: number,
  classId: number,
  activityId: string | null,
  kind: ActivityKind = "grammar",
): Promise<GrammarStatus> {
  const { itemIds, rows, attempts } = await collect(assignmentId, classId, activityId, kind);
  const students: GrammarStudentRow[] = rows.map(({ st, sub, prog }) => ({
    studentId: st.id,
    number: st.number,
    nickname: st.nickname,
    submissionId: sub?.id ?? null,
    status: sub?.status ?? null,
    solved: prog.filter((p) => p.solved).length,
    total: itemIds.length,
    firstTry: prog.filter((p) => p.firstTryCorrect).length,
    revealed: prog.filter((p) => p.revealed).length,
    hintItems: prog.filter((p) => p.hintsUsed > 0).length,
    updatedAt: sub && prog.some((p) => p.attempts > 0) ? sub.updatedAt.toISOString() : null,
    alert: sub ? alertOf(attempts.filter((a) => a.submissionId === sub.id)) : null,
  }));
  const summaryIds = summaryItemIds(kind, itemIds);
  const summaries: SummaryStudentRow[] = [];
  for (const { st, sub, prog } of rows) {
    if (!sub) continue;
    for (const itemId of itemIds.filter((id) => summaryIds.has(id))) {
      const mine = attempts.filter((a) => a.submissionId === sub.id && a.itemId === itemId).sort((a, b) => a.attemptNo - b.attemptNo);
      if (mine.length === 0) continue;
      const p = prog.find((x) => x.itemId === itemId);
      summaries.push({
        studentId: st.id,
        number: st.number,
        nickname: st.nickname,
        itemId,
        no: itemIds.indexOf(itemId) + 1,
        solved: !!p?.solved,
        helped: !!p?.revealed,
        attempts: mine.map(summaryAttemptView),
      });
    }
  }
  const items: GrammarItemRow[] = itemIds.map((itemId, i) => {
    const per = rows.map((r) => r.prog.find((p) => p.itemId === itemId)).filter((p): p is ItemProgress => !!p && p.attempts > 0);
    return {
      itemId,
      no: i + 1,
      students: per.length,
      firstTryRate: per.length ? per.filter((p) => p.firstTryCorrect).length / per.length : null,
      avgAttempts: per.length ? per.reduce((s, p) => s + p.attempts, 0) / per.length : null,
      revealed: per.filter((p) => p.revealed).length,
    };
  });
  // 어려운 문제가 위로: 첫 시도 정답률이 낮은 순(시도 없는 문제는 맨 아래)
  items.sort((a, b) => (a.firstTryRate ?? 2) - (b.firstTryRate ?? 2) || b.revealed - a.revealed || a.no - b.no);
  return { students, items, summaries };
}

/** 한 제출물의 시도 중 가장 심한 안전 알림(위험 신호 > 개인 정보) */
function alertOf(rows: readonly AttemptRow[]): GrammarStudentRow["alert"] {
  if (rows.some((a) => a.reason === "distress")) return "distress";
  if (rows.some((a) => a.reason === "personal_info")) return "personal_info";
  return null;
}

// 연구용 익명 CSV: 학생 × 문제 한 줄. 별명은 넣지 않는다.
// 읽기·매체 활동은 끝에 evidence_wrong_attempts(답은 맞고 근거 문장이 틀린 시도 수),
// summary_coverage·summary_chars(요약 쓰기 문제의 마지막 점검 결과: 문단 반영률, 글자 수. 다른 문제는 빈칸) 열이 붙는다. 매체 활동은 wrong_query_attempts(검색 실험실에서 알맞지 않은 검색어를 고른 시도 수, 다른 문제는 빈칸)도 붙는다.
export async function grammarCsv(
  assignmentId: number,
  classId: number,
  activityId: string | null,
  kind: ActivityKind = "grammar",
): Promise<string> {
  const { itemIds, rows, attempts } = await collect(assignmentId, classId, activityId, kind);
  const header = ["student_number", "item_id", "standard_code", "attempts", "first_try_correct", "revealed", "max_hint_level", "seconds_to_solve"];
  if (kind !== "grammar") header.push("evidence_wrong_attempts", "summary_coverage", "summary_chars");
  if (kind === "media") header.push("wrong_query_attempts");
  const summaryIds = summaryItemIds(kind, itemIds);
  const lines = [header.join(",")];
  for (const { st, sub, prog } of rows) {
    for (const p of prog) {
      lines.push(
        [
          st.number,
          p.itemId,
          (kind !== "grammar" ? findItem(p.itemId) : getItem(p.itemId))?.standardCode ?? "",
          p.attempts,
          p.firstTryCorrect ? 1 : 0,
          p.revealed ? 1 : 0,
          p.hintsUsed,
          p.secondsToSolve ?? "",
          ...(kind !== "grammar"
            ? [
                sub
                  ? attempts.filter((a) => a.submissionId === sub.id && a.itemId === p.itemId && a.reason === "evidence-wrong").length
                  : 0,
                ...summaryCells(summaryIds.has(p.itemId) && sub ? lastEvaluated(attempts, sub.id, p.itemId) : undefined),
                // 매체: 검색 실험실 문제에서 알맞지 않은 검색어를 고른 시도 수(다른 문제는 빈칸)
                ...(kind === "media"
                  ? [
                      findItem(p.itemId)?.type === "search-task"
                        ? sub
                          ? attempts.filter((a) => a.submissionId === sub.id && a.itemId === p.itemId && a.reason === "wrong-query").length
                          : 0
                        : "",
                    ]
                  : []),
              ]
            : []),
        ].join(","),
      );
    }
  }
  return lines.join("\n") + "\n";
}

/** 요약 쓰기 문제의 마지막 점검 시도(안전 점검으로 건너뛴 시도는 제외) */
function lastEvaluated(attempts: readonly (AttemptRow & { submissionId: number })[], submissionId: number, itemId: string): AttemptRow | undefined {
  return attempts
    .filter((a) => a.submissionId === submissionId && a.itemId === itemId && !SAFETY_REASONS.has(a.reason ?? ""))
    .sort((a, b) => b.attemptNo - a.attemptNo)[0];
}

/** CSV의 summary_coverage·summary_chars 두 칸. 요약 쓰기 문제가 아니거나 시도가 없으면 빈칸. */
function summaryCells(last: AttemptRow | undefined): (number | string)[] {
  if (!last) return ["", ""];
  const ans = asRecord(last.answer);
  const coverage = num(ans.coverage);
  const length = num(ans.length);
  return [coverage === null ? "" : Math.round(coverage * 100) / 100, length ?? ""];
}
