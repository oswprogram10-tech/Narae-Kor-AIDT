// 문법 활동 핵심부의 자료 형식. Next.js·DB에 의존하지 않는다.

/**
 * 블록의 역할.
 * indirect-object: ~에게/~께, time-place: 언제/어디에서, manner: 천천히·열심히처럼 움직임을 꾸미는 말,
 * degree: 아주처럼 정도를 나타내는 말, modifier: 서술어 명사를 꾸미는 말(예: 친절한).
 */
export type BlockRole =
  | "subject"
  | "object"
  | "indirect-object"
  | "time-place"
  | "manner"
  | "degree"
  | "modifier"
  | "predicate";

export interface Block {
  id: string;
  text: string;
  role: BlockRole;
}

interface ItemBase {
  /** 문제 고유 번호. 예: "sb-01" */
  id: string;
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

export interface SentenceBuildItem extends ItemBase {
  type: "sentence-build";
  /** 3~5개. 정답이 아닌 순서로 섞어서 둔다 */
  blocks: Block[];
  /** 자연스러운 모든 순서(블록 id 전체). answers[0]은 '누가'로 시작하는 기본 순서 */
  answers: string[][];
  /** 뜻은 통하지만 어색한 순서. 오답으로 세지 않고 부드럽게 안내한다(classifyOrder가 계산) */
  awkward: string[][];
}

export interface AgreementFixItem extends ItemBase {
  type: "agreement-fix";
  category: "honorific" | "adverb-predicate" | "subject-predicate" | "tense";
  /** 문장을 어절로 나눈 것. 문장부호는 어절에 붙여 둔다 */
  tokens: string[];
  /** 어색한 어절 하나의 자리 */
  wrongIndex: number;
  /** 바꿔 쓸 후보(3~4개) */
  options: string[];
  /** options에서 정답의 자리(정답은 하나) */
  correctOption: number;
}

export type GrammarItem = SentenceBuildItem | AgreementFixItem;

export type GrammarAnswer =
  | { type: "sentence-build"; order: string[] }
  | { type: "agreement-fix"; index: number; option: number };

export interface GrammarActivity {
  id: string;
  title: string;
  standardCode: string;
  gradeBand: "3-4" | "5-6";
  description: string;
  itemIds: string[];
}
