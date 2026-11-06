// 읽기 활동 핵심부의 자료 형식. Next.js·DB에 의존하지 않는다.

export type Genre = "설명하는 글" | "의견이 담긴 글" | "논설문" | "이야기";

export interface Sentence {
  /** 지문 안에서 겹치지 않는 번호. 예: "s2-3"(2문단 3번째 문장) */
  id: string;
  text: string;
}

export interface Paragraph {
  /** 예: "p2" */
  id: string;
  sentences: Sentence[];
}

export interface Passage {
  /** 예: "mi-cat" */
  id: string;
  title: string;
  genre: Genre;
  gradeBand: "3-4" | "5-6";
  paragraphs: Paragraph[];
}

/**
 * 문제 공통 필드. 학생 기기로 보낼 때는 정답 필드를 빼야 한다.
 * 정답 필드: sentence-pick의 correctSentenceIds, label-sentences의 answers,
 * slot-paragraphs의 slots[].paragraphIds, choice의 correctOption,
 * choice-with-evidence의 correctOption·evidenceIds.
 * 그리고 principle·hints·explanation은 단계에 맞게 나중에 보여 준다.
 */
interface ItemBase {
  /** 예: "ma-01" */
  id: string;
  passageId: string;
  /** src/core/data/standards.ts에 있는 성취기준 코드 */
  standardCode: string;
  grade: 3 | 4 | 5 | 6;
  /** 학생에게 보이는 안내(해요체) */
  prompt: string;
  /** 틀렸을 때 보이는 개념 설명(해요체, 정답을 알려 주지 않음) */
  principle: string;
  /** 힌트 1(2번째 오답 뒤), 힌트 2(3번째 오답 뒤). 정답을 직접 알려 주지 않음 */
  hints: [string, string];
  /** 정답과 함께 보이는 설명(4번째 오답 뒤 또는 정답 뒤) */
  explanation: string;
}

/** 지문(또는 지정한 문단)의 문장 중 하나를 누르는 문제 */
export interface SentencePickItem extends ItemBase {
  type: "sentence-pick";
  /** 지정하면 그 문단의 문장만 고를 수 있다. 없으면 지문 전체 */
  paragraphId?: string;
  /** 정답 문장 id(기본은 하나. 둘 이상이면 어느 것을 골라도 정답) */
  correctSentenceIds: string[];
}

/** 지정한 문장마다 꼬리표(예: 사실/의견)를 다는 문제. 모두 맞아야 정답 */
export interface LabelSentencesItem extends ItemBase {
  type: "label-sentences";
  /** 꼬리표를 달 문장(2~4개, 지문 순서) */
  sentenceIds: string[];
  /** 꼬리표 목록(2~3개) */
  labels: string[];
  /** 문장 id → 정답 꼬리표 */
  answers: Record<string, string>;
}

export interface Slot {
  id: string;
  label: string;
  /** 이 칸에 들어갈 문단 id(1개 이상) */
  paragraphIds: string[];
}

/** 문단을 짜임 칸에 놓는 문제 */
export interface SlotParagraphsItem extends ItemBase {
  type: "slot-paragraphs";
  /** 칸에 놓을 문단 id(지문 순서) */
  paragraphIds: string[];
  slots: Slot[];
}

/** 보기 중 하나를 고르는 문제(간추린 글, 주제·주장 고르기) */
export interface ReadingChoiceItem extends ItemBase {
  type: "choice";
  /** 보기(3~4개, 서로 달라야 한다) */
  options: string[];
  correctOption: number;
}

/** 보기를 고르고, 그렇게 생각한 근거 문장을 고르는 문제 */
export interface ChoiceWithEvidenceItem extends ItemBase {
  type: "choice-with-evidence";
  options: string[];
  correctOption: number;
  /** 근거로 인정하는 문장 id 목록(학생은 하나를 고르고, 목록에 있으면 맞다) */
  evidenceIds: string[];
}

export type ReadingItem =
  | SentencePickItem
  | LabelSentencesItem
  | SlotParagraphsItem
  | ReadingChoiceItem
  | ChoiceWithEvidenceItem;

export type ReadingAnswer =
  | { type: "sentence-pick"; sentenceId: string }
  | { type: "label-sentences"; labels: Record<string, string> }
  /** placement: 문단 id → 칸 id */
  | { type: "slot-paragraphs"; placement: Record<string, string> }
  | { type: "choice"; option: number }
  | { type: "choice-with-evidence"; option: number; sentenceId: string };

export interface ReadingActivity {
  id: string;
  title: string;
  standardCode: string;
  gradeBand: "3-4" | "5-6";
  description: string;
  passageIds: string[];
  itemIds: string[];
}
