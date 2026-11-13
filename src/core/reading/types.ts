// 읽기 활동 핵심부의 자료 형식. Next.js·DB에 의존하지 않는다.

export type Genre = "설명하는 글" | "의견이 담긴 글" | "논설문" | "이야기" | "동화" | "시" | "대화" | "발표" | "연설";
// 대화·발표·연설은 듣기 자료(소리·말 나래)의 갈래다. 말차례 하나가 문단 하나다.

export interface Sentence {
  /** 지문 안에서 겹치지 않는 번호. 예: "s2-3"(2문단 3번째 문장) */
  id: string;
  text: string;
}

export interface Paragraph {
  /** 예: "p2" */
  id: string;
  /**
   * 듣기 자료(대화·발표·연설)에서만 쓴다: 이 말차례를 말한 사람(지어낸 이름이나 "엄마" 같은 역할).
   * 문단 하나가 말차례 하나다. 읽기 지문에서는 쓰지 않는다.
   */
  speaker?: string;
  sentences: Sentence[];
}

/** 연습용 가상 웹 페이지의 종류 */
export type PageKind = "블로그" | "백과" | "공공기관" | "뉴스" | "광고" | "게시판" | "쇼핑";

/**
 * 가상 웹 페이지 정보(미디어 나래). 호스트는 이 정보로 지문을 가짜 웹 페이지 모양으로 보여 준다.
 * address는 실제 주소와 겹치지 않도록 ".가상"으로 끝나는 지어낸 주소만 쓴다(예: "haesol-safety.가상").
 */
export interface PageMeta {
  kind: PageKind;
  /** 사이트 이름(지어낸 이름) */
  site: string;
  address: string;
  author?: string;
  /** 예: "2026년 3월 12일" */
  date?: string;
  /** 출처 표시(예: 어떤 자료에서 가져왔는지) */
  sourceNote?: string;
  isAd?: boolean;
}

export interface Passage {
  /** 예: "mi-cat" */
  id: string;
  title: string;
  genre: Genre;
  gradeBand: "3-4" | "5-6";
  paragraphs: Paragraph[];
  /**
   * 가상 웹 페이지일 때만 쓴다. 약속: 첫 문단은 페이지 정보 문단(id가 "meta" 또는 "접두사-meta")이고,
   * 정보 한 줄이 문장 하나다. 그래서 정보 줄도 문장 고르기·꼬리표·근거 고르기에 그대로 쓸 수 있다.
   * 줄 모양: "사이트: …", "주소: …", "글쓴이: …", "날짜: …", "출처: …", "광고: …"
   * (page의 author·date·sourceNote·isAd가 있으면 그 줄이 반드시 있어야 하고, validatePassage가 확인한다.
   * 글쓴이·날짜·출처가 없는 페이지는 "글쓴이: 밝히지 않았어요"처럼 없다는 사실을 줄로 적을 수 있다.)
   */
  page?: PageMeta;
}

/**
 * 문제 공통 필드. 학생 기기로 보낼 때는 정답 필드를 빼야 한다.
 * 정답 필드: summary-write의 paragraphs(핵심 낱말·topicHint), sentence-pick의 correctSentenceIds, label-sentences의 answers,
 * slot-paragraphs의 slots[].paragraphIds, choice의 correctOption,
 * choice-with-evidence의 correctOption·evidenceIds.
 * 그리고 principle·hints·explanation은 단계에 맞게 나중에 보여 준다.
 */
export interface ItemBase {
  /** 예: "ma-01" */
  id: string;
  /** 문제의 (첫) 지문 */
  passageId: string;
  /**
   * 지문 둘(미디어 나래의 가상 페이지 비교는 셋까지)을 함께 읽는 문제일 때만 쓴다. 첫 번째는 passageId와 같다.
   * 두 지문의 문장 id·문단 id는 서로 겹치면 안 된다(지문을 만들 때 접두사로 구분하고 validateItem이 확인한다).
   */
  passageIds?: string[];
  /**
   * 예측하며 읽기: 이 문제를 풀 때 학생에게 보이는 마지막 문단 id. 그 뒤 문단은 이 문제를 풀기 전까지 학생 기기로 보내지 않는다.
   * 근거 문장도 보이는 문단 안에서만 고른다. 없으면 지문 전체가 보인다.
   */
  revealUpTo?: string;
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

export interface SummaryParagraphSpec {
  paragraphId: string;
  /**
   * 핵심 낱말 묶음 여러 개. 묶음 안의 낱말이 모두 요약에 들어 있으면 그 묶음이 맞고,
   * 묶음 하나라도 맞으면 이 문단이 반영된 것으로 본다(같은 뜻의 다른 표현을 허용하려고 묶음을 여러 개 둔다).
   * 낱말은 어간·부분 글자도 되지만(띄어쓰기·문장부호는 지우고 비교) 너무 짧아 아무 데나 맞지 않게 쓴다.
   */
  keyGroups: string[][];
  /** 이 문단이 빠졌을 때 보여 줄, 내용을 알려 주지 않는 힌트 한 문장(해요체). 핵심 낱말을 넣지 않는다. */
  topicHint: string;
}

/** 학생이 지문을 자기 말로 요약해 쓰는 문제. 정답/오답이 아니라 고쳐 쓰기를 되풀이한다. */
export interface SummaryWriteItem extends ItemBase {
  type: "summary-write";
  /** 지문의 모든 문단을 순서대로 */
  paragraphs: SummaryParagraphSpec[];
  /** 공백을 뺀 글자 수의 범위 */
  minChars: number;
  maxChars: number;
}

export type ReadingItem =
  | SentencePickItem
  | LabelSentencesItem
  | SlotParagraphsItem
  | ReadingChoiceItem
  | ChoiceWithEvidenceItem
  | SummaryWriteItem;

export type ReadingAnswer =
  | { type: "sentence-pick"; sentenceId: string }
  | { type: "label-sentences"; labels: Record<string, string> }
  /** placement: 문단 id → 칸 id */
  | { type: "slot-paragraphs"; placement: Record<string, string> }
  | { type: "choice"; option: number }
  | { type: "choice-with-evidence"; option: number; sentenceId: string }
  /** submitAsIs: 여러 번 고쳐 쓴 뒤 선생님께 그대로 내기 */
  | { type: "summary-write"; text: string; submitAsIs?: boolean };

export interface ReadingActivity {
  id: string;
  title: string;
  standardCode: string;
  gradeBand: "3-4" | "5-6";
  description: string;
  passageIds: string[];
  itemIds: string[];
}
