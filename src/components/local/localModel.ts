"use client";

// 학생 기기(브라우저·WebView·Electron)에서 내장 모델을 한 번만 불러와 여러 화면이 함께 쓰게 하는 저장소.
import { useSyncExternalStore } from "react";
import { getLocalModel } from "@/core/local/catalog";
import { TransformersLocalRuntime, type LoadProgress, type PipelineFactory } from "@/core/local/runtime";
import { createLocalProvider, ProviderRegistry } from "@/core/providers";

export interface LocalModelClientConfig {
  id: string;
  baseUrl: string;
  allowRemote: boolean;
}

export type LocalStatus = "idle" | "loading" | "ready" | "error";

interface State {
  status: LocalStatus;
  progress: number; // 0~100 (전체 내려받기 기준, 알 수 없으면 0)
  file?: string;
  device?: string | null;
  error?: string | null;
  loadMs?: number | null;
}

// 호스트(예: 안드로이드 앱)가 자체 실행기를 주입하거나, 테스트에서 가짜 실행기를 넣는 연결 지점.
// 기기에서 만든 답은 서버가 다시 검사하므로 주입된 실행기도 정책을 벗어날 수 없다.
declare global {
  var __NARAE_LOCAL_PIPELINE_FACTORY__: PipelineFactory | undefined;
}

let runtime: TransformersLocalRuntime | null = null;
let runtimeKey = "";
let state: State = { status: "idle", progress: 0 };
const listeners = new Set<() => void>();
const REMEMBER_KEY = "narae-local-model-ready";

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function getRuntime(cfg: LocalModelClientConfig): TransformersLocalRuntime | null {
  const model = getLocalModel(cfg.id);
  if (!model) return null;
  const key = `${cfg.id}|${cfg.baseUrl}|${cfg.allowRemote}`;
  if (!runtime || runtimeKey !== key) {
    runtimeKey = key;
    const fileProgress = new Map<string, number>();
    runtime = new TransformersLocalRuntime({
      model,
      modelBaseUrl: cfg.baseUrl,
      allowRemote: cfg.allowRemote,
      pipelineFactory: globalThis.__NARAE_LOCAL_PIPELINE_FACTORY__,
      onProgress: (p: LoadProgress) => {
        if (p.status === "progress_total" && typeof p.progress === "number") {
          set({ progress: Math.round(p.progress) });
        } else if (p.status === "progress" && p.file && typeof p.progress === "number") {
          fileProgress.set(p.file, p.progress);
          const vals = [...fileProgress.values()];
          set({ progress: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), file: p.file });
        }
      },
    });
  }
  return runtime;
}

export async function loadLocalModel(cfg: LocalModelClientConfig): Promise<void> {
  const rt = getRuntime(cfg);
  if (!rt) return set({ status: "error", error: "알 수 없는 내장 모델이에요." });
  if (rt.isReady()) return set({ status: "ready", progress: 100, device: rt.device, loadMs: rt.loadMs });
  set({ status: "loading", progress: 0, error: null });
  try {
    await rt.load();
    set({ status: "ready", progress: 100, device: rt.device, loadMs: rt.loadMs });
    try {
      localStorage.setItem(REMEMBER_KEY, cfg.id);
    } catch {
      /* 저장소를 못 써도 동작에는 문제없음 */
    }
  } catch (err) {
    set({ status: "error", error: friendlyError(String((err as Error)?.message ?? err)) });
  }
}

export function wasLoadedBefore(cfg: LocalModelClientConfig): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === cfg.id;
  } catch {
    return false;
  }
}

export function localRegistry(cfg: LocalModelClientConfig): ProviderRegistry | null {
  const rt = getRuntime(cfg);
  if (!rt?.isReady()) return null;
  return ProviderRegistry.fromProviders([createLocalProvider(rt)], ["local"]);
}

export function localModelName(): string {
  return runtime?.modelId ?? "local";
}

export function useLocalModelState(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

// 학생에게 보일 오류 문구(자세한 원인은 개발자 도구 콘솔에 남김)
function friendlyError(raw: string): string {
  console.warn("[narae] 내장 모델 불러오기 실패:", raw);
  if (/local_files_only|allowRemoteModels|404|not found/i.test(raw)) return "모델 파일을 찾지 못했어요. 선생님께 알려 주세요.";
  if (/memory|OOM|allocation/i.test(raw)) return "이 기기의 메모리가 부족해요.";
  if (/network|fetch|Failed to fetch/i.test(raw)) return "인터넷 연결을 확인해 주세요.";
  return "이 기기에서는 내장 AI를 준비하지 못했어요.";
}
