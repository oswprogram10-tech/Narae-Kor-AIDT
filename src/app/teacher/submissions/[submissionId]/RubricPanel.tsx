"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { saveRubricFinal, type FormState } from "@/app/actions/teacher";
import { FormMessage } from "@/components/FormMessage";
import type { RubricCriterion } from "@/data/genres";

interface Score {
  criterion: string;
  ai: number | null;
  evidence: string | null;
  final: number | null;
}

const LEVEL_NAMES = ["노력 필요", "보통", "잘함"];

export function RubricPanel({ submissionId, rubric, scores }: { submissionId: number; rubric: RubricCriterion[]; scores: Score[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveRubricFinal, {});
  const [aiState, setAiState] = useState<{ loading?: boolean; error?: string }>({});
  const router = useRouter();

  async function askAi() {
    setAiState({ loading: true });
    const res = await fetch(`/api/teacher/submissions/${submissionId}/rubric-ai`, { method: "POST" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setAiState({ error: data.error ?? "AI 제안을 받지 못했어요." });
      return;
    }
    setAiState({});
    router.refresh();
  }

  return (
    <form action={action} className="card space-y-4">
      <input type="hidden" name="submissionId" value={submissionId} />
      <div className="flex items-center justify-between">
        <h2 className="font-bold">평가 (3단계)</h2>
        <button type="button" onClick={askAi} className="btn-ghost px-3 py-1.5 text-sm" disabled={aiState.loading}>
          {aiState.loading ? "AI 제안 받는 중…" : "AI 제안 받기"}
        </button>
      </div>
      {aiState.error && <p className="text-sm text-orange-700">{aiState.error}</p>}
      {rubric.map((c) => {
        const s = scores.find((x) => x.criterion === c.key);
        const current = s?.final ?? null;
        return (
          <fieldset key={c.key} className="space-y-1">
            <legend className="text-sm font-semibold">{c.label}</legend>
            <div className="grid grid-cols-3 gap-1">
              {[1, 2, 3].map((lv) => (
                <label
                  key={lv}
                  title={c.levels[lv - 1]}
                  className="flex cursor-pointer flex-col items-center rounded-lg border border-black/10 px-2 py-1.5 text-xs has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
                >
                  <input type="radio" name={`score_${c.key}`} value={lv} defaultChecked={current === lv} className="sr-only" />
                  <span className="font-semibold">{LEVEL_NAMES[lv - 1]}</span>
                  {s?.ai === lv && <span className="text-[10px] text-brand-600">AI 제안</span>}
                </label>
              ))}
            </div>
            {s?.evidence && <p className="text-xs text-stone-500">AI 근거: {s.evidence}</p>}
          </fieldset>
        );
      })}
      <FormMessage state={state} />
      <button className="btn-primary w-full text-sm" disabled={pending}>선생님 평가 저장</button>
      <p className="text-xs text-stone-500">AI는 제안만 해요. 저장되는 점수는 선생님이 고른 점수입니다.</p>
    </form>
  );
}
