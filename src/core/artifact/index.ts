// 학생이 만드는 제작물(카드뉴스·매체 이용 일지)의 공통 처리: 형식 고르기, 글 칸 목록, 안전 점검.
// 호스트는 저장·제출 때마다 scanSafety를 돌려, 걸린 칸은 새 글을 저장하지 않는다.
import { classifyInput, DISTRESS_REPLY, PERSONAL_INFO_REPLY } from "@/core/coach/guard";
import { emptyCardnews, sanitizeCardnews, submitProblems as cardnewsProblems } from "@/core/cardnews";
import type { CardnewsArtifact } from "@/core/cardnews";
import { emptyDiary, sanitizeDiary, submitProblems as diaryProblems } from "@/core/diary";
import type { DiaryArtifact } from "@/core/diary";

export type Artifact = CardnewsArtifact | DiaryArtifact;
export type ArtifactKind = Artifact["kind"];

export const ARTIFACT_KINDS: readonly ArtifactKind[] = ["cardnews", "media-diary"];
export const isArtifactKind = (x: unknown): x is ArtifactKind => typeof x === "string" && (ARTIFACT_KINDS as readonly string[]).includes(x);

export function emptyArtifact(kind: ArtifactKind): Artifact {
  return kind === "cardnews" ? emptyCardnews() : emptyDiary();
}

/** 밖에서 들어온 값을 해당 종류의 안전한 형식으로 고친다. 형식이 맞지 않으면 null. */
export function sanitizeArtifact(kind: ArtifactKind, raw: unknown, prev?: Artifact | null): Artifact | null {
  if (kind === "cardnews") return sanitizeCardnews(raw, prev?.kind === "cardnews" ? prev : null);
  return sanitizeDiary(raw, prev?.kind === "media-diary" ? prev : null);
}

export function submitProblems(a: Artifact): string[] {
  return a.kind === "cardnews" ? cardnewsProblems(a) : diaryProblems(a);
}

export interface TextField {
  /** 안정된 칸 이름. 카드는 위치가 아니라 카드 id로 가리킨다(순서를 바꿔도 같은 칸). */
  key: string;
  text: string;
}

/** 학생이 쓴 모든 글 칸 */
export function fieldsOf(a: Artifact): TextField[] {
  if (a.kind === "cardnews") {
    const f: TextField[] = [
      { key: "plan.topic", text: a.plan.topic },
      { key: "plan.audience", text: a.plan.audience },
      { key: "plan.keyMessage", text: a.plan.keyMessage },
    ];
    a.plan.sources.forEach((s, i) => {
      f.push({ key: `plan.source.${i}.title`, text: s.title }, { key: `plan.source.${i}.where`, text: s.where });
    });
    for (const c of a.cards) f.push({ key: `card.${c.id}.title`, text: c.title }, { key: `card.${c.id}.body`, text: c.body });
    return f;
  }
  const f: TextField[] = [];
  for (const e of a.entries) f.push({ key: `entry.${e.day}.note`, text: e.note });
  f.push({ key: "reflection.good", text: a.reflection.good }, { key: "reflection.change", text: a.reflection.change }, { key: "reflection.promise", text: a.reflection.promise });
  return f;
}

/** 글 칸의 내용을 바꾼 새 제작물(원본은 그대로). 없는 칸은 건너뛴다. */
export function withFields(a: Artifact, values: Record<string, string>): Artifact {
  const next = structuredClone(a);
  const set = (key: string, text: string) => {
    if (next.kind === "cardnews") {
      const m = /^card\.([a-z0-9]+)\.(title|body)$/.exec(key);
      if (m) {
        const c = next.cards.find((x) => x.id === m[1]);
        if (c) c[m[2] as "title" | "body"] = text;
        return;
      }
      const s = /^plan\.source\.(\d+)\.(title|where)$/.exec(key);
      if (s) {
        const src = next.plan.sources[Number(s[1])];
        if (src) src[s[2] as "title" | "where"] = text;
        return;
      }
      if (key === "plan.topic" || key === "plan.audience" || key === "plan.keyMessage") next.plan[key.slice(5) as "topic" | "audience" | "keyMessage"] = text;
      return;
    }
    const n = /^entry\.(\d)\.note$/.exec(key);
    if (n) {
      const e = next.entries.find((x) => x.day === Number(n[1]));
      if (e) e.note = text;
      return;
    }
    const r = /^reflection\.(good|change|promise)$/.exec(key);
    if (r) next.reflection[r[1] as "good" | "change" | "promise"] = text;
  };
  for (const [k, v] of Object.entries(values)) set(k, v);
  return next;
}

export type SafetyKind = "distress" | "personal_info";

export interface SafetyHit {
  key: string;
  kind: SafetyKind;
}

export interface SafetyScan {
  /** 걸린 칸의 새 글을 이전 글로 되돌린 제작물 */
  artifact: Artifact;
  hits: SafetyHit[];
  /** 가장 심한 것 하나(힘든 일 > 개인 정보) */
  kind: SafetyKind | null;
  /** 학생에게 보여 줄 정해진 안내(코치와 같은 문장) */
  reply: string | null;
}

/** 글 한 칸의 안전 분류. 힘든 일 언급이 개인 정보보다 먼저다. */
export function classifyField(text: string): SafetyKind | null {
  const flags = classifyInput(text);
  if (flags.distress) return "distress";
  if (flags.personalInfo) return "personal_info";
  return null;
}

/**
 * 이전에 저장된 글과 달라진 칸마다 위험 신호·개인 정보를 확인한다.
 * 걸린 칸은 새 글을 저장하지 않고 이전 글(없으면 빈 글)로 되돌린다.
 */
export function scanSafety(prev: Artifact | null, next: Artifact): SafetyScan {
  const prevMap = new Map((prev ? fieldsOf(prev) : []).map((f) => [f.key, f.text]));
  const hits: SafetyHit[] = [];
  const revert: Record<string, string> = {};
  for (const f of fieldsOf(next)) {
    const before = prevMap.get(f.key) ?? "";
    if (f.text === before || !f.text.trim()) continue;
    const kind = classifyField(f.text);
    if (kind) {
      hits.push({ key: f.key, kind });
      revert[f.key] = before;
    }
  }
  const kind: SafetyKind | null = hits.some((h) => h.kind === "distress") ? "distress" : hits.length ? "personal_info" : null;
  return {
    artifact: hits.length ? withFields(next, revert) : next,
    hits,
    kind,
    reply: kind === "distress" ? DISTRESS_REPLY.reply : kind === "personal_info" ? PERSONAL_INFO_REPLY.reply : null,
  };
}

/** 칸 이름을 학생·교사 화면용 한글로 */
export function fieldLabel(a: Artifact, key: string): string {
  if (a.kind === "cardnews") {
    const m = /^card\.([a-z0-9]+)\.(title|body)$/.exec(key);
    if (m) {
      const i = a.cards.findIndex((c) => c.id === m[1]);
      return `${i + 1}번 카드 ${m[2] === "title" ? "제목" : "본문"}`;
    }
    if (key.startsWith("plan.source")) return "출처";
    return { "plan.topic": "주제", "plan.audience": "읽을 사람", "plan.keyMessage": "핵심 문장" }[key] ?? "계획";
  }
  const n = /^entry\.(\d)\.note$/.exec(key);
  if (n) return `${n[1]}일째 한 줄 생각`;
  return { "reflection.good": "잘한 점", "reflection.change": "바꾸고 싶은 점", "reflection.promise": "다음 약속" }[key] ?? "성찰";
}

export interface ArtifactActivity {
  kind: ArtifactKind;
  title: string;
  description: string;
  standardCode: string;
  /** 이 학년 이상에서만 낼 수 있다 */
  minGrade: number;
}

/** 교사가 낼 수 있는 제작 활동(과제 종류 = kind) */
export const ARTIFACT_ACTIVITIES: readonly ArtifactActivity[] = [
  {
    kind: "cardnews",
    title: "카드뉴스 만들기",
    description: "읽을 사람을 정해 4~6장짜리 카드뉴스를 만들어요. 스스로 점검한 뒤 제출하고, 선생님이 공유를 허락하면 반 친구들이 스티커로 반응을 남겨요.",
    standardCode: "6국06-03",
    minGrade: 5,
  },
  {
    kind: "media-diary",
    title: "매체 이용 성찰 일지",
    description: "일주일 동안 영상·게임·대화·검색·책 읽기에 쓴 시간을 기록하고, 내 매체 이용을 돌아보는 글을 써요. 친구와 공유하지 않아요.",
    standardCode: "6국06-04",
    minGrade: 5,
  },
];

export const artifactActivity = (kind: string): ArtifactActivity | undefined => ARTIFACT_ACTIVITIES.find((x) => x.kind === kind);
export const artifactActivitiesForGrade = (grade: number): ArtifactActivity[] => ARTIFACT_ACTIVITIES.filter((x) => grade >= x.minGrade);
