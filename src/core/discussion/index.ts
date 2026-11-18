// 토의 말차례 신호등(교사 도구)의 순수 계산. 브라우저·Node API에 의존하지 않는다.
// 모든 동작 함수는 새 상태를 돌려주고, 잘못된 요청이면 원래 상태를 그대로 돌려준다.
import { classifyInput } from "../coach/guard";

export type DiscussionPhase = "share" | "compare" | "adjust";
export type Signal = "green" | "yellow" | "red";
export type TurnPhase = "ok" | "almost" | "over";

export interface DiscussionMember {
  no: number;
  turns: number;
}
export interface DiscussionOpinion {
  id: string;
  no?: number;
  text: string;
  good: string;
  worry: string;
  group?: string;
  chosen: boolean;
}
export interface TurnLog {
  no: number;
  startedAt: number;
  seconds: number;
  skipped: boolean;
}
export interface DiscussionState {
  topic: string;
  members: DiscussionMember[];
  turnSeconds: number;
  order: number[];
  current: number;
  phase: DiscussionPhase;
  opinions: DiscussionOpinion[];
  log: TurnLog[];
}

export const DISCUSSION_LIMITS = {
  topic: 80,
  minMembers: 2,
  maxMembers: 6,
  minNo: 1,
  maxNo: 40,
  minSeconds: 30,
  maxSeconds: 120,
  opinions: 12,
  text: 60,
  note: 40,
  log: 200,
} as const;

export const PHASE_LABELS: Record<DiscussionPhase, string> = {
  share: "의견 내기",
  compare: "의견 비교하기",
  adjust: "의견 조정하기",
};
export const SIGNAL_LABELS: Record<Signal, string> = {
  green: "지금 말해요",
  yellow: "다음 차례",
  red: "기다려요",
};

const clip = (s: unknown, n: number): string => (typeof s === "string" ? s.trim().slice(0, n) : "");
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const validNo = (v: unknown): v is number => isInt(v) && v >= DISCUSSION_LIMITS.minNo && v <= DISCUSSION_LIMITS.maxNo;

export type CreateResult = { ok: true; state: DiscussionState } | { ok: false; error: string };

export function createDiscussion(topic: string, numbers: number[], turnSeconds: number): CreateResult {
  const L = DISCUSSION_LIMITS;
  if (!numbers.every(validNo)) return { ok: false, error: "번호는 1부터 40까지만 고를 수 있어요." };
  if (new Set(numbers).size !== numbers.length) return { ok: false, error: "같은 번호를 두 번 고를 수 없어요." };
  if (numbers.length < L.minMembers || numbers.length > L.maxMembers) {
    return { ok: false, error: `함께 말할 친구는 ${L.minMembers}명에서 ${L.maxMembers}명까지예요.` };
  }
  if (!isInt(turnSeconds) || turnSeconds < L.minSeconds || turnSeconds > L.maxSeconds) {
    return { ok: false, error: `말하는 시간은 ${L.minSeconds}초에서 ${L.maxSeconds}초까지예요.` };
  }
  return {
    ok: true,
    state: {
      topic: clip(topic, L.topic),
      members: numbers.map((no) => ({ no, turns: 0 })),
      turnSeconds,
      order: [...numbers],
      current: 0,
      phase: "share",
      opinions: [],
      log: [],
    },
  };
}

function pushLog(log: TurnLog[], entry: TurnLog): TurnLog[] {
  return [...log, entry].slice(-DISCUSSION_LIMITS.log);
}
function clampSeconds(s: number): number {
  return Number.isFinite(s) ? Math.max(0, Math.round(s)) : 0;
}
function currentNo(state: DiscussionState): number {
  return state.order[state.current] ?? state.order[0];
}

function finishTurn(state: DiscussionState, spokeSeconds: number, nowMs: number, skipped: boolean, advance: boolean): DiscussionState {
  const no = currentNo(state);
  const seconds = skipped ? 0 : clampSeconds(spokeSeconds);
  return {
    ...state,
    members: state.members.map((m) => (m.no === no && !skipped ? { ...m, turns: m.turns + 1 } : m)),
    current: advance ? (state.current + 1) % state.order.length : state.current,
    log: pushLog(state.log, { no, startedAt: Math.round(nowMs - seconds * 1000), seconds, skipped }),
  };
}

// 이 사람이 말을 마쳤어요. 말한 횟수를 하나 올리고 다음 사람으로 넘어가요.
export function nextTurn(state: DiscussionState, spokeSeconds: number, nowMs: number): DiscussionState {
  return finishTurn(state, spokeSeconds, nowMs, false, true);
}
// 아직 생각 중이라 건너뛰어요(말한 횟수는 올라가지 않아요).
export function skipTurn(state: DiscussionState, nowMs: number): DiscussionState {
  return finishTurn(state, 0, nowMs, true, true);
}
// 같은 사람이 한 번 더 말해요(차례는 그대로).
export function againTurn(state: DiscussionState, spokeSeconds: number, nowMs: number): DiscussionState {
  return finishTurn(state, spokeSeconds, nowMs, false, false);
}

export function signalOf(state: DiscussionState): Record<number, Signal> {
  const out: Record<number, Signal> = {};
  for (const no of state.order) out[no] = "red";
  const cur = state.order[state.current];
  const next = state.order[(state.current + 1) % state.order.length];
  if (next !== undefined) out[next] = "yellow";
  if (cur !== undefined) out[cur] = "green";
  return out;
}

export function turnPhase(elapsedSeconds: number, turnSeconds: number): TurnPhase {
  const remaining = turnSeconds - elapsedSeconds;
  if (remaining <= 0) return "over";
  if (remaining <= 10 || remaining <= turnSeconds * 0.2) return "almost";
  return "ok";
}

export function balanceHint(state: DiscussionState): { silent: number[]; message: string | null } {
  const silent = state.members.filter((m) => m.turns === 0).map((m) => m.no).sort((a, b) => a - b);
  return {
    silent,
    message: silent.length ? `아직 말하지 않은 친구가 있어요: ${silent.map((n) => `${n}번`).join(", ")}` : null,
  };
}

// ---- 의견 카드 ----

function nextOpinionId(state: DiscussionState): string {
  let max = 0;
  for (const o of state.opinions) {
    const n = Number(o.id.replace(/^o/, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `o${max + 1}`;
}
function mapOpinion(state: DiscussionState, id: string, f: (o: DiscussionOpinion) => DiscussionOpinion): DiscussionState {
  if (!state.opinions.some((o) => o.id === id)) return state;
  return { ...state, opinions: state.opinions.map((o) => (o.id === id ? f(o) : o)) };
}
function noOrUndefined(state: DiscussionState, no: number | undefined): number | undefined {
  return no !== undefined && state.members.some((m) => m.no === no) ? no : undefined;
}

export function addOpinion(state: DiscussionState, input: { no?: number; text: string }): DiscussionState {
  const text = clip(input.text, DISCUSSION_LIMITS.text);
  if (!text || state.opinions.length >= DISCUSSION_LIMITS.opinions) return state;
  const op: DiscussionOpinion = { id: nextOpinionId(state), text, good: "", worry: "", chosen: false };
  const no = noOrUndefined(state, input.no);
  if (no !== undefined) op.no = no;
  return { ...state, opinions: [...state.opinions, op] };
}
export function updateOpinion(state: DiscussionState, id: string, patch: { no?: number | null; text?: string }): DiscussionState {
  return mapOpinion(state, id, (o) => {
    const next = { ...o };
    if (patch.text !== undefined) {
      const t = clip(patch.text, DISCUSSION_LIMITS.text);
      if (t) next.text = t;
    }
    if (patch.no === null) delete next.no;
    else if (patch.no !== undefined) {
      const no = noOrUndefined(state, patch.no);
      if (no !== undefined) next.no = no;
    }
    return next;
  });
}
export function removeOpinion(state: DiscussionState, id: string): DiscussionState {
  if (!state.opinions.some((o) => o.id === id)) return state;
  return normalizeGroups({ ...state, opinions: state.opinions.filter((o) => o.id !== id) });
}
export function setNotes(state: DiscussionState, id: string, patch: { good?: string; worry?: string }): DiscussionState {
  return mapOpinion(state, id, (o) => ({
    ...o,
    good: patch.good !== undefined ? clip(patch.good, DISCUSSION_LIMITS.note) : o.good,
    worry: patch.worry !== undefined ? clip(patch.worry, DISCUSSION_LIMITS.note) : o.worry,
  }));
}

// 묶음에 카드가 하나만 남으면 묶음을 풀어요.
function normalizeGroups(state: DiscussionState): DiscussionState {
  const count = new Map<string, number>();
  for (const o of state.opinions) if (o.group) count.set(o.group, (count.get(o.group) ?? 0) + 1);
  if (state.opinions.every((o) => !o.group || (count.get(o.group) ?? 0) >= 2)) return state;
  return {
    ...state,
    opinions: state.opinions.map((o) => {
      if (!o.group || (count.get(o.group) ?? 0) >= 2) return o;
      const { group: _group, ...rest } = o;
      void _group;
      return rest;
    }),
  };
}

export function groupOpinions(state: DiscussionState, ids: string[]): DiscussionState {
  const picked = new Set(ids.filter((id) => state.opinions.some((o) => o.id === id)));
  if (picked.size < 2) return state;
  // 이미 묶인 카드가 있으면 그 묶음 전체를 하나로 합쳐요.
  const oldGroups = new Set(state.opinions.filter((o) => picked.has(o.id) && o.group).map((o) => o.group as string));
  let n = 0;
  for (const o of state.opinions) {
    const m = o.group ? Number(o.group.replace(/^g/, "")) : 0;
    if (Number.isFinite(m) && m > n) n = m;
  }
  const gid = `g${n + 1}`;
  return {
    ...state,
    opinions: state.opinions.map((o) => (picked.has(o.id) || (o.group && oldGroups.has(o.group)) ? { ...o, group: gid } : o)),
  };
}
export function ungroup(state: DiscussionState, groupId: string): DiscussionState {
  if (!state.opinions.some((o) => o.group === groupId)) return state;
  return {
    ...state,
    opinions: state.opinions.map((o) => {
      if (o.group !== groupId) return o;
      const { group: _group, ...rest } = o;
      void _group;
      return rest;
    }),
  };
}
// 함께 정한 의견 표시를 켜고 꺼요.
export function choose(state: DiscussionState, id: string): DiscussionState {
  return mapOpinion(state, id, (o) => ({ ...o, chosen: !o.chosen }));
}
export function setTopic(state: DiscussionState, topic: string): DiscussionState {
  return { ...state, topic: clip(topic, DISCUSSION_LIMITS.topic) };
}
export function setPhase(state: DiscussionState, phase: DiscussionPhase): DiscussionState {
  return phase in PHASE_LABELS ? { ...state, phase } : state;
}

// ---- 브라우저 저장소에서 읽은 값 검사 ----

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function sanitizeDiscussion(raw: unknown): DiscussionState | null {
  const L = DISCUSSION_LIMITS;
  if (!isObj(raw)) return null;
  if (typeof raw.topic !== "string" || !Array.isArray(raw.members) || typeof raw.turnSeconds !== "number") return null;
  const members: DiscussionMember[] = [];
  for (const m of raw.members) {
    if (!isObj(m) || !validNo(m.no)) return null;
    if (members.some((x) => x.no === m.no)) return null;
    const turns = isInt(m.turns) && m.turns >= 0 ? Math.min(m.turns, 9999) : 0;
    members.push({ no: m.no, turns });
  }
  if (members.length < L.minMembers || members.length > L.maxMembers) return null;
  if (!Number.isFinite(raw.turnSeconds)) return null;
  const turnSeconds = Math.min(L.maxSeconds, Math.max(L.minSeconds, Math.round(raw.turnSeconds)));

  let order = Array.isArray(raw.order) ? raw.order.filter(validNo) : [];
  const sameSet = order.length === members.length && members.every((m) => order.includes(m.no)) && new Set(order).size === order.length;
  if (!sameSet) order = members.map((m) => m.no);
  const current = isInt(raw.current) && raw.current >= 0 && raw.current < order.length ? raw.current : 0;
  const phase: DiscussionPhase = raw.phase === "compare" || raw.phase === "adjust" ? raw.phase : "share";

  const opinions: DiscussionOpinion[] = [];
  if (Array.isArray(raw.opinions)) {
    for (const o of raw.opinions) {
      if (opinions.length >= L.opinions) break;
      if (!isObj(o) || typeof o.id !== "string" || !o.id || o.id.length > 20) continue;
      if (opinions.some((x) => x.id === o.id)) continue;
      const text = clip(o.text, L.text);
      if (!text) continue;
      const op: DiscussionOpinion = { id: o.id, text, good: clip(o.good, L.note), worry: clip(o.worry, L.note), chosen: o.chosen === true };
      if (validNo(o.no) && members.some((m) => m.no === o.no)) op.no = o.no;
      if (typeof o.group === "string" && o.group && o.group.length <= 20) op.group = o.group;
      opinions.push(op);
    }
  }
  const log: TurnLog[] = [];
  if (Array.isArray(raw.log)) {
    for (const e of raw.log.slice(-L.log)) {
      if (!isObj(e) || !validNo(e.no) || typeof e.startedAt !== "number" || !Number.isFinite(e.startedAt)) continue;
      const seconds = typeof e.seconds === "number" && Number.isFinite(e.seconds) ? Math.min(Math.max(0, Math.round(e.seconds)), 86400) : 0;
      log.push({ no: e.no, startedAt: Math.round(e.startedAt), seconds, skipped: e.skipped === true });
    }
  }
  return normalizeGroups({ topic: clip(raw.topic, L.topic), members, turnSeconds, order, current, phase, opinions, log });
}

// ---- 내려받기(CSV) ----

export function csvCell(v: string | number): string {
  let s = String(v);
  // 표 프로그램이 수식으로 읽지 않도록 맨 앞이 = + - @ (또는 탭·줄 바꿈)인 칸은 작은따옴표를 붙여요.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvLine = (cells: (string | number)[]) => cells.map(csvCell).join(",");

export function discussionCsv(state: DiscussionState): string {
  const lines: string[] = [];
  lines.push(csvLine(["주제", state.topic]));
  lines.push("");
  lines.push(csvLine(["순서", "번호", "말한 초", "건너뜀"]));
  state.log.forEach((e, i) => lines.push(csvLine([i + 1, e.no, e.seconds, e.skipped ? "예" : ""])));
  lines.push("");
  lines.push(csvLine(["번호", "의견", "좋은 점", "걱정", "묶음", "함께 정함"]));
  for (const o of state.opinions) lines.push(csvLine([o.no ?? "", o.text, o.good, o.worry, o.group ?? "", o.chosen ? "예" : ""]));
  return lines.join("\n") + "\n";
}

// ---- 개인 정보 경고 ----

export interface PersonalInfoWarning {
  field: "topic" | "text" | "good" | "worry";
  opinionId?: string;
}
export const PERSONAL_INFO_NOTICE = "이름·전화번호 같은 개인 정보는 화면에 띄우지 않아요.";

export function personalInfoWarnings(state: DiscussionState): PersonalInfoWarning[] {
  const out: PersonalInfoWarning[] = [];
  const bad = (s: string) => s !== "" && classifyInput(s).personalInfo;
  if (bad(state.topic)) out.push({ field: "topic" });
  for (const o of state.opinions) {
    if (bad(o.text)) out.push({ field: "text", opinionId: o.id });
    if (bad(o.good)) out.push({ field: "good", opinionId: o.id });
    if (bad(o.worry)) out.push({ field: "worry", opinionId: o.id });
  }
  return out;
}
