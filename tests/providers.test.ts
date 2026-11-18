import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createGeminiProvider, createOpenAIProvider, createLocalProvider, ProviderRegistry, ProviderError } from "@/core/providers";
import type { FetchLike, JsonRequest } from "@/core/providers";

const Schema = z.object({ reply: z.string(), questions: z.array(z.string()) });
const req: JsonRequest<z.infer<typeof Schema>> = {
  system: "SYS",
  user: "USER",
  schema: Schema,
  schemaName: "coach_output",
  purpose: "coach",
};

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, init: init!, body: JSON.parse(String(init!.body)) });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status });
  };
  return { fn, calls };
}

describe("OpenAI provider", () => {
  it("is unavailable without key or model", () => {
    expect(createOpenAIProvider({ apiKey: "k" }).available()).toBe(false);
    expect(createOpenAIProvider({ model: "m" }).available()).toBe(false);
  });

  it("sends a strict json_schema request and parses the answer", async () => {
    const { fn, calls } = fakeFetch([
      { status: 200, body: { choices: [{ message: { content: '{"reply":"좋아요","questions":["왜 그럴까요?"]}' }, finish_reason: "stop" }] } },
    ]);
    const p = createOpenAIProvider({ apiKey: "sk-test", model: "test-model", fetch: fn });
    expect(await p.generateJson(req)).toEqual({ reply: "좋아요", questions: ["왜 그럴까요?"] });
    const c = calls[0];
    expect(c.url).toBe("https://api.openai.com/v1/chat/completions");
    expect((c.init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(c.body.model).toBe("test-model");
    const rf = c.body.response_format as { type: string; json_schema: { strict: boolean; schema: Record<string, unknown> } };
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.strict).toBe(true);
    expect(rf.json_schema.schema.additionalProperties).toBe(false);
    expect(rf.json_schema.schema.$schema).toBeUndefined();
  });

  it("returns null on refusal or invalid JSON, throws ProviderError on HTTP errors", async () => {
    const refusal = fakeFetch([{ status: 200, body: { choices: [{ message: { content: null, refusal: "no" } }] } }]);
    expect(await createOpenAIProvider({ apiKey: "k", model: "m", fetch: refusal.fn }).generateJson(req)).toBeNull();
    const bad = fakeFetch([{ status: 200, body: { choices: [{ message: { content: '{"reply":1}' } }] } }]);
    expect(await createOpenAIProvider({ apiKey: "k", model: "m", fetch: bad.fn }).generateJson(req)).toBeNull();
    const err = fakeFetch([{ status: 401, body: "unauthorized" }]);
    await expect(createOpenAIProvider({ apiKey: "k", model: "m", fetch: err.fn }).generateJson(req)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("Gemini provider", () => {
  const ok = { candidates: [{ content: { parts: [{ text: '```json\n{"reply":"네","questions":[]}\n```' }] }, finishReason: "STOP" }] };

  it("calls generateContent with a JSON schema and parses fenced JSON", async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: ok }]);
    const p = createGeminiProvider({ apiKey: "g-key", model: "test-gemini", fetch: fn });
    expect(await p.generateJson(req)).toEqual({ reply: "네", questions: [] });
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models/test-gemini:generateContent");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-key");
    const gc = calls[0].body.generationConfig as Record<string, unknown>;
    expect(gc.responseMimeType).toBe("application/json");
    expect(gc.responseJsonSchema).toBeDefined();
    expect((calls[0].body.systemInstruction as { parts: { text: string }[] }).parts[0].text).toBe("SYS");
  });

  it("retries once without the schema when the API rejects it", async () => {
    const { fn, calls } = fakeFetch([{ status: 400, body: "schema not supported" }, { status: 200, body: ok }]);
    const p = createGeminiProvider({ apiKey: "k", model: "m", fetch: fn });
    expect(await p.generateJson(req)).toEqual({ reply: "네", questions: [] });
    expect(calls).toHaveLength(2);
    expect((calls[1].body.generationConfig as Record<string, unknown>).responseJsonSchema).toBeUndefined();
  });

  it("returns null when blocked for safety", async () => {
    const { fn } = fakeFetch([{ status: 200, body: { candidates: [{ finishReason: "SAFETY" }] } }]);
    expect(await createGeminiProvider({ apiKey: "k", model: "m", fetch: fn }).generateJson(req)).toBeNull();
  });
});

describe("local provider (stage-2 hook)", () => {
  it("is unavailable without a runtime", () => {
    expect(createLocalProvider(null).available()).toBe(false);
  });
  it("uses a runtime that follows the contract", async () => {
    const p = createLocalProvider({
      modelId: "tiny-test",
      isReady: () => true,
      complete: async ({ jsonSchema }) => {
        expect(jsonSchema.type).toBe("object");
        return 'Sure! {"reply":"좋아요","questions":["무엇이 떠오르나요?"]}';
      },
    });
    expect(await p.generateJson(req)).toEqual({ reply: "좋아요", questions: ["무엇이 떠오르나요?"] });
  });
});

describe("ProviderRegistry", () => {
  it("orders the chain with the preferred provider first and skips unconfigured ones", () => {
    const reg = new ProviderRegistry({
      order: ["local", "claude", "gemini", "openai"],
      claude: { apiKey: "a" },
      openai: { apiKey: "o", model: "m" },
    });
    expect(reg.available()).toEqual(["claude", "openai"]);
    expect(reg.chain("auto").map((p) => p.id)).toEqual(["claude", "openai"]);
    expect(reg.chain("openai").map((p) => p.id)).toEqual(["openai", "claude"]);
    expect(reg.chain("gemini").map((p) => p.id)).toEqual(["claude", "openai"]);
  });
});
