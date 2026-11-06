"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  IMPRESSION_STICKERS,
  LIMITS,
  MIN_CHARS,
  getImpressionWork,
  impressionWorks,
  sentenceInWork,
  submitProblems,
  type ImpressionArtifact,
  type ImpressionStep,
} from "@/core/impression";
import { SentencePicker } from "./SentencePicker";
import { useArtifactSave } from "./useArtifactSave";

const STEPS: { no: ImpressionStep; label: string }[] = [
  { no: 1, label: "작품 고르기" },
  { no: 2, label: "문장 고르기" },
  { no: 3, label: "쓰고 내기" },
];

export function ImpressionMaker({
  submissionId,
  assignmentId,
  title,
  prompt,
  isOpen,
  initial,
  status,
  approved,
  reactions,
  reflection: initialReflection,
}: {
  submissionId: number;
  assignmentId: number;
  title: string;
  prompt: string;
  isOpen: boolean;
  initial: ImpressionArtifact;
  status: string;
  approved: boolean;
  reactions: Record<string, number>;
  reflection: string;
}) {
  const locked = !isOpen || approved;
  const { art, change, flush, state, error, safety, clearSafety } = useArtifactSave<ImpressionArtifact>(submissionId, initial, locked);
  const [submitted, setSubmitted] = useState(status === "submitted");
  const [submitMsg, setSubmitMsg] = useState<{ ok: boolean; text: string; problems?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [localStep, setLocalStep] = useState<ImpressionStep | null>(null);
  const step = locked ? (localStep ?? art.step) : art.step;

  const works = useMemo(() => impressionWorks(), []);
  const work = getImpressionWork(art.workId);
  const sentence = work ? sentenceInWork(work, art.sentenceId) : undefined;
  const problems = useMemo(() => submitProblems(art), [art]);

  const canGo = (to: ImpressionStep) => to === 1 || (to === 2 && !!work) || (to === 3 && !!work && !!sentence);
  const goStep = (to: ImpressionStep) => {
    if (!canGo(to)) return;
    if (locked) setLocalStep(to);
    else change({ ...art, step: to, maxStep: Math.max(art.maxStep, to) as ImpressionStep }, true);
  };
  const pickWork = (id: string) => {
    if (locked) return;
    change({ ...art, workId: id, sentenceId: id === art.workId ? art.sentenceId : "", step: 2, maxStep: Math.max(art.maxStep, 2) as ImpressionStep }, true);
  };
  const pickSentence = (id: string) => change({ ...art, sentenceId: id }, true);

  async function submit() {
    setBusy(true);
    setSubmitMsg(null);
    await flush();
    try {
      const res = await fetch(`/api/artifacts/${submissionId}/submit`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; problems?: string[]; submitted?: boolean; safety?: { reply: string } | null };
      if (!res.ok) setSubmitMsg({ ok: false, text: data.error ?? "제출하지 못했어요.", problems: data.problems });
      else if (data.safety) setSubmitMsg({ ok: false, text: data.safety.reply });
      else {
        setSubmitted(true);
        setSubmitMsg({ ok: true, text: "선생님께 냈어요! 선생님이 확인하고 공유를 허락하면 반 갤러리에 올라가요." });
      }
    } catch {
      setSubmitMsg({ ok: false, text: "제출하지 못했어요. 인터넷을 확인해 주세요." });
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/student" className="text-sm text-stone-500 underline">← 목록으로</Link>
          <Link href={`/student/assignments/${assignmentId}/gallery`} className="btn-ghost px-3 py-1.5 text-sm">🖼️ 우리 반 갤러리</Link>
        </div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-stone-600">{prompt}</p>
      </header>

      <nav aria-label="하는 순서" className="flex gap-1">
        {STEPS.map((s) => (
          <button
            key={s.no}
            type="button"
            aria-current={step === s.no ? "step" : undefined}
            disabled={!canGo(s.no)}
            onClick={() => goStep(s.no)}
            className={`flex-1 rounded-xl border px-2 py-2 text-sm font-semibold disabled:opacity-50 ${step === s.no ? "border-brand-600 bg-brand-600 text-white" : "border-black/10 bg-white text-stone-700"}`}
          >
            {s.no}. {s.label}
          </button>
        ))}
      </nav>

      <div className="flex min-h-6 items-center justify-between text-xs text-stone-500" aria-live="polite">
        <span data-testid="save-state">
          {locked ? (approved ? "공유가 승인되어 더 고칠 수 없어요" : "과제가 닫혔어요") : state === "saving" ? "저장 중…" : state === "saved" ? "저장했어요" : ""}
        </span>
        {error && <span role="alert" className="text-red-700">{error}</span>}
      </div>

      {safety && (
        <div role="alert" data-testid="safety-reply" className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-orange-950">
          <p>{safety.reply}</p>
          <button type="button" className="mt-2 text-sm underline" onClick={clearSafety}>알겠어요</button>
        </div>
      )}

      {approved && <ApprovedPanel submissionId={submissionId} assignmentId={assignmentId} reactions={reactions} initialReflection={initialReflection} />}

      {step === 1 && (
        <section className="space-y-3" aria-label="1단계 작품 고르기">
          <h2 className="text-lg font-bold">1. 어떤 작품을 읽을까요?</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {works.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  data-work={w.id}
                  aria-pressed={w.id === art.workId}
                  disabled={locked}
                  onClick={() => pickWork(w.id)}
                  className={`card block w-full text-left transition hover:shadow-md disabled:cursor-default ${w.id === art.workId ? "border-brand-500 ring-2 ring-brand-100" : ""}`}
                >
                  <span className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-600">{w.genre}</span>
                  <span className="mt-2 block text-lg font-bold">{w.title}</span>
                  <span className="mt-1 block text-sm text-stone-500">{w.paragraphs.length}{w.genre === "시" ? "연" : "문단"}으로 된 {w.genre === "시" ? "시" : "글"}</span>
                </button>
              </li>
            ))}
          </ul>
          {work && (
            <button type="button" className="btn-primary" onClick={() => goStep(2)}>다음: 「{work.title}」 읽기</button>
          )}
        </section>
      )}

      {step === 2 && work && (
        <section className="space-y-4" aria-label="2단계 문장 고르기">
          <div className="space-y-1">
            <h2 className="text-lg font-bold">2. 「{work.title}」을 읽고 가장 인상적인 문장을 눌러요</h2>
            <p className="text-sm text-stone-600">천천히 읽어 보고, 마음에 오래 남는 문장을 하나 눌러요. 다시 누르면 다른 문장을 고를 수 있어요.</p>
          </div>
          <div className="card">
            <SentencePicker work={work} selectedId={art.sentenceId} disabled={locked} onSelect={pickSentence} />
          </div>
          <p className="rounded-lg bg-sun-100 px-3 py-2 text-sm" data-testid="chosen-sentence">
            {sentence ? <>내가 고른 문장: <b>{sentence.text}</b></> : "아직 고른 문장이 없어요."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => goStep(1)}>다른 작품 고르기</button>
            <button type="button" className="btn-primary" disabled={!sentence} onClick={() => goStep(3)}>다음: 생각 쓰기</button>
          </div>
        </section>
      )}

      {step === 3 && work && sentence && (
        <section className="card space-y-4" aria-label="3단계 쓰고 내기">
          <h2 className="text-lg font-bold">3. 까닭과 내 삶을 이어서 써요</h2>
          <p className="rounded-lg bg-sun-100 px-3 py-2 text-sm">친구나 가족의 진짜 이름, 전화번호, 주소는 쓰지 않아요.</p>
          <blockquote className="rounded-xl border-l-4 border-sun-400 bg-stone-50 px-4 py-3" data-testid="quote">
            <p className="text-xs text-stone-500">「{work.title}」에서 고른 문장</p>
            <p className="mt-1 font-semibold">{sentence.text}</p>
          </blockquote>
          <Area id="why" label="이 문장이 인상적인 까닭" hint={`${MIN_CHARS.why}자 이상`} max={LIMITS.why} min={MIN_CHARS.why} value={art.why} disabled={locked} onChange={(v) => change({ ...art, why: v })} placeholder="어떤 장면이나 마음이 떠올랐나요?" />
          <Area id="life" label="내 삶과 이어 본 생각" hint={`${MIN_CHARS.life}자 이상`} max={LIMITS.life} min={MIN_CHARS.life} value={art.life} disabled={locked} onChange={(v) => change({ ...art, life: v })} placeholder="비슷한 경험이나 떠오르는 생각을 써 봐요." />
          <button type="button" className="btn-ghost text-sm" onClick={() => goStep(2)}>← 문장 다시 고르기</button>
          {problems.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-red-700" data-testid="submit-problems">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          {submitMsg && (
            <div role={submitMsg.ok ? "status" : "alert"} data-testid="submit-msg" className={`rounded-lg px-3 py-2 text-sm ${submitMsg.ok ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-700"}`}>
              {submitMsg.text}
            </div>
          )}
          {!approved && (
            <button type="button" className="btn-primary" disabled={busy || !isOpen || problems.length > 0} onClick={submit}>
              {submitted ? "고친 내용 다시 내기" : "선생님께 내기"}
            </button>
          )}
          {submitted && !approved && <p className="text-sm text-stone-600">냈어요. 선생님이 공유를 허락하기 전까지는 고쳐서 다시 낼 수 있어요.</p>}
        </section>
      )}
    </main>
  );
}

function Area({ id, label, hint, max, min, value, onChange, disabled, placeholder }: { id: string; label: string; hint: string; max: number; min: number; value: string; onChange: (v: string) => void; disabled: boolean; placeholder?: string }) {
  const n = Array.from(value.trim()).length;
  return (
    <div>
      <label className="label" htmlFor={id}>{label} <span className="font-normal text-stone-500">({hint})</span></label>
      <textarea id={id} className="input min-h-28" maxLength={max} value={value} disabled={disabled} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <p className={`mt-1 text-right text-xs ${n < min ? "text-stone-500" : "text-brand-700"}`} data-testid={`count-${id}`}>{value.length}/{max}</p>
    </div>
  );
}

/** 공유가 승인된 뒤: 받은 반응과 '친구 반응을 보고 더 생각한 점' 한 줄 */
function ApprovedPanel({ submissionId, assignmentId, reactions, initialReflection }: { submissionId: number; assignmentId: number; reactions: Record<string, number>; initialReflection: string }) {
  const [text, setText] = useState(initialReflection);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const total = Object.values(reactions).reduce((s, n) => s + n, 0);
  async function save() {
    setMsg(null);
    const res = await fetch(`/api/artifacts/${submissionId}/reflection`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string; reflection?: string; safety?: { reply: string } | null };
    if (!res.ok) setMsg({ ok: false, text: data.error ?? "저장하지 못했어요." });
    else if (data.safety) {
      setText(data.reflection ?? "");
      setMsg({ ok: false, text: data.safety.reply });
    } else setMsg({ ok: true, text: "저장했어요." });
  }
  return (
    <section className="card space-y-3" aria-label="받은 반응" data-testid="approved-panel">
      <h2 className="text-lg font-bold">🎉 내 생각이 반 갤러리에 올라갔어요</h2>
      <Link href={`/student/assignments/${assignmentId}/gallery`} className="text-sm underline">갤러리에서 보기</Link>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="받은 스티커">
        {IMPRESSION_STICKERS.map((s) => (
          <li key={s.id} data-sticker={s.id} className="rounded-xl bg-stone-50 p-3 text-center text-sm">
            <div className="text-2xl" aria-hidden="true">{s.emoji}</div>
            <div>{s.label}</div>
            <div className="text-lg font-bold" data-testid={`got-${s.id}`}>{reactions[s.id] ?? 0}</div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-stone-600">받은 스티커 {total}개. 친구들의 반응을 보고 더 생각한 점이 있으면 한 줄로 적어 보세요.</p>
      <div>
        <label className="label" htmlFor="reflection">친구 반응을 보고 더 생각한 점</label>
        <input id="reflection" className="input" maxLength={LIMITS.reflection} value={text} onChange={(e) => setText(e.target.value)} />
        <p className="mt-1 text-right text-xs text-stone-500">{text.length}/{LIMITS.reflection}</p>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} data-testid="reflection-msg" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-brand-50 text-brand-700" : "bg-orange-50 text-orange-950"}`}>{msg.text}</p>}
      <button type="button" className="btn-primary" onClick={save}>저장하기</button>
    </section>
  );
}
