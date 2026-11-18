"use client";

// 토론 타이머. 학생 기기 안에서만 돌고 서버에 저장하지 않으며, 녹음도 하지 않는다.
// 경과 시간은 performance.now()로 재고, 단계·남은 시간은 핵심부의 timerState로 구한다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { timerState, totalSeconds, type DebateStep } from "@/core/speaking";

const SIDE_LABEL = { pro: "찬성", con: "반대", both: "작전" } as const;
const SIDE_STYLE = {
  pro: "bg-blue-700 text-white",
  con: "bg-orange-700 text-white",
  both: "bg-stone-700 text-white",
} as const;
const SIDE_SOFT = {
  pro: "border-blue-700 bg-blue-50",
  con: "border-orange-700 bg-orange-50",
  both: "border-stone-500 bg-stone-100",
} as const;
const SIDE_MARK = { pro: "▲", con: "▼", both: "●" } as const;

const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
const TICK_MS = 200;

export function DebateTimer({ steps, mySide }: { steps: DebateStep[]; mySide: "pro" | "con" | null }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [beep, setBeep] = useState(true);
  const base = useRef(0); // 멈출 때까지 쌓인 경과 ms
  const startedAt = useRef(0); // 돌기 시작한 performance.now()
  const audio = useRef<AudioContext | null>(null);
  const lastIndex = useRef(0);
  const skipAlert = useRef(false); // '다음 단계'를 직접 누른 때는 끝났다고 알리지 않는다

  const state = useMemo(() => timerState(steps, elapsedMs / 1000), [steps, elapsedMs]);
  const total = totalSeconds(steps);
  const startOf = useCallback((index: number) => steps.slice(0, index).reduce((n, s) => n + s.seconds, 0), [steps]);

  const sound = useCallback(() => {
    try {
      const ctx = audio.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.12;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      /* 소리가 안 나도 화면 알림이 있다 */
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const ms = base.current + (performance.now() - startedAt.current);
      if (ms >= total * 1000) {
        base.current = total * 1000;
        setRunning(false);
        setElapsedMs(total * 1000);
        return;
      }
      setElapsedMs(ms);
    }, TICK_MS);
    return () => clearInterval(t);
  }, [running, total]);

  // 단계가 바뀌거나 끝나면 화면에 알린다(소리는 선택)
  useEffect(() => {
    if (state.index === lastIndex.current && !(state.done && elapsedMs > 0)) return;
    if (skipAlert.current) {
      skipAlert.current = false;
    } else if (state.done && elapsedMs > 0) {
      setAlert("토론 시간이 모두 끝났어요. 수고했어요!");
      sound();
    } else if (state.index > lastIndex.current) {
      const prev = steps[lastIndex.current];
      const next = steps[state.index];
      setAlert(`‘${prev.label}’ 시간이 끝났어요. 다음은 ‘${next.label}’이에요.`);
      if (beep) sound();
    }
    lastIndex.current = state.index;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.index, state.done]);

  function start() {
    if (state.done) return;
    if (beep && !audio.current) {
      try {
        audio.current = new AudioContext();
      } catch {
        audio.current = null;
      }
    }
    startedAt.current = performance.now();
    setRunning(true);
  }
  function pause() {
    base.current += performance.now() - startedAt.current;
    setRunning(false);
  }
  function reset() {
    base.current = 0;
    lastIndex.current = 0;
    setRunning(false);
    setElapsedMs(0);
    setAlert(null);
  }
  function nextStep() {
    if (state.index < 0 || state.index >= steps.length - 1) return;
    base.current = startOf(state.index + 1) * 1000;
    skipAlert.current = true;
    startedAt.current = performance.now();
    setElapsedMs(base.current);
    setAlert(null);
  }

  const current = state.index >= 0 ? steps[state.index] : null;
  const pct = current ? Math.round(((current.seconds - state.remaining) / current.seconds) * 100) : 0;
  const mine = current && mySide && (current.side === mySide) ? "내 차례예요" : null;

  return (
    <section aria-label="토론 타이머" className="space-y-4" data-testid="debate-timer">
      {alert && (
        <div role="alert" data-testid="timer-alert" className="flex items-start justify-between gap-3 rounded-xl border-2 border-sun-400 bg-sun-100 p-3 font-semibold text-stone-900">
          <span>⏰ {alert}</span>
          <button type="button" className="min-h-11 shrink-0 text-sm underline" onClick={() => setAlert(null)}>닫기</button>
        </div>
      )}

      {current && (
        <div className={`rounded-2xl border-4 p-4 text-center ${SIDE_SOFT[current.side]}`} data-testid="timer-current" data-side={current.side}>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className={`rounded-full px-3 py-1 text-base font-bold ${SIDE_STYLE[current.side]}`}>
              {SIDE_MARK[current.side]} {SIDE_LABEL[current.side]}
            </span>
            {mine && <span className="rounded-full border border-stone-700 bg-white px-3 py-1 text-sm font-bold">{mine}</span>}
          </div>
          <div className="mt-2 text-2xl font-bold" data-testid="timer-label">{current.label}</div>
          <div role="timer" aria-label="남은 시간" className="mt-1 text-6xl font-bold tabular-nums" data-testid="timer-remaining">
            {mmss(state.remaining)}
          </div>
          <div className="mx-auto mt-3 h-3 max-w-md overflow-hidden rounded-full bg-white/80" aria-hidden="true">
            <div className="h-full bg-stone-700 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-sm text-stone-700">
            {state.index + 1}/{steps.length} 단계 · 전체 남은 시간 {mmss(state.totalRemaining)}
            {state.done && " · 모두 끝났어요"}
          </p>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {running ? (
          <button type="button" data-testid="timer-pause" className="btn-primary min-h-11" onClick={pause}>⏸ 일시정지</button>
        ) : (
          <button type="button" data-testid="timer-start" className="btn-primary min-h-11" disabled={state.done} onClick={start}>
            ▶ {elapsedMs > 0 ? "계속하기" : "시작하기"}
          </button>
        )}
        <button type="button" data-testid="timer-next" className="btn-ghost min-h-11" disabled={state.index >= steps.length - 1} onClick={nextStep}>⏭ 다음 단계</button>
        <button type="button" data-testid="timer-reset" className="btn-ghost min-h-11" onClick={reset}>↺ 처음부터</button>
      </div>

      <label className="flex items-center justify-center gap-2 text-sm text-stone-700">
        <input type="checkbox" checked={beep} onChange={(e) => setBeep(e.target.checked)} />
        단계가 끝나면 짧은 소리 내기
      </label>

      <ol aria-label="토론 순서" className="grid gap-2">
        {steps.map((s, i) => {
          const isNow = i === state.index && !state.done;
          const over = state.done || i < state.index;
          return (
            <li
              key={s.id + i}
              data-step={s.id}
              aria-current={isNow ? "step" : undefined}
              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                isNow ? `border-2 ${SIDE_SOFT[s.side]} font-bold` : "border-black/10 bg-white"
              } ${over ? "text-stone-500" : ""}`}
            >
              <span className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${SIDE_STYLE[s.side]}`}>
                  {SIDE_MARK[s.side]} {SIDE_LABEL[s.side]}
                </span>
                <span className={over ? "line-through" : ""}>{s.label}</span>
                {over && <span className="sr-only">(끝남)</span>}
                {mySide && s.side === mySide && <span className="text-xs font-semibold text-stone-700">내 차례</span>}
              </span>
              <span className="tabular-nums text-sm">{mmss(s.seconds)}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-center text-xs text-stone-500">타이머는 이 기기 안에서만 돌아요. 소리나 목소리를 녹음하지 않고, 서버에 저장하지도 않아요.</p>
    </section>
  );
}
