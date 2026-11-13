"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DEBATE_LIMITS as L,
  REASON_MAX,
  REBUTTAL_MAX,
  checkDebate,
  debateSteps,
  debateSubmitProblems,
  newReason,
  newRebuttal,
  type DebateArtifact,
  type DebateReason,
  type DebateRebuttal,
  type DebateWarning,
} from "@/core/speaking";
import { DebateTimer } from "./DebateTimer";
import { Marked, SafetyBox, SaveLine, StepTabs, useSubmit, Warn } from "./SpeakingParts";
import { useArtifactSave } from "./useArtifactSave";

const TABS = ["논제와 내 편", "논거 나무", "예상 반론", "스스로 점검", "토론 타이머", "제출"] as const;
const SIDE_TEXT = { pro: "찬성", con: "반대" } as const;
const SIDE_COLOR = {
  pro: "border-blue-700 bg-blue-700 text-white",
  con: "border-orange-700 bg-orange-700 text-white",
} as const;

export function DebateMaker({
  submissionId,
  title,
  motion,
  seconds,
  isOpen,
  initial,
  status,
  assignmentId,
  approved,
}: {
  assignmentId: number;
  /** 선생님이 반 공유를 승인했는가(승인되면 편·주장·근거·반론은 고칠 수 없다. 토론 뒤 한 줄은 공유되지 않아 계속 쓸 수 있다) */
  approved: boolean;
  submissionId: number;
  title: string;
  motion: string;
  /** 교사가 바꾼 단계별 시간(없으면 기본 시간) */
  seconds?: Record<string, number>;
  isOpen: boolean;
  initial: DebateArtifact;
  status: string;
}) {
  const locked = !isOpen;
  const frozen = locked || approved;
  const { art, change, flush, state, error, safety, clearSafety } = useArtifactSave<DebateArtifact>(submissionId, initial, locked);
  const [tab, setTab] = useState(1);
  // 점검 단계를 본 뒤부터는 빠진 것 안내도 해당 칸 옆에 보여 준다(쓰는 도중에는 말투에 대한 안내만 바로 보여 준다)
  const [checked, setChecked] = useState(false);
  const { submitted, busy, msg, submit } = useSubmit(submissionId, flush, status === "submitted", "선생님께 냈어요. 토론 준비를 끝까지 해서 멋져요! 고치고 싶으면 고쳐서 다시 낼 수 있어요.");
  const steps = useMemo(() => debateSteps(seconds), [seconds]);
  const warnings = useMemo(() => checkDebate(art), [art]);
  const problems = useMemo(() => debateSubmitProblems(art), [art]);

  const go = (n: number) => {
    setTab(n);
    if (n === 4) setChecked(true);
  };
  const warnFor = (key: string): DebateWarning[] => warnings.filter((w) => w.target === key && (checked || w.kind === "exaggeration" || w.kind === "disrespect"));

  const setReason = (id: string, patch: Partial<DebateReason>) => change({ ...art, reasons: art.reasons.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const setRebuttal = (id: string, patch: Partial<DebateRebuttal>) => change({ ...art, rebuttals: art.rebuttals.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const fieldWarn = (key: string, text: string) => {
    const ws = warnFor(key);
    if (ws.length === 0) return null;
    const spans = ws.flatMap((w) => w.spans ?? []);
    return (
      <div data-field-warn={key}>
        {spans.length > 0 && (
          <p className="mt-1 rounded-lg bg-stone-50 px-2 py-1 text-sm text-stone-700">
            <span className="mr-1 text-xs text-stone-500">확인해 볼 말</span>
            <Marked text={text} spans={spans} />
          </p>
        )}
        <Warn messages={ws.map((w) => w.message)} />
      </div>
    );
  };

  const where = (w: DebateWarning): number => (!w.target || w.kind === "no-side" ? 1 : w.target.startsWith("rebuttal.") ? 3 : 2);
  const textOf = (key: string): string => {
    if (key === "claim") return art.claim;
    const r = /^reason\.([a-z0-9]+)\.(text|support|source)$/.exec(key);
    if (r) return art.reasons.find((x) => x.id === r[1])?.[r[2] as "text" | "support" | "source"] ?? "";
    const b = /^rebuttal\.([a-z0-9]+)\.(expected|answer)$/.exec(key);
    if (b) return art.rebuttals.find((x) => x.id === b[1])?.[b[2] as "expected" | "answer"] ?? "";
    return key === "reflection" ? art.reflection : "";
  };

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header className="space-y-2">
        <Link href="/student" className="text-sm text-stone-500 underline">← 목록으로</Link>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="rounded-xl border border-black/10 bg-white p-3 text-lg" data-testid="motion">
          <span className="mr-2 text-sm font-semibold text-stone-500">논제</span>
          <b>{art.motion || motion}</b>
        </p>
        <p className="rounded-lg bg-sun-100 px-3 py-2 text-sm">
          내 토론 준비는 선생님만 볼 수 있어요. 친구의 진짜 이름, 전화번호, 주소는 쓰지 않아요. 토론할 때 소리나 목소리를 녹음하지 않아요.
        </p>
      </header>

      <StepTabs steps={TABS} current={tab} onGo={go} />
      <SaveLine locked={locked} lockedText="과제가 닫혔어요" state={state} error={error} />
      <SafetyBox safety={safety} onClose={clearSafety} />

      {tab === 1 && (
        <section className="card space-y-4" aria-label="1단계 논제와 내 편">
          <h2 className="text-lg font-bold">어느 편에서 말할까요?</h2>
          <p className="text-stone-700">논제를 읽고 내 편을 골라요. 내 생각과 달라도 괜찮아요. 고른 편의 입장에서 가장 좋은 까닭을 찾아봐요.</p>
          <div role="group" aria-label="내 편 고르기" className="grid grid-cols-2 gap-3">
            {(["pro", "con"] as const).map((side) => (
              <button
                key={side}
                type="button"
                data-side={side}
                disabled={frozen}
                aria-pressed={art.side === side}
                onClick={() => change({ ...art, side }, true)}
                className={`min-h-16 rounded-2xl border-4 px-3 py-4 text-xl font-bold ${
                  art.side === side ? SIDE_COLOR[side] : "border-stone-300 bg-white text-stone-800 hover:bg-stone-50"
                }`}
              >
                {side === "pro" ? "▲" : "▼"} {SIDE_TEXT[side]}
                {art.side === side && <span className="ml-2 text-base">✓ 내 편</span>}
              </button>
            ))}
          </div>
          <button type="button" className="btn-primary min-h-11" onClick={() => go(2)}>다음: 논거 나무 세우기</button>
        </section>
      )}

      {tab === 2 && (
        <section className="card space-y-4" aria-label="2단계 논거 나무">
          <h2 className="text-lg font-bold">논거 나무를 세워요</h2>
          <p className="text-stone-700">
            나무 꼭대기에는 <b>내 주장</b>, 가지에는 주장을 뒷받침하는 <b>근거</b>를 달아요. 근거마다 뒷받침 자료(조사한 것, 겪은 일)와 출처를 적어요.
          </p>
          <div data-testid="claim-box" className="rounded-2xl border-4 border-brand-600 bg-brand-50 p-3">
            <label htmlFor="claim" className="label">내 주장 (한 문장) {art.side && <span className="font-normal text-stone-600">· {SIDE_TEXT[art.side]} 편</span>}</label>
            <input id="claim" className="input" maxLength={L.claim} disabled={frozen} value={art.claim} onChange={(e) => change({ ...art, claim: e.target.value })} placeholder="예: 쉬는 시간을 늘려야 합니다." />
            <p className="mt-1 text-right text-xs text-stone-500">{art.claim.length}/{L.claim}</p>
            {fieldWarn("claim", art.claim)}
          </div>
          <div aria-hidden="true" className="mx-auto h-5 w-1 bg-stone-500" />
          <ul aria-label="근거 가지" className="ml-3 space-y-0 border-l-4 border-stone-500 pl-0">
            {art.reasons.map((r, i) => (
              <li key={r.id} data-reason={r.id} className="relative pb-4 pl-6 last:pb-0">
                <span aria-hidden="true" className="absolute left-0 top-8 h-1 w-6 bg-stone-500" />
                <div className="space-y-2 rounded-2xl border-2 border-stone-400 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold">🌿 {i + 1}번 근거</h3>
                    <button
                      type="button"
                      className="min-h-11 min-w-11 rounded-xl border border-black/15 px-3 text-sm hover:bg-stone-50 disabled:opacity-50"
                      disabled={frozen || art.reasons.length <= 1}
                      aria-label={`${i + 1}번 근거 지우기`}
                      onClick={() => change({ ...art, reasons: art.reasons.filter((x) => x.id !== r.id) }, true)}
                    >
                      지우기
                    </button>
                  </div>
                  <div>
                    <label className="label" htmlFor={`rt-${r.id}`}>근거 (왜 그렇게 생각하나요?)</label>
                    <input id={`rt-${r.id}`} className="input" maxLength={L.reason} disabled={frozen} value={r.text} onChange={(e) => setReason(r.id, { text: e.target.value })} />
                    {fieldWarn(`reason.${r.id}.text`, r.text)}
                  </div>
                  <div>
                    <label className="label" htmlFor={`rs-${r.id}`}>뒷받침 자료 (조사한 것, 겪은 일)</label>
                    <textarea id={`rs-${r.id}`} className="input min-h-16" maxLength={L.support} disabled={frozen} value={r.support} onChange={(e) => setReason(r.id, { support: e.target.value })} />
                    {fieldWarn(`reason.${r.id}.support`, r.support)}
                  </div>
                  <div>
                    <label className="label" htmlFor={`ro-${r.id}`}>출처 (어디에서 알게 됐나요?)</label>
                    <input id={`ro-${r.id}`} className="input" maxLength={L.source} disabled={frozen} value={r.source} onChange={(e) => setReason(r.id, { source: e.target.value })} placeholder="예: 우리 반 설문, 사회 교과서" />
                    {fieldWarn(`reason.${r.id}.source`, r.source)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-ghost min-h-11"
            disabled={frozen || art.reasons.length >= REASON_MAX}
            onClick={() => {
              const r = newReason(art.reasons);
              if (r) change({ ...art, reasons: [...art.reasons, r] }, true);
            }}
          >
            + 근거 가지 더하기 ({art.reasons.length}/{REASON_MAX})
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost min-h-11" onClick={() => go(1)}>이전</button>
            <button type="button" className="btn-primary min-h-11" onClick={() => go(3)}>다음: 예상 반론</button>
          </div>
        </section>
      )}

      {tab === 3 && (
        <section className="card space-y-4" aria-label="3단계 예상 반론">
          <h2 className="text-lg font-bold">상대편은 어떤 말을 할까요?</h2>
          <p className="text-stone-700">상대편이 할 것 같은 반론을 떠올리고, 내가 어떻게 답할지 미리 적어 봐요. 상대의 생각을 존중하는 말로 써요.</p>
          <ul className="space-y-3">
            {art.rebuttals.map((b, i) => (
              <li key={b.id} data-rebuttal={b.id} className="space-y-2 rounded-2xl border-2 border-stone-400 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold">💬 {i + 1}번 반론</h3>
                  <button
                    type="button"
                    className="min-h-11 min-w-11 rounded-xl border border-black/15 px-3 text-sm hover:bg-stone-50 disabled:opacity-50"
                    disabled={frozen || art.rebuttals.length <= 1}
                    aria-label={`${i + 1}번 반론 지우기`}
                    onClick={() => change({ ...art, rebuttals: art.rebuttals.filter((x) => x.id !== b.id) }, true)}
                  >
                    지우기
                  </button>
                </div>
                <div>
                  <label className="label" htmlFor={`be-${b.id}`}>상대편이 할 것 같은 반론</label>
                  <input id={`be-${b.id}`} className="input" maxLength={L.expected} disabled={frozen} value={b.expected} onChange={(e) => setRebuttal(b.id, { expected: e.target.value })} />
                  {fieldWarn(`rebuttal.${b.id}.expected`, b.expected)}
                </div>
                <div>
                  <label className="label" htmlFor={`ba-${b.id}`}>그때 내가 할 대답</label>
                  <textarea id={`ba-${b.id}`} className="input min-h-16" maxLength={L.answer} disabled={frozen} value={b.answer} onChange={(e) => setRebuttal(b.id, { answer: e.target.value })} />
                  {fieldWarn(`rebuttal.${b.id}.answer`, b.answer)}
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-ghost min-h-11"
            disabled={frozen || art.rebuttals.length >= REBUTTAL_MAX}
            onClick={() => {
              const r = newRebuttal(art.rebuttals);
              if (r) change({ ...art, rebuttals: [...art.rebuttals, r] }, true);
            }}
          >
            + 반론 더하기 ({art.rebuttals.length}/{REBUTTAL_MAX})
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost min-h-11" onClick={() => go(2)}>이전</button>
            <button type="button" className="btn-primary min-h-11" onClick={() => go(4)}>다음: 스스로 점검</button>
          </div>
        </section>
      )}

      {tab === 4 && (
        <section className="card space-y-4" aria-label="4단계 스스로 점검">
          <h2 className="text-lg font-bold">스스로 점검해 봐요</h2>
          <p className="text-stone-700">컴퓨터가 규칙으로 살펴본 거예요. 정답을 가리는 게 아니라, 더 좋게 다듬을 곳을 알려 줘요. 고치지 않아도 낼 수 있어요.</p>
          {warnings.length === 0 ? (
            <p className="rounded-xl border border-brand-500 bg-brand-50 p-3 text-brand-700" data-testid="no-warnings">살펴볼 곳이 없어요. 잘 준비했어요! 🎉</p>
          ) : (
            <ul className="space-y-2" data-testid="warnings">
              {warnings.map((w) => (
                <li key={w.id} data-warning={w.kind} className="rounded-xl border border-sun-400 bg-sun-100 p-3 text-stone-900">
                  <p>💡 {w.message}</p>
                  {w.target && textOf(w.target).trim() && (
                    <p className="mt-1 rounded-lg bg-white/70 px-2 py-1 text-sm">
                      <span className="mr-1 text-xs text-stone-500">내가 쓴 글</span>
                      <Marked text={textOf(w.target)} spans={w.spans ?? []} />
                    </p>
                  )}
                  <button type="button" className="mt-1 min-h-11 text-sm font-semibold underline" onClick={() => go(where(w))}>고치러 가기</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost min-h-11" onClick={() => go(3)}>이전</button>
            <button type="button" className="btn-primary min-h-11" onClick={() => go(5)}>다음: 토론 타이머</button>
          </div>
        </section>
      )}

      {tab === 5 && (
        <section className="card space-y-4" aria-label="5단계 토론 타이머">
          <h2 className="text-lg font-bold">토론 타이머</h2>
          <p className="text-stone-700">토론할 때 이 화면을 켜 두면 차례와 시간을 알려 줘요.{art.side ? ` 나는 ${SIDE_TEXT[art.side]} 편이에요.` : " 1단계에서 내 편을 고르면 내 차례를 알려 줘요."}</p>
          <DebateTimer steps={steps} mySide={art.side} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost min-h-11" onClick={() => go(4)}>이전</button>
            <button type="button" className="btn-primary min-h-11" onClick={() => go(6)}>다음: 제출</button>
          </div>
        </section>
      )}

      {tab === 6 && (
        <section className="card space-y-4" aria-label="6단계 제출">
          <h2 className="text-lg font-bold">선생님께 내기</h2>
          <div>
            <label className="label" htmlFor="reflection">토론을 마친 뒤 한 줄 (선택)</label>
            <textarea id="reflection" className="input min-h-20" maxLength={L.reflection} disabled={locked} value={art.reflection} onChange={(e) => change({ ...art, reflection: e.target.value })} placeholder="토론을 하고 나서 새로 알게 된 것이나 다음에 더 잘하고 싶은 점" />
            <p className="mt-1 text-right text-xs text-stone-500">{art.reflection.length}/{L.reflection}</p>
            {fieldWarn("reflection", art.reflection)}
          </div>
          {problems.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-red-700" data-testid="submit-problems">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          {msg && (
            <div role={msg.ok ? "status" : "alert"} data-testid="submit-msg" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-brand-50 text-brand-700" : "bg-orange-50 text-orange-950"}`}>
              {msg.text}
            </div>
          )}
          {submitted && !msg && <p className="text-sm text-stone-600">이미 냈어요. 고쳐서 다시 낼 수도 있어요.</p>}
          {approved ? (
            <p className="rounded-xl border border-brand-500 bg-brand-50 p-3 text-sm text-brand-700" data-testid="share-approved">
              🎉 선생님이 반 친구들에게 보여 주기로 했어요. 편·주장·근거만 보여요. 예상 반론과 토론 뒤 한 줄은 친구들에게 보이지 않아요. 보여 주기로 한 뒤에는 더 고칠 수 없어요. 토론 뒤 한 줄은 계속 쓸 수 있어요.{" "}
              <Link href={`/student/assignments/${assignmentId}/gallery`} className="font-semibold underline">갤러리에서 보기</Link>
            </p>
          ) : (
            <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-700" data-testid="share-info">
              {submitted ? "냈어요. " : ""}선생님이 반 친구들에게 보여 주기로 하면 갤러리에 보여요. 보이는 것은 내 편, 주장, 근거뿐이에요. 예상 반론과 토론 뒤 한 줄은 보이지 않아요.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost min-h-11" onClick={() => go(5)}>이전</button>
            <button type="button" className="btn-primary min-h-11" disabled={busy || frozen || problems.length > 0} onClick={submit}>
              {submitted ? "고쳐서 다시 내기" : "선생님께 내기"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
