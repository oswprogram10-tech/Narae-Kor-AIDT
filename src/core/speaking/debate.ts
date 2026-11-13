// 토론 준비: 형식 만들기·검사·점검. 규칙으로 돌리는 순수 함수이며 AI는 쓰지 않는다.
import { findExaggerations } from "@/core/cardnews/check";
import { DEBATE_LIMITS as L, REASON_MAX, REBUTTAL_MAX, type DebateArtifact, type DebateReason, type DebateRebuttal, type SpeakingWarning, type TextFieldLike } from "./types";
import { asRecord, clampStr, len, squash, uniqueId } from "./util";

export const DEBATE_MOTIONS: readonly { id: string; text: string }[] = [
  { id: "recess", text: "쉬는 시간을 20분으로 늘려야 한다" },
  { id: "plant", text: "교실에 반려 식물을 한 사람에 하나씩 길러야 한다" },
  { id: "outdoor", text: "일주일에 한 번은 운동장에서 수업해야 한다" },
  { id: "seat", text: "교실 자리는 한 달마다 바꾸어야 한다" },
  { id: "weekend", text: "주말에는 숙제를 내지 않아야 한다" },
  { id: "lunchmenu", text: "점심 반찬 가운데 한 가지는 학생들이 투표로 정해야 한다" },
];

export function emptyDebate(): DebateArtifact {
  return {
    kind: "debate",
    motion: "",
    side: null,
    claim: "",
    reasons: [
      { id: "r1", text: "", support: "", source: "" },
      { id: "r2", text: "", support: "", source: "" },
    ],
    rebuttals: [{ id: "b1", expected: "", answer: "" }],
    reflection: "",
  };
}

/** 근거·반론 칸을 하나 더 만든다(id가 겹치지 않게). 상한이면 null. */
export function newReason(existing: readonly DebateReason[]): DebateReason | null {
  if (existing.length >= REASON_MAX) return null;
  const used = new Set(existing.map((r) => r.id));
  let n = existing.length + 1;
  while (used.has(`r${n}`)) n++;
  return { id: `r${n}`, text: "", support: "", source: "" };
}

export function newRebuttal(existing: readonly DebateRebuttal[]): DebateRebuttal | null {
  if (existing.length >= REBUTTAL_MAX) return null;
  const used = new Set(existing.map((r) => r.id));
  let n = existing.length + 1;
  while (used.has(`b${n}`)) n++;
  return { id: `b${n}`, expected: "", answer: "" };
}

/**
 * 밖에서 들어온 값을 안전한 토론 준비 형식으로 고친다(글자 수·개수·id 검사).
 * 논제(motion)는 교사가 정한 값이라 학생이 바꾸지 못해야 한다: 이전 저장본(prev)이 있으면 그 논제를 쓰고 입력은 무시한다.
 * 처음 저장(prev 없음)일 때는 입력을 글자 수만 잘라 받아 두므로, 호스트는 저장 전에 반드시
 * withMotion(결과, 과제의 논제)으로 덮어써야 한다.
 */
export function sanitizeDebate(raw: unknown, prev?: DebateArtifact | null): DebateArtifact | null {
  const r = asRecord(raw);
  if (r.kind !== "debate") return null;
  const rs = new Set<string>();
  const reasons = (Array.isArray(r.reasons) ? r.reasons : []).slice(0, REASON_MAX).map((x): DebateReason => {
    const o = asRecord(x);
    return { id: uniqueId(o.id, rs, "r"), text: clampStr(o.text, L.reason), support: clampStr(o.support, L.support), source: clampStr(o.source, L.source) };
  });
  const bs = new Set<string>();
  const rebuttals = (Array.isArray(r.rebuttals) ? r.rebuttals : []).slice(0, REBUTTAL_MAX).map((x): DebateRebuttal => {
    const o = asRecord(x);
    return { id: uniqueId(o.id, bs, "b"), expected: clampStr(o.expected, L.expected), answer: clampStr(o.answer, L.answer) };
  });
  return {
    kind: "debate",
    motion: prev ? prev.motion : clampStr(r.motion, L.motion),
    side: r.side === "pro" || r.side === "con" ? r.side : null,
    claim: clampStr(r.claim, L.claim),
    reasons,
    rebuttals,
    reflection: clampStr(r.reflection, L.reflection),
  };
}

/** 논제를 교사가 정한 값으로 덮어쓴 새 제작물 */
export function withMotion(a: DebateArtifact, motion: string): DebateArtifact {
  return { ...a, motion: clampStr(motion, L.motion) };
}

/** 제출을 막는 꼭 필요한 것만. 나머지는 checkDebate의 권유다. */
export function debateSubmitProblems(a: DebateArtifact): string[] {
  const out: string[] = [];
  if (!a.side) out.push("찬성과 반대 중 내 편을 골라 주세요.");
  if (!a.claim.trim()) out.push("내 주장을 한 문장으로 써 주세요.");
  if (!a.reasons.some((r) => r.text.trim())) out.push("주장을 뒷받침하는 근거를 하나 이상 써 주세요.");
  return out;
}

/** 학생이 쓴 모든 글 칸(논제 제외). key는 id 기반이라 순서를 바꿔도 같은 칸이다. */
export function debateFields(a: DebateArtifact): TextFieldLike[] {
  const f: TextFieldLike[] = [{ key: "claim", text: a.claim }];
  for (const r of a.reasons) f.push({ key: `reason.${r.id}.text`, text: r.text }, { key: `reason.${r.id}.support`, text: r.support }, { key: `reason.${r.id}.source`, text: r.source });
  for (const b of a.rebuttals) f.push({ key: `rebuttal.${b.id}.expected`, text: b.expected }, { key: `rebuttal.${b.id}.answer`, text: b.answer });
  f.push({ key: "reflection", text: a.reflection });
  return f;
}

/** 글 칸의 내용을 바꾼 새 값(원본은 그대로). 없는 칸은 건너뛴다. */
export function withDebateFields(a: DebateArtifact, values: Record<string, string>): DebateArtifact {
  const next = structuredClone(a);
  for (const [key, text] of Object.entries(values)) {
    if (key === "claim" || key === "reflection") {
      next[key] = text;
      continue;
    }
    const m = /^reason\.([a-z0-9]+)\.(text|support|source)$/.exec(key);
    if (m) {
      const x = next.reasons.find((r) => r.id === m[1]);
      if (x) x[m[2] as "text" | "support" | "source"] = text;
      continue;
    }
    const n = /^rebuttal\.([a-z0-9]+)\.(expected|answer)$/.exec(key);
    if (n) {
      const x = next.rebuttals.find((r) => r.id === n[1]);
      if (x) x[n[2] as "expected" | "answer"] = text;
    }
  }
  return next;
}

export type DebateWarningKind =
  | "no-side"
  | "no-claim"
  | "few-reasons"
  | "no-support"
  | "no-source"
  | "no-rebuttal"
  | "rebuttal-no-answer"
  | "exaggeration"
  | "disrespect";

export interface DebateWarning extends SpeakingWarning {
  kind: DebateWarningKind;
  /** 과장 표현의 위치(target 글 기준) */
  spans?: { start: number; end: number; word: string }[];
}

/** 상대를 깎아내리는 말(띄어쓰기를 뺀 글에서 찾는다) */
export const DISRESPECT_WORDS: readonly string[] = ["말도안돼", "말이안돼", "바보", "멍청", "웃기", "한심", "그것도몰라"];

export const DISRESPECT_MESSAGE = "상대의 생각을 존중하는 말로 바꿔 볼까요?";

export const findDisrespect = (text: string): string[] => {
  const t = squash(text);
  return DISRESPECT_WORDS.filter((w) => t.includes(w));
};

const ORDER: Record<DebateWarningKind, number> = {
  "no-side": 0,
  "no-claim": 1,
  "few-reasons": 2,
  "no-support": 3,
  "no-source": 4,
  "no-rebuttal": 5,
  "rebuttal-no-answer": 6,
  exaggeration: 7,
  disrespect: 8,
};

/** 토론 준비 점검. 제출을 막지 않는다(막는 것은 debateSubmitProblems). */
export function checkDebate(a: DebateArtifact): DebateWarning[] {
  const out: DebateWarning[] = [];
  if (!a.side) out.push({ id: "no-side", kind: "no-side", message: "찬성과 반대 중 어느 편에서 말할지 골라 봐요." });
  if (!a.claim.trim()) out.push({ id: "no-claim", kind: "no-claim", target: "claim", message: "내 주장을 한 문장으로 먼저 적어 봐요." });
  const reasons = a.reasons.filter((r) => r.text.trim());
  if (reasons.length < 2) out.push({ id: "few-reasons", kind: "few-reasons", message: "근거가 두 개 이상이면 더 믿음직해요. 근거를 하나 더 떠올려 볼까요?" });
  reasons.forEach((r) => {
    const no = a.reasons.indexOf(r) + 1;
    if (!r.support.trim()) {
      out.push({ id: `no-support-${r.id}`, kind: "no-support", target: `reason.${r.id}.support`, message: `${no}번 근거를 뒷받침할 자료(조사한 것, 겪은 일)를 적어 보면 좋아요.` });
    } else if (!r.source.trim()) {
      out.push({ id: `no-source-${r.id}`, kind: "no-source", target: `reason.${r.id}.source`, message: `${no}번 근거의 자료를 어디에서 알게 됐는지 출처를 적어 봐요.` });
    }
  });
  if (!a.rebuttals.some((b) => b.expected.trim())) {
    out.push({ id: "no-rebuttal", kind: "no-rebuttal", message: "상대편이 어떤 반론을 할지 미리 떠올려 보면 토론이 쉬워져요." });
  }
  a.rebuttals.forEach((b, i) => {
    if (b.expected.trim() && !b.answer.trim()) {
      out.push({ id: `rebuttal-no-answer-${b.id}`, kind: "rebuttal-no-answer", target: `rebuttal.${b.id}.answer`, message: `${i + 1}번 예상 반론에 내가 할 대답도 적어 봐요.` });
    }
  });
  const exagTargets = debateFields(a).filter((f) => f.key === "claim" || /^reason\.[a-z0-9]+\.(text|support)$/.test(f.key) || /^rebuttal\.[a-z0-9]+\.answer$/.test(f.key));
  for (const f of exagTargets) {
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
  const respectTargets = debateFields(a).filter((f) => f.key === "claim" || /^reason\.[a-z0-9]+\.(text|support)$/.test(f.key) || /^rebuttal\.[a-z0-9]+\.answer$/.test(f.key) || f.key === "reflection");
  for (const f of respectTargets) {
    if (len(f.text) && findDisrespect(f.text).length) out.push({ id: `disrespect-${f.key}`, kind: "disrespect", target: f.key, message: DISRESPECT_MESSAGE });
  }
  return out.sort((x, y) => ORDER[x.kind] - ORDER[y.kind]);
}
