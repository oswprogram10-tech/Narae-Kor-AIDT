"use client";

import { useEffect } from "react";
import { getLocalModel } from "@/core/local/catalog";
import { loadLocalModel, useLocalModelState, wasLoadedBefore, type LocalModelClientConfig } from "./localModel";

// 학생 화면의 '내장 AI 준비' 카드. 처음 한 번 내려받으면 기기에 저장되어 다음부터는 빠르게 준비된다.
export function LocalModelPanel({ config }: { config: LocalModelClientConfig }) {
  const s = useLocalModelState();
  const model = getLocalModel(config.id);

  useEffect(() => {
    // 전에 준비한 적이 있으면(기기 캐시에 있음) 자동으로 불러온다.
    if (s.status === "idle" && wasLoadedBefore(config)) void loadLocalModel(config);
  }, [config, s.status]);

  if (!model) return null;
  const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;
  const size = hasWebGPU && model.webgpu ? model.webgpu.sizeMB : model.wasm.sizeMB;

  return (
    <div className="rounded-xl border border-black/10 bg-stone-50 p-3 text-sm" data-testid="local-model-panel">
      {s.status === "ready" ? (
        <p className="text-brand-700">
          💻 내장 AI 준비됨 <span className="text-xs text-stone-500">({s.device === "webgpu" ? "그래픽 가속" : "일반 모드"})</span>
          <span className="block text-xs text-stone-500">이 기기 안에서 답해요. 글이 밖으로 나가지 않아요.</span>
        </p>
      ) : s.status === "loading" ? (
        <div>
          <p>내장 AI 준비 중… {s.progress}%</p>
          <div className="mt-2 h-2 overflow-hidden rounded bg-stone-200">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${s.progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-stone-500">처음 한 번만 받아요. 와이파이에서 해 주세요.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p>
            💻 이 기기에 내장 AI를 준비할 수 있어요 <span className="text-xs text-stone-500">(약 {size}MB, 처음 한 번)</span>
          </p>
          {s.status === "error" && <p className="text-xs text-red-700">준비하지 못했어요: {s.error}</p>}
          <button type="button" className="btn-ghost w-full text-sm" onClick={() => void loadLocalModel(config)}>
            내장 AI 준비하기
          </button>
        </div>
      )}
    </div>
  );
}
