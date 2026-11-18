// 면담 질문지: 형식 만들기·검사·점검. 규칙으로 돌리는 순수 함수이며 AI는 쓰지 않는다.
import {
  CHECKLIST_ITEMS,
  INTERVIEW_LIMITS as L,
  INTERVIEW_METHODS,
  LEARNED_MAX,
  QUESTION_MAX,
  QUESTION_MIN,
  type ChecklistId,
  type InterviewArtifact,
  type InterviewQuestion,
  type SpeakingWarning,
  type TextFieldLike,
} from "./types";
import { asRecord, clampStr, squash, uniqueId } from "./util";

export function emptyInterview(): InterviewArtifact {
  return {
    kind: "interview",
    purpose: "",
    interviewee: "",
    method: null,
    questions: [1, 2, 3].map((n) => ({ id: `q${n}`, text: "" })),
    checklist: { appointment: false, greeting: false, permission: false, notes: false, thanks: false },
    learned: ["", "", ""],
    wonder: "",
  };
}

/** 새 질문 칸(id가 겹치지 않게). 상한이면 null. */
export function newQuestion(existing: readonly InterviewQuestion[]): InterviewQuestion | null {
  if (existing.length >= QUESTION_MAX) return null;
  const used = new Set(existing.map((q) => q.id));
  let n = existing.length + 1;
  while (used.has(`q${n}`)) n++;
  return { id: `q${n}`, text: "" };
}

/** 밖에서 들어온 값을 안전한 면담 질문지 형식으로 고친다(글자 수·개수·id·고정 목록 검사). */
export function sanitizeInterview(raw: unknown): InterviewArtifact | null {
  const r = asRecord(raw);
  if (r.kind !== "interview") return null;
  const seen = new Set<string>();
  const questions = (Array.isArray(r.questions) ? r.questions : []).slice(0, QUESTION_MAX).map((x): InterviewQuestion => {
    const o = asRecord(x);
    return { id: uniqueId(o.id, seen, "q"), text: clampStr(o.text, L.question) };
  });
  const cl = asRecord(r.checklist);
  return {
    kind: "interview",
    purpose: clampStr(r.purpose, L.purpose),
    interviewee: clampStr(r.interviewee, L.interviewee),
    method: typeof r.method === "string" && (INTERVIEW_METHODS as readonly string[]).includes(r.method) ? (r.method as InterviewArtifact["method"]) : null,
    questions,
    checklist: {
      appointment: cl.appointment === true,
      greeting: cl.greeting === true,
      permission: cl.permission === true,
      notes: cl.notes === true,
      thanks: cl.thanks === true,
    },
    learned: (Array.isArray(r.learned) ? r.learned : []).slice(0, LEARNED_MAX).map((x) => clampStr(x, L.learned)),
    wonder: clampStr(r.wonder, L.wonder),
  };
}

/** 제출을 막는 꼭 필요한 것: 목적·면담할 사람·방법·질문 3개 이상 */
export function interviewSubmitProblems(a: InterviewArtifact): string[] {
  const out: string[] = [];
  if (!a.purpose.trim()) out.push("면담하는 목적을 써 주세요.");
  if (!a.interviewee.trim()) out.push("면담할 사람을 써 주세요.");
  if (!a.method) out.push("면담 방법을 골라 주세요.");
  if (a.questions.filter((q) => q.text.trim()).length < QUESTION_MIN) out.push(`질문을 ${QUESTION_MIN}개 이상 써 주세요.`);
  return out;
}

export function interviewFields(a: InterviewArtifact): TextFieldLike[] {
  const f: TextFieldLike[] = [
    { key: "purpose", text: a.purpose },
    { key: "interviewee", text: a.interviewee },
  ];
  for (const q of a.questions) f.push({ key: `question.${q.id}`, text: q.text });
  a.learned.forEach((t, i) => f.push({ key: `learned.${i}`, text: t }));
  f.push({ key: "wonder", text: a.wonder });
  return f;
}

export function withInterviewFields(a: InterviewArtifact, values: Record<string, string>): InterviewArtifact {
  const next = structuredClone(a);
  for (const [key, text] of Object.entries(values)) {
    if (key === "purpose" || key === "interviewee" || key === "wonder") {
      next[key] = text;
      continue;
    }
    const q = /^question\.([a-z0-9]+)$/.exec(key);
    if (q) {
      const x = next.questions.find((y) => y.id === q[1]);
      if (x) x.text = text;
      continue;
    }
    const l = /^learned\.(\d)$/.exec(key);
    if (l && Number(l[1]) < next.learned.length) next.learned[Number(l[1])] = text;
  }
  return next;
}

/** 대답이 짧은 "네/아니요"로 끝나기 쉬운지 가르는 물음말 */
export const OPEN_WORDS = /(무엇|무슨|왜|어떻게|어떤|언제|누구|어디|얼마나|어느|몇)/;

/** 상대가 대답하기 곤란할 수 있는 말(띄어쓰기를 뺀 글에서 찾는다) */
export const SENSITIVE_WORDS: readonly string[] = [
  "나이",
  "몇살",
  "사는곳",
  "어디살",
  "어디에살",
  "집이어디",
  "주소",
  "전화번호",
  "월급",
  "연봉",
  "돈을얼마",
  "버는돈",
  "얼마나벌",
  "얼마나버",
];

/** 하는 일(역할)을 나타내는 낱말: 면담할 사람 칸이 이 낱말로 끝나면 역할로 본다 */
export const ROLE_ENDINGS: readonly string[] = [
  "선생님", "선생", "사장님", "님", "아저씨", "아주머니", "아줌마", "이모", "삼촌", "고모", "할머니", "할아버지", "언니", "형", "누나", "오빠",
  "의사", "소방관", "경찰관", "기자", "작가", "주무관", "직원", "원장", "교장", "교감", "관장", "조리사", "영양사", "간호사", "기사", "요리사",
  "사서", "교사", "약사", "농부", "어부", "점원", "선수", "감독", "대표", "이장", "경비원", "환경미화원",
];

const HANGUL_NAME = /^[가-힣]{2,4}$/;

/** 이름처럼 보이는가: 역할 낱말로 끝나지 않는 2~4글자 한글 한 덩어리 */
export function looksLikeName(interviewee: string): boolean {
  const t = interviewee.trim();
  if (!HANGUL_NAME.test(t)) return false;
  return !ROLE_ENDINGS.some((r) => t.endsWith(r));
}

const stripPunct = (s: string) => squash(s).replace(/[\p{P}\p{S}]/gu, "");

export type InterviewWarningKind = "closed-question" | "sensitive-question" | "real-name" | "few-questions" | "duplicate-question" | "checklist";

export interface InterviewWarning extends SpeakingWarning {
  kind: InterviewWarningKind;
}

const ORDER: Record<InterviewWarningKind, number> = {
  "real-name": 0,
  "few-questions": 1,
  "sensitive-question": 2,
  "closed-question": 3,
  "duplicate-question": 4,
  checklist: 5,
};

/** 면담 질문지 점검. 제출을 막지 않는다(막는 것은 interviewSubmitProblems). 질문 하나에는 경고를 하나만 한다. */
export function checkInterview(a: InterviewArtifact): InterviewWarning[] {
  const out: InterviewWarning[] = [];
  if (looksLikeName(a.interviewee)) {
    out.push({ id: "real-name", kind: "real-name", target: "interviewee", message: "이름 대신 ‘보건 선생님’처럼 하는 일로 적어 줘요." });
  }
  const filled = a.questions.filter((q) => q.text.trim());
  if (filled.length < QUESTION_MIN) {
    out.push({ id: "few-questions", kind: "few-questions", message: `질문이 ${QUESTION_MIN}개 이상이면 더 많은 이야기를 들을 수 있어요.` });
  }
  const seen = new Set<string>();
  a.questions.forEach((q, i) => {
    if (!q.text.trim()) return;
    const no = i + 1;
    const key = stripPunct(q.text);
    if (seen.has(key)) {
      out.push({ id: `duplicate-question-${q.id}`, kind: "duplicate-question", target: `question.${q.id}`, message: `${no}번 질문이 앞의 질문과 같아요. 다른 것을 물어볼까요?` });
      return;
    }
    seen.add(key);
    const sq = squash(q.text);
    if (SENSITIVE_WORDS.some((w) => sq.includes(w))) {
      out.push({ id: `sensitive-${q.id}`, kind: "sensitive-question", target: `question.${q.id}`, message: "상대가 대답하기 곤란할 수 있어요. 꼭 필요한 질문인가요?" });
    } else if (!OPEN_WORDS.test(q.text)) {
      out.push({ id: `closed-${q.id}`, kind: "closed-question", target: `question.${q.id}`, message: "더 자세한 대답을 들을 수 있게 바꿔 볼까요?" });
    }
  });
  const missing = CHECKLIST_ITEMS.filter((c) => !a.checklist[c.id as ChecklistId]);
  if (missing.length) {
    out.push({ id: "checklist", kind: "checklist", message: `절차 확인표에서 아직 체크하지 않은 것이 있어요: ${missing.map((m) => m.label).join(", ")}.` });
  }
  return out.sort((x, y) => ORDER[x.kind] - ORDER[y.kind]);
}
