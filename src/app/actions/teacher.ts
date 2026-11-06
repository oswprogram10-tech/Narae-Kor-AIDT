"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  createSession,
  destroySession,
  hashSecret,
  ownedAssignment,
  ownedClass,
  requireTeacher,
  verifySecret,
} from "@/lib/auth";
import { getGenre } from "@/core/data/genres";
import { activitiesForGrade } from "@/core/grammar";
import { activitiesForGrade as readingActivitiesForGrade } from "@/core/reading";
import { mediaActivitiesForGrade } from "@/core/media";
import { literatureActivitiesForGrade } from "@/core/literature";
import { teacherSubmission } from "@/lib/submissions";
import { PROVIDER_IDS } from "@/core/providers";
import { logEvent } from "@/lib/events";
import { artifactActivity, artifactActivitiesForGrade } from "@/core/artifact";
import { setShareApproved as approveShare } from "@/lib/artifacts";

export interface FormState {
  error?: string;
  ok?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signupTeacher(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const displayName = String(form.get("displayName") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!EMAIL_RE.test(email)) return { error: "이메일 형식을 확인해 주세요." };
  if (!displayName) return { error: "이름(표시용)을 입력해 주세요." };
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다." };
  const db = await getDb();
  const [exists] = await db.select({ id: schema.teachers.id }).from(schema.teachers).where(eq(schema.teachers.email, email));
  if (exists) return { error: "이미 가입된 이메일입니다." };
  const [t] = await db
    .insert(schema.teachers)
    .values({ email, displayName, passwordHash: await hashSecret(password) })
    .returning({ id: schema.teachers.id });
  await createSession({ kind: "teacher", teacherId: t.id });
  redirect("/teacher");
}

export async function loginTeacher(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const db = await getDb();
  const [t] = await db.select().from(schema.teachers).where(eq(schema.teachers.email, email));
  if (!t || !(await verifySecret(password, t.passwordHash))) {
    return { error: "이메일 또는 비밀번호가 맞지 않습니다." };
  }
  await createSession({ kind: "teacher", teacherId: t.id });
  redirect("/teacher");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export async function createClass(_: FormState, form: FormData): Promise<FormState> {
  const { teacherId } = await requireTeacher();
  const name = String(form.get("name") ?? "").trim();
  const grade = Number(form.get("grade"));
  if (!name) return { error: "학급 이름을 입력해 주세요." };
  if (!Number.isInteger(grade) || grade < 3 || grade > 6) return { error: "현재는 3~6학년만 지원합니다." };
  const db = await getDb();
  for (let i = 0; i < 5; i++) {
    const joinCode = randomCode();
    const [row] = await db
      .insert(schema.classes)
      .values({ teacherId, name, grade, joinCode })
      .onConflictDoNothing()
      .returning({ id: schema.classes.id });
    if (row) redirect(`/teacher/classes/${row.id}`);
  }
  return { error: "참여 코드를 만들지 못했습니다. 다시 시도해 주세요." };
}

export async function createAssignment(_: FormState, form: FormData): Promise<FormState> {
  const { teacherId } = await requireTeacher();
  const classId = Number(form.get("classId"));
  const klass = await ownedClass(teacherId, classId);
  if (!klass) return { error: "학급을 찾을 수 없습니다." };
  const kind = String(form.get("kind") ?? "writing");
  if (kind === "cardnews" || kind === "media-diary") {
    const activity = artifactActivity(kind);
    if (!activity || !artifactActivitiesForGrade(klass.grade).includes(activity)) return { error: "이 활동은 5~6학년 학급에서만 낼 수 있어요." };
    const db = await getDb();
    const [a] = await db
      .insert(schema.assignments)
      .values({
        classId,
        title: (String(form.get("title") ?? "").trim() || activity.title).slice(0, 100),
        kind,
        activityId: null,
        genreId: "",
        standardCodes: [activity.standardCode],
        prompt: activity.description,
        organizer: [],
        rubric: [],
        coachEnabled: false,
      })
      .returning({ id: schema.assignments.id });
    redirect(`/teacher/assignments/${a.id}`);
  }
  if (kind === "grammar" || kind === "reading" || kind === "media" || kind === "literature") {
    const activities =
      kind === "reading"
        ? readingActivitiesForGrade(klass.grade)
        : kind === "media"
          ? mediaActivitiesForGrade(klass.grade)
          : kind === "literature"
            ? literatureActivitiesForGrade(klass.grade)
            : activitiesForGrade(klass.grade);
    const activity = activities.find((x) => x.id === String(form.get("activityId") ?? ""));
    if (!activity) return { error: "활동을 골라 주세요." };
    const db = await getDb();
    const [a] = await db
      .insert(schema.assignments)
      .values({
        classId,
        title: (String(form.get("title") ?? "").trim() || activity.title).slice(0, 100),
        kind,
        activityId: activity.id,
        genreId: "",
        standardCodes: [activity.standardCode],
        prompt: activity.description,
        organizer: [],
        rubric: [],
        coachEnabled: false,
      })
      .returning({ id: schema.assignments.id });
    redirect(`/teacher/assignments/${a.id}`);
  }
  const genre = getGenre(String(form.get("genreId") ?? ""));
  if (!genre) return { error: "글의 종류를 골라 주세요." };
  const title = String(form.get("title") ?? "").trim() || genre.name;
  const prompt = String(form.get("prompt") ?? "").trim() || genre.defaultPrompt;
  const coachEnabled = form.get("coachEnabled") === "on";
  const db = await getDb();
  const [a] = await db
    .insert(schema.assignments)
    .values({
      classId,
      title: title.slice(0, 100),
      genreId: genre.id,
      standardCodes: genre.standardCodes,
      prompt: prompt.slice(0, 1000),
      organizer: genre.organizer,
      rubric: genre.rubric,
      coachEnabled,
    })
    .returning({ id: schema.assignments.id });
  redirect(`/teacher/assignments/${a.id}`);
}

export async function setAssignmentOpen(assignmentId: number, isOpen: boolean): Promise<void> {
  const { teacherId } = await requireTeacher();
  if (!(await ownedAssignment(teacherId, assignmentId))) return;
  const db = await getDb();
  await db.update(schema.assignments).set({ isOpen }).where(eq(schema.assignments.id, assignmentId));
  revalidatePath(`/teacher/assignments/${assignmentId}`);
}

export async function setCoachEnabled(assignmentId: number, coachEnabled: boolean): Promise<void> {
  const { teacherId } = await requireTeacher();
  if (!(await ownedAssignment(teacherId, assignmentId))) return;
  const db = await getDb();
  await db.update(schema.assignments).set({ coachEnabled }).where(eq(schema.assignments.id, assignmentId));
  revalidatePath(`/teacher/assignments/${assignmentId}`);
}

export async function setCoachProvider(assignmentId: number, form: FormData): Promise<void> {
  const { teacherId } = await requireTeacher();
  if (!(await ownedAssignment(teacherId, assignmentId))) return;
  const v = String(form.get("coachProvider") ?? "auto");
  const coachProvider = v === "auto" || (PROVIDER_IDS as readonly string[]).includes(v) ? v : "auto";
  const db = await getDb();
  await db.update(schema.assignments).set({ coachProvider }).where(eq(schema.assignments.id, assignmentId));
  revalidatePath(`/teacher/assignments/${assignmentId}`);
}

export async function resetStudentPin(classId: number, studentId: number): Promise<void> {
  const { teacherId } = await requireTeacher();
  if (!(await ownedClass(teacherId, classId))) return;
  const db = await getDb();
  await db
    .update(schema.students)
    .set({ pinHash: "" })
    .where(and(eq(schema.students.id, studentId), eq(schema.students.classId, classId)));
  revalidatePath(`/teacher/classes/${classId}`);
}

export async function addComment(_: FormState, form: FormData): Promise<FormState> {
  const { teacherId } = await requireTeacher();
  const submissionId = Number(form.get("submissionId"));
  const content = String(form.get("content") ?? "").trim();
  if (!content) return { error: "내용을 입력해 주세요." };
  if (!(await teacherSubmission(teacherId, submissionId))) return { error: "제출물을 찾을 수 없습니다." };
  const db = await getDb();
  await db.insert(schema.teacherComments).values({ submissionId, content: content.slice(0, 2000) });
  await logEvent(`teacher:${teacherId}`, "comment", "submission", submissionId);
  revalidatePath(`/teacher/submissions/${submissionId}`);
  return { ok: "코멘트를 남겼습니다." };
}

export async function saveRubricFinal(_: FormState, form: FormData): Promise<FormState> {
  const { teacherId } = await requireTeacher();
  const submissionId = Number(form.get("submissionId"));
  const row = await teacherSubmission(teacherId, submissionId);
  if (!row) return { error: "제출물을 찾을 수 없습니다." };
  const db = await getDb();
  for (const c of row.assignment.rubric) {
    const v = Number(form.get(`score_${c.key}`));
    if (![1, 2, 3].includes(v)) continue;
    await db
      .insert(schema.rubricScores)
      .values({ submissionId, criterion: c.key, teacherFinal: v })
      .onConflictDoUpdate({
        target: [schema.rubricScores.submissionId, schema.rubricScores.criterion],
        set: { teacherFinal: v, updatedAt: new Date() },
      });
  }
  await logEvent(`teacher:${teacherId}`, "rubric_final", "submission", submissionId);
  revalidatePath(`/teacher/submissions/${submissionId}`);
  return { ok: "평가를 저장했습니다." };
}

export async function returnSubmission(submissionId: number): Promise<void> {
  const { teacherId } = await requireTeacher();
  if (!(await teacherSubmission(teacherId, submissionId))) return;
  const db = await getDb();
  await db.update(schema.submissions).set({ status: "returned" }).where(eq(schema.submissions.id, submissionId));
  await logEvent(`teacher:${teacherId}`, "return", "submission", submissionId);
  revalidatePath(`/teacher/submissions/${submissionId}`);
}

/** 카드뉴스 공유 승인·승인 취소(승인한 작품만 반 갤러리에 보인다) */
export async function setShareApproved(submissionId: number, approved: boolean): Promise<void> {
  const { teacherId } = await requireTeacher();
  if (await approveShare(teacherId, submissionId, approved)) revalidatePath("/teacher/assignments", "layout");
}
