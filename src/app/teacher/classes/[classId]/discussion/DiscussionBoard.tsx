"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DISCUSSION_LIMITS,
  PERSONAL_INFO_NOTICE,
  PHASE_LABELS,
  SIGNAL_LABELS,
  addOpinion,
  againTurn,
  balanceHint,
  choose,
  createDiscussion,
  discussionCsv,
  groupOpinions,
  nextTurn,
  personalInfoWarnings,
  removeOpinion,
  sanitizeDiscussion,
  setNotes,
  setPhase,
  setTopic,
  signalOf,
  skipTurn,
  turnPhase,
  ungroup,
  updateOpinion,
  type DiscussionOpinion,
  type DiscussionPhase,
  type DiscussionState,
  type Signal,
} from "@/core/discussion";

const MASK = "가려진 글";
const SIGNAL_STYLE: Record<Signal, string> = {
  green: "bg-green-600 text-white border-green-800",
  yellow: "bg-yellow-300 text-stone-900 border-yellow-600",
  red: "bg-red-600 text-white border-red-900",
};
const SIGNAL_MARK: Record<Signal, string> = { green: "●", yellow: "▲", red: "■" };

function fmt(sec: number) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function DiscussionBoard({ classId, numbers }: { classId: number; numbers: number[] }) {
  const storageKey = `narae-discussion-${classId}`;
  const [ds, setDs] = useState<DiscussionState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 이 기기의 브라우저 저장소에서 읽어요(서버로는 보내지 않아요).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setDs(sanitizeDiscussion(JSON.parse(raw)));
    } catch {
      /* 저장소를 못 써도 계속 동작해요 */
    }
    setLoaded(true);
  }, [storageKey]);

  const update = useCallback(
    (f: (s: DiscussionState) => DiscussionState) => {
      setDs((prev) => {
        if (!prev) return prev;
        const next = f(prev);
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* 무시 */
        }
        return next;
      });
    },
    [storageKey],
  );
  const start = (s: DiscussionState) => {
    setDs(s);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(s));
    } catch {
      /* 무시 */
    }
  };
  const reset = () => {
    setDs(null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* 무시 */
    }
  };

  const [canFull, setCanFull] = useState(false);
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    setCanFull(typeof document !== "undefined" && !!document.fullscreenEnabled);
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void rootRef.current?.requestFullscreen();
    } catch {
      /* 무시 */
    }
  };

  return (
    <div ref={rootRef} className="min-h-[70vh] bg-stone-50 px-4 py-6">
      <div className="mx-auto max-w-[1700px]">
        {!loaded ? (
          <p className="text-stone-500">불러오는 중이에요…</p>
        ) : ds ? (
          <Running ds={ds} update={update} onReset={reset} canFull={canFull} isFull={isFull} toggleFull={toggleFull} />
        ) : (
          <Setup numbers={numbers} onStart={start} />
        )}
      </div>
    </div>
  );
}

// ---------- 준비 화면 ----------

function Setup({ numbers, onStart }: { numbers: number[]; onStart: (s: DiscussionState) => void }) {
  const [topic, setTopicText] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [seconds, setSeconds] = useState(60);
  const [error, setError] = useState("");
  const L = DISCUSSION_LIMITS;
  const choices = numbers.filter((n) => n >= L.minNo && n <= L.maxNo);

  const toggle = (n: number) => {
    setError("");
    setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length >= L.maxMembers ? p : [...p, n]));
  };
  const go = () => {
    const r = createDiscussion(topic, picked, seconds);
    if (!r.ok) return setError(r.error);
    onStart(r.state);
  };

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🚦 토의 말차례 신호등</h1>
        <p className="mt-1 text-sm text-stone-600">
          이 화면의 내용은 이 컴퓨터(브라우저)에만 저장돼요. 서버로 보내지 않아요.
        </p>
      </div>
      <div className="card space-y-5">
        <label className="block">
          <span className="font-bold">토의 주제</span>
          <input
            className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-lg"
            value={topic}
            maxLength={L.topic}
            onChange={(e) => setTopicText(e.target.value)}
            placeholder="예: 우리 반 쉬는 시간을 어떻게 보낼까요?"
          />
        </label>
        <fieldset>
          <legend className="font-bold">
            함께 말할 친구 번호 <span className="text-sm font-normal text-stone-500">({L.minMembers}~{L.maxMembers}명, 고른 차례대로 말해요)</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {choices.length === 0 && <p className="text-sm text-stone-500">학급에 학생이 아직 없어요.</p>}
            {choices.map((n) => {
              const idx = picked.indexOf(n);
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={idx >= 0}
                  onClick={() => toggle(n)}
                  className={`h-12 min-w-12 rounded-full border-2 px-3 text-lg font-bold ${
                    idx >= 0 ? "border-brand-700 bg-brand-600 text-white" : "border-black/15 bg-white hover:bg-stone-50"
                  }`}
                >
                  {n}번{idx >= 0 && <span className="ml-1 text-xs">({idx + 1})</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-stone-500">{picked.length}명 골랐어요.</p>
        </fieldset>
        <label className="block">
          <span className="font-bold">한 사람이 말하는 시간</span>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="range"
              min={L.minSeconds}
              max={L.maxSeconds}
              step={10}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
              className="w-64"
              aria-label="말하는 시간(초)"
            />
            <span className="text-lg font-bold" data-testid="setup-seconds">{seconds}초</span>
          </div>
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary text-lg" onClick={go} disabled={picked.length < L.minMembers}>
          토의 시작
        </button>
      </div>
    </section>
  );
}

// ---------- 진행 화면 ----------

function Running({
  ds, update, onReset, canFull, isFull, toggleFull,
}: {
  ds: DiscussionState;
  update: (f: (s: DiscussionState) => DiscussionState) => void;
  onReset: () => void;
  canFull: boolean;
  isFull: boolean;
  toggleFull: () => void;
}) {
  // 타이머: performance.now 기준. 멈추면 지금까지 흐른 시간을 모아 둬요.
  const accum = useRef(0);
  const resumedAt = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const readElapsed = useCallback(
    () => (accum.current + (resumedAt.current === null ? 0 : performance.now() - resumedAt.current)) / 1000,
    [],
  );
  const restartTimer = useCallback(() => {
    accum.current = 0;
    resumedAt.current = performance.now();
    setPaused(false);
    setElapsed(0);
  }, []);
  useEffect(() => {
    restartTimer();
    const id = window.setInterval(() => setElapsed(readElapsed()), 200);
    return () => window.clearInterval(id);
  }, [restartTimer, readElapsed]);

  const togglePause = () => {
    if (resumedAt.current === null) {
      resumedAt.current = performance.now();
      setPaused(false);
    } else {
      accum.current = readElapsed() * 1000;
      resumedAt.current = null;
      setPaused(true);
    }
  };

  const doNext = () => { update((s) => nextTurn(s, readElapsed(), Date.now())); restartTimer(); };
  const doSkip = () => { update((s) => skipTurn(s, Date.now())); restartTimer(); };
  const doAgain = () => { update((s) => againTurn(s, readElapsed(), Date.now())); restartTimer(); };

  const signals = signalOf(ds);
  const phase = turnPhase(elapsed, ds.turnSeconds);
  const remaining = Math.max(0, ds.turnSeconds - elapsed);
  const hint = balanceHint(ds);
  const warnings = personalInfoWarnings(ds);
  const topicMasked = warnings.some((w) => w.field === "topic");
  const [editTopic, setEditTopic] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const download = () => {
    const blob = new Blob(["﻿" + discussionCsv(ds)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "토의-기록.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const timerBox =
    phase === "over"
      ? "border-red-700 bg-red-50 text-red-800"
      : phase === "almost"
        ? "border-amber-500 border-8 bg-yellow-100 text-amber-900 motion-safe:animate-pulse"
        : "border-black/10 bg-white text-stone-900";

  return (
    <div className="space-y-5">
      {/* 위쪽: 주제와 단계 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-stone-500">토의 주제</div>
          {editTopic ? (
            <input
              autoFocus
              aria-label="토의 주제 고치기"
              className="w-full rounded-lg border border-black/15 px-3 py-2 text-2xl font-bold"
              value={ds.topic}
              maxLength={DISCUSSION_LIMITS.topic}
              onChange={(e) => update((s) => setTopic(s, e.target.value))}
              onBlur={() => setEditTopic(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditTopic(false)}
            />
          ) : (
            <h1 data-testid="topic" className="break-words text-3xl font-bold lg:text-5xl">
              {topicMasked ? <span className="text-stone-500">{MASK}</span> : ds.topic || "(주제 없음)"}
              <button className="ml-3 align-middle text-sm font-normal text-stone-500 underline" onClick={() => setEditTopic(true)}>
                고치기
              </button>
            </h1>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canFull && (
            <button className="btn-ghost" onClick={toggleFull}>{isFull ? "전체 화면 끝내기" : "전체 화면"}</button>
          )}
          <button className="btn-ghost" onClick={download}>기록 내려받기(CSV)</button>
          {confirmReset ? (
            <span className="flex items-center gap-2 rounded-lg bg-red-50 px-3 text-sm">
              모두 지울까요?
              <button className="font-bold text-red-700 underline" onClick={onReset}>지우기</button>
              <button className="underline" onClick={() => setConfirmReset(false)}>취소</button>
            </span>
          ) : (
            <button className="btn-ghost" onClick={() => setConfirmReset(true)}>새로 시작</button>
          )}
        </div>
      </div>

      {warnings.length > 0 && (
        <div role="alert" data-testid="personal-warning" className="rounded-xl border-2 border-red-500 bg-red-50 p-4 text-lg font-bold text-red-800">
          ⚠ {PERSONAL_INFO_NOTICE} 가려진 글은 고칠 때까지 화면에 보이지 않아요.
        </div>
      )}

      <div role="tablist" aria-label="토의 단계" className="flex flex-wrap gap-2">
        {(Object.keys(PHASE_LABELS) as DiscussionPhase[]).map((p, i) => (
          <button
            key={p}
            role="tab"
            aria-selected={ds.phase === p}
            onClick={() => update((s) => setPhase(s, p))}
            className={`rounded-full border-2 px-5 py-2 text-lg font-bold ${
              ds.phase === p ? "border-brand-700 bg-brand-600 text-white" : "border-black/15 bg-white hover:bg-stone-50"
            }`}
          >
            {i + 1}. {PHASE_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* 신호등 */}
        <section aria-label="말차례 신호등" className="space-y-4">
          <div data-testid="timer" data-phase={phase} className={`rounded-2xl border-4 p-5 text-center ${timerBox}`}>
            <div className="text-lg font-bold">
              {ds.order[ds.current]}번 친구 차례{paused && " · 잠깐 멈췄어요"}
            </div>
            <div className="text-7xl font-extrabold tabular-nums lg:text-9xl" aria-live="off">{fmt(remaining)}</div>
            {phase === "almost" && <div className="text-2xl font-bold">곧 끝나요</div>}
            {phase === "over" && <div role="alert" className="text-3xl font-extrabold">시간이 다 됐어요</div>}
          </div>

          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {ds.order.map((no) => {
              const sig = signals[no];
              const turns = ds.members.find((m) => m.no === no)?.turns ?? 0;
              return (
                <li key={no} data-no={no} data-signal={sig} className="flex flex-col items-center gap-1 rounded-2xl bg-white p-3 text-center shadow-sm">
                  <div className={`flex h-24 w-24 items-center justify-center rounded-full border-4 text-4xl font-extrabold lg:h-32 lg:w-32 lg:text-5xl ${SIGNAL_STYLE[sig]}`}>
                    {no}
                  </div>
                  <div className="text-xl font-bold lg:text-2xl">
                    <span aria-hidden="true">{SIGNAL_MARK[sig]} </span>
                    {SIGNAL_LABELS[sig]}
                  </div>
                  <div className="text-base text-stone-600" data-testid={`turns-${no}`}>말한 횟수 {turns}번</div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap gap-3">
            <button className="btn-primary px-6 py-3 text-xl" onClick={doNext}>다음 사람</button>
            <button className="btn-ghost px-6 py-3 text-xl" onClick={doSkip}>건너뛰기(아직 생각 중)</button>
            <button className="btn-ghost px-6 py-3 text-xl" onClick={doAgain}>한 번 더 말하기</button>
            <button className="btn-ghost px-6 py-3 text-xl" onClick={togglePause} aria-pressed={paused}>
              {paused ? "다시 시작" : "일시정지"}
            </button>
          </div>
          {hint.message && (
            <p data-testid="balance-hint" className="rounded-xl bg-sun-100 px-4 py-3 text-lg font-bold">{hint.message}</p>
          )}
        </section>

        {/* 단계별 내용 */}
        <section aria-label={PHASE_LABELS[ds.phase]} className="space-y-4">
          <Opinions ds={ds} update={update} warnings={warnings} />
        </section>
      </div>
    </div>
  );
}

// ---------- 의견 카드 ----------

type Warn = ReturnType<typeof personalInfoWarnings>;

function Opinions({ ds, update, warnings }: { ds: DiscussionState; update: (f: (s: DiscussionState) => DiscussionState) => void; warnings: Warn }) {
  const [text, setText] = useState("");
  const [no, setNo] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<string[]>([]);
  const L = DISCUSSION_LIMITS;
  const full = ds.opinions.length >= L.opinions;
  const masked = (id: string, field: "text" | "good" | "worry") => warnings.some((w) => w.opinionId === id && w.field === field);

  const add = () => {
    if (!text.trim() || full) return;
    update((s) => addOpinion(s, { no, text }));
    setText("");
  };

  // 같은 묶음 카드를 이웃하게 보여 줘요.
  const groups = useMemo(() => {
    const ids: string[] = [];
    for (const o of ds.opinions) if (o.group && !ids.includes(o.group)) ids.push(o.group);
    return ids;
  }, [ds.opinions]);
  const sorted = useMemo(() => {
    const out: DiscussionOpinion[] = [];
    const seen = new Set<string>();
    for (const o of ds.opinions) {
      if (o.group) {
        if (seen.has(o.group)) continue;
        seen.add(o.group);
        out.push(...ds.opinions.filter((x) => x.group === o.group));
      } else out.push(o);
    }
    return out;
  }, [ds.opinions]);

  const selectedValid = selected.filter((id) => ds.opinions.some((o) => o.id === id));
  const chosen = ds.opinions.filter((o) => o.chosen);

  return (
    <div className="space-y-4">
      {ds.phase === "share" && (
        <div className="card space-y-3">
          <h2 className="text-xl font-bold">의견 카드 만들기</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="말한 친구 번호">
            <button type="button" aria-pressed={no === undefined} onClick={() => setNo(undefined)}
              className={`rounded-full border-2 px-3 py-1 font-bold ${no === undefined ? "border-brand-700 bg-brand-600 text-white" : "border-black/15 bg-white"}`}>
              번호 없음
            </button>
            {ds.order.map((n) => (
              <button key={n} type="button" aria-pressed={no === n} onClick={() => setNo(n)}
                className={`rounded-full border-2 px-3 py-1 font-bold ${no === n ? "border-brand-700 bg-brand-600 text-white" : "border-black/15 bg-white"}`}>
                {n}번
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              aria-label="의견"
              className="min-w-0 flex-1 rounded-lg border border-black/15 px-3 py-2 text-lg"
              value={text}
              maxLength={L.text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="친구의 의견을 짧게 적어요"
            />
            <button className="btn-primary" onClick={add} disabled={full || !text.trim()}>카드 붙이기</button>
          </div>
          {full && <p className="text-sm text-stone-600">카드는 {L.opinions}장까지 붙일 수 있어요.</p>}
        </div>
      )}

      {ds.phase === "compare" && (
        <p className="rounded-xl bg-brand-50 px-4 py-3 text-lg">카드마다 좋은 점과 걱정되는 점을 써 보며 의견을 비교해요.</p>
      )}

      {ds.phase === "adjust" && (
        <div className="card space-y-3">
          <p className="text-lg">비슷한 카드를 여러 개 골라 묶어요. 그다음 함께 정한 의견에 별(★)을 달아요.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={selectedValid.length < 2}
              onClick={() => { update((s) => groupOpinions(s, selectedValid)); setSelected([]); }}>
              고른 카드 묶기 ({selectedValid.length}장)
            </button>
            {groups.map((g, i) => (
              <button key={g} className="btn-ghost text-sm" onClick={() => update((s) => ungroup(s, g))}>묶음 {i + 1} 풀기</button>
            ))}
          </div>
          {chosen.length > 0 && (
            <div data-testid="chosen-list" className="rounded-xl bg-sun-100 p-3">
              <div className="font-bold">★ 함께 정한 의견</div>
              <ul className="list-disc pl-5 text-lg">
                {chosen.map((o) => <li key={o.id}>{masked(o.id, "text") ? MASK : o.text}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {ds.opinions.length === 0 && <p className="card text-stone-600">아직 의견 카드가 없어요. ‘1. 의견 내기’에서 카드를 붙여 봐요.</p>}

      <ul className="grid gap-3 sm:grid-cols-2">
        {sorted.map((o) => (
          <OpinionCard
            key={o.id}
            o={o}
            ds={ds}
            update={update}
            groupNo={o.group ? groups.indexOf(o.group) + 1 : 0}
            maskedText={masked(o.id, "text")}
            maskedGood={masked(o.id, "good")}
            maskedWorry={masked(o.id, "worry")}
            selected={selected.includes(o.id)}
            onSelect={() => setSelected((p) => (p.includes(o.id) ? p.filter((x) => x !== o.id) : [...p, o.id]))}
          />
        ))}
      </ul>
    </div>
  );
}

function OpinionCard({
  o, ds, update, groupNo, maskedText, maskedGood, maskedWorry, selected, onSelect,
}: {
  o: DiscussionOpinion;
  ds: DiscussionState;
  update: (f: (s: DiscussionState) => DiscussionState) => void;
  groupNo: number;
  maskedText: boolean;
  maskedGood: boolean;
  maskedWorry: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const L = DISCUSSION_LIMITS;
  return (
    <li
      data-testid="opinion-card"
      data-id={o.id}
      className={`space-y-2 rounded-2xl border-2 bg-white p-4 shadow-sm ${o.chosen ? "border-amber-500 bg-yellow-50" : selected ? "border-brand-600" : "border-black/10"}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {o.no !== undefined && <span className="rounded-full bg-stone-100 px-2 py-0.5 font-bold">{o.no}번</span>}
        {groupNo > 0 && <span className="rounded-full bg-brand-100 px-2 py-0.5 font-bold text-brand-700">묶음 {groupNo}</span>}
        {o.chosen && <span className="font-bold text-amber-700">★ 함께 정했어요</span>}
      </div>

      {editing ? (
        <div className="space-y-2">
          <input aria-label="의견 고치기" className="w-full rounded-lg border border-black/15 px-3 py-2" value={o.text} maxLength={L.text}
            onChange={(e) => update((s) => updateOpinion(s, o.id, { text: e.target.value }))} />
          <select aria-label="말한 친구 번호" className="rounded-lg border border-black/15 px-2 py-1" value={o.no ?? ""}
            onChange={(e) => update((s) => updateOpinion(s, o.id, { no: e.target.value === "" ? null : Number(e.target.value) }))}>
            <option value="">번호 없음</option>
            {ds.order.map((n) => <option key={n} value={n}>{n}번</option>)}
          </select>
          <div className="flex gap-3 text-sm">
            <button className="font-bold text-brand-700 underline" onClick={() => setEditing(false)}>다 고쳤어요</button>
            <button className="text-red-700 underline" onClick={() => { update((s) => removeOpinion(s, o.id)); setEditing(false); }}>카드 떼기</button>
          </div>
        </div>
      ) : (
        <p className="break-words text-xl font-bold">
          {maskedText ? <span className="text-stone-500">{MASK}</span> : o.text}
        </p>
      )}

      {ds.phase === "compare" ? (
        <div className="space-y-2">
          <Note label="좋은 점" value={o.good} masked={maskedGood} max={L.note} onChange={(v) => update((s) => setNotes(s, o.id, { good: v }))} />
          <Note label="걱정되는 점" value={o.worry} masked={maskedWorry} max={L.note} onChange={(v) => update((s) => setNotes(s, o.id, { worry: v }))} />
        </div>
      ) : (
        <>
          {o.good && <p className="text-base">👍 좋은 점: {maskedGood ? MASK : o.good}</p>}
          {o.worry && <p className="text-base">🤔 걱정되는 점: {maskedWorry ? MASK : o.worry}</p>}
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {!editing && <button className="text-stone-600 underline" onClick={() => setEditing(true)}>고치기</button>}
        {ds.phase === "adjust" && (
          <>
            <label className="flex items-center gap-1 font-bold">
              <input type="checkbox" checked={selected} onChange={onSelect} className="h-5 w-5" /> 묶을 카드
            </label>
            <button
              className={`rounded-full border-2 px-3 py-1 font-bold ${o.chosen ? "border-amber-500 bg-amber-100" : "border-black/15 bg-white"}`}
              aria-pressed={o.chosen}
              onClick={() => update((s) => choose(s, o.id))}
            >
              {o.chosen ? "★ 함께 정함" : "☆ 함께 정하기"}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function Note({ label, value, masked, max, onChange }: { label: string; value: string; masked: boolean; max: number; onChange: (v: string) => void }) {
  const [reveal, setReveal] = useState(false);
  if (masked && !reveal) {
    return (
      <div className="text-sm">
        <span className="font-bold">{label}</span>: <span className="text-stone-500">{MASK}</span>{" "}
        <button className="underline" onClick={() => setReveal(true)}>고치기</button>
      </div>
    );
  }
  return (
    <label className="block text-sm">
      <span className="font-bold">{label}</span>
      <input className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-base" value={value} maxLength={max}
        onChange={(e) => onChange(e.target.value)} onBlur={() => setReveal(false)} />
    </label>
  );
}
