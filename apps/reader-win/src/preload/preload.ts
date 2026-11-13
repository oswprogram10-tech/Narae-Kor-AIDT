// renderer에 노출하는 좁은 API(window.naraeSpeech). Node 기능은 주지 않고, 입력은 여기서 한 번, main에서 한 번 더 검사한다.
import { contextBridge, ipcRenderer } from "electron";

import type { BenchmarkOptions, InstallProgress, NaraeSpeechApi, TranscribeOptions } from "../lib/api";
import { checkAudio, checkBenchmarkSeconds, checkDtype, checkModelId, checkTranscribeOptions } from "../lib/validate";

function fail(msg: string): never {
  throw new Error(msg);
}

// 검사에 걸리면 동기 예외가 아니라 거부된 Promise로 알린다(async 함수).
const api: NaraeSpeechApi = {
  info: () => ipcRenderer.invoke("narae:info"),
  models: () => ipcRenderer.invoke("narae:models"),
  install: async (modelId, dtype) => {
    const m = checkModelId(modelId);
    if (!m.ok) fail(m.error);
    const d = checkDtype(m.model, dtype);
    if (!d.ok) fail(d.error);
    return ipcRenderer.invoke("narae:install", m.model.id, d.dtype);
  },
  remove: async (modelId) => {
    const m = checkModelId(modelId);
    if (!m.ok) fail(m.error);
    return ipcRenderer.invoke("narae:remove", m.model.id);
  },
  transcribe: async (audio16k: Float32Array, opts: TranscribeOptions) => {
    const o = checkTranscribeOptions(opts);
    if (!o.ok) fail(o.error);
    const a = checkAudio(audio16k);
    if (!a.ok) fail(a.error);
    return ipcRenderer.invoke("narae:transcribe", a.audio, { modelId: o.model.id, device: o.device, dtype: o.dtype });
  },
  benchmark: async (opts: BenchmarkOptions) => {
    const o = checkTranscribeOptions(opts);
    if (!o.ok) fail(o.error);
    const s = checkBenchmarkSeconds((opts as BenchmarkOptions).seconds);
    if (!s.ok) fail(s.error);
    return ipcRenderer.invoke("narae:benchmark", { modelId: o.model.id, device: o.device, dtype: o.dtype, seconds: s.seconds });
  },
  onInstallProgress: (cb) => {
    const handler = (_e: unknown, p: InstallProgress) => cb(p);
    ipcRenderer.on("narae:install-progress", handler);
    return () => ipcRenderer.removeListener("narae:install-progress", handler);
  },
};

contextBridge.exposeInMainWorld("naraeSpeech", api);
