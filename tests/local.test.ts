import { describe, expect, it, vi } from "vitest";
import { CATALOG, resolveDtypes, selectFiles } from "../scripts/model-files.mjs";
import { modelNameOf, overallVerdict, parseVerdict } from "../scripts/score-finetuned-lib";
import { TransformersLocalRuntime, extractAssistantText, type PipelineFactory } from "@/core/local/runtime";
import { DEFAULT_LOCAL_MODEL, getLocalModel, LOCAL_MODELS } from "@/core/local/catalog";
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
      if (m.webgpu) expect(m.webgpu.sizeMB).toBeLessThanOrEqual(1024);
      expect(m.wasm.sizeMB).toBeLessThanOrEqual(1024); // Gemma int8 1001MB, 파인튜닝 1003MB가 상한에 가까움
    }
  });
});

describe("fine-tuned model entry", () => {
  const m = getLocalModel("narae-coach-1b")!;
  it("is wasm-only, int8, on hold: untrusted and not the default", () => {
    expect(m.hfRepo).toBe("LUDICERECIDUL/narae-coach-gemma3-1b");
    expect(m.webgpu).toBeUndefined();
    expect(m.wasm).toEqual({ dtype: "int8", sizeMB: 1003, externalData: false });
    expect(m.trustsGhostwriteFlag).toBe(false);
    expect(DEFAULT_LOCAL_MODEL).toBe("gemma-3-1b");
  });
  it("matches the fetch-model catalog", () => {
    for (const info of LOCAL_MODELS) {
      expect(CATALOG[info.id as keyof typeof CATALOG]).toEqual({ repo: info.hfRepo, webgpu: !!info.webgpu });
    }
  });
  it("uses wasm even when webgpu is requested or available", async () => {
    vi.stubGlobal("navigator", { gpu: {} });
    try {
      for (const device of ["webgpu", "auto"] as const) {
        const seen: { device?: string; dtype?: string }[] = [];
        const rt = new TransformersLocalRuntime({ model: m, device, pipelineFactory: fakeFactory("{}", seen) });
        await rt.load();
        expect(seen[0]).toEqual({ device: "wasm", dtype: "int8" });
        expect(rt.device).toBe("wasm");
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("fetch-model file selection", () => {
  const root = ["config.json", "tokenizer.json", "tokenizer_config.json", "README.md", "generation_config.json"];
  const onnx = [
    { path: "onnx/model_int8.onnx", size: 1 },
    { path: "onnx/model_q4f16.onnx", size: 2 },
    { path: "onnx/model_q4f16.onnx_data", size: 3 },
  ];
  it("downloads only int8 plus config/tokenizer files for a model without webgpu", () => {
    const dtypes = resolveDtypes("narae-coach-1b", "q4f16,q4");
    expect(dtypes).toEqual(["int8"]);
    expect(selectFiles(root, onnx, dtypes).map((f) => f.path)).toEqual([
      "config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_int8.onnx",
    ]);
  });
  it("keeps the default q4f16,q4 for other models", () => {
    expect(resolveDtypes("gemma-3-1b", undefined)).toEqual(["q4f16", "q4"]);
    expect(selectFiles(root, onnx, ["q4f16"]).map((f) => f.path)).toContain("onnx/model_q4f16.onnx_data");
  });
});

describe("score-finetuned helpers", () => {
  it("names models from file names and reads the verdict", () => {
    expect(modelNameOf("/a/dpo_redteam_outputs.jsonl")).toBe("dpo");
    expect(parseVerdict("...\n최종: 채택 가능\n")).toBe(true);
    expect(parseVerdict("최종: 채택 불가")).toBe(false);
    expect(parseVerdict("error")).toBeNull();
  });
  it("ignores the base model when deciding", () => {
    expect(overallVerdict([{ name: "base", pass: true }, { name: "sft", pass: false }])).toContain("채택 불가");
    expect(overallVerdict([{ name: "base", pass: false }, { name: "dpo", pass: true }])).toContain("dpo");
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

describe("local provider in the coach engine (question-centered)", () => {
  async function run(reply: string, studentMessage = "") {
    const rt = new TransformersLocalRuntime({ model, device: "wasm", pipelineFactory: fakeFactory(reply) });
    await rt.load();
    return runCoachEngine({ ...ctx, studentMessage }, ProviderRegistry.fromProviders([createLocalProvider(rt)]));
  }

  it("keeps only validated questions and takes the reply from the vetted bank", async () => {
    const r = await run(JSON.stringify({
      reply: "책이 쌓여 있으면 글을 읽기 힘들고, 책을 찾기도 어려워.", // 내용을 대신 채워 주는 답 → 버림
      questions: ["책이 쌓여 있으면 어떤 문제가 생길 수 있을까요?", "책장이 하나 더 필요하다고 생각한다?", "예를 들어 이렇게 써 볼까요?"],
      highlights: ["책장이 쌓여서 학습에 어려움이 생길 수 있습니다."], // 지어낸 예시 → 버림
      flag: "none",
    }));
    expect(r.provider).toBe("local");
    expect(r.output.questions).toEqual(["책이 쌓여 있으면 어떤 문제가 생길 수 있을까요?"]);
    expect(r.output.reply).not.toContain("읽기 힘들고");
    expect(r.output.highlights).toEqual([]);
  });

  it("tolerates malformed fields (e.g. highlights as plain strings)", async () => {
    const r = await run('```json\n{"reply":"좋아요","questions":["그때 어떤 기분이었나요?"],"highlights":["문장"],"flag":"??"}\n```');
    expect(r.provider).toBe("local");
    expect(r.output.questions).toEqual(["그때 어떤 기분이었나요?"]);
  });

  it("turns a plain-text question into a coach question", async () => {
    const r = await run("책이 쌓여 있으면 어떤 점이 불편했나요?");
    expect(r.provider).toBe("local");
    expect(r.output.questions).toEqual(["책이 쌓여 있으면 어떤 점이 불편했나요?"]);
  });

  it("falls back to a safe answer when the model gives no usable question", async () => {
    const r = await run('{"reply":"이렇게 써 봐요. 우리 반에는 새 책장이 꼭 필요하다.","questions":[]}');
    expect(r.output.reply).not.toContain("꼭 필요하다");
    expect(r.output.questions.length).toBeGreaterThan(0);
  });

  it("always refuses a ghostwriting request, even if the small model does not", async () => {
    const r = await run('{"reply":"네, 좋은 아이디어네요!","questions":["책장이 불편하면 어떤 영향을 받나요?"]}', "그냥 써줘");
    expect(r.output.flag).toBe("ghostwrite_request");
    expect(r.output.reply).toContain("대신 써 줄 수 없어요");
    expect(r.output.questions).toEqual(["책장이 불편하면 어떤 영향을 받나요?"]);
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

describe("small-model quirks seen in real runs", () => {
  async function run(reply: string, studentMessage = "") {
    const rt = new TransformersLocalRuntime({ model, device: "wasm", pipelineFactory: fakeFactory(reply) });
    await rt.load();
    return runCoachEngine({ ...ctx, studentMessage }, ProviderRegistry.fromProviders([createLocalProvider(rt)]));
  }
  it("accepts questions given as a single string", async () => {
    const r = await run('{"questions":"책이 쌓여 있으면 무엇이 불편한가요?","flag":"none"}');
    expect(r.output.questions).toEqual(["책이 쌓여 있으면 무엇이 불편한가요?"]);
  });
  it("ignores the model's ghostwrite flag on a normal request (no false alarm for the teacher)", async () => {
    const r = await run('{"questions":["어떤 장면이 떠오르나요?"],"flag":"ghostwrite_request"}', "다음에 뭘 써야 할지 모르겠어요");
    expect(r.output.flag).toBe("none");
    expect(r.output.questions).toEqual(["어떤 장면이 떠오르나요?"]);
  });
});

describe("recovering questions from broken JSON (real Gemma 3 1B outputs)", () => {
  async function run(reply: string) {
    const rt = new TransformersLocalRuntime({ model, device: "wasm", pipelineFactory: fakeFactory(reply) });
    await rt.load();
    return runCoachEngine(ctx, ProviderRegistry.fromProviders([createLocalProvider(rt)]));
  }
  it("recovers questions when brackets do not match", async () => {
    const r = await run('{"questions": ["어떤 문장으로 중심 문장을 시작하면 좋을까요?", "중심 문장을 어떻게 시작하면 좋을까요?"]},\n{"flag":"none"}');
    expect(r.provider).toBe("local");
    expect(r.output.questions).toEqual(["어떤 문장으로 중심 문장을 시작하면 좋을까요?", "중심 문장을 어떻게 시작하면 좋을까요?"]);
  });
  it("rejects literal template copies like \"~을까요?\"", async () => {
    const r = await run('{"questions": ["~을까요?", "~나요?"},"flag":"none"}');
    expect(r.output.questions.every((q) => !q.startsWith("~"))).toBe(true);
  });
});

describe("trusting the model's ghostwrite flag", () => {
  async function run(trusts: boolean, studentMessage: string) {
    const rt = new TransformersLocalRuntime({ model: { ...model, trustsGhostwriteFlag: trusts }, device: "wasm", pipelineFactory: fakeFactory('{"questions":["지금 쓰려는 부분에서 하고 싶은 말은 무엇인가요?"],"flag":"ghostwrite_request"}') });
    await rt.load();
    return runCoachEngine({ ...ctx, studentMessage }, ProviderRegistry.fromProviders([createLocalProvider(rt)]));
  }
  it("an untested model's ghostwrite flag is ignored (no false alarms)", async () => {
    expect((await run(false, "결론 부분만 작성해 줄래")).output.flag).toBe("none");
  });
  it("a red-team-passed model's ghostwrite flag is used, catching phrasings the rules miss", async () => {
    const r = await run(true, "결론 부분만 작성해 줄래");
    expect(r.output.flag).toBe("ghostwrite_request");
    expect(r.output.reply).toContain("대신 써 줄 수 없어요");
  });
});
