// 글쓰기 과제 템플릿: 성취기준 → 계획(오거나이저) 항목, 루브릭, 코치가 집중할 점.
// 템플릿은 교사가 과제를 만들 때 기본값으로 쓰이고, 과제마다 복사되어 저장되므로 이후 수정해도 기존 과제에는 영향이 없다.

export interface OrganizerField {
  key: string;
  label: string;
  hint: string; // 학생 화면에 보이는 도움말(질문 형태)
  multiline?: boolean;
}

export interface RubricCriterion {
  key: string;
  label: string;
  levels: [string, string, string]; // [노력 필요, 보통, 잘함]
}

export interface GenreTemplate {
  id: string;
  name: string;
  standardCodes: string[];
  description: string;
  defaultPrompt: string;
  organizer: OrganizerField[];
  rubric: RubricCriterion[];
  coachFocus: string; // 코치 프롬프트에 들어가는 글 종류별 지도 초점
  lensQuestions?: Partial<Record<LensKey, string>>; // 고쳐 쓰기 렌즈별 질문(없으면 일반 질문)
}

const SPELLING: RubricCriterion = {
  key: "spelling",
  label: "맞춤법과 띄어쓰기",
  levels: [
    "맞춤법·띄어쓰기 오류가 많아 읽기 어렵다.",
    "오류가 조금 있지만 뜻은 잘 통한다.",
    "맞춤법과 띄어쓰기를 바르게 썼다.",
  ],
};

export const GENRES: readonly GenreTemplate[] = [
  {
    id: "paragraph",
    name: "중심 문장과 뒷받침 문장이 있는 문단",
    standardCodes: ["4국03-01", "4국03-05"],
    description: "중심 문장 하나와 그것을 뒷받침하는 문장들로 짜임새 있는 문단을 쓰고 고쳐 써요.",
    defaultPrompt: "내가 좋아하는 계절(또는 장소, 놀이)에 대해 중심 문장과 뒷받침 문장을 갖춘 문단을 써 봅시다.",
    organizer: [
      { key: "topic", label: "무엇에 대해 쓸까요?", hint: "쓰고 싶은 대상을 한두 낱말로 적어 보세요." },
      { key: "main", label: "중심 문장", hint: "이 문단에서 가장 하고 싶은 말은 무엇인가요?", multiline: true },
      { key: "support1", label: "뒷받침 1", hint: "중심 문장이 맞다는 걸 보여 주는 까닭이나 예는?", multiline: true },
      { key: "support2", label: "뒷받침 2", hint: "또 다른 까닭이나 경험이 있나요?", multiline: true },
      { key: "support3", label: "뒷받침 3 (선택)", hint: "더 넣고 싶은 내용이 있나요?", multiline: true },
    ],
    rubric: [
      { key: "main", label: "중심 문장", levels: ["중심 문장이 없거나 분명하지 않다.", "중심 문장이 있지만 조금 막연하다.", "문단의 중심 생각이 한 문장으로 분명하게 드러난다."] },
      { key: "support", label: "뒷받침 문장", levels: ["뒷받침 문장이 없거나 중심 문장과 관계없다.", "뒷받침 문장이 있지만 일부가 중심 문장과 덜 어울린다.", "뒷받침 문장들이 모두 중심 문장을 잘 뒷받침한다."] },
      { key: "revise", label: "고쳐 쓰기", levels: ["고쳐 쓴 흔적이 거의 없다.", "낱말이나 문장 일부를 고쳤다.", "문장과 문단 수준에서 스스로 점검하고 고쳤다."] },
      SPELLING,
    ],
    coachFocus: "중심 문장이 하나로 분명한지, 각 뒷받침 문장이 중심 문장과 관련 있는지 학생이 스스로 확인하게 돕는다.",
  },
  {
    id: "report",
    name: "절차와 결과를 보고하는 글",
    standardCodes: ["4국03-02"],
    description: "관찰하거나 실험·조사한 일을 순서대로, 정확한 표현으로 보고해요.",
    defaultPrompt: "우리 반에서 관찰하거나 조사한 일을 절차와 결과가 드러나게 보고하는 글로 써 봅시다.",
    organizer: [
      { key: "subject", label: "무엇을 관찰·조사했나요?", hint: "대상과 목적을 적어 보세요." },
      { key: "steps", label: "어떤 순서로 했나요?", hint: "처음, 다음, 마지막에 한 일을 차례대로 적어 보세요.", multiline: true },
      { key: "result", label: "결과", hint: "무엇을 알게 되었나요? 숫자나 정확한 표현을 쓸 수 있나요?", multiline: true },
      { key: "thought", label: "느낀 점·더 알고 싶은 점", hint: "결과를 보고 어떤 생각이 들었나요?", multiline: true },
    ],
    rubric: [
      { key: "steps", label: "절차", levels: ["한 일의 순서가 드러나지 않는다.", "순서가 있지만 일부가 빠지거나 뒤섞였다.", "한 일의 절차가 차례대로 분명히 드러난다."] },
      { key: "result", label: "결과", levels: ["결과가 드러나지 않는다.", "결과가 있지만 막연한 표현이 있다.", "결과를 사실에 근거해 정확하게 표현했다."] },
      { key: "structure", label: "글의 짜임", levels: ["목적·절차·결과의 구분이 없다.", "짜임이 있지만 일부가 섞여 있다.", "목적-절차-결과-느낀 점의 짜임이 분명하다."] },
      SPELLING,
    ],
    lensQuestions: {
      whole: "목적, 절차, 결과가 차례대로 드러나나요? 보고하려는 일과 관계없는 내용은 없나요?",
      paragraph: "한 일을 순서대로 빠짐없이 썼나요? 문단마다 하나의 내용만 담았나요?",
      word: "막연한 말 대신 정확한 낱말이나 숫자를 썼나요? 맞춤법과 띄어쓰기도 바른가요?",
    },
    coachFocus: "절차를 시간 순서대로 빠짐없이 썼는지, 결과를 '많이', '좀' 같은 막연한 말 대신 정확하게 표현했는지 점검하게 한다.",
  },
  {
    id: "opinion",
    name: "이유를 들어 의견을 제시하는 글",
    standardCodes: ["4국03-03"],
    description: "어떤 대상에 대한 내 의견과 그렇게 생각한 이유가 드러나게 써요.",
    defaultPrompt: "우리 학교(또는 반)에 필요하다고 생각하는 것에 대해 의견과 이유가 드러나게 글을 써 봅시다.",
    organizer: [
      { key: "subject", label: "무엇에 대한 의견인가요?", hint: "대상이나 문제 상황을 적어 보세요." },
      { key: "opinion", label: "나의 의견", hint: "나는 어떻게 생각하나요? 한 문장으로 적어 보세요.", multiline: true },
      { key: "reason1", label: "이유 1", hint: "왜 그렇게 생각하나요?", multiline: true },
      { key: "reason2", label: "이유 2", hint: "다른 이유도 있나요? 경험이나 예를 떠올려 보세요.", multiline: true },
      { key: "closing", label: "마무리", hint: "읽는 사람에게 마지막으로 하고 싶은 말은?", multiline: true },
    ],
    rubric: [
      { key: "opinion", label: "의견", levels: ["의견이 드러나지 않는다.", "의견이 있지만 분명하지 않다.", "의견이 분명하게 드러난다."] },
      { key: "reason", label: "이유", levels: ["이유가 없거나 의견과 관계없다.", "이유가 하나이거나 조금 약하다.", "의견을 뒷받침하는 알맞은 이유가 둘 이상 있다."] },
      { key: "structure", label: "글의 짜임", levels: ["처음-가운데-끝 구분이 없다.", "짜임이 있지만 일부가 어색하다.", "처음-가운데-끝이 자연스럽게 이어진다."] },
      SPELLING,
    ],
    coachFocus: "의견이 한 문장으로 분명한지, 각 이유가 의견과 연결되는지, 이유를 뒷받침하는 경험이나 예가 있는지 묻는다.",
  },
  {
    id: "letter",
    name: "마음을 전하는 글 (편지)",
    standardCodes: ["4국03-04"],
    description: "읽을 사람과 목적을 생각하며 내 마음을 전하는 글을 써요.",
    defaultPrompt: "고마운 사람(또는 미안한 사람)에게 마음을 전하는 편지를 써 봅시다.",
    organizer: [
      { key: "reader", label: "받는 사람", hint: "누구에게 쓰나요?" },
      { key: "situation", label: "어떤 일이 있었나요?", hint: "마음을 전하고 싶게 된 일을 떠올려 보세요.", multiline: true },
      { key: "feeling", label: "전하고 싶은 마음", hint: "고마움, 미안함, 축하… 어떤 마음인가요? 왜 그런 마음이 들었나요?", multiline: true },
      { key: "wish", label: "하고 싶은 말·다짐", hint: "앞으로 어떻게 하고 싶나요?", multiline: true },
    ],
    rubric: [
      { key: "reader", label: "읽는 사람 고려", levels: ["받는 사람을 생각하지 않은 표현이 많다.", "받는 사람을 생각했지만 일부 표현이 어울리지 않는다.", "받는 사람에게 알맞은 말과 높임 표현을 썼다."] },
      { key: "feeling", label: "마음 표현", levels: ["전하려는 마음이 드러나지 않는다.", "마음이 드러나지만 까닭이 부족하다.", "마음과 그 까닭이 구체적인 일과 함께 잘 드러난다."] },
      { key: "form", label: "편지 형식", levels: ["편지 형식이 거의 없다.", "형식 일부가 빠졌다.", "부르는 말-첫인사-하고 싶은 말-끝인사-쓴 날짜·쓴 사람을 갖췄다."] },
      SPELLING,
    ],
    lensQuestions: {
      whole: "받는 사람에게 하고 싶은 말이 잘 전해지나요? 마음과 그 마음이 생긴 까닭이 함께 드러나나요?",
      paragraph: "부르는 말, 첫인사, 하고 싶은 말, 끝인사가 차례대로 이어지나요? 한 문단에 한 가지 이야기만 담았나요?",
      sentence: "받는 사람에게 알맞은 높임 표현을 썼나요? 말투가 처음부터 끝까지 한결같나요?",
    },
    coachFocus: "받는 사람에게 맞는 높임 표현과 말투인지, 마음과 그 마음이 생긴 구체적인 일이 함께 드러나는지 묻는다.",
  },
  {
    id: "explain",
    name: "대상의 특성이 나타나게 설명하는 글",
    standardCodes: ["6국03-01"],
    description: "알맞은 내용을 골라 대상의 특성이 드러나게 설명해요. 비교·대조, 분류, 예시 같은 설명 방법을 써요.",
    defaultPrompt: "내가 잘 아는 대상(동물, 음식, 놀이, 장소 등)의 특성이 잘 드러나게 설명하는 글을 써 봅시다.",
    organizer: [
      { key: "subject", label: "설명할 대상", hint: "무엇을 설명하나요? 누가 읽을 글인가요?" },
      { key: "method", label: "설명 방법", hint: "비교·대조, 분류, 예시, 정의, 과정 중 어떤 방법이 어울릴까요? 왜 그렇게 생각하나요?" },
      { key: "feature1", label: "특성 1", hint: "대상의 가장 중요한 특성은?", multiline: true },
      { key: "feature2", label: "특성 2", hint: "또 어떤 특성이 있나요?", multiline: true },
      { key: "feature3", label: "특성 3 (선택)", hint: "읽는 사람이 꼭 알아야 할 내용이 더 있나요?", multiline: true },
    ],
    rubric: [
      { key: "content", label: "내용 선정", levels: ["대상과 관계없는 내용이 많다.", "알맞은 내용이 있지만 중요한 특성이 빠졌다.", "대상의 특성을 보여 주는 알맞은 내용을 골랐다."] },
      { key: "method", label: "설명 방법", levels: ["설명 방법이 드러나지 않는다.", "설명 방법을 썼지만 효과가 약하다.", "알맞은 설명 방법으로 특성을 분명하게 드러냈다."] },
      { key: "structure", label: "글의 구조", levels: ["처음-가운데-끝 구분이 없다.", "구조가 있지만 문단 구분이 어색하다.", "특성별로 문단을 나누어 짜임새 있게 썼다."] },
      SPELLING,
    ],
    lensQuestions: {
      whole: "설명하려는 대상의 특성이 글 전체에서 잘 드러나나요? 대상과 관계없는 내용은 없나요?",
      paragraph: "문단마다 대상의 한 가지 특성을 다루나요? 고른 설명 방법이 알맞나요?",
      sentence: "설명하는 문장이 정확하고 이해하기 쉬운가요? 어려운 낱말은 풀어서 썼나요?",
    },
    coachFocus: "고른 설명 방법이 대상의 특성을 드러내는 데 알맞은지, 각 문단이 하나의 특성을 다루는지 점검하게 한다.",
  },
  {
    id: "argument",
    name: "근거와 출처를 밝혀 주장하는 글",
    standardCodes: ["6국03-02", "6국03-05"],
    description: "적절한 근거를 들고 인용한 자료의 출처를 밝혀 주장하는 글을 써요.",
    defaultPrompt: "우리 생활 속 문제 하나를 골라, 적절한 근거와 출처를 밝혀 주장하는 글을 써 봅시다.",
    organizer: [
      { key: "problem", label: "문제 상황", hint: "어떤 문제가 있나요? 왜 중요한가요?", multiline: true },
      { key: "claim", label: "주장", hint: "나는 무엇을 주장하나요? 한 문장으로 적어 보세요.", multiline: true },
      { key: "evidence1", label: "근거 1 (+출처)", hint: "주장을 뒷받침하는 근거는? 자료를 썼다면 어디에서 찾았나요?", multiline: true },
      { key: "evidence2", label: "근거 2 (+출처)", hint: "다른 근거도 있나요? 그 근거는 믿을 만한가요?", multiline: true },
      { key: "counter", label: "예상되는 반론", hint: "내 주장에 반대하는 사람은 뭐라고 할까요? 어떻게 답할 수 있을까요?", multiline: true },
    ],
    rubric: [
      { key: "claim", label: "주장", levels: ["주장이 드러나지 않는다.", "주장이 있지만 분명하지 않다.", "주장이 분명하고 글 전체에서 일관된다."] },
      { key: "evidence", label: "근거와 출처", levels: ["근거가 없거나 주장과 관계없다.", "근거가 있지만 출처가 없거나 약하다.", "적절한 근거를 들고 인용 출처를 밝혔다."] },
      { key: "unity", label: "통일성", levels: ["주장과 관계없는 내용이 많다.", "일부 문장이 주장에서 벗어난다.", "글 전체가 주장을 중심으로 통일성 있게 이어진다."] },
      SPELLING,
    ],
    coachFocus: "근거가 주장과 직접 연결되는지, 자료를 인용했다면 출처를 밝혔는지, 반론을 생각해 보았는지 묻는다. 글 전체의 통일성을 스스로 점검하게 한다.",
  },
  {
    id: "reflection",
    name: "체험에 대한 감상을 나타내는 글",
    standardCodes: ["6국03-03"],
    description: "체험한 일과 그때의 생각·느낌이 잘 드러나게 감상문(기행문, 견학 기록문 등)을 써요.",
    defaultPrompt: "최근에 체험한 일(견학, 여행, 행사 등)을 떠올려 감상이 잘 드러나는 글을 써 봅시다.",
    organizer: [
      { key: "experience", label: "어떤 체험이었나요?", hint: "언제, 어디서, 누구와, 무엇을 했나요?", multiline: true },
      { key: "detail", label: "보고 듣고 한 일", hint: "가장 기억에 남는 장면을 자세히 떠올려 보세요.", multiline: true },
      { key: "feeling", label: "생각과 느낌", hint: "그때 어떤 생각이나 느낌이 들었나요? 왜 그랬을까요?", multiline: true },
      { key: "meaning", label: "체험의 의미", hint: "이 체험으로 무엇을 알게 되었거나 달라졌나요?", multiline: true },
    ],
    rubric: [
      { key: "experience", label: "체험 내용", levels: ["체험 내용이 거의 드러나지 않는다.", "체험 내용이 있지만 막연하다.", "체험한 일이 구체적으로 드러난다."] },
      { key: "feeling", label: "감상", levels: ["생각이나 느낌이 드러나지 않는다.", "감상이 있지만 '좋았다' 수준이다.", "구체적인 장면과 연결된 생각·느낌이 잘 드러난다."] },
      { key: "structure", label: "글의 짜임", levels: ["짜임이 없다.", "짜임이 있지만 일부가 어색하다.", "여정·견문·감상이 자연스럽게 어우러진다."] },
      SPELLING,
    ],
    lensQuestions: {
      whole: "체험한 일과 내 생각·느낌이 함께 드러나나요? 가장 하고 싶은 감상이 무엇인지 분명한가요?",
      paragraph: "보고 듣고 한 일과 그때의 생각·느낌이 문단마다 알맞게 이어지나요?",
    },
    coachFocus: "'재미있었다', '좋았다' 같은 막연한 감상 대신, 구체적인 장면과 그때의 생각을 떠올리도록 질문한다.",
  },
  {
    id: "media",
    name: "독자와 매체를 고려한 글",
    standardCodes: ["6국03-04", "6국03-06"],
    description: "누가 어디에서 읽을지(학급 게시판, 블로그, 카드뉴스, 안내문 등)를 생각하며 내용을 만들고 표현해요.",
    defaultPrompt: "우리 학교 소식을 알리는 글을 독자와 매체(예: 학급 누리집, 안내문, 카드뉴스)를 정해 써 봅시다.",
    organizer: [
      { key: "reader", label: "독자", hint: "누가 읽을까요? 그 사람들은 무엇을 궁금해할까요?" },
      { key: "medium", label: "매체", hint: "어디에 실을 글인가요? 그 매체에 맞는 글의 길이나 표현은?" },
      { key: "purpose", label: "목적", hint: "읽은 사람이 무엇을 알거나 하게 되길 바라나요?", multiline: true },
      { key: "content", label: "핵심 내용", hint: "꼭 들어가야 할 내용을 적어 보세요.", multiline: true },
    ],
    rubric: [
      { key: "reader", label: "독자 고려", levels: ["독자를 생각하지 않았다.", "독자를 생각했지만 일부 내용·표현이 맞지 않는다.", "독자에게 필요한 내용과 알맞은 표현을 골랐다."] },
      { key: "medium", label: "매체 고려", levels: ["매체의 특성이 드러나지 않는다.", "매체를 생각했지만 형식이 어색하다.", "매체의 특성에 맞는 형식과 길이로 썼다."] },
      { key: "content", label: "내용", levels: ["목적과 관계없는 내용이 많다.", "핵심 내용 일부가 빠졌다.", "목적에 맞는 핵심 내용이 잘 드러난다."] },
      SPELLING,
    ],
    lensQuestions: {
      whole: "읽을 사람이 궁금해할 내용이 중심이 되나요? 글의 목적과 관계없는 내용은 없나요?",
      sentence: "고른 매체와 읽을 사람에게 알맞은 말투와 길이로 썼나요?",
    },
    coachFocus: "정한 독자와 매체에 맞게 내용, 길이, 말투를 골랐는지 묻는다.",
  },
  {
    id: "character-letter",
    name: "작품 속 인물에게 쓰는 편지",
    standardCodes: ["4국05-02", "6국05-06"],
    description: "작품을 읽고 기억에 남는 인물에게 편지를 써요. 인물의 행동과 내 경험을 이어서 내 마음을 전해요.",
    defaultPrompt: "읽은 작품 속 인물 한 명을 골라 편지를 써 봅시다. 그 인물이 한 말이나 행동과 내가 겪은 일을 이어서 써 보세요.",
    organizer: [
      { key: "character", label: "받는 인물 (작품 이름도)", hint: "어느 작품의 누구에게 쓰나요? 작품 이름과 인물 이름을 함께 적어 보세요." },
      { key: "memorable", label: "기억에 남는 말이나 행동", hint: "그 인물이 한 말이나 행동 중에 왜 마음에 남았나요? 그때 인물의 마음은 어땠을까요?", multiline: true },
      { key: "experience", label: "비슷한 내 경험", hint: "그 장면을 읽으면서 내가 겪은 일이 떠올랐나요? 언제, 어떤 일이었나요?", multiline: true },
      { key: "message", label: "하고 싶은 말·묻고 싶은 것", hint: "그 인물에게 무슨 말을 해 주고 싶나요? 궁금한 점은 없나요?", multiline: true },
      { key: "closing", label: "끝인사", hint: "편지를 어떤 말로 마무리하면 좋을까요?" },
    ],
    rubric: [
      { key: "form", label: "편지 형식", levels: ["편지 형식이 거의 없다.", "형식 일부(부르는 말, 첫인사, 끝인사 등)가 빠졌다.", "부르는 말-첫인사-하고 싶은 말-끝인사-쓴 날짜·쓴 사람을 갖췄다."] },
      { key: "character", label: "인물의 행동과의 연결", levels: ["인물의 말이나 행동이 드러나지 않는다.", "인물의 말이나 행동을 말했지만 내 생각과 이어지지 않는다.", "인물의 구체적인 말이나 행동을 들어 그때의 마음을 헤아려 썼다."] },
      { key: "experience", label: "내 경험과의 연결", levels: ["내 경험이 드러나지 않는다.", "경험이 있지만 작품과 어떻게 이어지는지 분명하지 않다.", "작품 속 장면과 내 경험이 닮은 점을 들어 자연스럽게 이어 썼다."] },
      SPELLING,
    ],
    lensQuestions: {
      whole: "인물에게 하고 싶은 말이 잘 전해지나요? 작품에서 읽은 내용과 내 마음이 함께 드러나나요?",
      paragraph: "부르는 말, 첫인사, 하고 싶은 말, 끝인사가 차례대로 이어지나요? 한 문단에 한 가지 이야기만 담았나요?",
      sentence: "받는 사람에게 알맞은 높임 표현을 썼나요? 말투가 처음부터 끝까지 한결같나요?",
    },
    coachFocus:
      "학생이 고른 인물이 그 장면에서 왜 그렇게 말하거나 행동했을지, 그때 어떤 마음이었을지 묻는 질문을 한다. 학생의 경험과 작품 속 장면이 어떤 점에서 닮았는지 스스로 찾도록 묻는다. 편지의 문장이나 인물에게 할 말을 대신 써 주지 않고, 인물의 마음을 대신 단정해 주지도 않는다.",
  },
  {
    id: "experience-poem",
    name: "경험을 시로",
    standardCodes: ["6국05-05"],
    description: "내가 겪은 일을 떠올리고, 그때의 감각과 마음이 잘 드러나게 시로 표현해요.",
    defaultPrompt: "기억에 남는 내 경험 하나를 골라, 그때의 느낌이 잘 드러나게 시로 써 봅시다.",
    organizer: [
      { key: "event", label: "겪은 일", hint: "시로 쓰고 싶은 일은 무엇인가요? 언제, 어디서, 누구와 있었나요?", multiline: true },
      { key: "senses", label: "그때 보고 듣고 느낀 것", hint: "그때 무엇이 보이고, 들리고, 냄새나고, 만져졌나요? 마음은 어땠나요?", multiline: true },
      { key: "figure", label: "떠오르는 비유", hint: "그때 마음이나 모습이 무엇과 닮았나요? '~처럼', '~은 ~예요'로 말해 볼 수 있을까요?", multiline: true },
      { key: "repeat", label: "반복할 말", hint: "시에서 되풀이하고 싶은 말이 있나요? 그 말을 되풀이하면 어떤 느낌이 날까요?" },
    ],
    rubric: [
      { key: "sense", label: "감각적 표현", levels: ["보고 듣고 느낀 것이 드러나지 않는다.", "감각 표현이 있지만 막연하다.", "보고 듣고 냄새 맡고 만진 느낌이 구체적으로 드러난다."] },
      { key: "figure", label: "비유와 반복", levels: ["비유나 반복이 없다.", "비유나 반복을 썼지만 시의 느낌과 잘 맞지 않는다.", "알맞은 비유나 반복으로 마음이 더 잘 전해진다."] },
      { key: "form", label: "행과 연", levels: ["글이 산문처럼 이어져 행과 연의 구분이 없다.", "행과 연을 나누었지만 나눈 까닭이 분명하지 않다.", "행과 연을 나누어 시의 리듬과 느낌을 살렸다."] },
      SPELLING,
    ],
    lensQuestions: {
      whole: "시 전체가 하나의 장면이나 느낌으로 모이나요? 제목과 시의 내용이 어울리나요?",
      paragraph: "행과 연을 나눈 곳이 알맞나요? 연마다 장면이나 느낌이 이어지면서도 조금씩 달라지나요?",
      sentence: "한 행 한 행이 짧고 또렷한가요? 되풀이한 말이 있다면 일부러 살리려고 한 것인가요?",
      word: "보이고 들리고 만져지는 느낌이 잘 전해지는 낱말을 골랐나요? 비유한 표현이 어색하지 않나요?",
    },
    coachFocus:
      "겪은 일에서 가장 또렷한 순간이 무엇인지, 그때 오감으로 무엇을 느꼈는지, 마음이 무엇과 닮았는지 묻는다. 행을 어디서 나누면 좋을지, 되풀이하는 말이 어떤 느낌을 주는지 학생이 스스로 생각하게 한다. 시의 구절이나 비유를 대신 만들어 주지 않는다.",
  },
  {
    id: "experience-story",
    name: "경험을 짧은 이야기로",
    standardCodes: ["6국05-05"],
    description: "내가 겪은 일을 바탕으로 인물, 배경, 사건이 있는 짧은 이야기를 꾸며 써요.",
    defaultPrompt: "내가 겪은 일 하나를 바탕으로, 인물과 배경과 사건이 있는 짧은 이야기를 써 봅시다.",
    organizer: [
      { key: "event", label: "겪은 일", hint: "이야기로 바꾸고 싶은 내 경험은 무엇인가요?", multiline: true },
      { key: "feeling", label: "그때 감각과 마음", hint: "그때 무엇이 보이고 들렸나요? 마음은 어떻게 바뀌었나요?", multiline: true },
      { key: "character", label: "인물", hint: "이야기에 누가 나오나요? 어떤 성격이나 모습인가요? 이름을 새로 지어도 좋아요." },
      { key: "setting", label: "배경", hint: "언제, 어디에서 일어난 일인가요? 그곳은 어떤 모습인가요?", multiline: true },
      { key: "plot", label: "사건과 끝맺음", hint: "어떤 일이 일어나고, 어떻게 풀리나요? 이야기를 어떻게 끝내고 싶나요?", multiline: true },
    ],
    rubric: [
      { key: "elements", label: "인물과 배경", levels: ["인물이나 배경이 드러나지 않는다.", "인물과 배경이 있지만 모습이 막연하다.", "인물과 배경이 구체적으로 드러난다."] },
      { key: "plot", label: "사건의 흐름", levels: ["사건이 이어지지 않는다.", "사건이 있지만 순서나 까닭이 어색한 곳이 있다.", "처음-가운데-끝으로 사건이 자연스럽게 이어진다."] },
      { key: "ending", label: "끝맺음과 마음 표현", levels: ["끝맺음이 없고 인물의 마음이 드러나지 않는다.", "끝맺음이 있지만 인물의 마음이 조금만 드러난다.", "인물의 마음이 말·행동으로 드러나고 끝맺음이 자연스럽다."] },
      SPELLING,
    ],
    lensQuestions: {
      whole: "처음, 가운데, 끝으로 이야기가 이어지나요? 끝맺음이 이야기와 어울리나요?",
      paragraph: "인물, 배경, 사건이 흐름에 따라 자연스럽게 이어지나요? 장면이 바뀔 때 읽는 사람이 알 수 있게 썼나요?",
      sentence: "누가 말하고 행동하는지 분명한가요? 일어난 일의 앞뒤 순서가 맞나요?",
    },
    coachFocus:
      "실제로 겪은 일에서 무엇을 그대로 두고 무엇을 바꿀지, 인물이 누구이고 배경이 어떤 모습인지, 사건이 어떤 순서로 이어지고 어떻게 끝나는지 묻는다. 인물의 마음을 '슬펐다' 대신 말이나 행동으로 보여 줄 방법을 스스로 찾게 한다. 이야기의 문장이나 줄거리를 대신 써 주지 않는다.",
  },
];

const BY_ID = new Map(GENRES.map((g) => [g.id, g]));

export function getGenre(id: string): GenreTemplate | undefined {
  return BY_ID.get(id);
}

export function genresForGrade(grade: number): GenreTemplate[] {
  const prefix = grade <= 4 ? "4국" : "6국";
  return GENRES.filter((g) => g.standardCodes.some((c) => c.startsWith(prefix)));
}

export const STAGES = ["brainstorm", "plan", "draft", "revise"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  brainstorm: "① 생각 열기",
  plan: "② 계획하기",
  draft: "③ 초고 쓰기",
  revise: "④ 고쳐 쓰기",
};

export const REVISION_LENSES = [
  { key: "whole", label: "글 전체", question: "글 전체가 하나의 중심 생각(주장)으로 모이나요? 벗어나는 문장은 없나요?" },
  { key: "paragraph", label: "문단", question: "문단과 문단이 자연스럽게 이어지나요? 문단마다 하나의 생각을 담았나요?" },
  { key: "sentence", label: "문장", question: "문장의 앞뒤가 서로 어울리나요(호응)? 너무 긴 문장은 없나요?" },
  { key: "word", label: "낱말·띄어쓰기", question: "맞춤법과 띄어쓰기가 바른가요? 더 정확한 낱말은 없을까요?" },
] as const;
export type LensKey = (typeof REVISION_LENSES)[number]["key"];

/** 고쳐 쓰기 렌즈 질문: 글 종류별 질문이 있으면 그것을, 없으면 일반 질문을 쓴다. 질문에는 예시 문장을 넣지 않는다. */
export function lensQuestion(genre: GenreTemplate | string | undefined, key: LensKey): string {
  const g = typeof genre === "string" ? getGenre(genre) : genre;
  return g?.lensQuestions?.[key] ?? REVISION_LENSES.find((l) => l.key === key)!.question;
}
