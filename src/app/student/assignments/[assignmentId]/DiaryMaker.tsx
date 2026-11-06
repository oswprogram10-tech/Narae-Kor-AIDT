"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CATEGORIES,
  DAYS,
  LIMITS,
  MAX_MINUTES,
  MOODS,
  emptyEntry,
  isLogged,
  submitProblems,
  summarizeDiary,
  type DiaryArtifact,
  type DiaryEntry,
  type DiaryReflection,
  type CategoryId,
} from "@/core/diary";
import { BarChart } from "@/components/BarChart";
import { useArtifactSave } from "./useArtifactSave";

const STEPS = [
  { no: 1 as const, label: "기록" },
  { no: 2 as const, label: "성찰" },
  { no: 3 as const, label: "그래프·제출" },
];
const STEP_MINUTES = 5;

export function DiaryMaker({
  submissionId,
  title,
  prompt,
  isOpen,
  initial,
  status,
}: {
  submissionId: number;
  title: string;
  prompt: string;
  isOpen: boolean;
  initial: DiaryArtifact;
  status: string;
}) {
  const [submitted, setSubmitted] = useState(status === "submitted");
  const locked = !isOpen || submitted;
  const { art, change, flush, state, error, safety, clearSafety } = useArtifactSave<DiaryArtifact>(submissionId, initial, locked);
  const [day, setDay] = useState(1);
  const [localStep, setLocalStep] = useState<1 | 2 | 3 | null>(null);
  const step = locked ? (localStep ?? art.step) : art.step;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const entry = art.entries.find((e) => e.day === day) ?? emptyEntry(day);
  const summary = useMemo(() => summarizeDiary(art), [art]);
  const problems = useMemo(() => submitProblems(art), [art]);

  const setEntry = (patch: Partial<DiaryEntry>) => {
    const next = { ...entry, ...patch };
    const others = art.entries.filter((e) => e.day !== day);
    change({ ...art, entries: [...others, next].sort((a, b) => a.day - b.day) });
  };
  const setMinutes = (cat: CategoryId, v: number) => setEntry({ minutes: { ...entry.minutes, [cat]: Math.min(MAX_MINUTES, Math.max(0, v)) } });
  const setReflection = (patch: Partial<DiaryReflection>) => change({ ...art, reflection: { ...art.reflection, ...patch } });
  const goStep = (to: 1 | 2 | 3) => (locked ? setLocalStep(to) : change({ ...art, step: to, maxStep: Math.max(art.maxStep, to) as 1 | 2 | 3 }, true));

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
        setMsg({ ok: true, text: "선생님께 냈어요. 일주일 동안 기록하느라 애썼어요!" });
      }
    } catch {
      setMsg({ ok: false, text: "제출하지 못했어요. 인터넷을 확인해 주세요." });
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header className="space-y-2">
        <Link href="/student" className="text-sm text-stone-500 underline">← 목록으로</Link>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-stone-600">{prompt}</p>
        <p className="rounded-lg bg-sun-100 px-3 py-2 text-sm">내 일지는 선생님만 볼 수 있고, 친구들과 나누지 않아요. 친구나 가족의 진짜 이름, 전화번호, 주소는 쓰지 않아요.</p>
      </header>

      <nav aria-label="쓰는 순서" className="flex gap-1">
        {STEPS.map((s) => (
          <button
            key={s.no}
            type="button"
            aria-current={step === s.no ? "step" : undefined}
            onClick={() => goStep(s.no)}
            className={`flex-1 rounded-xl border px-2 py-2 text-sm font-semibold ${step === s.no ? "border-brand-600 bg-brand-600 text-white" : "border-black/10 bg-white text-stone-700"}`}
          >
            {s.no}. {s.label}
          </button>
        ))}
      </nav>

      <div className="flex min-h-6 items-center justify-between text-xs text-stone-500" aria-live="polite">
        <span data-testid="save-state">{locked ? (submitted ? "냈어요" : "과제가 닫혔어요") : state === "saving" ? "저장 중…" : state === "saved" ? "저장했어요" : ""}</span>
        {error && <span role="alert" className="text-red-700">{error}</span>}
      </div>

      {safety && (
        <div role="alert" data-testid="safety-reply" className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-orange-950">
          <p>{safety.reply}</p>
          <button type="button" className="mt-2 text-sm underline" onClick={clearSafety}>알겠어요</button>
        </div>
      )}

      {step === 1 && (
        <section className="card space-y-4" aria-label="1단계 하루 기록">
          <div role="tablist" aria-label="날짜" className="flex flex-wrap gap-1">
            {Array.from({ length: DAYS }, (_, i) => i + 1).map((d) => {
              const logged = art.entries.some((e) => e.day === d && isLogged(e));
              return (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={d === day}
                  onClick={() => setDay(d)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${d === day ? "border-brand-600 bg-brand-50 text-brand-700" : "border-black/10 bg-white"}`}
                >
                  {d}일째{logged && <span aria-label="기록함"> ✓</span>}
                </button>
              );
            })}
          </div>
          <h2 className="text-lg font-bold">{day}일째, 어떤 매체를 몇 분 썼나요?</h2>
          <p className="text-sm text-stone-600">막대를 움직이거나 − + 단추로 고쳐요. ({STEP_MINUTES}분씩, 0~{MAX_MINUTES}분)</p>
          <ul className="space-y-3">
            {CATEGORIES.map((c) => {
              const v = entry.minutes[c.id as CategoryId];
              return (
                <li key={c.id} className="space-y-1 text-sm" data-cat={c.id}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      <span aria-hidden="true" className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: c.color }} />
                      {c.label}
                    </span>
                    <output className="text-base font-bold" aria-label={`${c.label} ${v}분`}>{v}분</output>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="btn-ghost h-10 w-10 shrink-0 p-0" disabled={locked || v <= 0} aria-label={`${c.label} ${STEP_MINUTES}분 줄이기`} onClick={() => setMinutes(c.id as CategoryId, v - STEP_MINUTES)}>−</button>
                    <input
                      type="range"
                      min={0}
                      max={MAX_MINUTES}
                      step={STEP_MINUTES}
                      value={v}
                      disabled={locked}
                      aria-label={`${c.label} 이용 시간(분)`}
                      aria-valuetext={`${v}분`}
                      className="h-10 min-w-0 flex-1"
                      style={{ accentColor: c.color }}
                      onChange={(e) => setMinutes(c.id as CategoryId, Number(e.target.value))}
                    />
                    <button type="button" className="btn-ghost h-10 w-10 shrink-0 p-0" disabled={locked || v >= MAX_MINUTES} aria-label={`${c.label} ${STEP_MINUTES}분 늘리기`} onClick={() => setMinutes(c.id as CategoryId, v + STEP_MINUTES)}>+</button>
                  </div>
                </li>
              );
            })}
          </ul>
          <fieldset>
            <legend className="label">그날 가장 오래 한 일</legend>
            <div className="flex flex-wrap gap-2" role="group" aria-label="가장 오래 한 일">
              {CATEGORIES.map((c) => (
                <button key={c.id} type="button" disabled={locked} aria-pressed={entry.longest === c.id} onClick={() => setEntry({ longest: entry.longest === c.id ? null : (c.id as CategoryId) })} className={`rounded-full border px-3 py-1.5 text-sm ${entry.longest === c.id ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-black/10 bg-white"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">그때 기분</legend>
            <div className="flex flex-wrap gap-2" role="group" aria-label="기분 고르기">
              {MOODS.map((m) => (
                <button key={m.id} type="button" disabled={locked} aria-pressed={entry.mood === m.id} aria-label={m.label} onClick={() => setEntry({ mood: entry.mood === m.id ? null : m.id })} className={`flex w-20 flex-col items-center rounded-xl border px-1 py-2 text-xs ${entry.mood === m.id ? "border-brand-600 bg-brand-50 font-semibold" : "border-black/10 bg-white"}`}>
                  <span className="text-2xl" aria-hidden="true">{m.emoji}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="note">한 줄 생각</label>
            <input id="note" className="input" maxLength={LIMITS.note} disabled={locked} value={entry.note} onChange={(e) => setEntry({ note: e.target.value })} placeholder="오늘 매체를 쓰면서 든 생각" />
            <p className="mt-1 text-right text-xs text-stone-500">{entry.note.length}/{LIMITS.note}</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => goStep(2)}>다음: 성찰하기</button>
        </section>
      )}

      {step === 2 && (
        <section className="card space-y-4" aria-label="2단계 성찰">
          <h2 className="text-lg font-bold">내 매체 이용을 돌아봐요</h2>
          {(
            [
              ["good", "잘한 점은 무엇인가요?"],
              ["change", "바꾸고 싶은 점은 무엇인가요?"],
              ["promise", "다음 주에 지킬 약속은 무엇인가요?"],
            ] as const
          ).map(([k, q]) => (
            <div key={k}>
              <label className="label" htmlFor={`r-${k}`}>{q}</label>
              <textarea id={`r-${k}`} className="input min-h-20" maxLength={LIMITS.reflection} disabled={locked} value={art.reflection[k]} onChange={(e) => setReflection({ [k]: e.target.value })} />
              <p className="mt-1 text-right text-xs text-stone-500">{art.reflection[k].length}/{LIMITS.reflection}</p>
            </div>
          ))}
          <button type="button" className="btn-primary" onClick={() => goStep(3)}>다음: 그래프 보기</button>
        </section>
      )}

      {step === 3 && (
        <section className="card space-y-4" aria-label="3단계 그래프와 제출">
          <h2 className="text-lg font-bold">내가 쓴 시간</h2>
          {summary.daysLogged === 0 ? (
            <p className="text-stone-600">아직 기록한 날이 없어요. 1단계에서 하루를 기록해 보세요.</p>
          ) : (
            <>
              <BarChart title={`${summary.daysLogged}일 동안 매체별로 쓴 시간(합계)`} bars={CATEGORIES.map((c) => ({ id: c.id, label: c.label, value: summary.totals[c.id as CategoryId], color: c.color }))} />
              <p className="text-sm text-stone-600" data-testid="diary-summary">
                {summary.daysLogged}일 기록했어요. 모두 합하면 {summary.totalMinutes}분이고, 하루 평균 {Math.round(summary.totalMinutes / summary.daysLogged)}분이에요.
              </p>
            </>
          )}
          {problems.length > 0 && !submitted && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-red-700" data-testid="submit-problems">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          {msg && (
            <div role={msg.ok ? "status" : "alert"} data-testid="submit-msg" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-brand-50 text-brand-700" : "bg-orange-50 text-orange-950"}`}>
              {msg.text}
            </div>
          )}
          {submitted ? (
            <p className="text-sm text-stone-600">이미 냈어요. 선생님이 돌려주면 다시 고칠 수 있어요.</p>
          ) : (
            <button type="button" className="btn-primary" disabled={busy || !isOpen || problems.length > 0} onClick={submit}>선생님께 내기</button>
          )}
        </section>
      )}
    </main>
  );
}
