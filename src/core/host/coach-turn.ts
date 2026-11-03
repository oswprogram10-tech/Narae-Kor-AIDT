import { runCoachEngine } from "@/core/coach/engine";
import { checkOutput, classifyInput, GHOSTWRITE_REPLY, safeFallback, studentCorpus } from "@/core/coach/guard";
import { POLICY_VERSION } from "@/core/coach/policy";
import { CoachOutputSchema, type CoachResult } from "@/core/coach/types";
import { REVISION_LENSES } from "@/core/data/genres";
import { ProviderRegistry } from "@/core/providers";
import type { CoachHostAdapter, CoachTurnInput, CoachTurnResponse, LoadedCoachTurn } from "./adapter";

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
  // 교사가 '내장 모델'을 고른 과제는 학생 글을 외부 AI로 보내지 않는다.
  // 이 경로로 왔다는 것은 기기의 내장 모델이 준비되지 않았다는 뜻이므로 모의 코치가 답한다.
  const onDeviceOnly = loaded.preferredProvider === "local";
  const result = await runCoachEngine(ctx, onDeviceOnly ? new ProviderRegistry({}) : registry, onDeviceOnly ? "auto" : loaded.preferredProvider);
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

// ── 내장 모델(학생 기기 안에서 실행) 흐름 ──
// 1) prepareCoachTurn: 호스트 서버가 권한을 확인하고 코치에 필요한 자료(context)를 기기로 보낸다.
// 2) 기기가 runCoachEngine(…, 내장 모델만 있는 registry)으로 답을 만든다.
// 3) recordLocalCoachTurn: 기기가 보낸 답을 서버가 다시 검사(입력 분류·형식·가드레일)한 뒤 저장한다.
//    학생 기기에서 온 값이므로 그대로 믿지 않는다.

export type PrepareOutcome =
  | { status: 200; body: { context: LoadedCoachTurn["context"]; preferredProvider: LoadedCoachTurn["preferredProvider"] } }
  | { status: 400 | 403 | 404; body: { error: string } };

export async function prepareCoachTurn(principal: unknown, rawInput: unknown, adapter: CoachHostAdapter): Promise<PrepareOutcome> {
  const submissionId = String(((rawInput ?? {}) as Record<string, unknown>).submissionId ?? "");
  if (!submissionId) return { status: 400, body: { error: "submissionId가 필요해요." } };
  const loaded = await adapter.loadCoachTurn(principal, submissionId);
  if (!loaded) return { status: 404, body: { error: "찾을 수 없어요." } };
  if (!loaded.coachEnabled) return { status: 403, body: { error: "이 과제는 선생님이 코치를 꺼 두었어요." } };
  return { status: 200, body: { context: loaded.context, preferredProvider: loaded.preferredProvider ?? "auto" } };
}

export async function recordLocalCoachTurn(
  principal: unknown,
  rawInput: unknown,
  adapter: CoachHostAdapter,
): Promise<CoachTurnOutcome> {
  const body = (rawInput ?? {}) as Record<string, unknown>;
  const submissionId = String(body.submissionId ?? "");
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
  const lens = typeof body.lens === "string" && REVISION_LENSES.some((l) => l.key === body.lens) ? body.lens : undefined;
  const model = typeof body.model === "string" ? body.model.slice(0, 80) : "local";
  if (!submissionId) return { status: 400, body: { error: "submissionId가 필요해요." } };

  const loaded = await adapter.loadCoachTurn(principal, submissionId);
  if (!loaded) return { status: 404, body: { error: "찾을 수 없어요." } };
  if (!loaded.coachEnabled) return { status: 403, body: { error: "이 과제는 선생님이 코치를 꺼 두었어요." } };

  const inputFlags = classifyInput(message);
  const ctx = { ...loaded.context, studentMessage: message, lens };
  let result: CoachResult;
  if (inputFlags.distress || inputFlags.personalInfo) {
    // 위험 신호·개인 정보는 기기의 답과 관계없이 서버 규칙으로 처리(교사 알림 포함)
    result = await runCoachEngine(ctx, new ProviderRegistry({}));
  } else {
    const parsed = CoachOutputSchema.safeParse(body.output);
    if (!parsed.success) return { status: 400, body: { error: "내장 AI의 답 형식이 올바르지 않아요." } };
    const corpus = studentCorpus([ctx.brainstorm, ...Object.values(ctx.organizerValues), ctx.draft, message]);
    const check = checkOutput(parsed.data, corpus, ctx.stage);
    const serverBlocked = !check.ok;
    // 기기에서 이미 가드레일이 응답을 바꿨다면 그 사실도 기록한다(연구 데이터). '막았다'는 보고는 믿어도 안전하다.
    const deviceBlocked = body.deviceBlocked === true;
    result = {
      output: serverBlocked ? (inputFlags.ghostwriteRequest ? structuredClone(GHOSTWRITE_REPLY) : safeFallback(ctx.stage)) : check.cleaned,
      blocked: serverBlocked || deviceBlocked,
      blockReason: check.reason ?? (deviceBlocked ? `device:${String(body.deviceBlockReason ?? "unknown").slice(0, 40)}` : undefined),
      provider: "local",
      model,
      fellBack: false,
      attempts: [{ provider: "local", model, outcome: "ok" }],
      policyVersion: POLICY_VERSION,
      inputFlags,
    };
  }

  const stage = ctx.stage;
  const ids = await adapter.saveCoachTurn(submissionId, { stage, studentMessage: message || "(도움 요청)", lens: lens ?? null, result });
  const actor = `student:${loaded.studentKey}`;
  await adapter.logEvent?.(actor, "help_request", submissionId, { stage, lens: lens ?? null, hasMessage: !!message });
  await adapter.logEvent?.(actor, result.blocked ? "coach_blocked" : "coach_reply", submissionId, {
    stage,
    provider: result.provider,
    model: result.model,
    onDevice: true,
    flag: result.output.flag,
    blockReason: result.blockReason ?? null,
  });
  const coachText = [result.output.reply, ...result.output.questions].join("\n");
  return {
    status: 200,
    body: {
      student: { id: ids.studentMessageId, role: "student", content: message || "(도움 요청)", stage },
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
      remainingToday: -1, // 내장 모델은 비용이 없어 하루 상한을 적용하지 않음
    },
  };
}
