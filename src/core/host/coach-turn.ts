import { runCoachEngine } from "@/core/coach/engine";
import { REVISION_LENSES } from "@/core/data/genres";
import type { ProviderRegistry } from "@/core/providers";
import type { CoachHostAdapter, CoachTurnInput, CoachTurnResponse } from "./adapter";

export interface CoachTurnOptions {
  adapter: CoachHostAdapter;
  registry: ProviderRegistry;
  dailyLimit: number;
}

export type CoachTurnOutcome =
  | { status: 200; body: CoachTurnResponse }
  | { status: 400 | 403 | 404 | 429; body: { error: string } };

// 호스트 서버의 어떤 프레임워크(Next.js, Express, Spring의 Node 사이드카 등)에서도 부를 수 있는 코치 한 번 처리.
// 호스트는 로그인 확인 → 이 함수 호출 → 결과를 그대로 JSON으로 돌려주면 된다.
export async function processCoachTurn(
  principal: unknown,
  rawInput: unknown,
  { adapter, registry, dailyLimit }: CoachTurnOptions,
): Promise<CoachTurnOutcome> {
  const body = (rawInput ?? {}) as Record<string, unknown>;
  const input: CoachTurnInput = {
    submissionId: String(body.submissionId ?? ""),
    message: typeof body.message === "string" ? body.message.trim().slice(0, 500) : "",
    lens: typeof body.lens === "string" && REVISION_LENSES.some((l) => l.key === body.lens) ? body.lens : undefined,
  };
  if (!input.submissionId) return { status: 400, body: { error: "submissionId가 필요해요." } };

  const loaded = await adapter.loadCoachTurn(principal, input.submissionId);
  if (!loaded) return { status: 404, body: { error: "찾을 수 없어요." } };
  if (!loaded.coachEnabled) return { status: 403, body: { error: "이 과제는 선생님이 코치를 꺼 두었어요." } };

  const actor = `student:${loaded.studentKey}`;
  const used = await adapter.coachUsageToday(loaded.studentKey);
  if (used >= dailyLimit) {
    await adapter.logEvent?.(actor, "coach_limit", input.submissionId);
    return {
      status: 429,
      body: { error: `오늘은 코치와 ${dailyLimit}번 이야기했어요. 이제 스스로 해 보고, 막히면 선생님께 물어보세요!` },
    };
  }

  const ctx = { ...loaded.context, studentMessage: input.message, lens: input.lens };
  const result = await runCoachEngine(ctx, registry, loaded.preferredProvider);
  const stage = ctx.stage;
  const ids = await adapter.saveCoachTurn(input.submissionId, {
    stage,
    studentMessage: input.message || "(도움 요청)",
    lens: input.lens ?? null,
    result,
  });

  await adapter.logEvent?.(actor, "help_request", input.submissionId, { stage, lens: input.lens ?? null, hasMessage: !!input.message });
  await adapter.logEvent?.(actor, result.blocked ? "coach_blocked" : "coach_reply", input.submissionId, {
    stage,
    provider: result.provider,
    model: result.model,
    fellBack: result.fellBack,
    attempts: result.attempts,
    flag: result.output.flag,
    blockReason: result.blockReason ?? null,
  });

  const coachText = [result.output.reply, ...result.output.questions].join("\n");
  return {
    status: 200,
    body: {
      student: { id: ids.studentMessageId, role: "student", content: input.message || "(도움 요청)", stage },
      coach: {
        id: ids.coachMessageId,
        role: "coach",
        content: coachText,
        stage,
        reply: result.output.reply,
        questions: result.output.questions,
        highlights: result.output.highlights,
        flag: result.output.flag,
        provider: result.provider,
      },
      remainingToday: dailyLimit - used - 1,
    },
  };
}
