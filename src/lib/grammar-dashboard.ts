import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getItem } from "@/core/grammar";
import { activityItems, attemptsFor } from "@/lib/grammar";
import { summarizeAttempts, type ItemProgress } from "@/lib/grammar-rules";

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
}

async function collect(assignmentId: number, classId: number, activityId: string | null) {
  const db = await getDb();
  const students = await db.select().from(schema.students).where(eq(schema.students.classId, classId)).orderBy(schema.students.number);
  const subs = await db.select().from(schema.submissions).where(eq(schema.submissions.assignmentId, assignmentId));
  const itemIds = activityItems(activityId).map((i) => i.id);
  const attempts = await attemptsFor(subs.map((s) => s.id));
  const rows = students.map((st) => {
    const sub = subs.find((s) => s.studentId === st.id) ?? null;
    const prog = summarizeAttempts(itemIds, sub ? attempts.filter((a) => a.submissionId === sub.id) : []);
    return { st, sub, prog };
  });
  return { itemIds, rows };
}

export async function grammarStatus(assignmentId: number, classId: number, activityId: string | null): Promise<GrammarStatus> {
  const { itemIds, rows } = await collect(assignmentId, classId, activityId);
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
  }));
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
  return { students, items };
}

// 연구용 익명 CSV: 학생 × 문제 한 줄. 별명은 넣지 않는다.
export async function grammarCsv(assignmentId: number, classId: number, activityId: string | null): Promise<string> {
  const { rows } = await collect(assignmentId, classId, activityId);
  const lines = [
    ["student_number", "item_id", "standard_code", "attempts", "first_try_correct", "revealed", "max_hint_level", "seconds_to_solve"].join(","),
  ];
  for (const { st, prog } of rows) {
    for (const p of prog) {
      lines.push(
        [
          st.number,
          p.itemId,
          getItem(p.itemId)?.standardCode ?? "",
          p.attempts,
          p.firstTryCorrect ? 1 : 0,
          p.revealed ? 1 : 0,
          p.hintsUsed,
          p.secondsToSolve ?? "",
        ].join(","),
      );
    }
  }
  return lines.join("\n") + "\n";
}
