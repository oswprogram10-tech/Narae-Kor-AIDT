import type { LlmProvider, ProviderId } from "@/core/providers/types";
import type { ProviderRegistry } from "@/core/providers";
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
import { CoachOutputSchema, type CoachContext, type CoachOutput, type CoachResult, type ProviderAttempt } from "./types";

// 코치 엔진: 어떤 AI가 답하든 같은 정책·가드레일을 적용한다.
// 순서: (위험 신호·개인 정보 → 규칙 응답) → 지정한 AI → 나머지 AI(기본 순서) → 모의 코치.
export async function runCoachEngine(
  ctx: CoachContext,
  registry: ProviderRegistry,
  preferred?: ProviderId | "auto" | null,
): Promise<CoachResult> {
  const inputFlags = classifyInput(ctx.studentMessage);
  const base = { policyVersion: POLICY_VERSION, inputFlags, attempts: [] as ProviderAttempt[] };

  if (inputFlags.distress) {
    return { ...base, output: structuredClone(DISTRESS_REPLY), provider: "rule", model: "rule", blocked: false, fellBack: false };
  }
  if (inputFlags.personalInfo) {
    return { ...base, output: structuredClone(PERSONAL_INFO_REPLY), provider: "rule", model: "rule", blocked: false, fellBack: false };
  }

  const chain = registry.chain(preferred);
  let raw: CoachOutput | null = null;
  let used: LlmProvider | null = null;
  for (const p of chain) {
    try {
      const out = await p.generateJson({
        system: SYSTEM_PROMPT,
        user: buildUserTurn(ctx),
        schema: CoachOutputSchema,
        schemaName: "coach_output",
        purpose: "coach",
      });
      if (out) {
        raw = out;
        used = p;
        base.attempts.push({ provider: p.id, model: p.model, outcome: "ok" });
        break;
      }
      base.attempts.push({ provider: p.id, model: p.model, outcome: "invalid" });
    } catch (err) {
      base.attempts.push({ provider: p.id, model: p.model, outcome: "error", error: String((err as Error).message).slice(0, 200) });
    }
  }

  const wanted = preferred && preferred !== "auto" ? preferred : chain[0]?.id;
  const fellBack = !used || (wanted !== undefined && used.id !== wanted);

  if (!raw) {
    // 쓸 수 있는 AI가 없거나 모두 실패: 모의 코치(대필 요청이면 정해진 거절 응답)
    const output = inputFlags.ghostwriteRequest ? structuredClone(GHOSTWRITE_REPLY) : mockCoach(ctx);
    return { ...base, output, provider: "mock", model: "mock", blocked: false, fellBack: chain.length > 0 };
  }

  const corpus = studentCorpus([ctx.brainstorm, ...Object.values(ctx.organizerValues), ctx.draft, ctx.studentMessage]);
  const check = checkOutput(raw, corpus, ctx.stage);
  if (!check.ok) {
    const fallback = inputFlags.ghostwriteRequest ? structuredClone(GHOSTWRITE_REPLY) : safeFallback(ctx.stage);
    return { ...base, output: fallback, provider: used!.id, model: used!.model, blocked: true, blockReason: check.reason, fellBack };
  }
  return { ...base, output: check.cleaned, provider: used!.id, model: used!.model, blocked: false, fellBack };
}
