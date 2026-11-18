// 장치 고르기·스레드 수(순수 함수).
import type { DeviceChoice, UsedDevice } from "./api";

/**
 * 장치 시험 순서. auto는 형식에 따라 고른다.
 * - q8(8비트): CPU만. 5625U 실측(2026-11-11)에서 DirectML q8이 CPU보다 느렸다(그래픽은 8비트 계산 이득이 없음).
 * - fp16: 윈도우에서는 DirectML 먼저, 안 되면 CPU.
 */
export function deviceOrder(device: DeviceChoice, platform: string, dtype: string = "q8"): UsedDevice[] {
  if (device === "cpu") return ["cpu"];
  if (device === "dml") return ["dml"];
  if (dtype !== "fp16") return ["cpu"];
  return platform === "win32" ? ["dml", "cpu"] : ["cpu"];
}

/** 앱이 시험해 볼 수 있는 장치 목록(화면 표시용) */
export function availableDevices(platform: string): UsedDevice[] {
  return platform === "win32" ? ["cpu", "dml"] : ["cpu"];
}

/** 물리 코어 어림: 논리 스레드의 절반(SMT 가정). 사용자가 정한 값이 있으면 그것. */
export function cpuThreads(logical: number, override: number | null | undefined): number {
  if (typeof override === "number" && Number.isInteger(override) && override >= 1) return Math.min(override, 64);
  return Math.max(1, Math.floor(Math.max(1, logical) / 2));
}

/** 1분 낭독 환산 시간(초) = RTF × 60 */
export function perMinuteSeconds(rtf: number): number {
  return Math.round(rtf * 60 * 10) / 10;
}
