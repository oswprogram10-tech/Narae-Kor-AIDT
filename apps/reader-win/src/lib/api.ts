// window.naraeSpeech(preload가 노출하는 좁은 API)의 모양. main·preload·renderer가 함께 쓴다.
import type { SpeechDtype } from "../../../../src/core/speech";

export type DeviceChoice = "auto" | "cpu" | "dml";
export type UsedDevice = "cpu" | "dml";

export interface DeviceInfo {
  appVersion: string;
  platform: string;
  arch: string;
  cpuModel: string;
  logicalCores: number;
  physicalCoresGuess: number;
  ramGB: number;
  gpu: string[];
  /** 앱 엔진이 시험해 볼 수 있는 장치 */
  devices: UsedDevice[];
  serverUrl: string;
  modelBaseUrl: string;
  trialMode: boolean;
  settingsPath: string;
  settingsWarnings: string[];
  cpuThreads: number;
}

export interface ModelStatus {
  id: string;
  label: string;
  tier: number;
  dtypes: SpeechDtype[];
  sizeMB: Partial<Record<SpeechDtype, number>>;
  installed: SpeechDtype[];
  /** 설치할 때 sha256을 확인하지 않았으면 true(시험 모드) */
  unverified: boolean;
  license: string;
  optional: boolean;
}

export interface InstallProgress {
  modelId: string;
  dtype: SpeechDtype;
  file: string;
  fileIndex: number;
  fileCount: number;
  receivedBytes: number;
  totalBytes: number | null;
}

export interface TranscribeOptions {
  modelId: string;
  device?: DeviceChoice;
  dtype?: SpeechDtype;
}

export interface TranscribeResult {
  text: string;
  /** 인식에 걸린 시간(초, 불러오기 제외) */
  seconds: number;
  audioSeconds: number;
  rtf: number;
  /** 실제로 쓴 장치 */
  device: UsedDevice;
  dtype: SpeechDtype;
  /** 모델을 불러오는 데 걸린 시간(초). 이미 불러 둔 것이면 0 */
  loadSeconds: number;
  threads: number;
  /** auto로 요청했는데 다른 장치로 바뀌었으면 이유(해요체) */
  note?: string;
}

export interface BenchmarkOptions extends TranscribeOptions {
  /** 시험에 쓸 소리 길이(초). 기본 60 */
  seconds?: number;
}

export interface NaraeSpeechApi {
  info(): Promise<DeviceInfo>;
  models(): Promise<ModelStatus[]>;
  install(modelId: string, dtype?: SpeechDtype): Promise<ModelStatus[]>;
  remove(modelId: string): Promise<ModelStatus[]>;
  transcribe(audio16k: Float32Array, opts: TranscribeOptions): Promise<TranscribeResult>;
  benchmark(opts: BenchmarkOptions): Promise<TranscribeResult>;
  onInstallProgress(cb: (p: InstallProgress) => void): () => void;
}
