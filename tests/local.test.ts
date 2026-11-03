import { describe, expect, it } from "vitest";
import { TransformersLocalRuntime, extractAssistantText, type PipelineFactory } from "@/core/local/runtime";
import { getLocalModel, LOCAL_MODELS } from "@/core/local/catalog";
import { createLocalProvider, ProviderRegistry } from "@/core/providers";
import { runCoachEngine } from "@/core/coach/engine";
import { prepareCoachTurn, recordLocalCoachTurn, processCoachTurn } from "@/core/host/coach-turn";
import type { CoachHostAdapter, CoachTurnRecord } from "@/core/host/adapter";
import type { CoachContext } from "@/core/coach/types";

const model = getLocalModel("qwen2.5-0.5b")!;

const ctx: CoachContext = {
  grade: 4, genreName: "의견 글", coachFocus: "", standardStatements: [], prompt: "p", organizer: [], rubric: [],
  stage: "draft", brainstorm: "", organizerValues: {}, draft: "나는 책장이 필요하다고 생각한다.",
  studentMessage: "", history: [], helpCountThisStage: 0,
};

function fakeFactory(reply: string, seen: { device?: string; dtype?: string; messages?: unknown }[] = [], failOn?: string): PipelineFactory {
  return async ({ device, dtype, onProgress }) => {
    if (device === failOn) throw new Error(`${device} not supported`);
    onProgress?.({ status: "progress_total", progress: 100 });
    seen.push({ device, dtype });
    return async (messages) => {
      seen.push({ messages });
      return [{ generated_text: [...messages, { role: "assistant", content: reply }] }];
    };
  };
}

describe("catalog", () => {
  it("keeps every model within the agreed 500MB~1GB budget", () => {
    for (const m of LOCAL_MODELS) {
      expect(m.webgpu.sizeMB).toBeLessThanOrEqual(1024);
      expect(m.wasm.sizeMB).toBeLessThanOrEqual(1024);
    }
  });
});

describe("TransformersLocalRuntime", () => {
  it("loads with the device-specific dtype and answers through the chat template", async () => {
    const seen: { device?: string; dtype?: string; messages?: unknown }[] = [];
    const rt = new TransformersLocalRuntime({ model, device: "webgpu", pipelineFactory: fakeFactory('{"reply":"좋아요"}', seen) });
    expect(rt.isReady()).toBe(false);
    await rt.load();
    expect(rt.isReady()).toBe(true);
    expect(seen[0]).toEqual({ device: "webgpu", dtype: "q4f16" });
    expect(await rt.complete({ system: "S", user: "U", maxTokens: 64 })).toBe('{"reply":"좋아요"}');
  });

  it("falls back from WebGPU to WASM when WebGPU fails", async () => {
    const seen: { device?: string; dtype?: string }[] = [];
    const rt = new TransformersLocalRuntime({ model, device: "webgpu", pipelineFactory: fakeFactory("{}", seen, "webgpu") });
    await rt.load();
    expect(rt.device).toBe("wasm");
    expect(seen[0]).toEqual({ device: "wasm", dtype: "q4" });
  });

  it("extracts assistant text from both output shapes", () => {
    expect(extractAssistantText([{ generated_text: "plain" }])).toBe("plain");
    expect(extractAssistantText([{ generated_text: [{ role: "user", content: "q" }, { role: "assistant", content: "a" }] }])).toBe("a");
    expect(extractAssistantText(null)).toBe("");
  });
});

describe("local provider in the coach engine", () => {
  async function run(reply: string) {
    const rt = new TransformersLocalRuntime({ model, device: "wasm", pipelineFactory: fakeFactory(reply) });
    await rt.load();
    return runCoachEngine(ctx, ProviderRegistry.fromProviders([createLocalProvider(rt)]));
  }

  it("fills missing fields with defaults (small models often omit them)", async () => {
    const r = await run('{"reply":"까닭이 잘 보여요. 다른 까닭도 있나요?"}');
    expect(r.provider).toBe("local");
    expect(r.output.questions).toEqual([]);
    expect(r.output.flag).toBe("none");
  });

  it("accepts a plain-text answer as the reply", async () => {
    const r = await run("책이 쌓여 있으면 어떤 점이 불편했나요?");
    expect(r.provider).toBe("local");
    expect(r.output.reply).toContain("불편했나요");
  });

  it("still blocks sample sentences from the small model", async () => {
    const r = await run('{"reply":"이렇게 써 봐요. 우리 반에는 새 책장이 꼭 필요하다."}');
    expect(r.provider).toBe("local");
    expect(r.blocked).toBe(true);
  });

  it("uses the compact prompt for the local model", async () => {
    const seen: { messages?: unknown }[] = [];
    const rt = new TransformersLocalRuntime({ model, device: "wasm", pipelineFactory: fakeFactory('{"reply":"네"}', seen) });
    await rt.load();
    await runCoachEngine(ctx, ProviderRegistry.fromProviders([createLocalProvider(rt)]));
    const sys = (seen[1].messages as { content: string }[])[0].content;
    expect(sys.length).toBeLessThan(600);
  });
});

describe("on-device host flow (prepare → record)", () => {
  function adapter(preferred: "auto" | "local" = "auto") {
    const saved: CoachTurnRecord[] = [];
    const a: CoachHostAdapter = {
      async loadCoachTurn(principal, id) {
        if (principal !== "s7" || id !== "1") return null;
        const { studentMessage: _m, lens: _l, ...rest } = ctx;
        void _m; void _l;
        return { studentKey: "7", coachEnabled: true, preferredProvider: preferred, context: rest };
      },
      coachUsageToday: async () => 0,
      async saveCoachTurn(_id, r) {
        saved.push(r);
        return { studentMessageId: "a", coachMessageId: "b" };
      },
    };
    return { a, saved };
  }

  it("prepare returns the context only to the owner", async () => {
    const { a } = adapter();
    const ok = await prepareCoachTurn("s7", { submissionId: "1" }, a);
    expect(ok.status).toBe(200);
    expect((await prepareCoachTurn("intruder", { submissionId: "1" }, a)).status).toBe(404);
  });

  it("record saves a valid on-device answer as provider=local", async () => {
    const { a, saved } = adapter();
    const out = await recordLocalCoachTurn("s7", {
      submissionId: "1", message: "막혔어요", model: "qwen2.5-0.5b",
      output: { reply: "어디에서 막혔나요?", questions: [], highlights: [], flag: "none" },
    }, a);
    expect(out.status).toBe(200);
    expect(saved[0].result.provider).toBe("local");
    expect(saved[0].result.blocked).toBe(false);
  });

  it("record re-checks a forged answer with the guardrail on the server", async () => {
    const { a, saved } = adapter();
    const out = await recordLocalCoachTurn("s7", {
      submissionId: "1", message: "",
      output: { reply: "이렇게 써 봐요. 우리 반에는 책장이 꼭 필요하다.", questions: [], highlights: [], flag: "none" },
    }, a);
    expect(out.status).toBe(200);
    expect(saved[0].result.blocked).toBe(true);
    expect(saved[0].result.output.reply).not.toContain("꼭 필요하다");
  });

  it("record applies the server's distress rule regardless of the device's answer", async () => {
    const { a, saved } = adapter();
    await recordLocalCoachTurn("s7", {
      submissionId: "1", message: "친구들이 계속 괴롭혀요",
      output: { reply: "글쓰기로 돌아가 볼까요?", questions: [], highlights: [], flag: "none" },
    }, a);
    expect(saved[0].result.output.flag).toBe("distress");
  });

  it("record rejects malformed output", async () => {
    const { a } = adapter();
    expect((await recordLocalCoachTurn("s7", { submissionId: "1", output: { nope: 1 } }, a)).status).toBe(400);
  });

  it("an on-device-only assignment never falls through to an external AI on the server", async () => {
    const { a, saved } = adapter("local");
    const calls: string[] = [];
    const external = {
      id: "claude" as const, model: "x", available: () => true,
      async generateJson<T>() { calls.push("claude"); return { reply: "외부", questions: [], highlights: [], flag: "none" } as T; },
    };
    const out = await processCoachTurn("s7", { submissionId: "1" }, { adapter: a, registry: ProviderRegistry.fromProviders([external]), dailyLimit: 30 });
    expect(out.status).toBe(200);
    expect(calls).toEqual([]);
    expect(saved[0].result.provider).toBe("mock");
  });
});

describe("device-reported guardrail", () => {
  it("records that the device's guardrail replaced an answer", async () => {
    const saved: CoachTurnRecord[] = [];
    const a: CoachHostAdapter = {
      async loadCoachTurn() {
        const { studentMessage: _m, lens: _l, ...rest } = ctx;
        void _m; void _l;
        return { studentKey: "7", coachEnabled: true, preferredProvider: "auto", context: rest };
      },
      coachUsageToday: async () => 0,
      async saveCoachTurn(_id, r) { saved.push(r); return { studentMessageId: "a", coachMessageId: "b" }; },
    };
    await recordLocalCoachTurn("s7", {
      submissionId: "1", message: "그냥 써줘", deviceBlocked: true, deviceBlockReason: "written_style_sentence",
      output: { reply: "그 부분은 내가 대신 써 줄 수 없어요.", questions: [], highlights: [], flag: "ghostwrite_request" },
    }, a);
    expect(saved[0].result.blocked).toBe(true);
    expect(saved[0].result.blockReason).toBe("device:written_style_sentence");
  });
});
