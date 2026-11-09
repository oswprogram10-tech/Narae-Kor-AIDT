import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { fieldLabel, type Artifact, type ArtifactKind, type SafetyKind } from "@/core/artifact";
import { checkCardnews, STICKER_IDS, type CardnewsArtifact } from "@/core/cardnews";
import { IMPRESSION_STICKER_IDS, getImpressionWork, sentenceInWork, type ImpressionArtifact } from "@/core/impression";
import { CATEGORY_IDS, classAverages, summarizeDiary, type DiaryArtifact, type DiarySummary, type Minutes } from "@/core/diary";
import { checkInterview, type DebateArtifact, type InterviewArtifact, type PresentationArtifact } from "@/core/speaking";
import { storedArtifact, stepOf } from "@/lib/artifacts";
import {
  debateCsvCells,
  debateStats,
  DEBATE_CSV_HEADER,
  interviewCsvCells,
  interviewStats,
  INTERVIEW_CSV_HEADER,
  presentationCsvCells,
  presentationStats,
  PRESENTATION_CSV_HEADER,
  type DebateStats,
  type InterviewStats,
  type PresentationStats,
} from "@/lib/speaking-rules";
import { debateSecondsOf, presentationSecondsOf } from "@/lib/assignment-settings";

export interface ArtifactAlert {
  kind: SafetyKind;
  /** 새 글을 저장하지 않은 칸(한글 이름) */
  fields: string[];
  /** 힘든 일 언급일 때만: 교사가 맥락을 볼 수 있도록 남긴 짧은 글(개인 정보는 글을 남기지 않는다) */
  excerpts: { field: string; text: string }[];
  count: number;
}

export interface ArtifactRow {
  studentId: number;
  number: number;
  nickname: string;
  submissionId: number | null;
  status: string | null;
  updatedAt: string | null;
  submittedAt: string | null;
  maxStep: number;
  alert: ArtifactAlert | null;
  cardnews: {
    artifact: CardnewsArtifact;
    cards: number;
    warningsNow: number;
    warningsAtSubmit: number | null;
    revisions: number;
    approved: boolean;
    reactions: Record<string, number>;
    reactionTotal: number;
    reflection: string;
  } | null;
  diary: { artifact: DiaryArtifact; summary: DiarySummary } | null;
  debate: { artifact: DebateArtifact; stats: DebateStats } | null;
  interview: { artifact: InterviewArtifact; stats: InterviewStats; closedQuestionNos: number[]; sensitiveQuestionNos: number[] } | null;
  presentation: { artifact: PresentationArtifact; stats: PresentationStats } | null;
  impression: {
    artifact: ImpressionArtifact;
    workTitle: string;
    sentenceText: string;
    whyChars: number;
    lifeChars: number;
    approved: boolean;
    reactions: Record<string, number>;
    reactionTotal: number;
    reflection: string;
  } | null;
}

export interface ArtifactStatus {
  kind: ArtifactKind;
  /** 토론: 교사가 정한 논제와 단계별 시간(바꾼 것만) */
  debate?: { motion: string; seconds: Record<string, number> };
  /** 발표 준비: 교사가 정한 목표 시간(초) */
  presentation?: { targetSeconds: number };
  rows: ArtifactRow[];
  classAverage: { students: number; averages: Minutes } | null;
}

export async function artifactStatus(assignmentId: number, classId: number, kind: ArtifactKind): Promise<ArtifactStatus> {
  const db = await getDb();
  const students = await db.select().from(schema.students).where(eq(schema.students.classId, classId)).orderBy(schema.students.number);
  const subs = await db.select().from(schema.submissions).where(eq(schema.submissions.assignmentId, assignmentId));
  const [assignment] = await db.select().from(schema.assignments).where(eq(schema.assignments.id, assignmentId));
  const targetSeconds = presentationSecondsOf(assignment?.settings);
  const ids = subs.map((s) => s.id);
  const events = ids.length
    ? await db
        .select()
        .from(schema.events)
        .where(and(eq(schema.events.objectType, "submission"), eq(schema.events.verb, "artifact_safety"), inArray(schema.events.objectId, ids)))
        .orderBy(schema.events.id)
    : [];
  const rx = ids.length ? await db.select().from(schema.reactions).where(inArray(schema.reactions.submissionId, ids)) : [];

  const rows: ArtifactRow[] = students.map((st) => {
    const s = subs.find((x) => x.studentId === st.id) ?? null;
    const art: Artifact | null = s ? storedArtifact(s, kind) : null;
    // 안전 알림: 위험 신호가 개인 정보보다 앞선다
    let alert: ArtifactAlert | null = null;
    if (s && art) {
      for (const e of events.filter((x) => x.objectId === s.id)) {
        const meta = (e.meta ?? {}) as { keys?: string[]; flags?: { distress?: boolean; personalInfo?: boolean }; excerpts?: { key: string; text: string }[] };
        const kindHit: SafetyKind = meta.flags?.distress ? "distress" : "personal_info";
        alert ??= { kind: kindHit, fields: [], excerpts: [], count: 0 };
        if (kindHit === "distress") alert.kind = "distress";
        alert.count++;
        for (const k of meta.keys ?? []) {
          const label = fieldLabel(art, k);
          if (!alert.fields.includes(label)) alert.fields.push(label);
        }
        for (const x of meta.excerpts ?? []) alert.excerpts.push({ field: fieldLabel(art, x.key), text: x.text });
      }
    }
    const mineRx = s ? rx.filter((r) => r.submissionId === s.id) : [];
    const reactions: Record<string, number> = Object.fromEntries((kind === "impression" ? IMPRESSION_STICKER_IDS : STICKER_IDS).map((id) => [id, mineRx.filter((r) => r.stickerId === id).length]));
    return {
      studentId: st.id,
      number: st.number,
      nickname: st.nickname,
      submissionId: s?.id ?? null,
      status: s?.status ?? null,
      updatedAt: s?.updatedAt.toISOString() ?? null,
      submittedAt: s?.submittedAt?.toISOString() ?? null,
      maxStep: art ? (stepOf(art) === null ? 0 : (art as { maxStep: number }).maxStep) : 0,
      alert,
      cardnews:
        s && art?.kind === "cardnews"
          ? {
              artifact: art,
              cards: art.cards.length,
              warningsNow: checkCardnews(art).length,
              warningsAtSubmit: art.submitWarnings,
              revisions: art.revisions,
              approved: s.shareApproved,
              reactions,
              reactionTotal: mineRx.length,
              reflection: s.reflection,
            }
          : null,
      diary: s && art?.kind === "media-diary" ? { artifact: art, summary: summarizeDiary(art) } : null,
      debate: s && art?.kind === "debate" ? { artifact: art, stats: debateStats(art) } : null,
      interview:
        s && art?.kind === "interview"
          ? (() => {
              const warnings = checkInterview(art);
              const noOf = (target?: string) => art.questions.findIndex((q) => `question.${q.id}` === target) + 1;
              return {
                artifact: art,
                stats: interviewStats(art),
                closedQuestionNos: warnings.filter((w) => w.kind === "closed-question").map((w) => noOf(w.target)),
                sensitiveQuestionNos: warnings.filter((w) => w.kind === "sensitive-question").map((w) => noOf(w.target)),
              };
            })()
          : null,
      presentation: s && art?.kind === "presentation" ? { artifact: art, stats: presentationStats(art, targetSeconds) } : null,
      impression:
        s && art?.kind === "impression"
          ? (() => {
              const work = getImpressionWork(art.workId);
              return {
                artifact: art,
                workTitle: work?.title ?? "",
                sentenceText: (work && sentenceInWork(work, art.sentenceId)?.text) || "",
                whyChars: Array.from(art.why.trim()).length,
                lifeChars: Array.from(art.life.trim()).length,
                approved: s.shareApproved,
                reactions,
                reactionTotal: mineRx.length,
                reflection: s.reflection,
              };
            })()
          : null,
    };
  });
  const diaries = rows.flatMap((r) => (r.diary ? [r.diary.summary] : []));
  return {
    kind,
    rows,
    classAverage: kind === "media-diary" ? classAverages(diaries) : null,
    ...(kind === "presentation" ? { presentation: { targetSeconds } } : {}),
    ...(kind === "debate" && assignment ? { debate: { motion: assignment.prompt, seconds: debateSecondsOf(assignment.settings) ?? {} } } : {}),
  };
}

// 연구용 익명 CSV: 학생 번호만 쓰고 별명·글 내용은 넣지 않는다.
export async function artifactCsv(assignmentId: number, classId: number, kind: ArtifactKind): Promise<string> {
  const { rows, presentation } = await artifactStatus(assignmentId, classId, kind);
  const lines: string[] = [];
  if (kind === "cardnews") {
    lines.push(["student_number", "status", "max_step", "cards", "warnings_at_submit", "revisions_after_submit", "shared", "reactions_received", "reflection_written", "safety_alert"].join(","));
    for (const r of rows) {
      const c = r.cardnews;
      lines.push(
        [
          r.number,
          r.status ?? "not_started",
          r.maxStep,
          c?.cards ?? 0,
          c?.warningsAtSubmit ?? "",
          c?.revisions ?? 0,
          c?.approved ? "y" : "n",
          c?.reactionTotal ?? 0,
          c && c.reflection.trim() ? "y" : "n",
          r.alert?.kind ?? "",
        ].join(","),
      );
    }
  } else if (kind === "impression") {
    lines.push(["student_number", "status", "max_step", "work_id", "sentence_id", "why_chars", "life_chars", "shared", "reactions_received", "reflection_written", "safety_alert"].join(","));
    for (const r of rows) {
      const c = r.impression;
      lines.push(
        [
          r.number,
          r.status ?? "not_started",
          r.maxStep,
          c?.artifact.workId ?? "",
          c?.artifact.sentenceId ?? "",
          c?.whyChars ?? 0,
          c?.lifeChars ?? 0,
          c?.approved ? "y" : "n",
          c?.reactionTotal ?? 0,
          c && c.reflection.trim() ? "y" : "n",
          r.alert?.kind ?? "",
        ].join(","),
      );
    }
  } else if (kind === "debate") {
    lines.push(DEBATE_CSV_HEADER.join(","));
    for (const r of rows) lines.push([r.number, r.status ?? "not_started", ...debateCsvCells(r.debate?.artifact ?? null), r.alert?.kind ?? ""].join(","));
  } else if (kind === "presentation") {
    lines.push(PRESENTATION_CSV_HEADER.join(","));
    const target = presentation?.targetSeconds ?? 0;
    for (const r of rows) lines.push([r.number, r.status ?? "not_started", ...presentationCsvCells(r.presentation?.artifact ?? null, target), r.alert?.kind ?? ""].join(","));
  } else if (kind === "interview") {
    lines.push(INTERVIEW_CSV_HEADER.join(","));
    for (const r of rows) lines.push([r.number, r.status ?? "not_started", ...interviewCsvCells(r.interview?.artifact ?? null), r.alert?.kind ?? ""].join(","));
  } else {
    lines.push(["student_number", "status", "days_logged", ...CATEGORY_IDS.map((c) => `minutes_${c}`), "minutes_total", "reflection_completed", "safety_alert"].join(","));
    for (const r of rows) {
      const d = r.diary?.summary;
      lines.push(
        [
          r.number,
          r.status ?? "not_started",
          d?.daysLogged ?? 0,
          ...CATEGORY_IDS.map((c) => d?.totals[c] ?? 0),
          d?.totalMinutes ?? 0,
          d?.reflectionComplete ? "y" : "n",
          r.alert?.kind ?? "",
        ].join(","),
      );
    }
  }
  return lines.join("\n") + "\n";
}
