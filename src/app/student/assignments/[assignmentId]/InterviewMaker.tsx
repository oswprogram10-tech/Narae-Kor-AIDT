"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CHECKLIST_ITEMS,
  INTERVIEW_LIMITS as L,
  INTERVIEW_METHODS,
  METHOD_LABELS,
  METHOD_TIPS,
  QUESTION_MAX,
  QUESTION_MIN,
  checkInterview,
  interviewSubmitProblems,
  newQuestion,
  type InterviewArtifact,
  type InterviewWarning,
} from "@/core/speaking";
import { SafetyBox, SaveLine, StepTabs, useSubmit, Warn } from "./SpeakingParts";
import { useArtifactSave } from "./useArtifactSave";

const TABS = ["계획", "질문 만들기", "절차 확인표", "스스로 점검", "면담 뒤 정리", "제출"] as const;

export function InterviewMaker({
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
  initial: InterviewArtifact;
  status: string;
}) {
  const locked = !isOpen;
  const { art, change, flush, state, error, safety, clearSafety } = useArtifactSave<InterviewArtifact>(submissionId, initial, locked);
  const [tab, setTab] = useState(1);
  const [checked, setChecked] = useState(false);
  // 칸을 벗어난 뒤부터 그 칸의 안내를 보여 준다(쓰는 도중에는 방해하지 않는다)
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const { submitted, busy, msg, submit } = useSubmit(submissionId, flush, status === "submitted", "선생님께 냈어요. 면담 준비를 꼼꼼히 해서 멋져요! 고치고 싶으면 고쳐서 다시 낼 수 있어요.");
  const warnings = useMemo(() => checkInterview(art), [art]);
  const problems = useMemo(() => interviewSubmitProblems(art), [art]);

  const go = (n: number) => {
    setTab(n);
    if (n === 4) setChecked(true);
  };
  const touch = (key: string) => setSeen((prev) => new Set(prev).add(key));
  const warnFor = (key: string): InterviewWarning[] => warnings.filter((w) => w.target === key && (checked || seen.has(key)));

  const setQuestion = (id: string, text: string) => change({ ...art, questions: art.questions.map((q) => (q.id === id ? { ...q, text } : q)) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= art.questions.length) return;
    const qs = [...art.questions];
    [qs[i], qs[j]] = [qs[j], qs[i]];
    change({ ...art, questions: qs }, true);
  };
  const setLearned = (i: number, text: string) => change({ ...art, learned: art.learned.map((t, k) => (k === i ? text : t)) });
  const noOf = (target?: string) => (target ? art.questions.findIndex((q) => `question.${q.id}` === target) + 1 : 0);
  const where = (w: InterviewWarning): number => (w.target === "interviewee" ? 1 : w.kind === "checklist" ? 3 : 2);

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header className="space-y-2">
        <Link href="/student" className="text-sm text-stone-500 underline">← 목록으로</Link>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-stone-600">{prompt}</p>
        <p className="rounded-lg bg-sun-100 px-3 py-2 text-sm">내 면담 질문지는 선생님만 볼 수 있어요. 이 앱은 면담을 녹음하지 않아요. 면담할 사람의 이름, 전화번호, 주소는 쓰지 않아요.</p>
      </header>

      <StepTabs steps={TABS} current={tab} onGo={go} />
      <SaveLine locked={locked} lockedText="과제가 닫혔어요" state={state} error={error} />
      <SafetyBox safety={safety} onClose={clearSafety} />

      {tab === 1 && (
        <section className="card space-y-4" aria-label="1단계 계획">
          <h2 className="text-lg font-bold">누구를 왜 만나나요?</h2>
          <div>
            <label className="label" htmlFor="purpose">면담하는 목적</label>
            <input id="purpose" className="input" maxLength={L.purpose} disabled={locked} value={art.purpose} onChange={(e) => change({ ...art, purpose: e.target.value })} placeholder="예: 우리 학교 급식이 어떻게 만들어지는지 알아보려고" />
          </div>
          <div>
            <label className="label" htmlFor="interviewee">면담할 사람</label>
            <input
              id="interviewee"
              className="input"
              maxLength={L.interviewee}
              disabled={locked}
              value={art.interviewee}
              onChange={(e) => change({ ...art, interviewee: e.target.value })}
              onBlur={() => touch("interviewee")}
              aria-describedby="interviewee-hint"
              placeholder="예: 보건 선생님"
            />
            <p id="interviewee-hint" className="mt-1 text-sm text-stone-600">이름 대신 ‘보건 선생님’처럼 하는 일로 적어요.</p>
            <Warn messages={warnFor("interviewee").map((w) => w.message)} />
          </div>
          <fieldset>
            <legend className="label">면담 방법</legend>
            <div role="group" aria-label="면담 방법 고르기" className="grid grid-cols-2 gap-2">
              {INTERVIEW_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  data-method={m}
                  disabled={locked}
                  aria-pressed={art.method === m}
                  onClick={() => change({ ...art, method: m }, true)}
                  className={`min-h-11 rounded-xl border-2 px-3 py-2 font-semibold ${art.method === m ? "border-brand-600 bg-brand-50 text-brand-700" : "border-black/15 bg-white hover:bg-stone-50"}`}
                >
                  {art.method === m && "✓ "}{METHOD_LABELS[m]}
                </button>
              ))}
            </div>
            {art.method && (
              <p data-testid="method-tip" className="mt-2 rounded-xl border border-brand-200 bg-brand-50 p-3 text-brand-700">
                <b className="block">{METHOD_LABELS[art.method]} 면담할 때 주의할 점</b>
                {METHOD_TIPS[art.method]}
              </p>
            )}
          </fieldset>
          <button type="button" className="btn-primary min-h-11" onClick={() => go(2)}>다음: 질문 만들기</button>
        </section>
      )}

      {tab === 2 && (
        <section className="card space-y-4" aria-label="2단계 질문 만들기">
          <h2 className="text-lg font-bold">질문을 만들어요 ({QUESTION_MIN}~{QUESTION_MAX}개)</h2>
          <p className="text-stone-700">‘무엇·왜·어떻게’처럼 자세한 대답을 들을 수 있는 질문이 좋아요. 순서도 생각해서 위아래로 옮겨 봐요.</p>
          <ol className="space-y-3">
            {art.questions.map((q, i) => (
              <li key={q.id} data-question={q.id} className="space-y-1 rounded-2xl border-2 border-stone-400 bg-white p-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">{i + 1}</span>
                  <input
                    className="input min-w-0 flex-1"
                    aria-label={`${i + 1}번 질문`}
                    maxLength={L.question}
                    disabled={locked}
                    value={q.text}
                    onChange={(e) => setQuestion(q.id, e.target.value)}
                    onBlur={() => touch(`question.${q.id}`)}
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" className="min-h-11 min-w-11 rounded-xl border border-black/15 px-3 text-sm hover:bg-stone-50 disabled:opacity-50" aria-label={`${i + 1}번 질문 위로 옮기기`} disabled={locked || i === 0} onClick={() => move(i, -1)}>↑ 위로</button>
                  <button type="button" className="min-h-11 min-w-11 rounded-xl border border-black/15 px-3 text-sm hover:bg-stone-50 disabled:opacity-50" aria-label={`${i + 1}번 질문 아래로 옮기기`} disabled={locked || i === art.questions.length - 1} onClick={() => move(i, 1)}>↓ 아래로</button>
                  <button type="button" className="min-h-11 min-w-11 rounded-xl border border-black/15 px-3 text-sm hover:bg-stone-50 disabled:opacity-50" aria-label={`${i + 1}번 질문 지우기`} disabled={locked || art.questions.length <= QUESTION_MIN} onClick={() => change({ ...art, questions: art.questions.filter((x) => x.id !== q.id) }, true)}>지우기</button>
                </div>
                <Warn messages={warnFor(`question.${q.id}`).map((w) => w.message)} />
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="btn-ghost min-h-11"
            disabled={locked || art.questions.length >= QUESTION_MAX}
            onClick={() => {
              const q = newQuestion(art.questions);
              if (q) change({ ...art, questions: [...art.questions, q] }, true);
            }}
          >
            + 질문 더하기 ({art.questions.length}/{QUESTION_MAX})
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost min-h-11" onClick={() => go(1)}>이전</button>
            <button type="button" className="btn-primary min-h-11" onClick={() => go(3)}>다음: 절차 확인표</button>
          </div>
        </section>
      )}

      {tab === 3 && (
        <section className="card space-y-4" aria-label="3단계 절차 확인표">
          <h2 className="text-lg font-bold">면담 절차를 확인해요</h2>
          <p className="text-stone-700">면담 전에 하나씩 확인하고 체크해요.</p>
          <ul className="space-y-2">
            {CHECKLIST_ITEMS.map((c) => (
              <li key={c.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-black/15 bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    data-check={c.id}
                    disabled={locked}
                    checked={art.checklist[c.id]}
                    onChange={(e) => change({ ...art, checklist: { ...art.checklist, [c.id]: e.target.checked } }, true)}
                  />
                  <span>{c.label}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-sm text-stone-600">이 앱은 면담을 녹음하지 않아요. 기록(녹음·사진)이 필요하면 상대의 허락을 받고 학교 기기로 해요.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost min-h-11" onClick={() => go(2)}>이전</button>
            <button type="button" className="btn-primary min-h-11" onClick={() => go(4)}>다음: 스스로 점검</button>
          </div>
        </section>
      )}

      {tab === 4 && (
        <section className="card space-y-4" aria-label="4단계 스스로 점검">
          <h2 className="text-lg font-bold">스스로 점검해 봐요</h2>
          <p className="text-stone-700">컴퓨터가 규칙으로 살펴본 거예요. 고치지 않아도 낼 수 있어요. 꼭 필요한 질문이라면 그대로 둬도 괜찮아요.</p>
          {warnings.length === 0 ? (
            <p className="rounded-xl border border-brand-500 bg-brand-50 p-3 text-brand-700" data-testid="no-warnings">살펴볼 곳이 없어요. 잘 준비했어요! 🎉</p>
          ) : (
            <ul className="space-y-2" data-testid="warnings">
              {warnings.map((w) => (
                <li key={w.id} data-warning={w.kind} className="rounded-xl border border-sun-400 bg-sun-100 p-3 text-stone-900">
                  <p>
                    💡 {noOf(w.target) > 0 && <b>{noOf(w.target)}번 질문: </b>}
                    {w.message}
                  </p>
                  {noOf(w.target) > 0 && <p className="mt-1 rounded-lg bg-white/70 px-2 py-1 text-sm">{art.questions[noOf(w.target) - 1].text}</p>}
                  <button type="button" className="mt-1 min-h-11 text-sm font-semibold underline" onClick={() => go(where(w))}>고치러 가기</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost min-h-11" onClick={() => go(3)}>이전</button>
            <button type="button" className="btn-primary min-h-11" onClick={() => go(5)}>다음: 면담 뒤 정리</button>
          </div>
        </section>
      )}

      {tab === 5 && (
        <section className="card space-y-4" aria-label="5단계 면담 뒤 정리">
          <h2 className="text-lg font-bold">면담을 하고 나서</h2>
          <p className="text-stone-700">면담을 마친 뒤에 적어요. 아직 면담 전이라면 비워 두고 제출해도 돼요. 나중에 다시 와서 적어도 돼요.</p>
          {art.learned.map((t, i) => (
            <div key={i}>
              <label className="label" htmlFor={`learned-${i}`}>알게 된 것 {i + 1}{i > 0 ? " (선택)" : ""}</label>
              <input id={`learned-${i}`} className="input" maxLength={L.learned} disabled={locked} value={t} onChange={(e) => setLearned(i, e.target.value)} />
            </div>
          ))}
          <div>
            <label className="label" htmlFor="wonder">더 궁금해진 것</label>
            <input id="wonder" className="input" maxLength={L.wonder} disabled={locked} value={art.wonder} onChange={(e) => change({ ...art, wonder: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost min-h-11" onClick={() => go(4)}>이전</button>
            <button type="button" className="btn-primary min-h-11" onClick={() => go(6)}>다음: 제출</button>
          </div>
        </section>
      )}

      {tab === 6 && (
        <section className="card space-y-4" aria-label="6단계 제출">
          <h2 className="text-lg font-bold">선생님께 내기</h2>
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
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost min-h-11" onClick={() => go(5)}>이전</button>
            <button type="button" className="btn-primary min-h-11" disabled={busy || locked || problems.length > 0} onClick={submit}>
              {submitted ? "고쳐서 다시 내기" : "선생님께 내기"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
