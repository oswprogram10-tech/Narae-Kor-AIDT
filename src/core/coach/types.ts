import { z } from "zod";
import type { Stage } from "@/core/data/genres";
import type { OrganizerField, RubricCriterion } from "@/core/data/genres";

export const LENS_KEYS = ["whole", "paragraph", "sentence", "word"] as const;

export const CoachOutputSchema = z.object({
  reply: z.string().describe("학생에게 하는 말. 해요체 1~3문장. 학생 글에 들어갈 문장을 대신 쓰지 않는다."),
  questions: z.array(z.string()).describe("학생이 스스로 생각하게 하는 질문 0~2개"),
  highlights: z
    .array(
      z.object({
        quote: z.string().describe("학생 글에서 그대로 따온 부분(글자 하나도 바꾸지 않음)"),
        lens: z.enum(LENS_KEYS),
        note: z.string().describe("그 부분에 대해 생각해 볼 질문 한 문장"),
      }),
    )
    .describe("고쳐 쓰기 단계에서 살펴볼 부분 0~3개. 다른 단계에서는 빈 배열"),
  flag: z
    .enum(["none", "ghostwrite_request", "off_topic", "personal_info", "distress"])
    .describe("학생 메시지 분류"),
});
export type CoachOutput = z.infer<typeof CoachOutputSchema>;

// 내장 초소형 모델용: 빠진 필드는 기본값으로 채운다(형식을 완벽히 지키지 못하는 경우가 많음).
export const CoachOutputLenientSchema = z.object({
  reply: z.string().min(1),
  questions: z.array(z.string()).default([]),
  highlights: CoachOutputSchema.shape.highlights.default([]),
  flag: CoachOutputSchema.shape.flag.catch("none").default("none"),
});

export interface CoachHistoryItem {
  role: "student" | "coach";
  content: string;
}

export interface CoachContext {
  grade: number;
  genreName: string;
  coachFocus: string;
  standardStatements: string[];
  prompt: string;
  organizer: OrganizerField[];
  rubric: RubricCriterion[];
  stage: Stage;
  brainstorm: string;
  organizerValues: Record<string, string>;
  draft: string;
  studentMessage: string; // 비어 있으면 "도움 요청" 버튼만 누른 것
  lens?: string; // 고쳐 쓰기 단계에서 학생이 고른 렌즈
  history: CoachHistoryItem[];
  helpCountThisStage: number; // 힌트 단계(1→2→3)를 정하는 데 씀
}

export interface ProviderAttempt {
  provider: string; // local | claude | gemini | openai
  model: string;
  outcome: "ok" | "invalid" | "error";
  error?: string;
}

export interface CoachResult {
  output: CoachOutput;
  blocked: boolean;
  blockReason?: string;
  provider: string; // 실제로 응답한 AI: local | claude | gemini | openai | mock | rule
  model: string; // 모델 ID, 또는 "mock" / "rule"
  fellBack: boolean; // 앞 순서의 AI가 실패해서 다음 AI(또는 모의 코치)가 응답했는지
  attempts: ProviderAttempt[];
  policyVersion: string;
  inputFlags: InputFlags;
}

export interface InputFlags {
  ghostwriteRequest: boolean;
  personalInfo: boolean;
  distress: boolean;
}
