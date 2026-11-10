import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPEECH_MODEL,
  SPEECH_ATTRIBUTION,
  SPEECH_BENCH_FAST_MS,
  SPEECH_BENCH_FAST_MS_WEBGPU,
  SPEECH_MODELS,
  canUseTier3,
  chooseSpeechTier,
  defaultModelForTier,
  getSpeechModel,
  speechModelFileUrl,
  speechModelFiles,
} from "@/core/speech";

describe("음성 인식 모델 목록", () => {
  it("id가 겹치지 않고 폴더 이름으로 쓸 수 있다", () => {
    const ids = SPEECH_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("단계마다 기본 모델이 하나이고, optional 항목은 기본이 아니다", () => {
    for (const tier of [1, 2, 3] as const) {
      const defaults = SPEECH_MODELS.filter((m) => m.tier === tier && !m.optional);
      expect(defaults.length, `tier ${tier}`).toBe(1);
      expect(defaultModelForTier(tier)).toBe(defaults[0]);
    }
    expect(getSpeechModel(DEFAULT_SPEECH_MODEL)?.tier).toBe(1);
    expect(getSpeechModel(DEFAULT_SPEECH_MODEL)?.optional).toBeFalsy();
  });

  it("출발 모델과 상업 사용 표시: Whisper는 MIT(가능), Moonshine은 비상업 선택지", () => {
    expect(getSpeechModel("narae-asr-lite")?.baseModel).toBe("openai/whisper-base");
    expect(getSpeechModel("narae-asr-standard")?.baseModel).toBe("openai/whisper-small");
    expect(getSpeechModel("narae-asr-pro")?.baseModel).toBe("openai/whisper-large-v3-turbo");
    for (const id of ["narae-asr-lite", "narae-asr-standard", "narae-asr-pro"]) {
      const m = getSpeechModel(id)!;
      expect(m.license.name).toBe("MIT");
      expect(m.license.commercial).toBe(true);
      expect(m.license.notice).toContain("OpenAI");
    }
    const moon = getSpeechModel("narae-asr-moonshine-ko")!;
    expect(moon.optional).toBe(true);
    expect(moon.license.commercial).toBe(false);
    expect(moon.license.notice).toContain("비상업");
  });

  it("모든 모델에 NIA 출처 표시가 있다", () => {
    expect(SPEECH_ATTRIBUTION).toContain("한국지능정보사회진흥원(NIA)");
    expect(SPEECH_ATTRIBUTION).toContain("한국어 아동 음성 데이터");
    for (const m of SPEECH_MODELS) expect(m.attribution).toBe(SPEECH_ATTRIBUTION);
  });

  it("파일 목록: 상대 경로, 형식별 onnx 파일, 크기가 형식마다 있다", () => {
    for (const m of SPEECH_MODELS) {
      expect(m.dtypes.length).toBeGreaterThan(0);
      expect(new Set(m.files).size).toBe(m.files.length);
      for (const f of m.files) {
        expect(f.startsWith("/")).toBe(false);
        expect(f).not.toMatch(/^https?:/);
      }
      for (const d of m.dtypes) {
        expect(m.sizeMB[d], `${m.id} ${d}`).toBeGreaterThan(0);
        const files = speechModelFiles(m, d);
        const suffix = d === "q8" ? "_quantized.onnx" : "_fp16.onnx";
        expect(files).toContain(`onnx/encoder_model${suffix}`);
        expect(files).toContain(`onnx/decoder_model_merged${suffix}`);
        expect(files).toContain("config.json");
        expect(files.filter((f) => f.startsWith("onnx/")).every((f) => f.endsWith(suffix))).toBe(true);
      }
    }
    // 지원하지 않는 형식은 빈 목록
    expect(speechModelFiles(getSpeechModel("narae-asr-lite")!, "fp16")).toEqual([]);
  });

  it("3단계는 교사 기기 전용이고 GPU가 필요하며 q8과 fp16을 둘 다 둔다", () => {
    const pro = getSpeechModel("narae-asr-pro")!;
    expect(pro.audience).toBe("teacher-device");
    expect(pro.requires).toEqual({ gpu: true, minVramGB: 4 });
    expect(pro.dtypes).toEqual(["q8", "fp16"]);
    for (const m of SPEECH_MODELS.filter((x) => x.tier < 3)) {
      expect(m.audience).toBe("student-device");
      expect(m.requires).toBeUndefined();
    }
  });

  it("파일 주소는 호스트가 정한 base URL에 상대 경로를 붙인 것이고 해외 주소가 들어 있지 않다", () => {
    const m = getSpeechModel("narae-asr-lite")!;
    expect(speechModelFileUrl("/models/asr/", m, "config.json")).toBe("/models/asr/narae-asr-lite/config.json");
    expect(speechModelFileUrl("https://school.example.kr/asr", m, "onnx/encoder_model_quantized.onnx")).toBe(
      "https://school.example.kr/asr/narae-asr-lite/onnx/encoder_model_quantized.onnx",
    );
    expect(JSON.stringify(SPEECH_MODELS)).not.toMatch(/huggingface\.co|https?:\/\//);
  });
});

describe("chooseSpeechTier", () => {
  it("정보가 없으면 1단계(안전)", () => {
    for (const probe of [undefined, {}, { cores: 12, memoryGB: 20 }, { benchMs: Number.NaN }, { benchMs: 0 }, { benchMs: -5 }]) {
      const c = chooseSpeechTier(probe);
      expect(c.tier).toBe(1);
      expect(c.reason).toMatch(/요\.$/);
    }
  });

  it("benchMs 문턱값 경계", () => {
    expect(chooseSpeechTier({ benchMs: SPEECH_BENCH_FAST_MS }).tier).toBe(2);
    expect(chooseSpeechTier({ benchMs: SPEECH_BENCH_FAST_MS + 1 }).tier).toBe(1);
    expect(chooseSpeechTier({ benchMs: 50 }).tier).toBe(2);
  });

  it("WebGPU가 있으면 문턱값이 느슨하다", () => {
    expect(chooseSpeechTier({ benchMs: SPEECH_BENCH_FAST_MS + 1, webgpu: true }).tier).toBe(2);
    expect(chooseSpeechTier({ benchMs: SPEECH_BENCH_FAST_MS_WEBGPU, webgpu: true }).tier).toBe(2);
    expect(chooseSpeechTier({ benchMs: SPEECH_BENCH_FAST_MS_WEBGPU + 1, webgpu: true }).tier).toBe(1);
  });

  it("빨라도 메모리·코어가 모자라면 1단계", () => {
    expect(chooseSpeechTier({ benchMs: 50, memoryGB: 3 }).tier).toBe(1);
    expect(chooseSpeechTier({ benchMs: 50, memoryGB: 4 }).tier).toBe(2);
    expect(chooseSpeechTier({ benchMs: 50, cores: 2 }).tier).toBe(1);
    expect(chooseSpeechTier({ benchMs: 50, cores: 4 }).tier).toBe(2);
  });

  it("3단계는 자동으로 고르지 않는다(GPU가 아주 좋아도 1 또는 2)", () => {
    const c = chooseSpeechTier({ benchMs: 1, gpu: true, vramGB: 24, webgpu: true, cores: 16, memoryGB: 64, native: true });
    expect([1, 2]).toContain(c.tier);
    expect(c.tier).toBe(2);
  });
});

describe("canUseTier3", () => {
  it("GPU와 GPU 메모리 조건이 맞을 때만 켤 수 있다", () => {
    expect(canUseTier3().available).toBe(false);
    expect(canUseTier3({ gpu: false, vramGB: 24 }).available).toBe(false);
    expect(canUseTier3({ gpu: true }).available).toBe(false); // 메모리를 모름
    expect(canUseTier3({ gpu: true, vramGB: 3.9 }).available).toBe(false);
    expect(canUseTier3({ gpu: true, vramGB: 4 }).available).toBe(true);
    expect(canUseTier3({ gpu: true, vramGB: 24 }).available).toBe(true);
  });

  it("까닭이 해요체로 나온다", () => {
    expect(canUseTier3({ gpu: true, vramGB: 2 }).reason).toContain("4GB");
    expect(canUseTier3({ gpu: true, vramGB: 8 }).reason).toMatch(/요\.$/);
  });
});
