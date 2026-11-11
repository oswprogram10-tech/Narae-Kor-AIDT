// 낭독 음성 인식 모델 목록(6단계 3차, docs/stage6-listening-speaking.md "음성 인식 모델 두 단계 제공").
// 언어 모델 목록(../local/catalog.ts)과 모양을 맞췄지만 섞지 않는다(음성 인식은 transformers.js의 automatic-speech-recognition 파이프라인).
//
// 모델 파일 주소는 이 목록에 넣지 않는다. 호스트가 정하는 base URL(예: 국내 학교 서버 "/models/asr/") + 모델 id 폴더 + files의 상대 경로다
// (speechModelFileUrl). 학습 데이터 약관상 모델의 국외 게시 가능 여부를 확인 중이라, 해외 저장소 주소를 하드코딩하지 않는다.
// 폴더 구조는 training/asr/export_asr.py 가 만드는 것과 같다(manifest.json에 파일 크기·sha256).
//
// sizeMB는 onnx-community 저장소의 같은 구조 파일 크기(2026-11-10 확인)에 토크나이저 파일을 더한 어림값이다.
// 3단계(turbo)는 아직 받아 보지 않아 파라미터 수(8.1억)로 어림했다. 내보낸 폴더의 manifest.json 값으로 고친다.

export type SpeechTier = 1 | 2 | 3;
export type SpeechDtype = "q8" | "fp16";

export interface SpeechModelInfo {
  id: string; // 모듈 안에서 쓰는 이름(= 폴더 이름)
  tier: SpeechTier;
  label: string; // 학생·교사 화면에 보일 짧은 이름(해요체)
  baseModel: string; // 학습의 출발 모델
  license: {
    name: string;
    commercial: boolean; // 상업적 사용 가능 여부
    notice: string; // 모델과 함께 보여 주거나 둬야 하는 문구
  };
  /** 제공하는 파일 형식. q8 = 8비트(CPU·브라우저), fp16 = GPU용 */
  dtypes: SpeechDtype[];
  /** 형식별 내려받는 크기(MB, 공통 파일 포함, 어림) */
  sizeMB: Partial<Record<SpeechDtype, number>>;
  /** 모델 폴더 안 상대 경로. 형식별 파일(_quantized = q8, _fp16 = fp16)과 공통 파일이 모두 들어 있다 */
  files: string[];
  /** 학습 데이터 출처 표시(이용 약관 1번). 모델을 보여 주는 화면·설명서에 함께 둔다 */
  attribution: string;
  /** 쓰는 기기. student-device = 학생 기기에서도, teacher-device = 학생이 교사 기기 앞에서 읽는 방식(음성은 그 기기 밖으로 나가지 않음) */
  audience: "student-device" | "teacher-device";
  /** 쓰려면 필요한 기기 조건(없으면 CPU만으로 돌아요) */
  requires?: { gpu: true; minVramGB: number };
  /** 연구·비교 실험용 선택지(자동 선택·기본값이 되지 않음) */
  optional?: boolean;
  note: string;
}

export const SPEECH_ATTRIBUTION = "본 모델은 한국지능정보사회진흥원(NIA) 「한국어 아동 음성 데이터」 사업 결과를 활용하여 만들었습니다.";

const MIT_NOTICE = "MIT 라이선스예요. 상업 사용이 가능하고, OpenAI의 저작권(Copyright (c) 2022 OpenAI)과 라이선스 문구를 모델과 함께 둬야 해요.";

const WHISPER_FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "added_tokens.json",
  "vocab.json",
  "merges.txt",
  "normalizer.json",
];

export const SPEECH_MODELS: readonly SpeechModelInfo[] = [
  {
    id: "narae-asr-lite",
    tier: 1,
    label: "가벼운 음성 인식",
    baseModel: "openai/whisper-base",
    license: { name: "MIT", commercial: true, notice: MIT_NOTICE },
    dtypes: ["q8", "fp16"], // fp16은 그래픽(DirectML·WebGPU)용 선택
    sizeMB: { q8: 82, fp16: 150 },
    files: [
      ...WHISPER_FILES,
      "onnx/encoder_model_quantized.onnx",
      "onnx/decoder_model_merged_quantized.onnx",
      "onnx/encoder_model_fp16.onnx",
      "onnx/decoder_model_merged_fp16.onnx",
    ],
    attribution: SPEECH_ATTRIBUTION,
    audience: "student-device",
    note: "1단계 기본. 학생 기기·브라우저에서 돌아요(7,400만 매개변수, 8비트).",
  },
  {
    id: "narae-asr-standard",
    tier: 2,
    label: "더 정확한 음성 인식",
    baseModel: "openai/whisper-small",
    license: { name: "MIT", commercial: true, notice: MIT_NOTICE },
    dtypes: ["q8", "fp16"], // fp16은 그래픽(DirectML·WebGPU)용 선택
    sizeMB: { q8: 254, fp16: 480 },
    files: [
      ...WHISPER_FILES,
      "onnx/encoder_model_quantized.onnx",
      "onnx/decoder_model_merged_quantized.onnx",
      "onnx/encoder_model_fp16.onnx",
      "onnx/decoder_model_merged_fp16.onnx",
    ],
    attribution: SPEECH_ATTRIBUTION,
    audience: "student-device",
    note: "2단계. 교사 노트북처럼 빠른 기기에서 더 정확하게(2.4억 매개변수, 8비트).",
  },
  {
    id: "narae-asr-pro",
    tier: 3,
    label: "가장 정확한 음성 인식(교사 기기)",
    baseModel: "openai/whisper-large-v3-turbo",
    license: { name: "MIT", commercial: true, notice: MIT_NOTICE },
    dtypes: ["q8", "fp16"],
    sizeMB: { q8: 900, fp16: 1700 }, // 어림(받아 보지 않음)
    files: [
      ...WHISPER_FILES,
      "onnx/encoder_model_quantized.onnx",
      "onnx/decoder_model_merged_quantized.onnx",
      "onnx/encoder_model_fp16.onnx",
      "onnx/decoder_model_merged_fp16.onnx",
    ],
    attribution: SPEECH_ATTRIBUTION,
    audience: "teacher-device",
    requires: { gpu: true, minVramGB: 4 },
    note: "3단계. GPU가 있는 교사 기기 전용(8.1억 매개변수): 학생이 교사 기기 앞에서 읽어요. 자동으로 고르지 않고 교사가 직접 켜요. 학습은 국내 GPU 클라우드에서만 해요.",
  },
  {
    id: "narae-asr-moonshine-ko",
    tier: 1,
    label: "가벼운 음성 인식(Moonshine, 연구용)",
    baseModel: "moonshine-ai/moonshine-base-ko",
    license: {
      name: "Moonshine Community License",
      commercial: false,
      notice: "비상업·연구 목적으로만 무료예요. 상업적으로 쓰려면 Moonshine AI의 별도 허가가 필요해요.",
    },
    dtypes: ["q8"],
    sizeMB: { q8: 67 },
    files: [
      "config.json",
      "generation_config.json",
      "preprocessor_config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "special_tokens_map.json",
      "onnx/encoder_model_quantized.onnx",
      "onnx/decoder_model_merged_quantized.onnx",
    ],
    attribution: SPEECH_ATTRIBUTION,
    audience: "student-device",
    optional: true,
    note: "비교 실험용 선택지(한국어 출발점이 좋아요). 상업 배포에는 쓰지 않아요.",
  },
];

/** 앱이 자동으로 고르는 기본 모델(1단계). */
export const DEFAULT_SPEECH_MODEL = "narae-asr-lite";

export function getSpeechModel(id: string | undefined | null): SpeechModelInfo | undefined {
  return SPEECH_MODELS.find((m) => m.id === id);
}

/** 단계의 기본 모델(optional 항목은 기본이 되지 않는다). */
export function defaultModelForTier(tier: SpeechTier): SpeechModelInfo | undefined {
  return SPEECH_MODELS.find((m) => m.tier === tier && !m.optional);
}

/** 한 형식으로 내려받을 파일(공통 파일 + 그 형식 파일). 다른 형식 파일은 뺀다. */
export function speechModelFiles(model: SpeechModelInfo, dtype: SpeechDtype): string[] {
  const other = dtype === "q8" ? "_fp16.onnx" : "_quantized.onnx";
  const mine = dtype === "q8" ? "_quantized.onnx" : "_fp16.onnx";
  if (!model.dtypes.includes(dtype)) return [];
  return model.files.filter((f) => !f.endsWith(other) && (!f.startsWith("onnx/") || f.endsWith(mine)));
}

/** 호스트가 정한 base URL로 파일 주소를 만든다. 예: ("/models/asr/", model, "config.json") → "/models/asr/narae-asr-lite/config.json" */
export function speechModelFileUrl(baseUrl: string, model: SpeechModelInfo, file: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}${model.id}/${file}`;
}

// ---------------------------------------------------------------- 기기에 맞는 단계 고르기

export interface SpeechProbe {
  /** CPU 코어(논리 스레드) 수 */
  cores?: number;
  memoryGB?: number;
  /** 호스트가 정해 둔 작은 계산 시험을 돌린 시간(ms). 작을수록 빠른 기기 */
  benchMs?: number;
  webgpu?: boolean;
  /** 설치형(안드로이드·윈도우 프로그램) 여부 */
  native?: boolean;
  /**
   * 이 기기·이 실행 방식에서 1단계 모델을 실제로 돌려 잰 RTF(처리 시간 ÷ 소리 길이). 있으면 benchMs보다 먼저 쓴다.
   * 30초 이상 소리로 잰 값이어야 믿을 만하다(짧은 소리는 불러오기 같은 고정 시간이 섞인다).
   */
  tier1Rtf?: number;
  /** 3단계용: GPU가 있는지, GPU 메모리(GB) */
  gpu?: boolean;
  vramGB?: number;
}

// 문턱값은 지금은 어림이다. 5625U 노트북(CPU 6코어)에서 `npx tsx scripts/asr-eval-onnx.mjs` 로 1·2단계의 1분 낭독 처리 시간을 재고
// 같은 기기의 benchMs 와 맞춰 본 뒤 고친다(2단계가 1분 낭독을 10초 안에 처리하는 기기를 "빠른 기기"로 삼을 계획).
export const SPEECH_BENCH_FAST_MS = 150; // 이 시간 이하면 2단계
export const SPEECH_BENCH_FAST_MS_WEBGPU = 300; // WebGPU가 있으면 조금 느슨하게
export const SPEECH_MIN_CORES_TIER2 = 4;
export const SPEECH_MIN_MEMORY_GB_TIER2 = 4;

// 실측(2026-11-11, Ryzen 5 5625U, q8, 37초 소리): 1단계 RTF 앱 0.048 / 브라우저 0.087, 2단계 RTF 앱 0.117 / 브라우저 0.281.
// 2단계는 1단계보다 앱에서 약 2.4배, 브라우저에서 약 3.2배 느렸다 → 넉넉하게 3.5배로 어림한다.
export const SPEECH_TIER2_OVER_TIER1 = 3.5;
// 2단계 RTF가 이 값 이하로 예상되면 2단계를 쓴다(1분 낭독을 30초 안에 처리 — 읽는 동안 앞부분부터 처리하면 기다림이 짧다).
export const SPEECH_TIER2_MAX_RTF = 0.5;

export interface TierChoice {
  tier: 1 | 2;
  reason: string; // 해요체
}

/** 기기 정보로 기본 단계(1 또는 2)를 고른다. 3단계는 자동으로 고르지 않는다(canUseTier3 참고). 정보가 없으면 안전하게 1단계. */
export function chooseSpeechTier(probe: SpeechProbe = {}): TierChoice {
  if (typeof probe.memoryGB === "number" && probe.memoryGB < SPEECH_MIN_MEMORY_GB_TIER2) {
    return { tier: 1, reason: "기기 메모리가 넉넉하지 않아서 가벼운 1단계를 써요." };
  }
  const r1 = probe.tier1Rtf;
  if (typeof r1 === "number" && Number.isFinite(r1) && r1 > 0) {
    return r1 * SPEECH_TIER2_OVER_TIER1 <= SPEECH_TIER2_MAX_RTF
      ? { tier: 2, reason: "이 기기에서 재 보니 더 정확한 2단계도 충분히 빨라요." }
      : { tier: 1, reason: "이 기기에서 재 보니 가벼운 1단계가 더 알맞아요." };
  }
  const bench = probe.benchMs;
  if (typeof bench !== "number" || !Number.isFinite(bench) || bench <= 0) {
    return { tier: 1, reason: "기기 속도를 아직 알 수 없어서 가벼운 1단계로 시작해요." };
  }
  if (typeof probe.memoryGB === "number" && probe.memoryGB < SPEECH_MIN_MEMORY_GB_TIER2) {
    return { tier: 1, reason: "기기 메모리가 넉넉하지 않아서 가벼운 1단계를 써요." };
  }
  if (typeof probe.cores === "number" && probe.cores < SPEECH_MIN_CORES_TIER2) {
    return { tier: 1, reason: "기기의 계산 장치가 많지 않아서 가벼운 1단계를 써요." };
  }
  const limit = probe.webgpu ? SPEECH_BENCH_FAST_MS_WEBGPU : SPEECH_BENCH_FAST_MS;
  if (bench <= limit) {
    return { tier: 2, reason: "이 기기는 계산이 빨라서 더 정확한 2단계를 쓸 수 있어요." };
  }
  return { tier: 1, reason: "이 기기에서는 가벼운 1단계가 더 알맞아요." };
}

export interface Tier3Availability {
  available: boolean;
  reason: string; // 해요체
}

/** 3단계(교사 기기 전용)를 '켤 수 있는지'. 교사가 직접 켜야만 쓰며, 조건(GPU와 GPU 메모리)이 맞을 때만 켤 수 있다고 알려 준다. */
export function canUseTier3(probe: SpeechProbe = {}): Tier3Availability {
  const need = getSpeechModel("narae-asr-pro")?.requires;
  const minVram = need?.minVramGB ?? 4;
  if (!probe.gpu) return { available: false, reason: "GPU가 있는 기기에서만 켤 수 있어요." };
  if (typeof probe.vramGB !== "number" || !Number.isFinite(probe.vramGB)) {
    return { available: false, reason: "GPU 메모리를 알 수 없어서 켤 수 없어요." };
  }
  if (probe.vramGB < minVram) {
    return { available: false, reason: `GPU 메모리가 ${minVram}GB 이상이어야 켤 수 있어요.` };
  }
  return { available: true, reason: "이 기기에서 가장 정확한 3단계를 켤 수 있어요. 교사 기기 앞에서 읽을 때만 써요." };
}
