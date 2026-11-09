// 발표 준비: 형식 만들기·검사·점검. 규칙으로 돌리는 순수 함수이며 AI는 쓰지 않는다.
import { findExaggerations } from "@/core/cardnews/check";
import {
  AID_LABELS,
  POINT_MAX,
  PRACTICE_MAX,
  PRACTICE_SECONDS_MAX,
  PRESENTATION_AIDS,
  PRESENTATION_LIMITS as L,
  PRESENTATION_PURPOSES,
  SELF_CHECK_ITEMS,
  SOURCE_MAX,
  type PresentationArtifact,
  type PresentationBand,
  type PresentationPoint,
  type PresentationSource,
  type SelfCheckId,
  type SpeakingWarning,
  type TextFieldLike,
} from "./types";
import { asRecord, clampStr, squash, uniqueId } from "./util";

/** 메모는 실제로 말할 때 약 3배로 늘어난다고 어림한다(정확한 값이 아니라 어림이다). */
export const MEMO_EXPANSION = 3;
/** 말하는 속도 어림: 1분에 약 250글자(공백 뺀 글자). 어림값이라 학생에게 ‘어림’이라고 밝힌다. */
export const SPOKEN_CHARS_PER_MINUTE = 250;
/** 연습 시간이 목표 시간에서 이만큼(±30%) 벗어나면 안내한다 */
export const PRACTICE_TOLERANCE = 0.3;

export const bandOfGrade = (grade: number): PresentationBand => (grade >= 5 ? "5-6" : "3-4");
/** 학년대별 성취기준: 3~4학년 [4국01-05], 5~6학년 [6국01-05] */
export const presentationStandardCode = (grade: number): string => (bandOfGrade(grade) === "5-6" ? "6국01-05" : "4국01-05");

const emptySelfCheck = (): Record<SelfCheckId, number> => ({ volume: 0, pace: 0, eyes: 0, posture: 0, gesture: 0 });
const newSource = (id: string, band: PresentationBand): PresentationSource => ({
  id,
  name: "",
  from: "",
  keyInfo: "",
  ...(band === "5-6" ? { trust: { who: false, when: false, evidence: false } } : {}),
});

export function emptyPresentation(band: PresentationBand = "3-4"): PresentationArtifact {
  return {
    kind: "presentation",
    band,
    topic: "",
    purpose: null,
    audience: "",
    sources: [newSource("s1", band)],
    opening: "",
    points: [1, 2].map((n) => ({ id: `p${n}`, text: "", sourceIds: [], aid: null })),
    closing: "",
    practice: [],
    selfCheck: emptySelfCheck(),
    reflection: "",
  };
}

/** 자료 칸을 하나 더 만든다(id가 겹치지 않게). 상한이면 null. */
export function newPresentationSource(existing: readonly PresentationSource[], band: PresentationBand): PresentationSource | null {
  if (existing.length >= SOURCE_MAX) return null;
  const used = new Set(existing.map((s) => s.id));
  let n = existing.length + 1;
  while (used.has(`s${n}`)) n++;
  return newSource(`s${n}`, band);
}

/** 가운데 내용 칸을 하나 더 만든다. 상한이면 null. */
export function newPoint(existing: readonly PresentationPoint[]): PresentationPoint | null {
  if (existing.length >= POINT_MAX) return null;
  const used = new Set(existing.map((p) => p.id));
  let n = existing.length + 1;
  while (used.has(`p${n}`)) n++;
  return { id: `p${n}`, text: "", sourceIds: [], aid: null };
}

const bandOf = (x: unknown): PresentationBand => (x === "5-6" ? "5-6" : "3-4");

/**
 * 밖에서 들어온 값을 안전한 발표 준비 형식으로 고친다(글자 수·개수·id·고정 목록·연습 숫자 검사).
 * 학년대(band)는 학급 학년으로 정해지는 값이라 학생이 바꾸지 못해야 한다: 이전 저장본(prev)이 있으면 그 값을 쓰고 입력은 무시한다.
 * 처음 저장(prev 없음)일 때는 입력을 받아 두므로, 호스트는 저장 전에 반드시 withBand(결과, 학급 학년대)로 덮어써야 한다.
 */
export function sanitizePresentation(raw: unknown, prev?: PresentationArtifact | null): PresentationArtifact | null {
  const r = asRecord(raw);
  if (r.kind !== "presentation") return null;
  const band = prev ? prev.band : bandOf(r.band);
  const seen = new Set<string>();
  const sources = (Array.isArray(r.sources) ? r.sources : []).slice(0, SOURCE_MAX).map((x): PresentationSource => {
    const o = asRecord(x);
    const t = asRecord(o.trust);
    return {
      id: uniqueId(o.id, seen, "s"),
      name: clampStr(o.name, L.name),
      from: clampStr(o.from, L.from),
      keyInfo: clampStr(o.keyInfo, L.keyInfo),
      ...(band === "5-6" ? { trust: { who: t.who === true, when: t.when === true, evidence: t.evidence === true } } : {}),
    };
  });
  const sourceIds = new Set(sources.map((s) => s.id));
  const ps = new Set<string>();
  const points = (Array.isArray(r.points) ? r.points : []).slice(0, POINT_MAX).map((x): PresentationPoint => {
    const o = asRecord(x);
    const ids = (Array.isArray(o.sourceIds) ? o.sourceIds : []).filter((i): i is string => typeof i === "string" && sourceIds.has(i));
    return {
      id: uniqueId(o.id, ps, "p"),
      text: clampStr(o.text, L.point),
      sourceIds: [...new Set(ids)],
      aid: band === "5-6" && typeof o.aid === "string" && (PRESENTATION_AIDS as readonly string[]).includes(o.aid) ? (o.aid as PresentationPoint["aid"]) : null,
    };
  });
  const sc = asRecord(r.selfCheck);
  const selfCheck = emptySelfCheck();
  for (const item of SELF_CHECK_ITEMS) {
    const v = sc[item.id];
    selfCheck[item.id] = typeof v === "number" && Number.isFinite(v) ? Math.min(3, Math.max(0, Math.round(v))) : 0;
  }
  const practice = (Array.isArray(r.practice) ? r.practice : [])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .map((v) => Math.min(PRACTICE_SECONDS_MAX, Math.round(v)))
    .filter((v) => v >= 1)
    .slice(0, PRACTICE_MAX);
  return {
    kind: "presentation",
    band,
    topic: clampStr(r.topic, L.topic),
    purpose: typeof r.purpose === "string" && (PRESENTATION_PURPOSES as readonly string[]).includes(r.purpose) ? (r.purpose as PresentationArtifact["purpose"]) : null,
    audience: clampStr(r.audience, L.audience),
    sources,
    opening: clampStr(r.opening, L.opening),
    points,
    closing: clampStr(r.closing, L.closing),
    practice,
    selfCheck,
    reflection: clampStr(r.reflection, L.reflection),
  };
}

/** 학년대를 학급 학년으로 정한 값으로 덮어쓴 새 제작물. 3~4학년이면 5~6학년 전용 칸(믿을 만한가·보조 매체)은 지운다. */
export function withBand(a: PresentationArtifact, band: PresentationBand): PresentationArtifact {
  if (band === "5-6") {
    return {
      ...a,
      band,
      sources: a.sources.map((s) => ({ ...s, trust: s.trust ?? { who: false, when: false, evidence: false } })),
    };
  }
  return {
    ...a,
    band,
    sources: a.sources.map(({ trust: _trust, ...s }) => {
      void _trust;
      return s;
    }),
    points: a.points.map((p) => ({ ...p, aid: null })),
  };
}

/** 제출을 막는 꼭 필요한 것만: 주제, 목적, 가운데 내용 1개 이상. 나머지는 checkPresentation의 권유다. */
export function presentationSubmitProblems(a: PresentationArtifact): string[] {
  const out: string[] = [];
  if (!a.topic.trim()) out.push("발표 주제를 써 주세요.");
  if (!a.purpose) out.push("발표 목적을 골라 주세요.");
  if (!a.points.some((p) => p.text.trim())) out.push("가운데 중요한 내용을 하나 이상 써 주세요.");
  return out;
}

/** 학생이 쓴 모든 글 칸. key는 id 기반이라 순서를 바꿔도 같은 칸이다. */
export function presentationFields(a: PresentationArtifact): TextFieldLike[] {
  const f: TextFieldLike[] = [
    { key: "topic", text: a.topic },
    { key: "audience", text: a.audience },
  ];
  for (const s of a.sources) f.push({ key: `source.${s.id}.name`, text: s.name }, { key: `source.${s.id}.from`, text: s.from }, { key: `source.${s.id}.keyInfo`, text: s.keyInfo });
  f.push({ key: "opening", text: a.opening });
  for (const p of a.points) f.push({ key: `point.${p.id}.text`, text: p.text });
  f.push({ key: "closing", text: a.closing }, { key: "reflection", text: a.reflection });
  return f;
}

/** 글 칸의 내용을 바꾼 새 값(원본은 그대로). 없는 칸은 건너뛴다. */
export function withPresentationFields(a: PresentationArtifact, values: Record<string, string>): PresentationArtifact {
  const next = structuredClone(a);
  for (const [key, text] of Object.entries(values)) {
    if (key === "topic" || key === "audience" || key === "opening" || key === "closing" || key === "reflection") {
      next[key] = text;
      continue;
    }
    const s = /^source\.([a-z0-9]+)\.(name|from|keyInfo)$/.exec(key);
    if (s) {
      const x = next.sources.find((y) => y.id === s[1]);
      if (x) x[s[2] as "name" | "from" | "keyInfo"] = text;
      continue;
    }
    const p = /^point\.([a-z0-9]+)\.text$/.exec(key);
    if (p) {
      const x = next.points.find((y) => y.id === p[1]);
      if (x) x.text = text;
    }
  }
  return next;
}

/** 메모 전체(처음·가운데·끝)의 공백 뺀 글자 수 */
export function memoChars(a: PresentationArtifact): number {
  return [a.opening, ...a.points.map((p) => p.text), a.closing].reduce((n, t) => n + Array.from(squash(t)).length, 0);
}

/** 메모로 어림한 발표 시간(초). 정확한 값이 아니라 어림이다(메모 글자 × 3 ÷ 1분 250글자). */
export function estimateSeconds(a: PresentationArtifact): number {
  return Math.round(((memoChars(a) * MEMO_EXPANSION) / SPOKEN_CHARS_PER_MINUTE) * 60);
}

/** 초를 "2분 5초" 꼴로 */
export function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return m === 0 ? `${s}초` : s % 60 === 0 ? `${m}분` : `${m}분 ${s % 60}초`;
}

/** 분을 소수 한 자리까지 ("2.4", "3") */
const minutesText = (sec: number): string => String(Math.round((sec / 60) * 10) / 10);

export type PresentationWarningKind =
  | "no-topic"
  | "no-purpose"
  | "few-points"
  | "point-no-source"
  | "source-no-from"
  | "source-unused"
  | "no-closing"
  | "exaggeration"
  | "time-estimate"
  | "practice-time";

export interface PresentationWarning extends SpeakingWarning {
  kind: PresentationWarningKind;
  spans?: { start: number; end: number; word: string }[];
}

const ORDER: Record<PresentationWarningKind, number> = {
  "no-topic": 0,
  "no-purpose": 1,
  "few-points": 2,
  "point-no-source": 3,
  "source-no-from": 4,
  "source-unused": 5,
  "no-closing": 6,
  exaggeration: 7,
  "time-estimate": 8,
  "practice-time": 9,
};

const filledSource = (s: PresentationSource) => !!(s.name.trim() || s.keyInfo.trim());

/** 발표 준비 점검. 제출을 막지 않는다(막는 것은 presentationSubmitProblems). 모두 권유다. */
export function checkPresentation(a: PresentationArtifact, targetSeconds: number): PresentationWarning[] {
  const out: PresentationWarning[] = [];
  if (!a.topic.trim()) out.push({ id: "no-topic", kind: "no-topic", target: "topic", message: "발표 주제를 먼저 적어 봐요." });
  if (!a.purpose) out.push({ id: "no-purpose", kind: "no-purpose", message: "알리기, 설득하기, 겪은 일 나누기 중 발표 목적을 골라 봐요." });
  const points = a.points.filter((p) => p.text.trim());
  if (points.length < 2) out.push({ id: "few-points", kind: "few-points", message: "가운데 내용이 두 개 이상이면 듣는 사람이 따라가기 쉬워요. 하나 더 떠올려 볼까요?" });
  const ids = new Set(a.sources.map((s) => s.id));
  for (const p of points) {
    if (!p.sourceIds.some((i) => ids.has(i))) {
      out.push({ id: `point-no-source-${p.id}`, kind: "point-no-source", target: `point.${p.id}.text`, message: `${a.points.indexOf(p) + 1}번 내용에 쓸 자료를 연결해 봐요.` });
    }
  }
  const used = new Set(points.flatMap((p) => p.sourceIds));
  for (const s of a.sources.filter(filledSource)) {
    const no = a.sources.indexOf(s) + 1;
    if (!s.from.trim()) out.push({ id: `source-no-from-${s.id}`, kind: "source-no-from", target: `source.${s.id}.from`, message: `${no}번 자료를 어디에서 알게 됐는지 출처를 적어 봐요.` });
    if (!used.has(s.id)) out.push({ id: `source-unused-${s.id}`, kind: "source-unused", message: `${no}번 자료는 어느 내용에도 쓰이지 않았어요. 쓸 내용에 연결하거나, 쓰지 않을 자료면 지워도 좋아요.` });
  }
  if (!a.closing.trim()) out.push({ id: "no-closing", kind: "no-closing", target: "closing", message: "끝에 내용을 정리하는 말이나 마무리 인사를 메모해 봐요." });
  const targets = [
    { key: "opening", text: a.opening },
    ...a.points.map((p) => ({ key: `point.${p.id}.text`, text: p.text })),
    { key: "closing", text: a.closing },
    ...a.sources.map((s) => ({ key: `source.${s.id}.keyInfo`, text: s.keyInfo })),
  ];
  for (const f of targets) {
    const spans = findExaggerations(f.text);
    if (spans.length) {
      out.push({
        id: `exag-${f.key}`,
        kind: "exaggeration",
        target: f.key,
        spans,
        message: `과장처럼 들릴 수 있는 말(${spans.map((s) => `‘${s.word}’`).join(", ")})이 있어요. 확인할 수 있는 사실인가요?`,
      });
    }
  }
  const est = estimateSeconds(a);
  if (memoChars(a) > 0 && targetSeconds > 0 && (est < targetSeconds * 0.5 || est > targetSeconds * 1.5)) {
    out.push({ id: "time-estimate", kind: "time-estimate", message: `메모로 어림해 보면 약 ${minutesText(est)}분이에요. 연습하며 시간을 재 볼까요?` });
  }
  const last = a.practice[a.practice.length - 1];
  if (last !== undefined && targetSeconds > 0 && Math.abs(last - targetSeconds) > targetSeconds * PRACTICE_TOLERANCE) {
    out.push({
      id: "practice-time",
      kind: "practice-time",
      message: `마지막 연습은 ${formatSeconds(last)}였어요. 목표 시간(${formatSeconds(targetSeconds)})에 가깝게 내용을 ${last > targetSeconds ? "줄이거나 조금 빠르게" : "더하거나 조금 천천히"} 말해 볼까요?`,
    });
  }
  return out.sort((x, y) => ORDER[x.kind] - ORDER[y.kind]);
}

/** 보조 매체 이름 */
export const aidLabel = (aid: PresentationPoint["aid"]): string => (aid ? AID_LABELS[aid] : "");
