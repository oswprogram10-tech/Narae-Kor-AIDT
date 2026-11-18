// 앱 API 입력 검사(순수 함수). 신뢰할 수 없는 화면에서 오는 값은 main에서 반드시 한 번 더 검사한다.
import { getSpeechModel, type SpeechDtype, type SpeechModelInfo } from "../../../../src/core/speech";
import type { DeviceChoice } from "./api";

export const SAMPLE_RATE = 16000;
/** 한 번에 인식할 수 있는 소리 길이 상한(초) */
export const MAX_AUDIO_SECONDS = 600;
export const MAX_BENCHMARK_SECONDS = 120;
const DEVICES: readonly string[] = ["auto", "cpu", "dml"];

export type Checked<T> = ({ ok: true } & T) | { ok: false; error: string };

export function isFloat32Array(x: unknown): x is Float32Array {
  return ArrayBuffer.isView(x) && Object.prototype.toString.call(x) === "[object Float32Array]";
}

export function checkModelId(id: unknown): Checked<{ model: SpeechModelInfo }> {
  if (typeof id !== "string" || !id) return { ok: false, error: "모델 이름이 없어요." };
  const model = getSpeechModel(id);
  if (!model) return { ok: false, error: "목록에 없는 모델이에요." };
  return { ok: true, model };
}

export function checkDtype(model: SpeechModelInfo, dtype: unknown): Checked<{ dtype: SpeechDtype }> {
  const d = dtype === undefined || dtype === null ? model.dtypes[0] : dtype;
  if (d !== "q8" && d !== "fp16") return { ok: false, error: "모델 형식(dtype)이 맞지 않아요." };
  if (!model.dtypes.includes(d)) return { ok: false, error: `이 모델은 ${d} 형식이 없어요.` };
  return { ok: true, dtype: d };
}

export interface CheckedTranscribe {
  model: SpeechModelInfo;
  device: DeviceChoice;
  /** 값을 주지 않았으면 undefined(설치된 형식 중에서 고른다) */
  dtype: SpeechDtype | undefined;
}

/** 옵션 검사(소리 제외) */
export function checkTranscribeOptions(opts: unknown): Checked<CheckedTranscribe> {
  if (!opts || typeof opts !== "object") return { ok: false, error: "설정이 없어요." };
  const o = opts as Record<string, unknown>;
  const m = checkModelId(o.modelId);
  if (!m.ok) return m;
  const device = o.device === undefined ? "auto" : o.device;
  if (typeof device !== "string" || !DEVICES.includes(device)) return { ok: false, error: "장치는 auto, cpu, dml 중 하나여야 해요." };
  let dtype: SpeechDtype | undefined;
  if (o.dtype !== undefined && o.dtype !== null) {
    const d = checkDtype(m.model, o.dtype);
    if (!d.ok) return d;
    dtype = d.dtype;
  }
  return { ok: true, model: m.model, device: device as DeviceChoice, dtype };
}

/** 소리 검사: 16kHz mono Float32Array, 비어 있지 않음, 길이 상한, 유한한 값. */
export function checkAudio(audio: unknown): Checked<{ audio: Float32Array; seconds: number }> {
  if (!isFloat32Array(audio)) return { ok: false, error: "소리 형식이 맞지 않아요(16kHz Float32Array)." };
  if (audio.length < SAMPLE_RATE / 10) return { ok: false, error: "소리가 너무 짧아요." };
  if (audio.length > MAX_AUDIO_SECONDS * SAMPLE_RATE) return { ok: false, error: `소리는 ${MAX_AUDIO_SECONDS / 60}분까지만 인식해요.` };
  for (let i = 0; i < audio.length; i++) {
    const v = audio[i];
    if (!Number.isFinite(v) || v > 100 || v < -100) return { ok: false, error: "소리 값이 올바르지 않아요." };
  }
  return { ok: true, audio, seconds: audio.length / SAMPLE_RATE };
}

export function checkBenchmarkSeconds(v: unknown): Checked<{ seconds: number }> {
  if (v === undefined || v === null) return { ok: true, seconds: 60 };
  if (typeof v !== "number" || !Number.isFinite(v) || v < 5 || v > MAX_BENCHMARK_SECONDS) return { ok: false, error: `시험 소리 길이는 5~${MAX_BENCHMARK_SECONDS}초여야 해요.` };
  return { ok: true, seconds: v };
}
