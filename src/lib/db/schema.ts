import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { OrganizerField, RubricCriterion } from "@/core/data/genres";

// 학생 실명·이메일은 저장하지 않는다(결정 6: 익명 계정). 번호-이름 대응표는 교사가 앱 밖에서 보관한다.

export const teachers = pgTable("teachers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  grade: integer("grade").notNull(),
  joinCode: text("join_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const students = pgTable(
  "students",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    nickname: text("nickname").notNull(),
    pinHash: text("pin_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("students_class_number").on(t.classId, t.number)],
);

export const assignments = pgTable("assignments", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  // writing(글쓰기) | grammar(문법·어휘 활동). grammar면 activityId에 활동 id를 둔다.
  kind: text("kind").$type<"writing" | "grammar">().notNull().default("writing"),
  activityId: text("activity_id"),
  genreId: text("genre_id").notNull(),
  standardCodes: jsonb("standard_codes").$type<string[]>().notNull(),
  prompt: text("prompt").notNull(),
  organizer: jsonb("organizer").$type<OrganizerField[]>().notNull(),
  rubric: jsonb("rubric").$type<RubricCriterion[]>().notNull(),
  coachEnabled: boolean("coach_enabled").default(true).notNull(),
  // 이 과제의 코치 AI: auto(기본 순서) | local | claude | gemini | openai
  coachProvider: text("coach_provider").notNull().default("auto"),
  isOpen: boolean("is_open").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SubmissionStatus = "in_progress" | "submitted" | "returned";

export const submissions = pgTable(
  "submissions",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id").notNull().references(() => assignments.id, { onDelete: "cascade" }),
    studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    stage: text("stage").notNull().default("brainstorm"),
    status: text("status").$type<SubmissionStatus>().notNull().default("in_progress"),
    brainstorm: text("brainstorm").notNull().default(""),
    organizerValues: jsonb("organizer_values").$type<Record<string, string>>().notNull().default({}),
    draft: text("draft").notNull().default(""),
    pasteChars: integer("paste_chars").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("submissions_assignment_student").on(t.assignmentId, t.studentId)],
);

// 초고 버전 기록(초고 → 최종본 비교, 연구용 쓰기 과정 분석)
export const drafts = pgTable(
  "drafts",
  {
    id: serial("id").primaryKey(),
    submissionId: integer("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    content: text("content").notNull(),
    reason: text("reason").notNull(), // autosave | stage_change | submit
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("drafts_submission").on(t.submissionId)],
);

export const coachMessages = pgTable(
  "coach_messages",
  {
    id: serial("id").primaryKey(),
    submissionId: integer("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    role: text("role").$type<"student" | "coach">().notNull(),
    stage: text("stage").notNull(),
    content: text("content").notNull(),
    // 코치 응답의 질문·하이라이트 등 구조화된 부분
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    policyVersion: text("policy_version"),
    provider: text("provider"), // 실제로 응답한 AI(local/claude/gemini/openai/mock/rule)
    model: text("model"),
    blocked: boolean("blocked").notNull().default(false),
    blockReason: text("block_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("coach_messages_submission").on(t.submissionId)],
);

// 문법 활동의 문제별 시도 기록(연구용). feedbackLevel: 정답이면 null, 아니면 principle|hint1|hint2|reveal|awkward
export const grammarAttempts = pgTable(
  "grammar_attempts",
  {
    id: serial("id").primaryKey(),
    submissionId: integer("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    attemptNo: integer("attempt_no").notNull(),
    correct: boolean("correct").notNull(),
    reason: text("reason").notNull(),
    feedbackLevel: text("feedback_level"),
    answer: jsonb("answer").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("grammar_attempts_submission").on(t.submissionId)],
);

export const teacherComments = pgTable("teacher_comments", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const rubricScores = pgTable(
  "rubric_scores",
  {
    id: serial("id").primaryKey(),
    submissionId: integer("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    criterion: text("criterion").notNull(),
    aiSuggested: integer("ai_suggested"), // 1~3
    aiEvidence: text("ai_evidence"),
    teacherFinal: integer("teacher_final"), // 1~3
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("rubric_scores_submission_criterion").on(t.submissionId, t.criterion)],
);

// xAPI와 비슷한 학습 활동 로그(연구용). actor는 "student:12" / "teacher:3" 형태.
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    actor: text("actor").notNull(),
    verb: text("verb").notNull(),
    objectType: text("object_type").notNull(),
    objectId: integer("object_id").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("events_object").on(t.objectType, t.objectId)],
);
