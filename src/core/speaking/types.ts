// 말하기 준비 도구(토론 준비 [6국01-07], 면담 질문지 [6국01-04]) 핵심부 형식. 호스트와 무관한 순수 데이터다.

export const REASON_MAX = 3;
export const REBUTTAL_MAX = 3;
export const QUESTION_MIN = 3;
export const QUESTION_MAX = 8;
export const LEARNED_MAX = 3;

/** 글자 수 제한(글자 단위) */
export const DEBATE_LIMITS = {
  motion: 60,
  claim: 60,
  reason: 60,
  support: 100,
  source: 40,
  expected: 80,
  answer: 100,
  reflection: 100,
} as const;

export const INTERVIEW_LIMITS = {
  purpose: 80,
  interviewee: 30,
  question: 80,
  learned: 100,
  wonder: 100,
} as const;

export type DebateSide = "pro" | "con";

export interface DebateReason {
  id: string;
  /** 근거 */
  text: string;
  /** 뒷받침 자료(조사 결과, 겪은 일 등) */
  support: string;
  /** 출처 */
  source: string;
}

export interface DebateRebuttal {
  id: string;
  /** 상대편이 할 것 같은 반론 */
  expected: string;
  /** 그에 대한 내 답 */
  answer: string;
}

export interface DebateArtifact {
  kind: "debate";
  /** 논제. 교사가 정한 값이다(학생 글 칸이 아니다). 호스트가 withMotion으로 덮어쓴다. */
  motion: string;
  side: DebateSide | null;
  claim: string;
  reasons: DebateReason[];
  rebuttals: DebateRebuttal[];
  /** 토론을 마친 뒤 한 줄(선택) */
  reflection: string;
}

export type InterviewMethod = "meet" | "phone" | "video" | "letter";

export const INTERVIEW_METHODS: readonly InterviewMethod[] = ["meet", "phone", "video", "letter"];

export const METHOD_LABELS: Record<InterviewMethod, string> = {
  meet: "만나서",
  phone: "전화로",
  video: "영상 통화로",
  letter: "편지나 전자 우편으로",
};

/** 방법별 주의할 점 */
export const METHOD_TIPS: Record<InterviewMethod, string> = {
  meet: "약속한 시각보다 조금 일찍 가고, 상대의 말을 끝까지 들으며 눈을 마주쳐요.",
  phone: "상대가 통화하기 편한 시간을 먼저 여쭤봐요. 목소리만 들리니 또박또박 천천히 말해요.",
  video: "화면과 소리가 잘 나오는지 미리 확인해요. 말이 겹치지 않게 차례를 지켜요.",
  letter: "받는 사람이 답하기 쉽게 질문을 짧게 쓰고, 답을 받을 날짜를 알려 드려요.",
};

export interface InterviewQuestion {
  id: string;
  text: string;
}

export type ChecklistId = "appointment" | "greeting" | "permission" | "notes" | "thanks";

export const CHECKLIST_ITEMS: readonly { id: ChecklistId; label: string }[] = [
  { id: "appointment", label: "미리 약속하기" },
  { id: "greeting", label: "인사와 면담 목적 말하기" },
  { id: "permission", label: "기록(녹음·사진)은 허락받기" },
  { id: "notes", label: "들은 내용 확인하며 메모하기" },
  { id: "thanks", label: "고마움 전하기" },
];

export interface InterviewArtifact {
  kind: "interview";
  purpose: string;
  /** 면담할 사람: 이름 말고 하는 일(역할)로 */
  interviewee: string;
  method: InterviewMethod | null;
  questions: InterviewQuestion[];
  checklist: Record<ChecklistId, boolean>;
  /** 면담 뒤: 알게 된 것 */
  learned: string[];
  /** 면담 뒤: 더 궁금해진 것 */
  wonder: string;
}

export interface TextFieldLike {
  key: string;
  text: string;
}

export interface SpeakingWarning {
  id: string;
  kind: string;
  /** 글 칸 key(fieldsOf와 같은 key). 없으면 전체에 대한 안내 */
  target?: string;
  message: string;
}

// ── 발표 준비 [4국01-05](3~4학년) · [6국01-05](5~6학년) ─────────────────────────

export const SOURCE_MAX = 4;
export const POINT_MAX = 3;
export const POINT_MIN = 2;
export const PRACTICE_MAX = 10;
export const PRACTICE_SECONDS_MAX = 1800;
/** 목표 발표 시간(초): 교사가 1~5분 사이로 정한다 */
export const PRESENTATION_SECONDS_MIN = 60;
export const PRESENTATION_SECONDS_MAX = 300;
export const PRESENTATION_SECONDS_DEFAULT = 180;

/** 발표 준비의 칸은 메모라서 짧게 쓴다(원고 전체를 쓰게 하지 않는다). */
export const PRESENTATION_LIMITS = {
  topic: 40,
  audience: 30,
  name: 30,
  from: 40,
  keyInfo: 60,
  opening: 80,
  point: 80,
  closing: 80,
  reflection: 100,
} as const;

export type PresentationBand = "3-4" | "5-6";
export type PresentationPurpose = "inform" | "persuade" | "share";
export const PRESENTATION_PURPOSES: readonly PresentationPurpose[] = ["inform", "persuade", "share"];
export const PURPOSE_LABELS: Record<PresentationPurpose, string> = { inform: "알리기", persuade: "설득하기", share: "겪은 일 나누기" };

export type PresentationAid = "photo" | "table" | "graph" | "object" | "video" | "none";
export const PRESENTATION_AIDS: readonly PresentationAid[] = ["photo", "table", "graph", "object", "video", "none"];
export const AID_LABELS: Record<PresentationAid, string> = { photo: "사진", table: "표", graph: "그래프", object: "실물", video: "영상", none: "없음" };

export type SelfCheckId = "volume" | "pace" | "eyes" | "posture" | "gesture";
/** 연습 뒤 돌아보기(준언어·비언어, [4국01-03]) */
export const SELF_CHECK_ITEMS: readonly { id: SelfCheckId; label: string; hint: string }[] = [
  { id: "volume", label: "목소리 크기", hint: "뒤에 앉은 친구도 들리게" },
  { id: "pace", label: "빠르기", hint: "너무 빠르지 않게" },
  { id: "eyes", label: "눈 맞춤", hint: "듣는 사람을 바라보며" },
  { id: "posture", label: "바른 자세", hint: "몸을 흔들지 않고" },
  { id: "gesture", label: "몸짓", hint: "알맞은 손짓으로" },
];
/** 0 = 아직 안 함, 1~3 = 단계 */
export const SELF_CHECK_LEVELS = ["아직 안 했어요", "더 연습해요", "괜찮아요", "잘했어요"] as const;

export interface PresentationSource {
  id: string;
  /** 자료 이름 */
  name: string;
  /** 출처 */
  from: string;
  /** 이 자료에서 쓸 핵심 정보 */
  keyInfo: string;
  /** 믿을 만한가 스스로 체크(5~6학년만) */
  trust?: { who: boolean; when: boolean; evidence: boolean };
}

export interface PresentationPoint {
  id: string;
  /** 중요한 내용 메모 */
  text: string;
  /** 이 내용에 쓸 자료(자료 id) */
  sourceIds: string[];
  /** 보조 매체(5~6학년만) */
  aid: PresentationAid | null;
}

export interface PresentationArtifact {
  kind: "presentation";
  /** 학년대. 학급 학년으로 호스트가 withBand로 늘 덮어쓴다(학생 값이 아니다). */
  band: PresentationBand;
  topic: string;
  purpose: PresentationPurpose | null;
  audience: string;
  sources: PresentationSource[];
  opening: string;
  points: PresentationPoint[];
  closing: string;
  /** 연습에 걸린 시간(초), 오래된 것부터. 숫자만 저장한다. */
  practice: number[];
  selfCheck: Record<SelfCheckId, number>;
  /** 연습 뒤 한 줄 */
  reflection: string;
}
