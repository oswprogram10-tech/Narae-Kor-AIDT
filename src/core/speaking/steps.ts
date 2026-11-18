// 토론 절차와 타이머. 순수 함수이며 시계를 읽지 않는다(경과 초는 화면이 넣어 준다).

export interface DebateStep {
  id: string;
  label: string;
  side: "pro" | "con" | "both";
  seconds: number;
}

export const STEP_SECONDS_MIN = 30;
export const STEP_SECONDS_MAX = 300;

export const DEBATE_STEPS: readonly DebateStep[] = [
  { id: "pro-open", label: "찬성 주장 펼치기", side: "pro", seconds: 120 },
  { id: "con-open", label: "반대 주장 펼치기", side: "con", seconds: 120 },
  { id: "plan1", label: "작전 시간", side: "both", seconds: 60 },
  { id: "con-rebut", label: "반대 반론하기", side: "con", seconds: 120 },
  { id: "pro-rebut", label: "찬성 반론하기", side: "pro", seconds: 120 },
  { id: "plan2", label: "작전 시간", side: "both", seconds: 60 },
  { id: "con-close", label: "반대 주장 다지기", side: "con", seconds: 60 },
  { id: "pro-close", label: "찬성 주장 다지기", side: "pro", seconds: 60 },
];

/** 교사가 바꾼 시간(단계 id → 초)을 적용한 절차. 30~300초로 자르고, 알 수 없는 id나 숫자가 아닌 값은 무시한다. */
export function debateSteps(overrides?: Record<string, number> | null): DebateStep[] {
  return DEBATE_STEPS.map((s) => {
    const v = overrides && Object.prototype.hasOwnProperty.call(overrides, s.id) ? overrides[s.id] : undefined;
    if (typeof v !== "number" || !Number.isFinite(v)) return { ...s };
    return { ...s, seconds: Math.min(STEP_SECONDS_MAX, Math.max(STEP_SECONDS_MIN, Math.round(v))) };
  });
}

export const totalSeconds = (steps: readonly DebateStep[]) => steps.reduce((n, s) => n + s.seconds, 0);

export interface TimerState {
  /** 지금 단계 번호(0부터). 끝난 뒤에는 마지막 단계 번호, 단계가 없으면 -1 */
  index: number;
  /** 지금 단계에서 남은 초(끝나면 0) */
  remaining: number;
  /** 모든 단계가 끝났는가 */
  done: boolean;
  /** 전체에서 남은 초 */
  totalRemaining: number;
}

/** 경과 초(소수·음수 가능)에서 타이머 상태를 구한다. 단계가 끝나는 바로 그 초에 다음 단계가 시작된다. */
export function timerState(steps: readonly DebateStep[], elapsedSeconds: number): TimerState {
  const total = totalSeconds(steps);
  const e = Number.isFinite(elapsedSeconds) ? Math.max(0, Math.floor(elapsedSeconds)) : 0;
  if (steps.length === 0) return { index: -1, remaining: 0, done: true, totalRemaining: 0 };
  if (e >= total) return { index: steps.length - 1, remaining: 0, done: true, totalRemaining: 0 };
  let start = 0;
  for (let i = 0; i < steps.length; i++) {
    const end = start + steps[i].seconds;
    if (e < end) return { index: i, remaining: end - e, done: false, totalRemaining: total - e };
    start = end;
  }
  return { index: steps.length - 1, remaining: 0, done: true, totalRemaining: 0 };
}
