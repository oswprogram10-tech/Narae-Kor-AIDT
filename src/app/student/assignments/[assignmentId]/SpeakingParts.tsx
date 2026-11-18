"use client";

// 토론 준비·면담 질문지 화면이 함께 쓰는 작은 조각: 단계 탭, 저장 상태, 안전 안내, 제출.
import { useState } from "react";
import type { SafetyNotice, SaveState } from "./useArtifactSave";

export function StepTabs({ steps, current, onGo }: { steps: readonly string[]; current: number; onGo: (n: number) => void }) {
  return (
    <nav aria-label="준비 순서" className="grid grid-cols-3 gap-1 sm:grid-cols-6">
      {steps.map((label, i) => (
        <button
          key={label}
          type="button"
          aria-current={current === i + 1 ? "step" : undefined}
          onClick={() => onGo(i + 1)}
          className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-semibold ${
            current === i + 1 ? "border-brand-600 bg-brand-600 text-white" : "border-black/10 bg-white text-stone-700 hover:bg-stone-50"
          }`}
        >
          {i + 1}. {label}
        </button>
      ))}
    </nav>
  );
}

export function SaveLine({ locked, lockedText, state, error }: { locked: boolean; lockedText: string; state: SaveState; error: string | null }) {
  return (
    <div className="flex min-h-6 items-center justify-between text-xs text-stone-500" aria-live="polite">
      <span data-testid="save-state">{locked ? lockedText : state === "saving" ? "저장 중…" : state === "saved" ? "저장했어요" : ""}</span>
      {error && <span role="alert" className="text-red-700">{error}</span>}
    </div>
  );
}

export function SafetyBox({ safety, onClose }: { safety: SafetyNotice | null; onClose: () => void }) {
  if (!safety) return null;
  return (
    <div role="alert" data-testid="safety-reply" className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-orange-950">
      <p>{safety.reply}</p>
      <button type="button" className="mt-2 min-h-11 text-sm underline" onClick={onClose}>알겠어요</button>
    </div>
  );
}

/** 제출: 먼저 저장을 끝내고 제출한다. 서버가 안전 점검에서 걸러 내면 안내만 보여 준다. */
export function useSubmit(submissionId: number, flush: () => Promise<void>, initiallySubmitted: boolean, doneText: string) {
  const [submitted, setSubmitted] = useState(initiallySubmitted);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit() {
    setBusy(true);
    setMsg(null);
    await flush();
    try {
      const res = await fetch(`/api/artifacts/${submissionId}/submit`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; submitted?: boolean; safety?: { reply: string } | null };
      if (!res.ok) setMsg({ ok: false, text: data.error ?? "제출하지 못했어요." });
      else if (data.safety) setMsg({ ok: false, text: data.safety.reply });
      else {
        setSubmitted(true);
        setMsg({ ok: true, text: doneText });
      }
    } catch {
      setMsg({ ok: false, text: "제출하지 못했어요. 인터넷을 확인해 주세요." });
    }
    setBusy(false);
  }
  return { submitted, busy, msg, submit };
}

/** 글 칸 옆에 붙는 경고(제출을 막지 않는 권유) */
export function Warn({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <ul className="mt-1 space-y-1" data-testid="field-warn">
      {messages.map((m) => (
        <li key={m} className="rounded-lg border border-sun-400 bg-sun-100 px-2 py-1 text-sm text-stone-800">
          💡 {m}
        </li>
      ))}
    </ul>
  );
}

/** 글에서 표시할 부분(과장 표현 등)을 강조해 보여 준다. */
export function Marked({ text, spans }: { text: string; spans: { start: number; end: number }[] }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  [...spans].sort((a, b) => a.start - b.start).forEach((s, i) => {
    if (s.start < at) return;
    if (s.start > at) parts.push(text.slice(at, s.start));
    parts.push(
      <mark key={i} className="rounded bg-sun-200 px-0.5 font-semibold text-stone-900 underline decoration-wavy decoration-orange-600">
        {text.slice(s.start, s.end)}
      </mark>,
    );
    at = s.end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <span data-testid="marked">{parts}</span>;
}
