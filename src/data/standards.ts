// 2022 개정 국어과 교육과정(교육부 고시 제2022-33호 [별책 5]) 초등학교 성취기준 87개.
// 출처: 국어과 교육과정 고시 원문을 옮긴 자료(나무위키 「2022 개정 교육과정/국어과」, Lesson Flow 성취기준 목록)를 서로 대조함.
// 연구·대회 제출 전 국가교육과정정보센터(NCIC) 원문과 최종 대조할 것.

export type GradeBand = "1-2" | "3-4" | "5-6";
export type Area = "듣기·말하기" | "읽기" | "쓰기" | "문법" | "문학" | "매체";

export interface Standard {
  code: string; // 예: "4국03-01"
  gradeBand: GradeBand;
  area: Area;
  statement: string;
}

export const STANDARDS: readonly Standard[] = [
  { code: "2국01-01", gradeBand: "1-2", area: "듣기·말하기", statement: "중요한 내용이나 일이 일어난 순서를 고려하며 듣고 말한다." },
  { code: "2국01-02", gradeBand: "1-2", area: "듣기·말하기", statement: "바르고 고운 말로 서로의 감정을 나누며 듣고 말한다." },
  { code: "2국01-03", gradeBand: "1-2", area: "듣기·말하기", statement: "상대의 말을 집중하여 듣고 말차례를 지키며 대화한다." },
  { code: "2국01-04", gradeBand: "1-2", area: "듣기·말하기", statement: "자신의 경험이나 생각을 바른 자세로 발표한다." },
  { code: "2국01-05", gradeBand: "1-2", area: "듣기·말하기", statement: "듣기와 말하기에 관심과 흥미를 가진다." },
  { code: "2국02-01", gradeBand: "1-2", area: "읽기", statement: "글자, 단어, 문장, 짧은 글을 정확하게 소리 내어 읽는다." },
  { code: "2국02-02", gradeBand: "1-2", area: "읽기", statement: "의미가 잘 드러나도록 문장과 짧은 글을 알맞게 띄어 읽는다." },
  { code: "2국02-03", gradeBand: "1-2", area: "읽기", statement: "글을 읽고 중심 내용을 확인한다." },
  { code: "2국02-04", gradeBand: "1-2", area: "읽기", statement: "인물의 마음이나 생각을 짐작하고 이를 자신과 비교하며 글을 읽는다." },
  { code: "2국02-05", gradeBand: "1-2", area: "읽기", statement: "읽기에 흥미를 가지고 즐겨 읽는 태도를 지닌다." },
  { code: "2국03-01", gradeBand: "1-2", area: "쓰기", statement: "글자와 단어를 바르게 쓴다." },
  { code: "2국03-02", gradeBand: "1-2", area: "쓰기", statement: "쓰기에 흥미를 가지며 자신의 생각이나 느낌을 문장으로 표현한다." },
  { code: "2국03-03", gradeBand: "1-2", area: "쓰기", statement: "주변 소재에 대해 소개하는 글을 쓴다." },
  { code: "2국03-04", gradeBand: "1-2", area: "쓰기", statement: "겪은 일을 표현하는 글을 자유롭게 쓰고, 쓴 글을 함께 읽고 생각이나 느낌을 나눈다." },
  { code: "2국04-01", gradeBand: "1-2", area: "문법", statement: "한글 자모의 이름과 소릿값을 알고 정확하게 발음하고 쓴다." },
  { code: "2국04-02", gradeBand: "1-2", area: "문법", statement: "소리와 표기가 다를 수 있음을 알고 단어를 바르게 읽고 쓴다." },
  { code: "2국04-03", gradeBand: "1-2", area: "문법", statement: "문장과 문장 부호를 알맞게 쓰고 한글에 호기심을 가진다." },
  { code: "2국05-01", gradeBand: "1-2", area: "문학", statement: "말놀이, 낭송 등을 통해 말의 재미와 즐거움을 느낀다." },
  { code: "2국05-02", gradeBand: "1-2", area: "문학", statement: "작품을 듣거나 읽으면서 느끼거나 생각한 점을 말한다." },
  { code: "2국05-03", gradeBand: "1-2", area: "문학", statement: "작품 속 인물의 모습, 행동, 마음을 상상하여 시, 노래, 이야기, 그림 등으로 표현한다." },
  { code: "2국05-04", gradeBand: "1-2", area: "문학", statement: "시나 노래, 이야기에 흥미를 가진다." },
  { code: "2국06-01", gradeBand: "1-2", area: "매체", statement: "일상의 다양한 매체와 매체 자료에 흥미와 관심을 가진다." },
  { code: "2국06-02", gradeBand: "1-2", area: "매체", statement: "일상의 경험과 생각을 글과 그림으로 표현한다." },
  { code: "4국01-01", gradeBand: "3-4", area: "듣기·말하기", statement: "중요한 내용과 주제를 파악하며 듣고 그 내용을 요약한다." },
  { code: "4국01-02", gradeBand: "3-4", area: "듣기·말하기", statement: "원인과 결과의 관계를 고려하여 내용을 예측하며 듣고 말한다." },
  { code: "4국01-03", gradeBand: "3-4", area: "듣기·말하기", statement: "상황에 적절한 준언어·비언어적 표현을 활용하여 듣고 말한다." },
  { code: "4국01-04", gradeBand: "3-4", area: "듣기·말하기", statement: "상황과 상대의 입장을 이해하고 예의를 지키며 대화한다." },
  { code: "4국01-05", gradeBand: "3-4", area: "듣기·말하기", statement: "목적과 주제에 알맞게 자료를 정리하여 자신감 있게 발표한다." },
  { code: "4국01-06", gradeBand: "3-4", area: "듣기·말하기", statement: "주제에 적절한 의견과 이유를 제시하고 서로의 생각을 교환하며 토의한다." },
  { code: "4국02-01", gradeBand: "3-4", area: "읽기", statement: "글의 의미를 파악하며 유창하게 글을 읽는다." },
  { code: "4국02-02", gradeBand: "3-4", area: "읽기", statement: "문단과 글에서 중심 생각을 파악하고 내용을 간추린다." },
  { code: "4국02-03", gradeBand: "3-4", area: "읽기", statement: "질문을 활용하여 글을 예측하며 읽고 자신의 읽기 과정을 점검한다." },
  { code: "4국02-04", gradeBand: "3-4", area: "읽기", statement: "글에 나타난 사실과 의견을 구분하고 필자와 자신의 의견을 비교한다." },
  { code: "4국02-05", gradeBand: "3-4", area: "읽기", statement: "글이나 자료의 출처가 믿을 만한지 판단한다." },
  { code: "4국02-06", gradeBand: "3-4", area: "읽기", statement: "바람직한 읽기 습관을 형성하고 읽기에 대한 자신감을 기른다." },
  { code: "4국03-01", gradeBand: "3-4", area: "쓰기", statement: "중심 문장과 뒷받침 문장을 갖추어 문단을 쓰고, 문장과 문단을 중심으로 고쳐 쓴다." },
  { code: "4국03-02", gradeBand: "3-4", area: "쓰기", statement: "절차와 결과가 드러나게 정확한 표현으로 보고하는 글을 쓴다." },
  { code: "4국03-03", gradeBand: "3-4", area: "쓰기", statement: "대상에 대한 자신의 의견과 그렇게 생각한 이유가 드러나게 글을 쓴다." },
  { code: "4국03-04", gradeBand: "3-4", area: "쓰기", statement: "목적과 주제를 고려하여 독자에게 마음을 전하는 글을 쓴다." },
  { code: "4국03-05", gradeBand: "3-4", area: "쓰기", statement: "자신의 쓰기 과정을 점검하며 쓰기에 자신감을 갖는다." },
  { code: "4국04-01", gradeBand: "3-4", area: "문법", statement: "단어와 단어 간의 의미 관계를 파악한다." },
  { code: "4국04-02", gradeBand: "3-4", area: "문법", statement: "단어를 분류하고 국어사전을 활용하여 능동적인 국어 활동을 한다." },
  { code: "4국04-03", gradeBand: "3-4", area: "문법", statement: "기본적인 문장의 짜임을 이해하고 적절하게 사용한다." },
  { code: "4국04-04", gradeBand: "3-4", area: "문법", statement: "글과 담화에 쓰인 높임 표현과 지시·접속 표현을 이해하고 상황에 맞게 표현한다." },
  { code: "4국04-05", gradeBand: "3-4", area: "문법", statement: "언어가 의사소통과 관계 형성의 수단임을 이해하고 국어를 소중히 여기는 태도를 지닌다." },
  { code: "4국05-01", gradeBand: "3-4", area: "문학", statement: "인물과 이야기의 흐름을 중심으로 작품을 감상한다." },
  { code: "4국05-02", gradeBand: "3-4", area: "문학", statement: "자신의 경험을 바탕으로 작품 속 세계와 현실 세계를 비교하여 작품을 감상한다." },
  { code: "4국05-03", gradeBand: "3-4", area: "문학", statement: "작품을 듣거나 읽고 마음에 드는 작품을 소개한다." },
  { code: "4국05-04", gradeBand: "3-4", area: "문학", statement: "감각적 표현에 유의하여 작품을 감상하고, 감각적 표현을 활용하여 자신의 생각이나 감정을 표현한다." },
  { code: "4국05-05", gradeBand: "3-4", area: "문학", statement: "재미나 감동을 느끼며 작품을 즐겨 감상하는 태도를 지닌다." },
  { code: "4국06-01", gradeBand: "3-4", area: "매체", statement: "인터넷에서 학습에 필요한 다양한 자료를 탐색하고 목적에 맞게 자료를 선택한다." },
  { code: "4국06-02", gradeBand: "3-4", area: "매체", statement: "매체를 활용하여 간단한 발표 자료를 만든다." },
  { code: "4국06-03", gradeBand: "3-4", area: "매체", statement: "매체 소통 윤리를 고려하여 매체 자료를 활용하고 공유한다." },
  { code: "6국01-01", gradeBand: "5-6", area: "듣기·말하기", statement: "대화에서 생략된 내용을 추론하며 듣는다." },
  { code: "6국01-02", gradeBand: "5-6", area: "듣기·말하기", statement: "주장을 파악하고 이유나 근거가 타당한지 평가하며 듣는다." },
  { code: "6국01-03", gradeBand: "5-6", area: "듣기·말하기", statement: "주제와 관련하여 궁금한 내용을 질문하며 적극적으로 듣고 말한다." },
  { code: "6국01-04", gradeBand: "5-6", area: "듣기·말하기", statement: "면담의 절차를 이해하고 상대와 매체를 고려하여 면담한다." },
  { code: "6국01-05", gradeBand: "5-6", area: "듣기·말하기", statement: "자료를 선별하여 핵심 정보를 중심으로 내용을 구성하고 매체를 활용하여 발표한다." },
  { code: "6국01-06", gradeBand: "5-6", area: "듣기·말하기", statement: "토의에 협력적으로 참여하며 서로의 의견을 비교하고 조정한다." },
  { code: "6국01-07", gradeBand: "5-6", area: "듣기·말하기", statement: "절차와 규칙을 지키고 타당한 이유와 근거를 제시하며 토론한다." },
  { code: "6국02-01", gradeBand: "5-6", area: "읽기", statement: "글의 구조를 고려하며 주제나 주장을 파악하고 글 내용을 요약한다." },
  { code: "6국02-02", gradeBand: "5-6", area: "읽기", statement: "글에서 생략된 내용이나 함축된 표현을 문맥을 고려하여 추론한다." },
  { code: "6국02-03", gradeBand: "5-6", area: "읽기", statement: "글이나 자료를 읽고 내용의 타당성과 표현의 적절성을 평가한다." },
  { code: "6국02-04", gradeBand: "5-6", area: "읽기", statement: "문제 상황과 관련된 다양한 관점의 글을 읽고 이를 문제 해결에 활용한다." },
  { code: "6국02-05", gradeBand: "5-6", area: "읽기", statement: "긍정적인 읽기 동기를 형성하고 적극적으로 읽기에 참여하는 태도를 기른다." },
  { code: "6국03-01", gradeBand: "5-6", area: "쓰기", statement: "알맞은 내용을 선정하여 대상의 특성이 나타나게 설명하는 글을 쓴다." },
  { code: "6국03-02", gradeBand: "5-6", area: "쓰기", statement: "적절한 근거를 사용하고 인용의 출처를 밝히며 주장하는 글을 쓴다." },
  { code: "6국03-03", gradeBand: "5-6", area: "쓰기", statement: "체험한 일에 대한 감상을 나타내는 글을 쓴다." },
  { code: "6국03-04", gradeBand: "5-6", area: "쓰기", statement: "독자와 매체를 고려하여 내용을 생성하고 표현하며 글을 쓴다." },
  { code: "6국03-05", gradeBand: "5-6", area: "쓰기", statement: "쓰기 과정을 점검·조정하며 글을 쓰고, 글 전체를 대상으로 통일성 있게 고쳐 쓴다." },
  { code: "6국03-06", gradeBand: "5-6", area: "쓰기", statement: "쓰기에 적극적으로 참여하며 자신의 글을 독자와 공유하는 태도를 지닌다." },
  { code: "6국04-01", gradeBand: "5-6", area: "문법", statement: "음성 언어 및 문자 언어의 특성을 이해하고 다양한 매체 자료에서 표현 효과를 평가한다." },
  { code: "6국04-02", gradeBand: "5-6", area: "문법", statement: "표준어와 방언의 기능을 파악하고 언어 공동체와 국어생활과의 관계를 이해한다." },
  { code: "6국04-03", gradeBand: "5-6", area: "문법", statement: "고유어와 관용 표현의 쓰임과 가치를 이해하고 상황에 맞게 표현한다." },
  { code: "6국04-04", gradeBand: "5-6", area: "문법", statement: "문장 성분을 이해하고 호응 관계가 올바른 문장을 구성한다." },
  { code: "6국04-05", gradeBand: "5-6", area: "문법", statement: "글과 담화에 쓰인 시간 표현을 이해하고 상황에 맞게 표현한다." },
  { code: "6국04-06", gradeBand: "5-6", area: "문법", statement: "글과 담화에 쓰인 단어 및 문장, 띄어쓰기를 민감하게 살펴 바르게 고치는 태도를 지닌다." },
  { code: "6국05-01", gradeBand: "5-6", area: "문학", statement: "작가의 의도를 생각하며 작품을 읽는다." },
  { code: "6국05-02", gradeBand: "5-6", area: "문학", statement: "비유적 표현의 효과에 유의하여 작품을 감상한다." },
  { code: "6국05-03", gradeBand: "5-6", area: "문학", statement: "소설이나 극을 읽고 인물, 사건, 배경을 파악한다." },
  { code: "6국05-04", gradeBand: "5-6", area: "문학", statement: "인상적인 부분을 중심으로 작품에 대한 의견을 나눈다." },
  { code: "6국05-05", gradeBand: "5-6", area: "문학", statement: "자신의 경험을 시, 소설, 극, 수필 등 적절한 갈래로 표현한다." },
  { code: "6국05-06", gradeBand: "5-6", area: "문학", statement: "작품을 읽고 자신의 삶과 연관 지어 성찰하는 태도를 지닌다." },
  { code: "6국06-01", gradeBand: "5-6", area: "매체", statement: "정보 검색 도구를 활용하여 자신의 목적에 맞는 매체 자료를 찾는다." },
  { code: "6국06-02", gradeBand: "5-6", area: "매체", statement: "뉴스 및 각종 정보 매체 자료의 신뢰성을 평가한다." },
  { code: "6국06-03", gradeBand: "5-6", area: "매체", statement: "적합한 양식과 수용자의 반응을 고려하여 복합양식 매체 자료를 제작하고 공유한다." },
  { code: "6국06-04", gradeBand: "5-6", area: "매체", statement: "자신의 매체 이용 양상에 대해 성찰한다." },
];

const BY_CODE = new Map(STANDARDS.map((s) => [s.code, s]));

export function getStandard(code: string): Standard | undefined {
  return BY_CODE.get(code);
}

export function gradeBandOf(grade: number): GradeBand {
  if (grade <= 2) return "1-2";
  if (grade <= 4) return "3-4";
  return "5-6";
}
