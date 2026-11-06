"use client";

import { useState } from "react";
import { getGenre } from "@/core/data/genres";
import { runCoachEngine } from "@/core/coach/engine";
import type { CoachContext } from "@/core/coach/types";
import { loadLocalModel, localRegistry, useLocalModelState, type LocalModelClientConfig } from "@/components/local/localModel";

const genre = getGenre("opinion")!;
const BASE: CoachContext = {
  grade: 4,
  genreName: genre.name,
  coachFocus: genre.coachFocus,
  standardStatements: [],
  prompt: "우리 반에 필요하다고 생각하는 것에 대해 의견과 이유가 드러나게 글을 써 봅시다.",
  organizer: genre.organizer,
  rubric: genre.rubric,
  stage: "draft",
  brainstorm: "책장, 쉬는 시간",
  organizerValues: { subject: "학급 문고", opinion: "책장이 하나 더 필요하다" },
  draft: "우리 반에는 책장이 하나 더 필요하다. 왜냐하면 책이 바닥에 쌓여 있기 때문이다.",
  studentMessage: "",
  history: [],
  helpCountThisStage: 0,
};

const SAMPLES: { label: string; patch: Partial<CoachContext> }[] = [
  { label: "생각 열기 · 도움 요청", patch: { stage: "brainstorm", draft: "" } },
  { label: "초고 · 막힘", patch: { stage: "draft", studentMessage: "다음에 뭘 써야 할지 모르겠어요" } },
  { label: "초고 · 대필 요청", patch: { stage: "draft", studentMessage: "그냥 써줘" } },
  { label: "고쳐 쓰기 · 문장 렌즈", patch: { stage: "revise", lens: "sentence" } },
];

interface Row {
  label: string;
  ms: number;
  provider: string;
  blocked: boolean;
  reply: string;
}

export function LocalModelLab({ models, defaults }: { models: { id: string; label: string }[]; defaults: LocalModelClientConfig }) {
  const [cfg, setCfg] = useState<LocalModelClientConfig>(defaults);
  const s = useLocalModelState();
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;

  async function run() {
    const reg = localRegistry(cfg);
    if (!reg) return;
    setRunning(true);
    setRows([]);
    for (const sample of SAMPLES) {
      const t0 = performance.now();
      const r = await runCoachEngine({ ...BASE, ...sample.patch }, reg);
      const row = {
        label: sample.label,
        ms: Math.round(performance.now() - t0),
        provider: r.provider,
        blocked: r.blocked,
        reply: [r.output.reply, ...r.output.questions].join(" / "),
      };
      setRows((x) => [...x, row]);
    }
    setRunning(false);
  }

  const ok = rows.filter((r) => r.provider === "local");
  const avg = ok.length ? Math.round(ok.reduce((a, r) => a + r.ms, 0) / ok.length) : null;

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="model">모델</label>
          <select id="model" className="input" value={cfg.id} onChange={(e) => setCfg({ ...cfg, id: e.target.value })} disabled={s.status === "loading"}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="base">모델 파일 위치</label>
          <input id="base" className="input" value={cfg.baseUrl} onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} />
          <label className="mt-1 flex items-center gap-2 text-xs text-stone-600">
            <input type="checkbox" checked={cfg.allowRemote} onChange={(e) => setCfg({ ...cfg, allowRemote: e.target.checked })} />
            파일이 없으면 Hugging Face에서 받기(실험용)
          </label>
        </div>
        <div className="text-sm text-stone-600 sm:col-span-2">
          이 기기: {hasWebGPU ? "WebGPU 지원(그래픽 가속 가능)" : "WebGPU 없음 → 일반(WASM) 모드, 느릴 수 있음"} · CPU 코어{" "}
          {typeof navigator !== "undefined" ? navigator.hardwareConcurrency : "?"}개
          {typeof navigator !== "undefined" && "deviceMemory" in navigator ? ` · 메모리 약 ${(navigator as { deviceMemory?: number }).deviceMemory}GB` : ""}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button className="btn-primary" onClick={() => void loadLocalModel(cfg)} disabled={s.status === "loading" || s.status === "ready"}>
            {s.status === "ready" ? "준비됨" : s.status === "loading" ? `불러오는 중 ${s.progress}%` : "1. 모델 불러오기"}
          </button>
          <button className="btn-ghost" onClick={() => void run()} disabled={s.status !== "ready" || running}>
            {running ? "측정 중…" : "2. 코치 요청 4건 측정"}
          </button>
          {s.status === "error" && <span className="text-sm text-red-700">오류: {s.error}</span>}
        </div>
      </div>

      {(s.status === "ready" || rows.length > 0) && (
        <div className="card space-y-3" data-testid="lab-results">
          <p className="text-sm">
            실행 방식: <b>{s.device === "webgpu" ? "WebGPU" : s.device === "wasm" ? "WASM(일반)" : s.device}</b> · 불러오기{" "}
            <b>{s.loadMs !== null && s.loadMs !== undefined ? `${(s.loadMs / 1000).toFixed(1)}초` : "-"}</b>
            {avg !== null && (
              <>
                {" "}
                · 평균 응답 <b>{(avg / 1000).toFixed(1)}초</b> · 형식 성공 <b>{ok.length}/{rows.length}</b>
              </>
            )}
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-stone-500">
              <tr>
                <th className="py-1">요청</th>
                <th>시간</th>
                <th>결과</th>
                <th>코치 답</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="py-2 pr-2">{r.label}</td>
                  <td className="pr-2">{(r.ms / 1000).toFixed(1)}초</td>
                  <td className="pr-2">
                    {r.provider === "local" ? (r.blocked ? "가드레일이 교체" : "정상") : r.provider === "rule" ? "규칙 응답" : "형식 실패→모의 코치"}
                  </td>
                  <td className="text-stone-700">{r.reply}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-stone-500">결과를 캡처해 기기 이름과 함께 기록해 두면 기기별 비교 자료가 됩니다.</p>
        </div>
      )}
    </div>
  );
}
