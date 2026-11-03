import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export interface StatusRow {
  studentId: number;
  number: number;
  nickname: string;
  submissionId: number | null;
  stage: string | null;
  status: string | null;
  chars: number;
  helpCount: number;
  blockedCount: number;
  ghostwriteRequests: number;
  alert: "distress" | "personal_info" | null;
  pasteChars: number;
  startedAt: string | null;
  updatedAt: string | null;
  submittedAt: string | null;
}

export async function assignmentStatus(assignmentId: number, classId: number): Promise<StatusRow[]> {
  const db = await getDb();
  const students = await db
    .select()
    .from(schema.students)
    .where(eq(schema.students.classId, classId))
    .orderBy(schema.students.number);
  const subs = await db.select().from(schema.submissions).where(eq(schema.submissions.assignmentId, assignmentId));
  const subIds = subs.map((s) => s.id);
  const msgs = subIds.length
    ? await db
        .select({
          submissionId: schema.coachMessages.submissionId,
          role: schema.coachMessages.role,
          blocked: schema.coachMessages.blocked,
          meta: schema.coachMessages.meta,
        })
        .from(schema.coachMessages)
        .where(inArray(schema.coachMessages.submissionId, subIds))
    : [];

  const agg = new Map<number, { help: number; blocked: number; ghost: number; alert: StatusRow["alert"] }>();
  for (const m of msgs) {
    const a = agg.get(m.submissionId) ?? { help: 0, blocked: 0, ghost: 0, alert: null };
    if (m.role === "student") {
      a.help++;
      const flags = (m.meta as { flags?: Record<string, boolean> } | null)?.flags;
      if (flags?.ghostwriteRequest) a.ghost++;
      if (flags?.distress) a.alert = "distress";
      else if (flags?.personalInfo && a.alert !== "distress") a.alert = "personal_info";
    } else if (m.blocked) {
      a.blocked++;
    }
    agg.set(m.submissionId, a);
  }

  const byStudent = new Map(subs.map((s) => [s.studentId, s]));
  return students.map((st) => {
    const s = byStudent.get(st.id);
    const a = s ? agg.get(s.id) : undefined;
    return {
      studentId: st.id,
      number: st.number,
      nickname: st.nickname,
      submissionId: s?.id ?? null,
      stage: s?.stage ?? null,
      status: s?.status ?? null,
      chars: s ? s.draft.replace(/\s/g, "").length : 0,
      helpCount: a?.help ?? 0,
      blockedCount: a?.blocked ?? 0,
      ghostwriteRequests: a?.ghost ?? 0,
      alert: a?.alert ?? null,
      pasteChars: s?.pasteChars ?? 0,
      startedAt: s?.startedAt.toISOString() ?? null,
      updatedAt: s?.updatedAt.toISOString() ?? null,
      submittedAt: s?.submittedAt?.toISOString() ?? null,
    };
  });
}

// 연구용 익명 CSV: 학생 번호만 쓰고 별명·글 내용은 넣지 않는다(글 내용은 교사가 따로 내려받음).
export async function assignmentCsv(assignmentId: number, classId: number, rubricKeys: string[]): Promise<string> {
  const rows = await assignmentStatus(assignmentId, classId);
  const db = await getDb();
  const subIds = rows.map((r) => r.submissionId).filter((x): x is number => x !== null);
  const scores = subIds.length
    ? await db.select().from(schema.rubricScores).where(inArray(schema.rubricScores.submissionId, subIds))
    : [];
  const draftCounts = subIds.length
    ? await db
        .select({ submissionId: schema.drafts.submissionId })
        .from(schema.drafts)
        .where(and(inArray(schema.drafts.submissionId, subIds)))
    : [];
  const versions = new Map<number, number>();
  for (const d of draftCounts) versions.set(d.submissionId, (versions.get(d.submissionId) ?? 0) + 1);

  const header = [
    "student_number",
    "status",
    "final_stage",
    "chars_no_space",
    "draft_versions",
    "help_requests",
    "ghostwrite_requests",
    "coach_blocked",
    "paste_chars",
    "minutes_active",
    ...rubricKeys.flatMap((k) => [`ai_${k}`, `teacher_${k}`]),
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const minutes =
      r.startedAt && (r.submittedAt || r.updatedAt)
        ? Math.round((new Date(r.submittedAt ?? r.updatedAt!).getTime() - new Date(r.startedAt).getTime()) / 60000)
        : "";
    const sc = scores.filter((s) => s.submissionId === r.submissionId);
    lines.push(
      [
        r.number,
        r.status ?? "not_started",
        r.stage ?? "",
        r.chars,
        r.submissionId ? versions.get(r.submissionId) ?? 0 : 0,
        r.helpCount,
        r.ghostwriteRequests,
        r.blockedCount,
        r.pasteChars,
        minutes,
        ...rubricKeys.flatMap((k) => {
          const s = sc.find((x) => x.criterion === k);
          return [s?.aiSuggested ?? "", s?.teacherFinal ?? ""];
        }),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}
