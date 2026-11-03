import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  checkOutput,
  classifyInput,
  DISTRESS_REPLY,
  GHOSTWRITE_REPLY,
  PERSONAL_INFO_REPLY,
  safeFallback,
  studentCorpus,
} from "./guard";
import { mockCoach } from "./mock";
import { buildUserTurn, POLICY_VERSION, SYSTEM_PROMPT } from "./policy";
import { CoachOutputSchema, type CoachContext, type CoachOutput, type CoachResult } from "./types";

// 결정 7(무료 티어 중심·저렴한 모델)에 따라 기본값은 가장 저렴한 현행 모델. 환경 변수로 바꿀 수 있다.
export const COACH_MODEL = process.env.NARAE_COACH_MODEL || "claude-haiku-5-5";
const COACH_EFFORT = (process.env.NARAE_COACH_EFFORT || "low") as "low" | "medium" | "high";

export function coachMode(): "claude" | "mock" {
  if (process.env.NARAE_COACH_MODE === "mock") return "mock";
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "claude" : "mock";
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ timeout: 30_000, maxRetries: 1 });
  return client;
}

async function callClaude(ctx: CoachContext): Promise<CoachOutput | null> {
  const response = await getClient().messages.parse({
    model: COACH_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    output_config: { effort: COACH_EFFORT, format: zodOutputFormat(CoachOutputSchema) },
    messages: [{ role: "user", content: buildUserTurn(ctx) }],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
  return response.parsed_output ?? null;
}

function result(
  output: CoachOutput,
  model: string,
  inputFlags: CoachResult["inputFlags"],
  blocked = false,
  blockReason?: string,
): CoachResult {
  return { output, model, blocked, blockReason, policyVersion: POLICY_VERSION, inputFlags };
}

export async function runCoach(ctx: CoachContext): Promise<CoachResult> {
  const inputFlags = classifyInput(ctx.studentMessage);

  // 위험 신호와 개인 정보는 모델을 부르지 않고 바로 정해진 응답을 준다(교사 대시보드에 알림).
  if (inputFlags.distress) return result(structuredClone(DISTRESS_REPLY), "rule", inputFlags);
  if (inputFlags.personalInfo) return result(structuredClone(PERSONAL_INFO_REPLY), "rule", inputFlags);

  const mode = coachMode();
  if (mode === "mock" && inputFlags.ghostwriteRequest) {
    return result(structuredClone(GHOSTWRITE_REPLY), "mock", inputFlags);
  }

  let raw: CoachOutput | null = null;
  let model = mode === "mock" ? "mock" : COACH_MODEL;
  if (mode === "mock") {
    raw = mockCoach(ctx);
  } else {
    try {
      raw = await callClaude(ctx);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) console.warn("[coach] rate limited");
      else if (err instanceof Anthropic.AuthenticationError) console.error("[coach] API 키가 올바르지 않습니다");
      else if (err instanceof Anthropic.APIError) console.error(`[coach] API error ${err.status}: ${err.message}`);
      else console.error("[coach] unexpected error", err);
      raw = null;
    }
    if (!raw) {
      // 모델 호출 실패 시 수업이 멈추지 않도록 모의 코치로 대신 응답한다.
      model = "mock-fallback";
      raw = mockCoach(ctx);
    }
  }

  const corpus = studentCorpus([ctx.brainstorm, ...Object.values(ctx.organizerValues), ctx.draft, ctx.studentMessage]);
  const check = checkOutput(raw, corpus, ctx.stage);
  if (!check.ok) {
    const fallback = inputFlags.ghostwriteRequest ? structuredClone(GHOSTWRITE_REPLY) : safeFallback(ctx.stage);
    return result(fallback, model, inputFlags, true, check.reason);
  }
  return result(check.cleaned, model, inputFlags);
}
