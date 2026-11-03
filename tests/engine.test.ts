import { describe, expect, it } from "vitest";
import { runCoachEngine } from "@/core/coach/engine";
import { processCoachTurn } from "@/core/host/coach-turn";
import { ProviderRegistry, type LlmProvider, type ProviderId } from "@/core/providers";
import type { CoachHostAdapter, CoachTurnRecord } from "@/core/host/adapter";
import type { CoachContext, CoachOutput } from "@/core/coach/types";

const ctx: CoachContext = {
  grade: 4, genreName: "의견 글", coachFocus: "", standardStatements: [], prompt: "p", organizer: [], rubric: [],
  stage: "draft", brainstorm: "", organizerValues: {}, draft: "나는 책장이 필요하다고 생각한다.",
  studentMessage: "", history: [], helpCountThisStage: 0,
};

const good: CoachOutput = { reply: "까닭을 잘 적었어요.", questions: ["또 다른 까닭이 있나요?"], highlights: [], flag: "none" };

function fake(id: ProviderId, behavior: "ok" | "null" | "throw" | "leak", calls: string[] = []): LlmProvider {
  return {
    id,
    model: `${id}-model`,
    available: () => true,
    async generateJson<T>() {
      calls.push(id);
      if (behavior === "throw") throw new Error("network down");
      if (behavior === "null") return null;
      if (behavior === "leak") return { ...good, reply: "이렇게 시작해 봐요. 우리 반에는 책장이 꼭 필요하다." } as T;
      return good as T;
    },
  };
}

describe("runCoachEngine", () => {
  it("uses the preferred provider first", async () => {
    const calls: string[] = [];
    const reg = ProviderRegistry.fromProviders([fake("claude", "ok", calls), fake("openai", "ok", calls)]);
    const r = await runCoachEngine(ctx, reg, "openai");
    expect(r.provider).toBe("openai");
    expect(r.fellBack).toBe(false);
    expect(calls).toEqual(["openai"]);
  });

  it("falls back to the next provider on error or invalid output", async () => {
    const reg = ProviderRegistry.fromProviders([fake("local", "null"), fake("claude", "throw"), fake("gemini", "ok")]);
    const r = await runCoachEngine(ctx, reg);
    expect(r.provider).toBe("gemini");
    expect(r.fellBack).toBe(true);
    expect(r.attempts.map((a) => a.outcome)).toEqual(["invalid", "error", "ok"]);
  });

  it("falls back to the mock coach when every provider fails, and with no providers at all", async () => {
    const r = await runCoachEngine(ctx, ProviderRegistry.fromProviders([fake("claude", "throw")]));
    expect(r.provider).toBe("mock");
    expect(r.fellBack).toBe(true);
    const none = await runCoachEngine(ctx, new ProviderRegistry({}));
    expect(none.provider).toBe("mock");
    expect(none.fellBack).toBe(false);
  });

  it("never lets a sample sentence through, whichever provider answers", async () => {
    for (const id of ["local", "claude", "gemini", "openai"] as const) {
      const r = await runCoachEngine(ctx, ProviderRegistry.fromProviders([fake(id, "leak")]));
      // 외부 AI는 가드레일이 막고, 내장 모델은 질문 중심 다듬기에서 reply를 버린다.
      if (id !== "local") expect(r.blocked, id).toBe(true);
      expect(r.output.reply, id).not.toContain("꼭 필요하다");
    }
  });

  it("answers distress messages by rule without calling any AI", async () => {
    const calls: string[] = [];
    const r = await runCoachEngine({ ...ctx, studentMessage: "친구들이 저를 계속 괴롭혀요" }, ProviderRegistry.fromProviders([fake("claude", "ok", calls)]));
    expect(r.provider).toBe("rule");
    expect(r.output.flag).toBe("distress");
    expect(calls).toEqual([]);
  });
});

describe("processCoachTurn (host server contract)", () => {
  function adapter(opts: { enabled?: boolean; used?: number } = {}) {
    const saved: CoachTurnRecord[] = [];
    const a: CoachHostAdapter = {
      async loadCoachTurn(principal, submissionId) {
        if (principal !== "student-7" || submissionId !== "s1") return null;
        const { studentMessage: _m, lens: _l, ...rest } = ctx;
        void _m; void _l;
        return { studentKey: "7", coachEnabled: opts.enabled ?? true, preferredProvider: "auto", context: rest };
      },
      coachUsageToday: async () => opts.used ?? 0,
      async saveCoachTurn(_id, record) {
        saved.push(record);
        return { studentMessageId: "m1", coachMessageId: "m2" };
      },
    };
    return { a, saved };
  }
  const registry = ProviderRegistry.fromProviders([fake("claude", "ok")]);

  it("runs the coach and saves the turn", async () => {
    const { a, saved } = adapter();
    const out = await processCoachTurn("student-7", { submissionId: "s1", message: "막혔어요" }, { adapter: a, registry, dailyLimit: 30 });
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.body.coach.provider).toBe("claude");
    expect(out.body.remainingToday).toBe(29);
    expect(saved[0].studentMessage).toBe("막혔어요");
  });

  it("enforces access, the teacher's switch, and the daily limit", async () => {
    expect((await processCoachTurn("someone-else", { submissionId: "s1" }, { adapter: adapter().a, registry, dailyLimit: 30 })).status).toBe(404);
    expect((await processCoachTurn("student-7", { submissionId: "s1" }, { adapter: adapter({ enabled: false }).a, registry, dailyLimit: 30 })).status).toBe(403);
    expect((await processCoachTurn("student-7", { submissionId: "s1" }, { adapter: adapter({ used: 30 }).a, registry, dailyLimit: 30 })).status).toBe(429);
    expect((await processCoachTurn("student-7", {}, { adapter: adapter().a, registry, dailyLimit: 30 })).status).toBe(400);
  });
});

describe("model-detected risk as a second safety net", () => {
  function flagging(flag: "distress" | "personal_info"): LlmProvider {
    return { id: "claude", model: "m", available: () => true, async generateJson<T>() { return { ...good, flag } as T; } };
  }
  it("turns a model's distress flag into the fixed care reply", async () => {
    // 규칙 감지기가 놓치는 표현(예: 은유적인 표현)이라고 가정
    const r = await runCoachEngine({ ...ctx, studentMessage: "요즘 학교 오기가 너무 무서워요" }, ProviderRegistry.fromProviders([flagging("distress")]));
    expect(r.output.flag).toBe("distress");
    expect(r.output.reply).toContain("선생님께");
  });
  it("turns a model's personal-info flag into the fixed reply", async () => {
    const r = await runCoachEngine({ ...ctx, studentMessage: "우리 집은 행복아파트 3동이에요" }, ProviderRegistry.fromProviders([flagging("personal_info")]));
    expect(r.output.flag).toBe("personal_info");
  });
});
