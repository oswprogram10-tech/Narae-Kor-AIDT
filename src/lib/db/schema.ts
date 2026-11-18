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
import type { Artifact } from "@/core/artifact";
import type { AssignmentSettings } from "@/lib/assignment-settings";
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
  // writing(글쓰기) | grammar(문법·어휘 활동) | reading(읽기 활동) | media(매체 활동, 읽기 화면 재사용) | literature(문학 활동, 읽기 화면 재사용) | listening(듣기 활동, 읽기 화면 재사용)
  // | cardnews(카드뉴스 만들기) | media-diary(매체 이용 성찰 일지) | impression(인상적인 부분 나누기) | debate(토론 준비) | interview(면담 질문지) | presentation(발표 준비).
  // grammar·reading·media·literature·listening이면 activityId에 활동 id를 둔다. 제작물 종류는 활동 id 없이 제출물의 artifact에 저장한다.
  // debate이면 prompt에 논제를 둔다.
  kind: text("kind").$type<"writing" | "grammar" | "reading" | "media" | "literature" | "listening" | "cardnews" | "media-diary" | "impression" | "debate" | "interview" | "presentation">().notNull().default("writing"),
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
  // 과제 종류별 교사 설정(없으면 null). 토론: { debateSeconds: { 단계 id: 초 } }. 발표 준비: { presentationSeconds: 목표 시간(초) }. 형식·검사는 src/lib/assignment-settings.ts.
  settings: jsonb("settings").$type<AssignmentSettings | null>(),
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
    // 학생이 만드는 제작물(카드뉴스·매체 이용 일지)의 내용. 형식은 src/core/artifact.
    artifact: jsonb("artifact").$type<Artifact>(),
    // 카드뉴스: 교사가 공유를 승인하면 반 갤러리에 보인다.
    shareApproved: boolean("share_approved").notNull().default(false),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    // 카드뉴스: 작가가 받은 반응을 보고 '고칠 점'을 한 줄 적는다.
    reflection: text("reflection").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("submissions_assignment_student").on(t.assignmentId, t.studentId)],
);

// 카드뉴스 반응 스티커: 같은 학생이 같은 작품에 같은 스티커를 두 번 남길 수 없다(자유 댓글은 없다).
export const reactions = pgTable(
  "reactions",
  {
    id: serial("id").primaryKey(),
    submissionId: integer("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    reactorId: integer("reactor_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    stickerId: text("sticker_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("reactions_unique").on(t.submissionId, t.reactorId, t.stickerId), index("reactions_submission").on(t.submissionId)],
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

// 문법·읽기 활동의 문제별 시도 기록(연구용). 이름은 grammar_attempts지만 읽기 활동도 같은 표를 쓴다
// (제출물이 어느 종류의 과제인지는 assignments.kind로 알고, itemId는 활동 문제 id, answer는 종류별 답안 JSON).
// feedbackLevel: 정답이면 null, 아니면 principle|hint1|hint2|reveal|awkward
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
  // 교사가 작품 속 인물이 되어 쓴 답장이면 그 인물 id(core/literature/replies.ts), 아니면 null
  asCharacter: text("as_character"),
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
