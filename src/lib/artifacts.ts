import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  classifyField,
  emptyArtifact,
  fieldsOf,
  isArtifactKind,
  sanitizeArtifact,
  scanSafety,
  submitProblems,
  type Artifact,
  type ArtifactKind,
  type SafetyKind,
} from "@/core/artifact";
import { checkCardnews, isStickerId, LIMITS as CARD_LIMITS, STICKER_IDS, type Card } from "@/core/cardnews";
import { IMPRESSION_STICKER_IDS, LIMITS as IMPRESSION_LIMITS, isImpressionStickerId } from "@/core/impression";
import { DEBATE_STICKER_IDS, bandOfGrade, checkDebate, checkInterview, checkPresentation, isDebateStickerId, sharedDebateView, withBand, withMotion, type SharedDebate } from "@/core/speaking";
import { presentationSecondsOf } from "@/lib/assignment-settings";
import { DISTRESS_REPLY, PERSONAL_INFO_REPLY } from "@/core/coach/guard";
import { logEvent } from "@/lib/events";

type Submission = typeof schema.submissions.$inferSelect;
type Assignment = typeof schema.assignments.$inferSelect;

/** 같은 작품에서 '고쳐 쓴 횟수'로 따로 세는 최소 간격(자동 저장이 잦아도 한 번의 고침으로 센다) */
const REVISION_GAP_MS = 30_000;

/** 저장된 제작물(없으면 빈 제작물). 저장된 값이 깨졌어도 안전한 형식으로 돌려준다. */
export function storedArtifact(submission: Submission, kind: ArtifactKind): Artifact {
  // 저장된 값은 우리가 쓴 것이므로 호스트가 적는 값(제출 때 경고 수 등)도 그대로 가져온다(prev = 자기 자신).
  const clean = submission.artifact ? sanitizeArtifact(kind, submission.artifact, submission.artifact) : null;
  return clean ?? emptyArtifact(kind);
}

export interface Safety {
  kind: SafetyKind;
  reply: string;
  /** 새 글을 저장하지 않은 칸(칸 이름) */
  keys: string[];
}

export type ArtifactOutcome =
  | { status: 400 | 403 | 404 | 409; error: string; problems?: string[] }
  | { status: 200; artifact: Artifact; safety?: Safety; savedAt: string; submitted?: boolean };

/** 이 과제 종류와 상태에서 학생이 제작물을 고칠 수 있는가 */
function lockMessage(kind: ArtifactKind, submission: Submission): string | null {
  if ((kind === "cardnews" || kind === "impression" || kind === "debate") && submission.shareApproved) {
    return "공유가 승인된 작품은 더 고칠 수 없어요. 고치고 싶으면 선생님께 말씀드려 보세요.";
  }
  // 토론·면담·발표 준비는 제출한 뒤에도 고쳐서 다시 낼 수 있다(토론 뒤 한 줄·면담 뒤 정리는 제출한 뒤에 쓰는 경우가 많다).
  if (kind === "media-diary" && submission.status === "submitted") return "이미 냈어요. 선생님이 돌려주면 다시 고칠 수 있어요.";
  return null;
}

const contentKey = (a: Artifact): string =>
  a.kind === "cardnews"
    ? JSON.stringify({ p: a.plan, c: a.cards })
    : a.kind === "impression"
      ? JSON.stringify({ w: a.workId, s: a.sentenceId, y: a.why, l: a.life })
      : a.kind === "media-diary"
        ? JSON.stringify({ e: a.entries, r: a.reflection })
        : JSON.stringify(a);

/** 단계가 저장되는 제작물(카드뉴스·일지·인상 나누기)의 지금 단계. 토론·면담·발표 준비는 단계를 저장하지 않는다(화면 안 탭일 뿐). */
export const stepOf = (a: Artifact): number | null => (a.kind === "debate" || a.kind === "interview" || a.kind === "presentation" ? null : a.step);

/**
 * 토론은 논제를 교사가 정한 값(과제의 prompt)으로, 발표 준비는 학년대를 학급 학년으로 늘 덮어쓴다.
 * 학생은 이 값을 바꿀 수 없다.
 */
async function withAssignmentFixed(a: Artifact, assignment: Assignment): Promise<Artifact> {
  if (a.kind === "debate") return withMotion(a, assignment.prompt);
  if (a.kind === "presentation") {
    const db = await getDb();
    const [k] = await db.select({ grade: schema.classes.grade }).from(schema.classes).where(eq(schema.classes.id, assignment.classId));
    return withBand(a, bandOfGrade(k?.grade ?? 3));
  }
  return a;
}

/** 길이로 자르기 전 원문 검사에서, 논제·학년대는 서버 값으로 덮어쓰이므로 학생이 보낸 값은 보지 않는다. */
function rawWithoutMotion(raw: unknown, kind: ArtifactKind): unknown {
  if ((kind !== "debate" && kind !== "presentation") || !raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const { motion: _motion, band: _band, ...rest } = raw as Record<string, unknown>;
  void _motion;
  void _band;
  return rest;
}

/** 걸린 칸을 알리고 기록한다. 개인 정보는 글을 어디에도 남기지 않고, 힘든 일 언급만 교사가 맥락을 볼 수 있도록 짧게 남긴다. */
async function recordSafety(submissionId: number, studentId: number, scan: ReturnType<typeof scanSafety>, sent: Artifact): Promise<Safety | undefined> {
  if (!scan.kind || !scan.reply) return undefined;
  const sentText = new Map(fieldsOf(sent).map((f) => [f.key, f.text]));
  const distress = scan.hits.filter((h) => h.kind === "distress");
  await logEvent(`student:${studentId}`, "artifact_safety", "submission", submissionId, {
    keys: scan.hits.map((h) => h.key),
    flags: { distress: distress.length > 0, personalInfo: scan.hits.some((h) => h.kind === "personal_info") },
    ...(distress.length ? { excerpts: distress.map((h) => ({ key: h.key, text: (sentText.get(h.key) ?? "").slice(0, 300) })) } : {}),
  });
  return { kind: scan.kind, reply: scan.reply, keys: scan.hits.map((h) => h.key) };
}

const RAW_SCAN_LIMIT = 5000;

/** 요청 본문 안의 모든 글(칸 길이로 잘리기 전 원문)을 모은다. 깊이·개수·길이를 제한한다. */
function rawStrings(x: unknown, out: string[] = [], depth = 0): string[] {
  if (out.length >= 300 || depth > 6) return out;
  if (typeof x === "string") out.push(x.slice(0, RAW_SCAN_LIMIT));
  else if (Array.isArray(x)) for (const v of x) rawStrings(v, out, depth + 1);
  else if (x && typeof x === "object") for (const v of Object.values(x)) rawStrings(v, out, depth + 1);
  return out;
}

/**
 * 길이 제한으로 잘리기 전의 원문에서 위험 신호·개인 정보를 찾는다.
 * 칸 길이를 넘는 글의 뒷부분이나 모양이 틀린 요청에 담긴 글도 놓치지 않으려고, 길이로 거르거나 자르기 전에 본다.
 */
function rawSafety(raw: unknown): { kind: SafetyKind; text: string } | null {
  let found: { kind: SafetyKind; text: string } | null = null;
  for (const text of rawStrings(raw)) {
    const kind = classifyField(text);
    if (kind === "distress") return { kind, text };
    if (kind && !found) found = { kind, text };
  }
  return found;
}

/** 자동 저장: 모든 글 칸에 안전 점검을 돌리고, 걸린 칸은 새 글을 저장하지 않는다. */
export async function saveArtifact(
  submission: Submission,
  assignment: Assignment,
  studentId: number,
  raw: unknown,
): Promise<ArtifactOutcome> {
  if (!isArtifactKind(assignment.kind)) return { status: 404, error: "찾을 수 없어요." };
  const kind = assignment.kind;
  if (!assignment.isOpen) return { status: 403, error: "선생님이 과제를 닫았어요." };
  // 공유가 승인된 토론 준비는 갤러리에 나간 부분을 고칠 수 없지만, 공유되지 않는 '토론 뒤 한 줄'은 계속 쓸 수 있다.
  const reflectionOnly = kind === "debate" && submission.shareApproved;
  const locked = reflectionOnly ? null : lockMessage(kind, submission);
  if (locked) return { status: 409, error: locked };
  const prev = await withAssignmentFixed(storedArtifact(submission, kind), assignment);
  if (reflectionOnly) {
    const sent = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).reflection : undefined;
    raw = { ...prev, reflection: typeof sent === "string" ? sent : prev.kind === "debate" ? prev.reflection : "" };
  }
  const sanitized = sanitizeArtifact(kind, raw, prev);
  const next = sanitized ? await withAssignmentFixed(sanitized, assignment) : null;
  const scan = next ? scanSafety(submission.artifact ? prev : null, next) : null;
  if (!scan?.kind) {
    // 칸 점검에 안 걸렸거나 모양이 틀린 요청이어도, 잘리기 전 원문에 위험 신호·개인 정보가 있으면 저장하지 않고 안내한다.
    const over = rawSafety(rawWithoutMotion(raw, kind));
    if (over) {
      await logEvent(`student:${studentId}`, "artifact_safety", "submission", submission.id, {
        keys: ["raw"],
        flags: { distress: over.kind === "distress", personalInfo: over.kind === "personal_info" },
        ...(over.kind === "distress" ? { excerpts: [{ key: "raw", text: over.text.slice(0, 300) }] } : {}),
      });
      const reply = over.kind === "distress" ? DISTRESS_REPLY.reply : PERSONAL_INFO_REPLY.reply;
      return { status: 200, artifact: prev, safety: { kind: over.kind, reply, keys: ["raw"] }, savedAt: new Date().toISOString() };
    }
  }
  if (!next || !scan) return { status: 400, error: "내용을 다시 확인해 주세요." };
  let saved = scan.artifact;
  const now = new Date();
  if (saved.kind === "cardnews" && submission.submittedAt && contentKey(saved) !== contentKey(prev)) {
    // 제출한 뒤 고친 횟수(연구용)
    if (saved.lastRevisionAt === null || now.getTime() - saved.lastRevisionAt > REVISION_GAP_MS) {
      saved = { ...saved, revisions: saved.revisions + 1, lastRevisionAt: now.getTime() };
    }
  }
  const db = await getDb();
  const step = stepOf(saved);
  await db
    .update(schema.submissions)
    .set({ artifact: saved, stage: step === null ? "artifact" : `step${step}`, updatedAt: now })
    .where(eq(schema.submissions.id, submission.id));
  if (step !== null && step !== stepOf(prev)) await logEvent(`student:${studentId}`, "stage_enter", "submission", submission.id, { step });
  const safety = await recordSafety(submission.id, studentId, scan, next);
  return { status: 200, artifact: saved, ...(safety ? { safety } : {}), savedAt: now.toISOString() };
}

/** 제출(카드뉴스는 선생님이 공유를 승인하기 전까지 다시 낼 수 있다) */
export async function submitArtifact(submission: Submission, assignment: Assignment, studentId: number): Promise<ArtifactOutcome> {
  if (!isArtifactKind(assignment.kind)) return { status: 404, error: "찾을 수 없어요." };
  const kind = assignment.kind;
  if (!assignment.isOpen) return { status: 403, error: "선생님이 과제를 닫았어요." };
  const locked = lockMessage(kind, submission);
  if (locked) return { status: 409, error: locked };
  const stored = await withAssignmentFixed(storedArtifact(submission, kind), assignment);
  // 제출 때도 모든 글 칸을 다시 점검한다.
  const scan = scanSafety(emptyArtifact(kind), stored);
  const db = await getDb();
  const now = new Date();
  if (scan.kind) {
    await db.update(schema.submissions).set({ artifact: scan.artifact, updatedAt: now }).where(eq(schema.submissions.id, submission.id));
    const safety = await recordSafety(submission.id, studentId, scan, stored);
    return { status: 200, artifact: scan.artifact, ...(safety ? { safety } : {}), savedAt: now.toISOString(), submitted: false };
  }
  const problems = submitProblems(stored);
  if (problems.length) return { status: 400, error: problems[0], problems };
  let final: Artifact = stored;
  if (final.kind === "cardnews") final = { ...final, step: 4, maxStep: 4, submitWarnings: checkCardnews(final).length };
  if (final.kind === "impression") final = { ...final, step: 3, maxStep: 3 };
  await db
    .update(schema.submissions)
    .set({ artifact: final, status: "submitted", submittedAt: submission.submittedAt ?? now, updatedAt: now })
    .where(eq(schema.submissions.id, submission.id));
  await logEvent(`student:${studentId}`, "submit", "submission", submission.id, {
    kind,
    ...(final.kind === "cardnews" ? { warnings: final.submitWarnings, cards: final.cards.length, resubmit: !!submission.submittedAt } : {}),
    ...(final.kind === "debate" ? { warnings: checkDebate(final).length, resubmit: !!submission.submittedAt } : {}),
    ...(final.kind === "interview" ? { warnings: checkInterview(final).length, resubmit: !!submission.submittedAt } : {}),
    ...(final.kind === "presentation"
      ? {
          warnings: checkPresentation(final, presentationSecondsOf(assignment.settings)).length,
          practiceRuns: final.practice.length,
          lastPracticeSeconds: final.practice[final.practice.length - 1] ?? null,
          resubmit: !!submission.submittedAt,
        }
      : {}),
  });
  return { status: 200, artifact: final, savedAt: now.toISOString(), submitted: true };
}

export type ReflectionOutcome =
  | { status: 400 | 403 | 404 | 409; error: string }
  | { status: 200; reflection: string; safety?: Safety };

/** 작가가 받은 반응을 보고 고칠 점(인상적인 부분 나누기는 더 생각한 점)을 한 줄 적는다(공유가 승인된 뒤). */
export async function saveReflection(submission: Submission, assignment: Assignment, studentId: number, text: unknown): Promise<ReflectionOutcome> {
  if (assignment.kind !== "cardnews" && assignment.kind !== "impression") return { status: 404, error: "찾을 수 없어요." };
  if (!assignment.isOpen) return { status: 403, error: "선생님이 과제를 닫았어요." };
  if (!submission.shareApproved) return { status: 409, error: "작품이 공유된 뒤에 적을 수 있어요." };
  if (typeof text !== "string") return { status: 400, error: "내용을 확인해 주세요." };
  // 안전 점검은 길이로 자르기 전의 글에 한다(긴 글 뒷부분의 위험 신호도 놓치지 않는다).
  const whole = Array.from(text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")).slice(0, RAW_SCAN_LIMIT).join("");
  const clean = Array.from(whole).slice(0, assignment.kind === "impression" ? IMPRESSION_LIMITS.reflection : CARD_LIMITS.reflection).join("");
  const kind = classifyField(whole);
  if (kind) {
    const reply = kind === "distress" ? DISTRESS_REPLY.reply : PERSONAL_INFO_REPLY.reply;
    await logEvent(`student:${studentId}`, "artifact_safety", "submission", submission.id, {
      keys: ["reflection"],
      flags: { distress: kind === "distress", personalInfo: kind === "personal_info" },
      ...(kind === "distress" ? { excerpts: [{ key: "reflection", text: whole.slice(0, 300) }] } : {}),
    });
    return { status: 200, reflection: submission.reflection, safety: { kind, reply, keys: ["reflection"] } };
  }
  const db = await getDb();
  await db.update(schema.submissions).set({ reflection: clean, updatedAt: new Date() }).where(eq(schema.submissions.id, submission.id));
  await logEvent(`student:${studentId}`, "reflection", "submission", submission.id, { chars: clean.length });
  return { status: 200, reflection: clean };
}

// ── 갤러리·반응 ──────────────────────────────────────────────────────────────

export interface GalleryWork {
  submissionId: number;
  nickname: string;
  own: boolean;
  topic: string;
  audience: string;
  keyMessage: string;
  cards: Pick<Card, "id" | "layout" | "title" | "body" | "color" | "icon">[];
  sources: { title: string; where: string }[];
  /** 스티커 id별 받은 개수 */
  counts: Record<string, number>;
  /** 내가 남긴 스티커 */
  mine: string[];
}

/** 승인된 작품 행과 스티커 행을 모은다. 승인 안 된 작품·다른 반 작품은 절대 들어가지 않는다. */
async function approvedWorks(assignmentId: number, classId: number, kind: "cardnews" | "impression" | "debate") {
  const db = await getDb();
  const [a] = await db
    .select()
    .from(schema.assignments)
    .where(and(eq(schema.assignments.id, assignmentId), eq(schema.assignments.classId, classId), eq(schema.assignments.kind, kind)));
  if (!a) return null;
  const rows = await db
    .select({ s: schema.submissions, nickname: schema.students.nickname })
    .from(schema.submissions)
    .innerJoin(schema.students, eq(schema.submissions.studentId, schema.students.id))
    .where(and(eq(schema.submissions.assignmentId, assignmentId), eq(schema.submissions.shareApproved, true), eq(schema.students.classId, classId)))
    .orderBy(schema.submissions.sharedAt, schema.submissions.id);
  const ids = rows.map((r) => r.s.id);
  const rx = ids.length ? await db.select().from(schema.reactions).where(inArray(schema.reactions.submissionId, ids)) : [];
  return { a, rows, rx };
}

function reactionSummary(rx: { submissionId: number; reactorId: number; stickerId: string }[], submissionId: number, viewerId: number, stickerIds: readonly string[]) {
  const counts: Record<string, number> = Object.fromEntries(stickerIds.map((id) => [id, 0]));
  const mine: string[] = [];
  for (const r of rx) {
    if (r.submissionId !== submissionId) continue;
    counts[r.stickerId] = (counts[r.stickerId] ?? 0) + 1;
    if (r.reactorId === viewerId) mine.push(r.stickerId);
  }
  return { counts, mine };
}

/** 같은 반 학생에게 보이는 승인된 작품들. 승인 안 된 작품·다른 반 작품은 절대 들어가지 않는다. */
export async function galleryFor(assignmentId: number, classId: number, viewerId: number): Promise<{ title: string; works: GalleryWork[] } | null> {
  const found = await approvedWorks(assignmentId, classId, "cardnews");
  if (!found) return null;
  const works: GalleryWork[] = [];
  for (const { s, nickname } of found.rows) {
    const art = storedArtifact(s, "cardnews");
    if (art.kind !== "cardnews") continue;
    const { counts, mine } = reactionSummary(found.rx, s.id, viewerId, STICKER_IDS);
    works.push({
      submissionId: s.id,
      nickname,
      own: s.studentId === viewerId,
      topic: art.plan.topic,
      audience: art.plan.audience,
      keyMessage: art.plan.keyMessage,
      cards: art.cards.map(({ id, layout, title, body, color, icon }) => ({ id, layout, title, body, color, icon })),
      sources: art.plan.sources.filter((x) => x.title.trim()),
      counts,
      mine,
    });
  }
  return { title: found.a.title, works };
}

export interface ImpressionGalleryWork {
  submissionId: number;
  nickname: string;
  own: boolean;
  workId: string;
  sentenceId: string;
  why: string;
  life: string;
  counts: Record<string, number>;
  mine: string[];
}

/** 인상적인 부분 나누기 갤러리: 승인된 같은 반 작품만. 학생이 쓴 글은 승인된 것만 나간다. */
export async function impressionGalleryFor(assignmentId: number, classId: number, viewerId: number): Promise<{ title: string; works: ImpressionGalleryWork[] } | null> {
  const found = await approvedWorks(assignmentId, classId, "impression");
  if (!found) return null;
  const works: ImpressionGalleryWork[] = [];
  for (const { s, nickname } of found.rows) {
    const art = storedArtifact(s, "impression");
    if (art.kind !== "impression") continue;
    const { counts, mine } = reactionSummary(found.rx, s.id, viewerId, IMPRESSION_STICKER_IDS);
    works.push({ submissionId: s.id, nickname, own: s.studentId === viewerId, workId: art.workId, sentenceId: art.sentenceId, why: art.why, life: art.life, counts, mine });
  }
  return { title: found.a.title, works };
}

export interface DebateGalleryWork {
  submissionId: number;
  nickname: string;
  own: boolean;
  shared: SharedDebate;
  counts: Record<string, number>;
  mine: string[];
}

/** 토론 갤러리: 승인된 같은 반 작품의 편·주장·근거만 나간다(예상 반론·토론 뒤 한 줄은 나가지 않는다). */
export async function debateGalleryFor(assignmentId: number, classId: number, viewerId: number): Promise<{ title: string; motion: string; works: DebateGalleryWork[] } | null> {
  const found = await approvedWorks(assignmentId, classId, "debate");
  if (!found) return null;
  const works: DebateGalleryWork[] = [];
  for (const { s, nickname } of found.rows) {
    const art = storedArtifact(s, "debate");
    if (art.kind !== "debate") continue;
    const shared = sharedDebateView(art);
    if (!shared) continue;
    const { counts, mine } = reactionSummary(found.rx, s.id, viewerId, DEBATE_STICKER_IDS);
    works.push({ submissionId: s.id, nickname, own: s.studentId === viewerId, shared, counts, mine });
  }
  return { title: found.a.title, motion: found.a.prompt, works };
}

export type ReactionOutcome =
  | { status: 400 | 403 | 404; error: string }
  | { status: 200; on: boolean; counts: Record<string, number>; mine: string[] };

/** 스티커를 붙이거나 떼는 토글. 본인 작품에는 남길 수 없고, 승인된 같은 반 작품에만 남길 수 있다. */
export async function toggleReaction(studentId: number, classId: number, submissionId: unknown, stickerId: unknown): Promise<ReactionOutcome> {
  if (typeof submissionId !== "number" || !Number.isInteger(submissionId)) return { status: 400, error: "작품을 확인해 주세요." };
  if (!isStickerId(stickerId) && !isImpressionStickerId(stickerId) && !isDebateStickerId(stickerId)) return { status: 400, error: "스티커를 확인해 주세요." };
  const db = await getDb();
  const [row] = await db
    .select({ s: schema.submissions, a: schema.assignments })
    .from(schema.submissions)
    .innerJoin(schema.assignments, eq(schema.submissions.assignmentId, schema.assignments.id))
    .where(eq(schema.submissions.id, submissionId));
  // 다른 반 작품이거나 승인 전이면 있는지조차 알려 주지 않는다.
  if (!row || row.a.classId !== classId || (row.a.kind !== "cardnews" && row.a.kind !== "impression" && row.a.kind !== "debate") || !row.s.shareApproved) return { status: 404, error: "찾을 수 없어요." };
  const stickerIds: readonly string[] = row.a.kind === "impression" ? IMPRESSION_STICKER_IDS : row.a.kind === "debate" ? DEBATE_STICKER_IDS : STICKER_IDS;
  if (!stickerIds.includes(stickerId)) return { status: 400, error: "스티커를 확인해 주세요." };
  if (row.s.studentId === studentId) return { status: 403, error: "내 작품에는 스티커를 붙일 수 없어요." };
  const where = and(
    eq(schema.reactions.submissionId, submissionId),
    eq(schema.reactions.reactorId, studentId),
    eq(schema.reactions.stickerId, stickerId),
  );
  const [existing] = await db.select().from(schema.reactions).where(where);
  if (existing) await db.delete(schema.reactions).where(where);
  else await db.insert(schema.reactions).values({ submissionId, reactorId: studentId, stickerId }).onConflictDoNothing();
  await logEvent(`student:${studentId}`, "reaction", "submission", submissionId, { sticker: stickerId, on: !existing });
  const all = await db.select().from(schema.reactions).where(eq(schema.reactions.submissionId, submissionId));
  const counts: Record<string, number> = Object.fromEntries(stickerIds.map((id) => [id, 0]));
  for (const r of all) counts[r.stickerId] = (counts[r.stickerId] ?? 0) + 1;
  return { status: 200, on: !existing, counts, mine: all.filter((r) => r.reactorId === studentId).map((r) => r.stickerId) };
}

/** 교사의 공유 승인·승인 취소. 제출한 카드뉴스·인상적인 부분 나누기·토론 준비만 승인할 수 있다. */
export async function setShareApproved(teacherId: number, submissionId: number, approved: boolean): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ s: schema.submissions, a: schema.assignments, k: schema.classes })
    .from(schema.submissions)
    .innerJoin(schema.assignments, eq(schema.submissions.assignmentId, schema.assignments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .where(and(eq(schema.submissions.id, submissionId), eq(schema.classes.teacherId, teacherId)));
  if (!row || (row.a.kind !== "cardnews" && row.a.kind !== "impression" && row.a.kind !== "debate")) return false;
  if (approved && row.s.status !== "submitted") return false;
  await db
    .update(schema.submissions)
    .set({ shareApproved: approved, sharedAt: approved ? new Date() : null })
    .where(eq(schema.submissions.id, submissionId));
  await logEvent(`teacher:${teacherId}`, "share", "submission", submissionId, { approved });
  return true;
}
