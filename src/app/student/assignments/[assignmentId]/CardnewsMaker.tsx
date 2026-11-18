"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CARD_COLORS,
  CARD_ICONS,
  CARD_MAX,
  CARD_MIN,
  LAYOUT_LABELS,
  LIMITS,
  MAX_SOURCES,
  STICKERS,
  checkCardnews,
  layoutAt,
  newCard,
  sourceCardOf,
  submitProblems,
  type Card,
  type CardnewsArtifact,
  type StepNo,
  type Warning,
} from "@/core/cardnews";
import { CardView, SourceCardView } from "@/components/CardView";
import { useArtifactSave } from "./useArtifactSave";

const STEPS: { no: StepNo; label: string }[] = [
  { no: 1, label: "계획" },
  { no: 2, label: "카드" },
  { no: 3, label: "점검" },
  { no: 4, label: "제출" },
];

const relayout = (cards: Card[]): Card[] => cards.map((c, i) => ({ ...c, layout: layoutAt(i, cards.length) }));

export function CardnewsMaker({
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
  initial: CardnewsArtifact;
  status: string;
  approved: boolean;
  reactions: Record<string, number>;
  reflection: string;
}) {
  const locked = !isOpen || approved;
  const { art, change, flush, state, error, safety, clearSafety } = useArtifactSave<CardnewsArtifact>(submissionId, initial, locked);
  const [sel, setSel] = useState(0);
  const [submitted, setSubmitted] = useState(status === "submitted");
  const [submitMsg, setSubmitMsg] = useState<{ ok: boolean; text: string; problems?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  // 잠긴 작품(승인됨·과제 닫힘)은 저장하지 않으므로 보는 단계만 화면에서 바꾼다.
  const [localStep, setLocalStep] = useState<StepNo | null>(null);
  const step = locked ? (localStep ?? art.step) : art.step;

  const warnings = useMemo(() => checkCardnews(art), [art]);
  const problems = useMemo(() => submitProblems(art), [art]);
  const card = art.cards[Math.min(sel, art.cards.length - 1)];
  const selIndex = art.cards.indexOf(card);

  const setPlan = (patch: Partial<CardnewsArtifact["plan"]>) => change({ ...art, plan: { ...art.plan, ...patch } });
  const setCard = (patch: Partial<Card>) => change({ ...art, cards: art.cards.map((c) => (c === card ? { ...c, ...patch } : c)) });
  const goStep = (to: StepNo) => (locked ? setLocalStep(to) : change({ ...art, step: to, maxStep: Math.max(art.maxStep, to) as StepNo }, true));
  const moveCard = (dir: -1 | 1) => {
    const j = selIndex + dir;
    if (j < 0 || j >= art.cards.length) return;
    const cards = [...art.cards];
    [cards[selIndex], cards[j]] = [cards[j], cards[selIndex]];
    change({ ...art, cards: relayout(cards) });
    setSel(j);
  };
  const addCard = () => {
    if (art.cards.length >= CARD_MAX) return;
    const cards = relayout([...art.cards.slice(0, -1), newCard(art.cards), art.cards[art.cards.length - 1]]);
    change({ ...art, cards });
    setSel(cards.length - 2);
  };
  const removeCard = () => {
    if (art.cards.length <= CARD_MIN) return;
    change({ ...art, cards: relayout(art.cards.filter((c) => c !== card)) });
    setSel(Math.max(0, selIndex - 1));
  };

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

  const goFix = (w: Warning) => {
    const i = art.cards.findIndex((c) => c.id === w.cardId);
    if (i >= 0) setSel(i);
    goStep(i >= 0 ? 2 : 1);
  };

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/student" className="text-sm text-stone-500 underline">← 목록으로</Link>
          <Link href={`/student/assignments/${assignmentId}/gallery`} className="btn-ghost px-3 py-1.5 text-sm">🖼️ 우리 반 갤러리</Link>
        </div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-stone-600">{prompt}</p>
      </header>

      <nav aria-label="만드는 순서" className="flex gap-1">
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
        <span data-testid="save-state">
          {locked ? (approved ? "공유가 승인되어 더 고칠 수 없어요" : "과제가 닫혔어요") : state === "saving" ? "저장 중…" : state === "saved" ? "저장했어요" : state === "error" ? "" : ""}
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
        <section className="card space-y-4" aria-label="1단계 계획">
          <h2 className="text-lg font-bold">1. 무엇을, 누구에게 알릴까요?</h2>
          <p className="rounded-lg bg-sun-100 px-3 py-2 text-sm">친구나 가족의 진짜 이름, 전화번호, 주소는 쓰지 않아요.</p>
          <Field id="topic" label="주제" max={LIMITS.topic} value={art.plan.topic} disabled={locked} onChange={(v) => setPlan({ topic: v })} placeholder="예: 손 씻기" />
          <Field id="audience" label="읽을 사람" max={LIMITS.audience} value={art.plan.audience} disabled={locked} onChange={(v) => setPlan({ audience: v })} placeholder="예: 3학년 동생들" />
          <Field id="keyMessage" label="전하고 싶은 핵심 한 문장" max={LIMITS.keyMessage} value={art.plan.keyMessage} disabled={locked} onChange={(v) => setPlan({ keyMessage: v })} placeholder="예: 비누로 30초 손을 씻으면 세균이 줄어요" />
          <fieldset className="space-y-2">
            <legend className="label">참고한 자료 (책, 누리집, 사람 …) 최대 {MAX_SOURCES}개</legend>
            {art.plan.sources.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input aria-label={`${i + 1}번 자료 이름`} className="input" maxLength={LIMITS.sourceTitle} disabled={locked} value={s.title} placeholder="자료 이름" onChange={(e) => setPlan({ sources: art.plan.sources.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                <input aria-label={`${i + 1}번 자료 어디에서`} className="input" maxLength={LIMITS.sourceWhere} disabled={locked} value={s.where} placeholder="어디에서 (책, 누리집 …)" onChange={(e) => setPlan({ sources: art.plan.sources.map((x, j) => (j === i ? { ...x, where: e.target.value } : x)) })} />
                <button type="button" className="btn-ghost px-3" disabled={locked} aria-label={`${i + 1}번 자료 지우기`} onClick={() => setPlan({ sources: art.plan.sources.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button type="button" className="btn-ghost text-sm" disabled={locked || art.plan.sources.length >= MAX_SOURCES} onClick={() => setPlan({ sources: [...art.plan.sources, { title: "", where: "" }] })}>+ 자료 추가</button>
          </fieldset>
          <button type="button" className="btn-primary" onClick={() => goStep(2)}>다음: 카드 만들기</button>
        </section>
      )}

      {step === 2 && card && (
        <section className="space-y-4" aria-label="2단계 카드 만들기">
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="카드 목록">
            {art.cards.map((c, i) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={c === card}
                onClick={() => setSel(i)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${c === card ? "border-brand-600 bg-brand-50 text-brand-700" : "border-black/10 bg-white"}`}
              >
                {i + 1}번 · {LAYOUT_LABELS[c.layout]}
              </button>
            ))}
            <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={locked || art.cards.length >= CARD_MAX} onClick={addCard}>+ 카드 추가</button>
          </div>
          <p className="text-xs text-stone-500">카드는 {CARD_MIN}~{CARD_MAX}장이에요. 첫 장은 표지, 마지막 장은 마무리 카드가 되고, 출처 카드는 맨 끝에 저절로 붙어요.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:order-2">
              <div className="mx-auto w-full max-w-sm md:sticky md:top-4">
                <CardView card={card} label={`${selIndex + 1}번 카드 미리보기`} />
              </div>
            </div>
            <div className="card space-y-4 md:order-1">
              <h2 className="text-lg font-bold">{selIndex + 1}번 카드 ({LAYOUT_LABELS[card.layout]})</h2>
              <Field id="card-title" label="제목 (짧게)" max={LIMITS.cardTitle} value={card.title} disabled={locked} onChange={(v) => setCard({ title: v })} />
              <div>
                <label className="label" htmlFor="card-body">본문 (두세 문장 이하)</label>
                <textarea id="card-body" className="input min-h-24" maxLength={LIMITS.cardBody} disabled={locked} value={card.body} onChange={(e) => setCard({ body: e.target.value })} />
                <p className="mt-1 text-right text-xs text-stone-500">{card.body.length}/{LIMITS.cardBody}</p>
              </div>
              <fieldset>
                <legend className="label">배경색</legend>
                <div className="flex flex-wrap gap-2" role="group" aria-label="배경색 고르기">
                  {CARD_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={locked}
                      aria-label={c.label}
                      aria-pressed={card.color === c.id}
                      onClick={() => setCard({ color: c.id })}
                      style={{ background: c.bg }}
                      className={`h-10 w-10 rounded-full border-2 ${card.color === c.id ? "border-brand-700 ring-2 ring-brand-200" : "border-black/20"}`}
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="label">그림 기호</legend>
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-8" role="group" aria-label="그림 기호 고르기">
                  {CARD_ICONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      disabled={locked}
                      aria-label={`그림 기호 ${ic}`}
                      aria-pressed={card.icon === ic}
                      onClick={() => setCard({ icon: ic })}
                      className={`h-10 rounded-lg border text-2xl ${card.icon === ic ? "border-brand-600 bg-brand-50" : "border-black/10 bg-white"}`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={locked || selIndex === 0} onClick={() => moveCard(-1)}>↑ 앞으로</button>
                <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={locked || selIndex === art.cards.length - 1} onClick={() => moveCard(1)}>↓ 뒤로</button>
                <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={locked || art.cards.length <= CARD_MIN} onClick={removeCard}>이 카드 지우기</button>
              </div>
            </div>
          </div>
          <details className="card">
            <summary className="cursor-pointer font-semibold">자동으로 붙는 출처 카드 보기</summary>
            <div className="mx-auto mt-3 w-full max-w-xs"><SourceCardView source={sourceCardOf(art.plan)} /></div>
          </details>
          <button type="button" className="btn-primary" onClick={() => goStep(3)}>다음: 스스로 점검</button>
        </section>
      )}

      {step === 3 && (
        <section className="card space-y-4" aria-label="3단계 스스로 점검">
          <h2 className="text-lg font-bold">3. 스스로 점검해 봐요</h2>
          <p className="text-sm text-stone-600">컴퓨터가 찾은 것은 참고만 해요. 고칠지 말지는 내가 정해요.</p>
          {warnings.length === 0 ? (
            <p data-testid="check-ok" className="rounded-lg bg-brand-50 px-3 py-2 text-brand-700">점검할 것이 없어요. 아주 잘 만들었어요!</p>
          ) : (
            <ul className="space-y-2" data-testid="check-list">
              {warnings.map((w) => (
                <li key={w.id} data-warning={w.kind} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p>{w.message}</p>
                    {w.spans && w.field && <Marked text={art.cards.find((c) => c.id === w.cardId)?.[w.field] ?? ""} spans={w.spans} />}
                  </div>
                  {w.kind !== "audience" && (
                    <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={() => goFix(w)}>
                      다시 보기
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(art.confirms.keyMessage || warnings.some((w) => w.id === "key-cover")) && (
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" disabled={locked} checked={art.confirms.keyMessage} onChange={(e) => change({ ...art, confirms: { ...art.confirms, keyMessage: e.target.checked } })} />
              <span>낱말은 달라도 표지에 내가 전하고 싶은 핵심 메시지가 들어 있어요.</span>
            </label>
          )}
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" disabled={locked} checked={art.confirms.audience} onChange={(e) => change({ ...art, confirms: { ...art.confirms, audience: e.target.checked } })} />
            <span>읽을 사람({art.plan.audience || "…"})이 이해할 수 있는 낱말로 썼어요.</span>
          </label>
          <button type="button" className="btn-primary" onClick={() => goStep(4)}>다음: 제출</button>
        </section>
      )}

      {step === 4 && (
        <section className="card space-y-4" aria-label="4단계 제출">
          <h2 className="text-lg font-bold">4. 선생님께 내요</h2>
          <p className="text-sm">경고 {warnings.length}개가 남아 있어요. 고치지 않고 내도 되지만, 한 번 더 살펴보면 더 좋아요.</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {art.cards.map((c, i) => (
              <CardView key={c.id} card={c} size="sm" label={`${i + 1}번 카드`} />
            ))}
            <SourceCardView source={sourceCardOf(art.plan)} size="sm" />
          </div>
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

function Field({ id, label, max, value, onChange, disabled, placeholder }: { id: string; label: string; max: number; value: string; onChange: (v: string) => void; disabled: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" maxLength={max} value={value} disabled={disabled} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <p className="mt-1 text-right text-xs text-stone-500">{value.length}/{max}</p>
    </div>
  );
}

function Marked({ text, spans }: { text: string; spans: { start: number; end: number }[] }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  spans.forEach((s, i) => {
    if (s.start > at) parts.push(text.slice(at, s.start));
    parts.push(<mark key={i} className="rounded bg-yellow-200 px-0.5">{text.slice(s.start, s.end)}</mark>);
    at = s.end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <p className="mt-1 break-words rounded bg-white/70 px-2 py-1" data-testid="marked-text">{parts}</p>;
}

/** 공유가 승인된 뒤: 받은 반응과 '반응을 보고 고칠 점' 한 줄 */
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
      <h2 className="text-lg font-bold">🎉 내 카드뉴스가 반 갤러리에 올라갔어요</h2>
      <Link href={`/student/assignments/${assignmentId}/gallery`} className="text-sm underline">갤러리에서 보기</Link>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="받은 스티커">
        {STICKERS.map((s) => (
          <li key={s.id} data-sticker={s.id} className="rounded-xl bg-stone-50 p-3 text-center text-sm">
            <div className="text-2xl" aria-hidden="true">{s.emoji}</div>
            <div>{s.label}</div>
            <div className="text-lg font-bold" data-testid={`got-${s.id}`}>{reactions[s.id] ?? 0}</div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-stone-600">받은 스티커 {total}개. 친구들의 반응을 보고 고치고 싶은 점을 한 줄로 적어 보세요.</p>
      <div>
        <label className="label" htmlFor="reflection">반응을 보고 고칠 점</label>
        <input id="reflection" className="input" maxLength={LIMITS.reflection} value={text} onChange={(e) => setText(e.target.value)} />
        <p className="mt-1 text-right text-xs text-stone-500">{text.length}/{LIMITS.reflection}</p>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} data-testid="reflection-msg" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-brand-50 text-brand-700" : "bg-orange-50 text-orange-950"}`}>{msg.text}</p>}
      <button type="button" className="btn-primary" onClick={save}>저장하기</button>
    </section>
  );
}
