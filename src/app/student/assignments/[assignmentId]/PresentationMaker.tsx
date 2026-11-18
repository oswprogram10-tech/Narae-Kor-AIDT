"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AID_LABELS,
  POINT_MAX,
  PRACTICE_MAX,
  PRESENTATION_AIDS,
  PRESENTATION_LIMITS as L,
  PRESENTATION_PURPOSES,
  PURPOSE_LABELS,
  SELF_CHECK_ITEMS,
  SELF_CHECK_LEVELS,
  SOURCE_MAX,
  checkPresentation,
  estimateSeconds,
  formatSeconds,
  memoChars,
  newPoint,
  newPresentationSource,
  presentationSubmitProblems,
  type PresentationArtifact,
  type PresentationPoint,
  type PresentationSource,
  type PresentationWarning,
} from "@/core/speaking";
import { PracticeBars, PresentationStopwatch } from "./PresentationPractice";
import { Marked, SafetyBox, SaveLine, StepTabs, useSubmit, Warn } from "./SpeakingParts";
import { useArtifactSave } from "./useArtifactSave";

const TABS = ["계획", "자료 고르기", "짜임표", "스스로 점검", "발표 연습", "제출"] as const;
const TRUST_ITEMS = [
  { id: "who", label: "누가 만들었는지 알 수 있어요" },
  { id: "when", label: "언제 만들었는지 알 수 있어요" },
  { id: "evidence", label: "근거(자료·출처)가 있어요" },
] as const;

export function PresentationMaker({
  submissionId,
  title,
  prompt,
  targetSeconds,
  isOpen,
  initial,
  status,
}: {
  submissionId: number;
  title: string;
  prompt: string;
  /** 교사가 정한 목표 발표 시간(초) */
  targetSeconds: number;
  isOpen: boolean;
  initial: PresentationArtifact;
  status: string;
}) {
  const locked = !isOpen;
  const { art, change, flush, state, error, safety, clearSafety } = useArtifactSave<PresentationArtifact>(submissionId, initial, locked);
  const [tab, setTab] = useState(1);
  // 점검 단계를 본 뒤부터는 빠진 것 안내도 해당 칸 옆에 보여 준다(쓰는 도중에는 과장 표현 안내만 바로 보여 준다)
  const [checked, setChecked] = useState(false);
  const { submitted, busy, msg, submit } = useSubmit(submissionId, flush, status === "submitted", "선생님께 냈어요. 발표 준비를 끝까지 해서 멋져요! 고치고 싶으면 고쳐서 다시 낼 수 있어요.");
  const warnings = useMemo(() => checkPresentation(art, targetSeconds), [art, targetSeconds]);
  const problems = useMemo(() => presentationSubmitProblems(art), [art]);
  const upper = art.band === "5-6";

  const go = (n: number) => {
    setTab(n);
    if (n === 4) setChecked(true);
  };
  const warnFor = (key: string): PresentationWarning[] => warnings.filter((w) => w.target === key && (checked || w.kind === "exaggeration"));

  const setSource = (id: string, patch: Partial<PresentationSource>) => change({ ...art, sources: art.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const setPoint = (id: string, patch: Partial<PresentationPoint>, immediate = false) => change({ ...art, points: art.points.map((p) => (p.id === id ? { ...p, ...patch } : p)) }, immediate);

  const sourceName = (s: PresentationSource, i: number) => s.name.trim() || `자료 ${i + 1}`;

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
  const counter = (text: string, max: number) => <p className="mt-1 text-right text-xs text-stone-500">{Array.from(text).length}/{max}</p>;

  const where = (w: PresentationWarning): number => {
    if (w.kind === "no-topic" || w.kind === "no-purpose") return 1;
    if (w.kind === "source-no-from" || w.kind === "source-unused" || w.target?.startsWith("source.")) return 2;
    if (w.kind === "time-estimate" || w.kind === "practice-time") return 5;
    return 3;
  };
  const textOf = (key: string): string => {
    if (key === "topic" || key === "opening" || key === "closing") return art[key];
    const s = /^source\.([a-z0-9]+)\.(name|from|keyInfo)$/.exec(key);
    if (s) return art.sources.find((x) => x.id === s[1])?.[s[2] as "name" | "from" | "keyInfo"] ?? "";
    const p = /^point\.([a-z0-9]+)\.text$/.exec(key);
    return p ? (art.points.find((x) => x.id === p[1])?.text ?? "") : "";
  };

  const est = estimateSeconds(art);

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header className="space-y-2">
        <Link href="/student" className="text-sm text-stone-500 underline">← 목록으로</Link>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="rounded-xl border border-black/10 bg-white p-3 text-stone-700">{prompt}</p>
        <p className="rounded-lg bg-sun-100 px-3 py-2 text-sm">
          내 발표 준비는 선생님만 볼 수 있어요. 칸에는 발표 원고가 아니라 <b>짧은 메모</b>만 써요. 친구의 진짜 이름, 전화번호, 주소는 쓰지 않아요. 연습할 때 소리나 모습을 녹음·촬영하지 않아요.
        </p>
      </header>

      <StepTabs steps={TABS} current={tab} onGo={go} />
      <SaveLine locked={locked} lockedText="과제가 닫혔어요" state={state} error={error} />
      <SafetyBox safety={safety} onClose={clearSafety} />

      {tab === 1 && (
        <section className="card space-y-4" aria-label="1단계 계획">
          <h2 className="text-lg font-bold">무엇을, 왜, 누구에게 발표할까요?</h2>
          <div>
            <label className="label" htmlFor="topic">발표 주제</label>
            <input id="topic" className="input" maxLength={L.topic} disabled={locked} value={art.topic} onChange={(e) => change({ ...art, topic: e.target.value })} placeholder="예: 우리 동네 재활용 이야기" />
            {counter(art.topic, L.topic)}
            {fieldWarn("topic", art.topic)}
          </div>
          <fieldset>
            <legend className="label">발표 목적</legend>
            <div role="group" aria-label="발표 목적 고르기" className="grid gap-2 sm:grid-cols-3">
              {PRESENTATION_PURPOSES.map((p) => (
                <button
                  key={p}
                  type="button"
                  data-purpose={p}
                  disabled={locked}
                  aria-pressed={art.purpose === p}
                  onClick={() => change({ ...art, purpose: p }, true)}
                  className={`min-h-12 rounded-2xl border-2 px-3 py-2 font-bold ${art.purpose === p ? "border-brand-600 bg-brand-600 text-white" : "border-stone-300 bg-white text-stone-800 hover:bg-stone-50"}`}
                >
                  {art.purpose === p && "✓ "}
                  {PURPOSE_LABELS[p]}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="audience">듣는 사람 (선택)</label>
            <input id="audience" className="input" maxLength={L.audience} disabled={locked} value={art.audience} onChange={(e) => change({ ...art, audience: e.target.value })} placeholder="예: 우리 반 친구들" />
            {counter(art.audience, L.audience)}
          </div>
          <button type="button" className="btn-primary min-h-11" onClick={() => go(2)}>다음: 자료 고르기</button>
        </section>
      )}

      {tab === 2 && (
        <section className="card space-y-4" aria-label="2단계 자료 고르기">
          <h2 className="text-lg font-bold">발표에 쓸 자료를 골라요</h2>
          <p className="text-stone-700">자료마다 이름, 어디에서 알게 됐는지(출처), 그 자료에서 쓸 핵심 정보를 짧게 적어요. 최대 {SOURCE_MAX}개예요.</p>
          <ul className="space-y-3">
            {art.sources.map((s, i) => (
              <li key={s.id} data-source={s.id} className="space-y-2 rounded-2xl border-2 border-stone-400 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold">📚 자료 {i + 1}</h3>
                  <button
                    type="button"
                    className="min-h-11 min-w-11 rounded-xl border border-black/15 px-3 text-sm hover:bg-stone-50 disabled:opacity-50"
                    disabled={locked || art.sources.length <= 1}
                    aria-label={`자료 ${i + 1} 지우기`}
                    onClick={() =>
                      change(
                        { ...art, sources: art.sources.filter((x) => x.id !== s.id), points: art.points.map((p) => ({ ...p, sourceIds: p.sourceIds.filter((id) => id !== s.id) })) },
                        true,
                      )
                    }
                  >
                    지우기
                  </button>
                </div>
                <div>
                  <label className="label" htmlFor={`sn-${s.id}`}>자료 이름</label>
                  <input id={`sn-${s.id}`} className="input" maxLength={L.name} disabled={locked} value={s.name} onChange={(e) => setSource(s.id, { name: e.target.value })} placeholder="예: 환경 도서관 책" />
                  {fieldWarn(`source.${s.id}.name`, s.name)}
                </div>
                <div>
                  <label className="label" htmlFor={`sf-${s.id}`}>출처 (어디에서 알게 됐나요?)</label>
                  <input id={`sf-${s.id}`} className="input" maxLength={L.from} disabled={locked} value={s.from} onChange={(e) => setSource(s.id, { from: e.target.value })} placeholder="예: 학교 도서관, 구청 누리집" />
                  {fieldWarn(`source.${s.id}.from`, s.from)}
                </div>
                <div>
                  <label className="label" htmlFor={`sk-${s.id}`}>이 자료에서 쓸 핵심 정보 (한 줄)</label>
                  <input id={`sk-${s.id}`} className="input" maxLength={L.keyInfo} disabled={locked} value={s.keyInfo} onChange={(e) => setSource(s.id, { keyInfo: e.target.value })} />
                  {counter(s.keyInfo, L.keyInfo)}
                  {fieldWarn(`source.${s.id}.keyInfo`, s.keyInfo)}
                </div>
                {upper && s.trust && (
                  <fieldset className="rounded-xl bg-stone-50 p-2" data-testid={`trust-${s.id}`}>
                    <legend className="px-1 text-sm font-semibold">이 자료는 믿을 만한가요? (스스로 체크)</legend>
                    {TRUST_ITEMS.map((t) => (
                      <label key={t.id} className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          disabled={locked}
                          checked={s.trust![t.id]}
                          onChange={(e) => setSource(s.id, { trust: { ...s.trust!, [t.id]: e.target.checked } })}
                        />
                        {t.label}
                      </label>
                    ))}
                  </fieldset>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-ghost min-h-11"
            disabled={locked || art.sources.length >= SOURCE_MAX}
            onClick={() => {
              const s = newPresentationSource(art.sources, art.band);
              if (s) change({ ...art, sources: [...art.sources, s] }, true);
            }}
          >
            + 자료 더하기 ({art.sources.length}/{SOURCE_MAX})
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost min-h-11" onClick={() => go(1)}>이전</button>
            <button type="button" className="btn-primary min-h-11" onClick={() => go(3)}>다음: 짜임표</button>
          </div>
        </section>
      )}

      {tab === 3 && (
        <section className="card space-y-4" aria-label="3단계 짜임표">
          <h2 className="text-lg font-bold">처음 · 가운데 · 끝 짜임표</h2>
          <p className="text-stone-700">칸마다 <b>짧은 메모</b>만 적어요. 가운데에는 중요한 내용을 2~3개 쓰고, 내용마다 쓸 자료를 눌러 이어 줘요.</p>
          <div className="space-y-3">
            <div data-part="opening" className="rounded-2xl border-4 border-brand-600 bg-brand-50 p-3">
              <label className="label" htmlFor="opening">처음 (인사 · 주제 · 관심 끌기)</label>
              <textarea id="opening" className="input min-h-16" maxLength={L.opening} disabled={locked} value={art.opening} onChange={(e) => change({ ...art, opening: e.target.value })} />
              {counter(art.opening, L.opening)}
              {fieldWarn("opening", art.opening)}
            </div>
            <div aria-hidden="true" className="mx-auto h-4 w-1 bg-stone-500" />
            <div data-part="middle" className="space-y-3 rounded-2xl border-4 border-stone-500 bg-white p-3">
              <h3 className="font-bold">가운데 (중요한 내용 2~3개)</h3>
              <ul className="space-y-3">
                {art.points.map((p, i) => (
                  <li key={p.id} data-point={p.id} className="space-y-2 rounded-xl border-2 border-stone-300 bg-stone-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <label className="font-bold" htmlFor={`pt-${p.id}`}>{i + 1}번 내용</label>
                      <button
                        type="button"
                        className="min-h-11 min-w-11 rounded-xl border border-black/15 px-3 text-sm hover:bg-white disabled:opacity-50"
                        disabled={locked || art.points.length <= 1}
                        aria-label={`${i + 1}번 내용 지우기`}
                        onClick={() => change({ ...art, points: art.points.filter((x) => x.id !== p.id) }, true)}
                      >
                        지우기
                      </button>
                    </div>
                    <textarea id={`pt-${p.id}`} className="input min-h-16" maxLength={L.point} disabled={locked} value={p.text} onChange={(e) => setPoint(p.id, { text: e.target.value })} />
                    {counter(p.text, L.point)}
                    {fieldWarn(`point.${p.id}.text`, p.text)}
                    <div role="group" aria-label={`${i + 1}번 내용에 쓸 자료`}>
                      <div className="mb-1 text-sm font-semibold">쓸 자료 고르기</div>
                      {art.sources.some((s) => s.name.trim() || s.keyInfo.trim()) ? (
                        <div className="flex flex-wrap gap-2">
                          {art.sources.map((s, si) =>
                            s.name.trim() || s.keyInfo.trim() ? (
                              <button
                                key={s.id}
                                type="button"
                                data-chip={s.id}
                                disabled={locked}
                                aria-pressed={p.sourceIds.includes(s.id)}
                                onClick={() => setPoint(p.id, { sourceIds: p.sourceIds.includes(s.id) ? p.sourceIds.filter((x) => x !== s.id) : [...p.sourceIds, s.id] }, true)}
                                className={`min-h-11 rounded-full border-2 px-3 text-sm font-semibold ${p.sourceIds.includes(s.id) ? "border-brand-600 bg-brand-600 text-white" : "border-stone-300 bg-white text-stone-800 hover:bg-stone-50"}`}
                              >
                                {p.sourceIds.includes(s.id) && "✓ "}
                                {sourceName(s, si)}
                              </button>
                            ) : null,
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-stone-600">2단계에서 자료의 이름이나 핵심 정보를 적으면 여기에서 고를 수 있어요.</p>
                      )}
                    </div>
                    {upper && (
                      <div role="group" aria-label={`${i + 1}번 내용의 보조 매체`}>
                        <div className="mb-1 text-sm font-semibold">보조 매체 고르기 (보여 줄 것)</div>
                        <div className="flex flex-wrap gap-2">
                          {PRESENTATION_AIDS.map((aid) => (
                            <button
                              key={aid}
                              type="button"
                              data-aid={aid}
                              disabled={locked}
                              aria-pressed={p.aid === aid}
                              onClick={() => setPoint(p.id, { aid: p.aid === aid ? null : aid }, true)}
                              className={`min-h-11 rounded-full border-2 px-3 text-sm font-semibold ${p.aid === aid ? "border-brand-600 bg-brand-600 text-white" : "border-stone-300 bg-white text-stone-800 hover:bg-stone-50"}`}
                            >
                              {p.aid === aid && "✓ "}
                              {AID_LABELS[aid]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn-ghost min-h-11"
                disabled={locked || art.points.length >= POINT_MAX}
                onClick={() => {
                  const p = newPoint(art.points);
                  if (p) change({ ...art, points: [...art.points, p] }, true);
                }}
              >
                + 내용 더하기 ({art.points.length}/{POINT_MAX})
              </button>
            </div>
            <div aria-hidden="true" className="mx-auto h-4 w-1 bg-stone-500" />
            <div data-part="closing" className="rounded-2xl border-4 border-brand-600 bg-brand-50 p-3">
              <label className="label" htmlFor="closing">끝 (내용 정리 · 마무리 인사)</label>
              <textarea id="closing" className="input min-h-16" maxLength={L.closing} disabled={locked} value={art.closing} onChange={(e) => change({ ...art, closing: e.target.value })} />
              {counter(art.closing, L.closing)}
              {fieldWarn("closing", art.closing)}
            </div>
          </div>
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
          <p className="text-sm text-stone-600" data-testid="estimate">
            참고: 메모 글자 수로 어림한 발표 시간은 약 {memoChars(art) > 0 ? formatSeconds(est) : "0초"}이에요(어림이라 실제와 달라요). 목표 시간은 {formatSeconds(targetSeconds)}예요.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost min-h-11" onClick={() => go(3)}>이전</button>
            <button type="button" className="btn-primary min-h-11" onClick={() => go(5)}>다음: 발표 연습</button>
          </div>
        </section>
      )}

      {tab === 5 && (
        <section className="card space-y-5" aria-label="5단계 발표 연습">
          <h2 className="text-lg font-bold">발표 연습</h2>
          <p className="text-stone-700">짜임표를 보며 소리 내어 발표해 봐요. 다 말하면 ‘기록하기’를 눌러요.</p>
          <PresentationStopwatch targetSeconds={targetSeconds} runs={art.practice.length} locked={locked} onRecord={(sec) => change({ ...art, practice: [...art.practice, sec].slice(0, PRACTICE_MAX) }, true)} />
          <div className="space-y-2">
            <h3 className="font-bold">연습 기록 ({art.practice.length}/10)</h3>
            <PracticeBars practice={art.practice} targetSeconds={targetSeconds} />
            {warnings.filter((w) => w.kind === "practice-time").map((w) => (
              <p key={w.id} data-warning={w.kind} className="rounded-xl border border-sun-400 bg-sun-100 p-3 text-sm">💡 {w.message}</p>
            ))}
          </div>
          <div className="space-y-2">
            <h3 className="font-bold">연습한 뒤 돌아봐요</h3>
            <p className="text-sm text-stone-600">스스로 생각해서 눌러요. 점수가 아니라 다음 연습에 도움이 되는 표시예요.</p>
            <ul className="space-y-3">
              {SELF_CHECK_ITEMS.map((item) => (
                <li key={item.id} data-self={item.id} className="rounded-xl border border-black/10 bg-white p-3">
                  <div className="font-bold">{item.label} <span className="text-sm font-normal text-stone-600">· {item.hint}</span></div>
                  <div role="group" aria-label={`${item.label} 돌아보기`} className="mt-2 grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((lv) => (
                      <button
                        key={lv}
                        type="button"
                        data-level={lv}
                        disabled={locked}
                        aria-pressed={art.selfCheck[item.id] === lv}
                        onClick={() => change({ ...art, selfCheck: { ...art.selfCheck, [item.id]: art.selfCheck[item.id] === lv ? 0 : lv } }, true)}
                        className={`min-h-11 rounded-xl border-2 px-2 text-sm font-semibold ${art.selfCheck[item.id] === lv ? "border-brand-600 bg-brand-600 text-white" : "border-stone-300 bg-white text-stone-800 hover:bg-stone-50"}`}
                      >
                        {art.selfCheck[item.id] === lv && "✓ "}
                        {SELF_CHECK_LEVELS[lv]}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
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
          <div>
            <label className="label" htmlFor="reflection">연습한 뒤 한 줄 (선택)</label>
            <textarea id="reflection" className="input min-h-20" maxLength={L.reflection} disabled={locked} value={art.reflection} onChange={(e) => change({ ...art, reflection: e.target.value })} placeholder="연습하며 알게 된 것이나 다음에 더 잘하고 싶은 점" />
            {counter(art.reflection, L.reflection)}
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
