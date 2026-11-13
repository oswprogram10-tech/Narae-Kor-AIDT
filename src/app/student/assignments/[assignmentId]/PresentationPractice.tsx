"use client";

// 발표 연습 스톱워치와 연습 기록 막대. 스톱워치는 학생 기기 안에서만 돌고(performance.now 기반),
// 녹음·촬영은 하지 않는다. 서버에 저장되는 것은 '기록하기'를 누른 연습의 걸린 시간(초) 숫자뿐이다.
import { useEffect, useRef, useState } from "react";
import { PRACTICE_MAX, PRACTICE_TOLERANCE, formatSeconds } from "@/core/speaking";

const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
const TICK_MS = 200;

export function PresentationStopwatch({ targetSeconds, runs, locked, onRecord }: { targetSeconds: number; runs: number; locked: boolean; onRecord: (seconds: number) => void }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const base = useRef(0); // 멈출 때까지 쌓인 경과 ms
  const startedAt = useRef(0); // 돌기 시작한 performance.now()

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsedMs(base.current + (performance.now() - startedAt.current)), TICK_MS);
    return () => clearInterval(t);
  }, [running]);

  const now = () => (running ? base.current + (performance.now() - startedAt.current) : base.current);
  const sec = Math.floor(elapsedMs / 1000);
  const over = sec >= targetSeconds;
  const full = runs >= PRACTICE_MAX;

  function toggle() {
    if (running) {
      base.current = now();
      setElapsedMs(base.current);
      setRunning(false);
    } else {
      startedAt.current = performance.now();
      setRunning(true);
    }
  }
  function reset() {
    base.current = 0;
    setElapsedMs(0);
    setRunning(false);
  }
  function record() {
    const ms = now();
    onRecord(Math.max(1, Math.round(ms / 1000)));
    reset();
  }

  return (
    <div className="space-y-3" data-testid="stopwatch">
      <div
        className={`rounded-2xl border-4 p-4 text-center ${over ? "border-orange-700 bg-orange-50 text-orange-950" : "border-brand-600 bg-brand-50 text-stone-900"}`}
        data-over={over ? "yes" : "no"}
      >
        <div className="text-sm font-semibold">목표 시간 {formatSeconds(targetSeconds)}</div>
        <div className="font-mono text-6xl font-bold tabular-nums sm:text-7xl" data-testid="stopwatch-time" aria-label={`지금 ${formatSeconds(sec)}`}>
          {mmss(sec)}
        </div>
        <p className="min-h-6 text-lg font-bold" role="status" aria-live="polite" data-testid="stopwatch-note">
          {over ? `⏰ 목표 시간이 지났어요! (${formatSeconds(sec - targetSeconds)} 넘음)` : running ? "말하는 중이에요" : sec > 0 ? "잠깐 멈췄어요" : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary min-h-12 min-w-28 text-lg" data-testid="sw-toggle" onClick={toggle}>
          {running ? "⏸ 멈춤" : sec > 0 ? "▶ 이어서" : "▶ 시작"}
        </button>
        <button type="button" className="btn-ghost min-h-12" data-testid="sw-record" disabled={locked || full || sec < 1} onClick={record}>
          📝 기록하기
        </button>
        <button type="button" className="btn-ghost min-h-12" data-testid="sw-reset" disabled={sec === 0 && !running} onClick={reset}>
          ↺ 다시
        </button>
      </div>
      {full && <p className="text-sm text-stone-600">연습 기록은 {PRACTICE_MAX}번까지 남길 수 있어요.</p>}
      <p className="text-xs text-stone-500">스톱워치는 이 기기 안에서만 돌아요. 소리나 모습을 녹음·촬영하지 않아요. ‘기록하기’를 누르면 걸린 시간(숫자)만 저장돼요.</p>
    </div>
  );
}

/** 연습 기록 목록과 목표선 막대(색과 글로 함께 알려 준다) */
export function PracticeBars({ practice, targetSeconds }: { practice: number[]; targetSeconds: number }) {
  if (practice.length === 0) return <p className="text-sm text-stone-600" data-testid="no-practice">아직 기록한 연습이 없어요. 말해 보고 ‘기록하기’를 눌러요.</p>;
  const scale = Math.max(targetSeconds * 1.5, ...practice);
  const targetPos = (targetSeconds / scale) * 100;
  return (
    <ul className="space-y-2" aria-label="연습 기록" data-testid="practice-list">
      {practice.map((p, i) => {
        const diff = p - targetSeconds;
        const near = Math.abs(diff) <= targetSeconds * PRACTICE_TOLERANCE;
        const note = near ? "목표에 가까워요" : diff > 0 ? "목표보다 길어요" : "목표보다 짧아요";
        return (
          <li key={i} data-run={i + 1}>
            <div className="flex items-baseline justify-between text-sm">
              <b>{i + 1}번째 연습</b>
              <span>
                {formatSeconds(p)} · <span className={near ? "text-brand-700" : "text-orange-900"}>{near ? "✓" : "△"} {note}</span>
              </span>
            </div>
            <div className="relative mt-1 h-4 rounded bg-stone-100" role="img" aria-label={`${i + 1}번째 연습 ${formatSeconds(p)}, 목표 ${formatSeconds(targetSeconds)}, ${note}`}>
              <div className={`h-4 rounded ${near ? "bg-brand-600" : "bg-orange-600"}`} style={{ width: `${Math.max(2, (p / scale) * 100)}%` }} />
              <div aria-hidden="true" className="absolute -top-1 h-6 w-0.5 bg-stone-900" style={{ left: `${targetPos}%` }} />
            </div>
          </li>
        );
      })}
      <li className="text-xs text-stone-500">검은 세로선이 목표 시간({formatSeconds(targetSeconds)})이에요.</li>
    </ul>
  );
}
