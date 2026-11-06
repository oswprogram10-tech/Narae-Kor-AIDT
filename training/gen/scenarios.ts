// 학습용 가상 학생 글(실제 학생 데이터 아님). 초등 3~6학년이 흔히 쓰는 표현·맞춤법 실수를 일부러 섞었다.
// topic은 질문의 빈칸({topic})에 들어가는 짧은 명사구.

export interface Scenario {
  id: string;
  genre: string;
  grade: number;
  topic: string;
  extra?: Record<string, string>; // reader, medium 등 질문 빈칸용
  org: Record<string, string>;
  brainstorm: string;
  draft: string;
  // 학생 글에 해로운 내용이 섞인 경우(코치가 그 표현을 되풀이하지 않고 존중하는 방향으로 이끌어야 함)
  harmful?: "insult" | "violence" | "profanity" | "discrimination" | "inappropriate";
}

export const SCENARIOS: Scenario[] = [
  // ── 문단(4국03-01) ──
  { id: "par-summer", genre: "paragraph", grade: 3, topic: "여름", org: { topic: "여름", main: "나는 여름이 제일 좋다.", support1: "수영을 할 수 있다." }, brainstorm: "수박, 바다, 매미, 방학", draft: "나는 여름이 제일 좋다. 왜냐하면 바다에서 수영을 할수있기 때문이다. 그리고 수박도 먹을 수 있다." },
  { id: "par-playground", genre: "paragraph", grade: 3, topic: "운동장", org: { topic: "학교 운동장", main: "우리 학교 운동장은 재미있는 곳이다." }, brainstorm: "축구, 그네, 친구, 모래", draft: "우리 학교 운동장은 재미있는 곳이다. 쉬는 시간에 친구들이랑 축구를 한다. 그네도 있다." },
  { id: "par-dog", genre: "paragraph", grade: 4, topic: "우리 집 강아지", org: { topic: "강아지 콩이", main: "", support1: "" }, brainstorm: "콩이, 산책, 꼬리, 간식", draft: "" },
  { id: "par-ramen", genre: "paragraph", grade: 4, topic: "라면", org: { topic: "라면", main: "라면은 맛있다.", support1: "빨리 만들 수 있다.", support2: "여러 가지 맛이 있다." }, brainstorm: "라면, 계란, 매운맛", draft: "라면은 맛있다. 빨리 만들 수 있다. 여러 가지 맛이 있다. 나는 어제 게임을 했다." },
  { id: "par-friend-insult", genre: "paragraph", grade: 4, topic: "우리 반 친구", org: { topic: "우리 반", main: "" }, brainstorm: "친구, 짝꿍", draft: "우리 반 민수는 진짜 바보 멍청이다. 맨날 느리고 못생겼다.", harmful: "insult" },

  // ── 보고하는 글(4국03-02) ──
  { id: "rep-bean", genre: "report", grade: 4, topic: "콩나물 기르기", org: { subject: "콩나물 기르기", steps: "콩을 물에 불렸다. 매일 물을 줬다.", result: "" }, brainstorm: "콩, 물, 검은 천", draft: "우리는 콩나물을 길렀다. 콩을 물에 불렸다. 그리고 매일 물을 줬다. 콩나물이 많이 컸다." },
  { id: "rep-weather", genre: "report", grade: 4, topic: "일주일 날씨 관찰", org: { subject: "날씨 관찰", steps: "", result: "" }, brainstorm: "맑음, 비, 기온", draft: "" },
  { id: "rep-survey", genre: "report", grade: 3, topic: "좋아하는 과일 조사", org: { subject: "우리 반이 좋아하는 과일", steps: "반 친구들에게 물어봤다.", result: "딸기가 제일 많았다." }, brainstorm: "딸기, 사과, 바나나", draft: "우리 반이 좋아하는 과일을 조사했다. 친구들에게 물어봤다. 딸기가 좀 많았다. 재미있었다." },
  { id: "rep-plant", genre: "report", grade: 4, topic: "강낭콩 관찰", org: { subject: "강낭콩", steps: "화분에 심고 날마다 키를 쟀다.", result: "2주 만에 12cm 자랐다." }, brainstorm: "화분, 자, 떡잎", draft: "강낭콩을 화분에 심었다. 날마다 키를 쟀다. 2주 만에 12cm 자랐다. 떡잎이 먼저 나왔고 그 다음에 본잎이 나왔는데 본잎은 떡잎보다 더 크고 초록색이 진했고 신기해서 사진도 찍었다." },

  // ── 의견 글(4국03-03) ──
  { id: "opi-bookshelf", genre: "opinion", grade: 4, topic: "학급 문고", org: { subject: "학급 문고", opinion: "책장이 하나 더 필요하다.", reason1: "책이 바닥에 쌓여 있다." }, brainstorm: "책장, 쉬는 시간, 만화책", draft: "우리 반에는 책장이 하나 더 필요하다. 왜냐하면 책이 너무 많아서 몇일 전부터 바닥에 쌓여 있기 때문이다." },
  { id: "opi-phone", genre: "opinion", grade: 4, topic: "학교에서 휴대 전화 쓰기", org: { subject: "휴대 전화", opinion: "", reason1: "" }, brainstorm: "게임, 연락, 수업", draft: "" },
  { id: "opi-recess", genre: "opinion", grade: 3, topic: "쉬는 시간", org: { subject: "쉬는 시간", opinion: "쉬는 시간이 더 길어야 한다.", reason1: "놀 시간이 부족하다.", reason2: "화장실에 갔다 오면 끝난다." }, brainstorm: "놀이, 화장실, 10분", draft: "쉬는 시간이 더 길어야 한다. 놀 시간이 부족하다. 화장실에 갔다오면 끝난다. 그래서 길어야 된다." },
  { id: "opi-pet", genre: "opinion", grade: 4, topic: "반려동물 키우기", org: { subject: "반려동물", opinion: "반려동물을 키우면 좋다." }, brainstorm: "강아지, 책임감, 산책", draft: "반려동물을 키우면 좋다. 외롭지 않다. 그리고 귀엽다." },
  { id: "opi-violence", genre: "opinion", grade: 4, topic: "급식 순서", org: { subject: "급식 순서", opinion: "" }, brainstorm: "급식, 새치기", draft: "급식 줄에서 새치기하는 애들은 다 때려 줘야 한다. 그래야 정신을 차린다.", harmful: "violence" },

  // ── 편지(4국03-04) ──
  { id: "let-grandma", genre: "letter", grade: 3, topic: "할머니께 쓰는 편지", extra: { reader: "할머니" }, org: { reader: "할머니", situation: "생일 때 선물을 주셨다.", feeling: "" }, brainstorm: "할머니, 선물, 고마움", draft: "할머니 안녕. 선물 고마워. 잘 쓸게." },
  { id: "let-friend-sorry", genre: "letter", grade: 4, topic: "친구에게 사과하는 편지", extra: { reader: "지우" }, org: { reader: "친구 지우", situation: "놀이 시간에 화를 냈다.", feeling: "미안하다" }, brainstorm: "지우, 미안, 놀이", draft: "지우야 안녕. 나 민준이야. 어제는 미안했어." },
  { id: "let-teacher", genre: "letter", grade: 4, topic: "담임 선생님께 쓰는 편지", extra: { reader: "선생님" }, org: { reader: "담임 선생님", situation: "", feeling: "" }, brainstorm: "선생님, 학년 끝, 고마움", draft: "" },
  { id: "let-firefighter", genre: "letter", grade: 3, topic: "소방관께 쓰는 감사 편지", extra: { reader: "소방관님" }, org: { reader: "소방관님", situation: "학교에 소방 안전 교육을 와 주셨다.", feeling: "고맙다" }, brainstorm: "소방차, 안전, 고마움", draft: "소방관님께. 안녕하세요. 우리 학교에 와 주셔서 고맙습니다. 소방차가 멋있었어요." },

  // ── 설명하는 글(6국03-01) ──
  { id: "exp-kimchi", genre: "explain", grade: 5, topic: "김치", org: { subject: "김치", method: "", feature1: "발효 음식이다." }, brainstorm: "배추, 발효, 종류", draft: "김치는 우리나라의 전통 음식이다. 김치는 발효 음식이다." },
  { id: "exp-dolphin", genre: "explain", grade: 5, topic: "돌고래", org: { subject: "돌고래", method: "예시", feature1: "포유류이다.", feature2: "초음파로 소통한다." }, brainstorm: "바다, 지능, 초음파", draft: "돌고래는 바다에 사는 포유류이다. 돌고래는 초음파로 서로 이야기를 한다. 돌고래는 똑똑하다. 상어는 무섭다." },
  { id: "exp-hangeul", genre: "explain", grade: 6, topic: "한글", org: { subject: "한글", method: "", feature1: "" }, brainstorm: "세종대왕, 자음, 모음", draft: "" },
  { id: "exp-soccer-futsal", genre: "explain", grade: 6, topic: "축구와 풋살", org: { subject: "축구와 풋살", method: "비교·대조", feature1: "선수 수가 다르다." }, brainstorm: "축구, 풋살, 공, 선수", draft: "축구와 풋살은 비슷하지만 다르다. 축구는 11명이 하고 풋살은 5명이 한다. 그리고 공 크기도 다르고 경기장 크기도 다르고 시간도 다르고 규칙도 조금씩 다른데 둘 다 재밌다." },

  // ── 주장하는 글(6국03-02) ──
  { id: "arg-plastic", genre: "argument", grade: 6, topic: "일회용 플라스틱 줄이기", org: { problem: "급식실에서 일회용 컵을 많이 쓴다.", claim: "일회용 컵을 쓰지 말아야 한다.", evidence1: "" }, brainstorm: "플라스틱, 바다, 텀블러", draft: "우리 학교는 일회용 컵을 쓰지 말아야 한다. 플라스틱은 썩지 않는다." },
  { id: "arg-game", genre: "argument", grade: 6, topic: "게임 시간 제한", org: { problem: "", claim: "" }, brainstorm: "게임, 숙제, 잠", draft: "" },
  { id: "arg-uniform", genre: "argument", grade: 5, topic: "교복 입기", org: { problem: "옷 때문에 친구들끼리 비교한다.", claim: "초등학교도 교복을 입어야 한다.", evidence1: "뉴스에서 봤다.", counter: "" }, brainstorm: "교복, 비교, 편함", draft: "초등학교도 교복을 입어야 한다. 왜냐하면 옷 때문에 비교를 하기 때문이다. 뉴스에서 봤는데 교복을 입으면 좋다고 했다." },
  { id: "arg-discrim", genre: "argument", grade: 6, topic: "운동부 선수 뽑기", org: { problem: "", claim: "" }, brainstorm: "운동부, 선수", draft: "운동부에는 남자만 들어가야 한다. 여자는 원래 운동을 못 하니까.", harmful: "discrimination" },

  // ── 감상을 나타내는 글(6국03-03) ──
  { id: "ref-museum", genre: "reflection", grade: 5, topic: "박물관 견학", org: { experience: "국립중앙박물관에 갔다.", detail: "", feeling: "재미있었다." }, brainstorm: "박물관, 금관, 버스", draft: "우리는 박물관에 갔다. 재미있었다. 금관을 봤다. 좋았다." },
  { id: "ref-camp", genre: "reflection", grade: 6, topic: "수련회", org: { experience: "2박 3일 수련회에 갔다.", detail: "밤에 캠프파이어를 했다.", feeling: "" }, brainstorm: "캠프파이어, 친구, 레크리에이션", draft: "수련회에서 캠프파이어를 했다. 친구들과 노래를 불렀다. 엄청 재미있었다." },
  { id: "ref-farm", genre: "reflection", grade: 5, topic: "농촌 체험", org: { experience: "", detail: "" }, brainstorm: "고구마, 흙, 할아버지", draft: "" },
  { id: "ref-profanity", genre: "reflection", grade: 6, topic: "체육 대회", org: { experience: "체육 대회를 했다.", feeling: "" }, brainstorm: "줄다리기, 계주", draft: "체육 대회에서 우리 반이 졌다. 심판이 개XX같이 봐서 졌다. 짜증 났다.", harmful: "profanity" },

  // ── 독자·매체를 고려한 글(6국03-04) ──
  { id: "med-festival", genre: "media", grade: 6, topic: "학교 축제 안내", extra: { reader: "1학년 동생들", medium: "학급 누리집" }, org: { reader: "1학년 동생들", medium: "학급 누리집", purpose: "축제에 오게 하려고" }, brainstorm: "축제, 부스, 시간", draft: "학교 축제를 합니다. 금요일입니다. 많이 오세요." },
  { id: "med-library", genre: "media", grade: 5, topic: "도서관 이용 안내 카드뉴스", extra: { reader: "전교생", medium: "카드뉴스" }, org: { reader: "전교생", medium: "카드뉴스", purpose: "", content: "" }, brainstorm: "도서관, 대출, 조용히", draft: "" },
  { id: "med-recycle", genre: "media", grade: 6, topic: "분리배출 안내문", extra: { reader: "우리 반 친구들", medium: "교실 게시판" }, org: { reader: "우리 반 친구들", medium: "교실 게시판", purpose: "분리배출을 잘하게 하려고", content: "종이, 플라스틱, 캔을 나눠서 버리기" }, brainstorm: "분리배출, 쓰레기통", draft: "분리배출을 잘 합시다. 종이는 종이에 플라스틱은 플라스틱에 캔은 캔에 버려야 하고 우유팩은 씻어서 말려서 따로 모아야 하고 비닐은 비닐에 버려야 합니다." },
  { id: "med-inappropriate", genre: "media", grade: 6, topic: "학급 신문 기사", extra: { reader: "우리 반 친구들", medium: "학급 신문" }, org: { reader: "우리 반", medium: "학급 신문" }, brainstorm: "기사, 소문", draft: "특종! 우리 반 서연이가 누구를 좋아한대요. 서연이 일기장을 몰래 봤는데 다 써 있었다.", harmful: "inappropriate" },
];
