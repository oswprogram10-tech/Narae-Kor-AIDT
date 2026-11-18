// 문학 나래 문제 은행. 학생에게 보이는 글(prompt·principle·hints·explanation)은 해요체로 쓰고, 힌트에 정답을 담지 않는다.
// 느낌·해석이 갈릴 수 있는 것은 채점하지 않고, 글 속 근거로 확인할 수 있는 것(인물 사이, 사건 순서, 감정의 방향, 표현의 종류)만 채점한다.
// 문제를 추가하면 tests/literature.test.ts가 validateLiteratureItem으로 검사한다.

import type { ChoiceWithEvidenceItem, LabelSentencesItem, ReadingChoiceItem, SentencePickItem } from "@/core/reading";
import type { LiteratureItem, MoodScaleItem, OwnLineItem, SequenceItem } from "./types";

// ───────── 마음 온도계(mood-thermometer) [4국05-01] ─────────
const MT_PRINCIPLE =
  "인물의 마음은 인물이 한 말, 행동, 표정, 몸의 변화에서 알 수 있어요. 마음 온도는 1이 아주 차갑고 힘든 마음, 5가 아주 따뜻하고 기쁜 마음이에요.";

function mood(
  id: string, n: number, grade: 3 | 4, minOk: number, maxOk: number, feelingOptions: string[], correctFeeling: number,
  evidenceIds: string[], hint1: string, hint2: string, explanation: string,
): MoodScaleItem {
  return {
    id, type: "mood-scale", passageId: "lt-stage", standardCode: "4국05-01", grade,
    prompt: `${n}문단 장면에서 하준이의 마음 온도는 몇 도쯤일까요? 마음 온도와 마음을 나타내는 말을 고르고, 그렇게 생각한 문장을 눌러 보세요.`,
    character: "하준", sceneParagraphId: `p${n}`, minOk, maxOk, feelingOptions, correctFeeling, evidenceIds,
    principle: MT_PRINCIPLE, hints: [hint1, hint2], explanation,
  };
}

const mt01 = mood("mt-01", 1, 4, 2, 3,
  ["신나고 기대돼요", "걱정되고 긴장돼요", "화가 나고 답답해요", "외롭고 쓸쓸해요"], 1, ["s1-3", "s1-4", "s1-5"],
  "하준이가 밤에 한 행동과 몸의 변화를 살펴보세요.",
  "마음이 편하고 기쁠 때는 잠을 잘 자요. 하준이는 어땠는지 떠올려 보세요.",
  "하준이는 손에 땀이 나고 잠을 이루지 못할 만큼 걱정하고 있어요. 그래서 마음 온도가 낮은 편(2~3)이고, 마음은 걱정되고 긴장되는 마음이에요.");
const mt02 = mood("mt-02", 2, 4, 1, 2,
  ["화가 나서 소리치고 싶어요", "자랑스럽고 뿌듯해요", "심심하고 지루해요", "창피하고 부끄러워요"], 3, ["s2-5"],
  "실수한 뒤 하준이의 얼굴빛과 몸짓을 살펴보세요.",
  "여러 사람 앞에서 실수했을 때 내 얼굴과 몸이 어떻게 되는지 떠올려 보세요.",
  "하준이는 얼굴이 새빨개지고 고개를 푹 숙였어요. 실수가 창피해서 마음 온도가 아주 낮은(1~2) 장면이에요.");
const mt03 = mood("mt-03", 3, 4, 3, 4,
  ["서운하고 화가 나요", "무섭고 겁이 나요", "위로를 받아 마음이 풀려요", "부럽고 샘이 나요"], 2, ["s3-4", "s3-5"],
  "서아의 말을 듣고 난 뒤 하준이의 몸과 표정이 어떻게 바뀌었는지 살펴보세요.",
  "처음에 혼자 앉아 있던 하준이와 장면의 끝에 있는 하준이를 비교해 보세요.",
  "하준이는 서아의 위로를 듣고 꽉 막혔던 가슴이 풀리며 웃음을 지었어요. 마음 온도가 다시 올라간(3~4) 장면이에요.");
const mt04 = mood("mt-04", 4, 4, 4, 5,
  ["지루하고 졸려요", "미안하고 안타까워요", "서운하고 쓸쓸해요", "즐겁고 자신감이 생겨요"], 3, ["s4-5"],
  "하준이가 소리치며 한 행동을 살펴보세요.",
  "연습이 잘되어 가는 아이는 어떤 표정과 몸짓을 하는지 떠올려 보세요.",
  "하준이는 \"어, 된다!\" 하고 소리치며 손뼉을 마주쳤어요. 기쁘고 자신감이 생겨 마음 온도가 높은(4~5) 장면이에요.");
const mt05 = mood("mt-05", 5, 4, 4, 5,
  ["창피하고 부끄러워요", "걱정되고 불안해요", "억울하고 화가 나요", "뿌듯하고 자랑스러워요"], 3, ["s5-6", "s5-7"],
  "연주가 끝난 뒤 하준이의 몸짓과 표정을 살펴보세요.",
  "해냈다는 생각이 들 때 어깨와 표정이 어떻게 되는지 떠올려 보세요.",
  "하준이는 어깨를 쭉 펴고 활짝 웃었고 가슴 가득 뿌듯함이 차올랐어요. 마음 온도가 가장 높은(4~5) 장면이에요.");

const mt06: SequenceItem = {
  id: "mt-06", type: "sequence", passageId: "lt-stage", standardCode: "4국05-01", grade: 4,
  prompt: "이야기에서 일어난 일을 차례대로 놓아 보세요.",
  events: [
    { id: "e1", text: "하준이는 장기자랑이 걱정되어 잠을 이루지 못했어요." },
    { id: "e2", text: "무대에서 리코더 소리가 갈라져 아이들이 웃었어요." },
    { id: "e3", text: "서아가 위로해 주고 함께 연습했어요." },
    { id: "e4", text: "다시 연주하고 박수를 받았어요." },
  ],
  correctOrder: ["e1", "e2", "e3", "e4"],
  principle: "이야기는 일이 일어난 차례대로 이어져요. 앞에서 일어난 일이 뒤의 일이 일어나는 까닭이 되기도 해요.",
  hints: [
    "'처음', '다음', '그날', '이튿날'처럼 때를 나타내는 말을 따라 이야기를 처음부터 훑어 읽어 보세요.",
    "하준이의 마음이 어떻게 바뀌었는지 떠올리면 일이 일어난 차례를 짐작할 수 있어요.",
  ],
  explanation: "걱정하며 밤을 보낸 뒤, 무대에서 실수했고, 서아의 위로와 연습 덕분에 용기를 얻어 다시 연주했어요.",
};

const mt07: ReadingChoiceItem = {
  id: "mt-07", type: "choice", passageId: "lt-stage", standardCode: "4국05-01", grade: 4,
  prompt: "이야기 전체에서 하준이의 마음은 어떻게 바뀌었나요?",
  options: [
    "신나고 들떴다가, 화가 났다가, 슬퍼졌다가, 마지막에는 외로워졌어요.",
    "처음부터 끝까지 걱정만 하다가 아무 일도 없이 끝났어요.",
    "걱정되고 떨렸다가, 창피했다가, 위로받아 힘을 얻고, 마지막에는 뿌듯해졌어요.",
    "자신 있게 시작했다가, 실수를 하고 장기자랑을 포기해 버렸어요.",
  ],
  correctOption: 2,
  principle: "이야기에서 인물의 마음은 일어난 일에 따라 바뀌어요. 마음이 바뀌는 순서와 까닭을 장면마다 살펴보면 이야기 전체의 흐름이 보여요.",
  hints: [
    "장면마다 하준이의 마음이 어땠는지 처음부터 차례로 떠올려 보세요.",
    "보기 가운데에는 글에 나오지 않는 마음이 들어 있거나, 이야기의 끝을 다르게 쓴 것이 있어요. 글과 하나씩 맞춰 보세요.",
  ],
  explanation: "하준이는 걱정하다가 실수로 창피해졌고, 서아의 위로와 연습으로 힘을 얻어 다시 연주한 뒤 뿌듯해졌어요.",
};

// ───────── 감각적 표현 찾기(sensory) [4국05-04] ─────────
const SN_PRINCIPLE =
  "감각적 표현은 눈으로 본 것, 귀로 들은 것, 코로 맡은 것, 혀로 맛본 것, 손과 피부로 만진 것을 생생하게 나타낸 표현이에요. 보는 느낌, 듣는 느낌, 냄새 맡는 느낌, 맛보는 느낌, 만지는 느낌으로 나눌 수 있어요.";
const SN_LABEL_HINTS: [string, string] = [
  "눈, 귀, 코, 혀, 피부 가운데 어느 곳으로 느낀 표현인지 행마다 떠올려 보세요.",
  "행마다 색깔, 소리, 냄새, 맛, 촉감을 나타내는 낱말이 있는지 찾아보세요.",
];

const sn01: LabelSentencesItem = {
  id: "sn-01", type: "label-sentences", passageId: "lt-rain-market", standardCode: "4국05-04", grade: 3,
  prompt: "시의 행마다 어떤 감각으로 느낀 표현인지 알맞은 꼬리표를 골라 보세요.",
  sentenceIds: ["s1-2", "s1-4", "s2-1", "s2-3"],
  labels: ["보는 느낌", "듣는 느낌", "냄새 맡는 느낌"],
  answers: { "s1-2": "듣는 느낌", "s1-4": "보는 느낌", "s2-1": "냄새 맡는 느낌", "s2-3": "냄새 맡는 느낌" },
  principle: SN_PRINCIPLE, hints: SN_LABEL_HINTS,
  explanation: "후두둑은 귀로 듣는 소리, 초록 파의 모습은 눈으로 보는 모습, 부침개 굽는 냄새와 흙냄새는 코로 맡는 냄새예요.",
};

const sn02: LabelSentencesItem = {
  id: "sn-02", type: "label-sentences", passageId: "lt-rain-market", standardCode: "4국05-04", grade: 3,
  prompt: "시의 행마다 어떤 감각으로 느낀 표현인지 알맞은 꼬리표를 골라 보세요.",
  sentenceIds: ["s2-2", "s3-1", "s3-2", "s3-3"],
  labels: ["맛보는 느낌", "만지는 느낌", "보는 느낌"],
  answers: { "s2-2": "맛보는 느낌", "s3-1": "만지는 느낌", "s3-2": "만지는 느낌", "s3-3": "보는 느낌" },
  principle: SN_PRINCIPLE, hints: SN_LABEL_HINTS,
  explanation: "달콤한 맛은 혀로, 차갑고 축축하고 보드라운 느낌은 피부로, 환한 불빛은 눈으로 느끼는 거예요.",
};

const sn03: SentencePickItem = {
  id: "sn-03", type: "sentence-pick", passageId: "lt-rain-market", standardCode: "4국05-04", grade: 3,
  prompt: "소리를 흉내 낸 말이 있는 행을 눌러 보세요.",
  correctSentenceIds: ["s1-2"],
  principle: "소리를 흉내 낸 말은 귀에 들리는 소리를 글자로 옮긴 말이에요. 눈에 보이는 모양을 나타내는 말과는 달라요.",
  hints: [
    "시를 소리 내어 읽으면서 귀에 들리는 소리가 느껴지는 행을 찾아보세요.",
    "'멍멍'이 강아지 소리를 흉내 낸 말인 것처럼, 소리를 그대로 옮긴 낱말이 들어 있는 행을 찾아보세요.",
  ],
  explanation: "'후두둑 후두둑'은 빗방울이 떨어지는 소리를 흉내 낸 말이에요. 읽기만 해도 소리가 들리는 것 같아요.",
};

const sn04: ChoiceWithEvidenceItem = {
  id: "sn-04", type: "choice-with-evidence", passageId: "lt-rain-market", standardCode: "4국05-04", grade: 4,
  prompt: "이 시에서 가장 많이 쓰인 감각은 무엇일까요? 그렇게 생각한 근거가 되는 행도 눌러 보세요.",
  options: ["귀로 듣는 느낌", "코로 냄새 맡는 느낌", "눈으로 보는 느낌", "손으로 만지는 느낌"],
  correctOption: 2,
  evidenceIds: ["s1-1", "s1-3", "s1-4", "s3-3"],
  principle: SN_PRINCIPLE,
  hints: [
    "시의 행을 처음부터 읽으며 어떤 감각으로 느낀 행인지 마음속으로 표시해 보세요.",
    "감각마다 몇 행씩 되는지 세어 보고 가장 많은 것을 찾아보세요.",
  ],
  explanation: "노란 우산, 빨간 사과, 초록 파, 환한 불빛처럼 눈으로 본 모습이 네 행이라 가장 많아요.",
};

const sn05: OwnLineItem = {
  id: "sn-05", type: "own-line", passageId: "lt-rain-market", standardCode: "4국05-04", grade: 4,
  prompt: "눈, 귀, 코, 혀, 피부 가운데 하나를 골라, 비 오는 날 내가 느낀 것을 한 줄로 써 보세요. 60자까지 쓸 수 있어요.",
  principle: "감각적 표현을 쓰면 내가 느낀 것이 읽는 사람에게도 생생하게 전해져요. 보고, 듣고, 맡고, 맛보고, 만진 것을 구체적인 낱말로 써 보세요.",
  hints: [
    "먼저 눈, 귀, 코, 혀, 피부 가운데 어느 감각으로 쓸지 정해 보세요.",
    "그 감각으로 느낀 색깔, 소리, 냄새, 맛, 촉감을 떠올려 짧은 말로 이어 보세요.",
  ],
  explanation: "정답은 없어요. 내가 느낀 것을 감각을 나타내는 낱말로 쓰면 돼요.",
};

// ───────── 인물 관계도(character-map) [6국05-03] ─────────
const CM_REL_PRINCIPLE =
  "인물 사이는 인물이 서로에게 하는 말과 행동, 이야기에서 인물을 소개하는 말에서 알 수 있어요. 처음과 끝에서 사이가 바뀌는 경우도 있어요.";
const CM_REL_HINT1 = "두 사람이 함께 나오는 장면에서 서로에게 하는 말과 행동을 찾아보세요.";

function relation(
  id: string, grade: 5 | 6, who: string, options: string[], correctOption: number, evidenceIds: string[], hint2: string, explanation: string,
): ChoiceWithEvidenceItem {
  return {
    id, type: "choice-with-evidence", passageId: "lt-kite", standardCode: "6국05-03", grade,
    prompt: `${who}은(는) 어떤 사이일까요? 그렇게 생각한 근거가 되는 문장도 눌러 보세요.`,
    options, correctOption, evidenceIds,
    principle: CM_REL_PRINCIPLE, hints: [CM_REL_HINT1, hint2], explanation,
  };
}

const cm01 = relation("cm-01", 5, "지우와 할머니",
  ["연날리기를 겨루는 사이", "같은 반 친구 사이", "옆집에 사는 이웃 사이", "같은 집에 사는 가족 사이"], 3, ["s1-3"],
  "어디에서 누구와 함께 지내는지 소개하는 말을 찾아보세요.",
  "지우는 같이 사는 할머니와 연을 만들었어요. 한집에서 함께 지내는 가족 사이예요.");
const cm02 = relation("cm-02", 5, "지우와 서린이",
  ["선생님과 제자 사이", "대회에서 겨루는 사이", "오랫동안 친하게 지내는 단짝 친구 사이", "옆집에 사는 이웃 사이"], 2, ["s1-4", "s3-5", "s4-4"],
  "서린이를 소개하는 말과, 힘든 때 서린이가 한 행동을 찾아보세요.",
  "서린이는 지우의 단짝으로 소개되고, 지우가 속상하거나 힘들 때마다 곁에서 달래 주고 함께했어요.");
const cm03 = relation("cm-03", 5, "지우와 달수 할아버지",
  ["연날리기 대회에서 겨루는 사이", "한 마을 옆집에 사는 이웃 사이", "같은 집에 사는 가족 사이", "같은 반 친구 사이"], 1, ["s2-2"],
  "달수 할아버지가 어디에 사는지, 지우에게 무엇을 해 주었는지 찾아보세요.",
  "달수 할아버지는 옆집에 살며 지우의 연에 쓸 대나무를 깎아 주셨어요. 이웃 사이예요.");
const cm04 = relation("cm-04", 6, "지우와 도윤이",
  ["늘 같은 편에서 힘을 합치는 가족 사이", "처음부터 끝까지 서로 미워하는 사이", "처음에는 친구였지만 나중에 멀어진 사이", "처음에는 겨루는 사이였지만 나중에는 친구가 된 사이"], 3, ["s7-3", "s7-5"],
  "이야기의 처음 장면과 끝 장면에서 두 사람이 서로에게 어떻게 말하고 행동하는지 비교해 보세요.",
  "도윤이는 처음에 지우의 연을 놀렸지만, 마지막에는 사과하고 함께 연을 날리는 친구가 되었어요.");

const cm05: ChoiceWithEvidenceItem = {
  id: "cm-05", type: "choice-with-evidence", passageId: "lt-kite", standardCode: "6국05-03", grade: 5,
  prompt: "이야기의 배경(때와 곳)은 어디일까요? 그렇게 생각한 근거가 되는 문장도 눌러 보세요.",
  options: [
    "가을 운동회 날, 학교 운동장",
    "겨울 대보름 무렵, 바닷가 마을",
    "봄 소풍 날, 도시의 공원",
    "여름 방학, 깊은 산골 마을",
  ],
  correctOption: 1,
  evidenceIds: ["s1-1", "s5-1"],
  principle: "이야기의 배경은 사건이 일어난 때와 곳이에요. 계절이나 날짜, 장소를 알려 주는 말과, 그 모습을 그린 말에서 알 수 있어요.",
  hints: [
    "이야기의 첫머리에서 언제, 어디인지 알려 주는 말을 찾아보세요.",
    "계절과 날짜를 나타내는 말, 마을이나 장소의 이름이나 모습을 나타내는 말을 각각 찾아보세요.",
  ],
  explanation: "정월 대보름을 열흘 앞둔 겨울, 바닷가 마을이 배경이에요. 대회도 선착장 옆 모래밭에서 열렸어요.",
};

const cm06: SequenceItem = {
  id: "cm-06", type: "sequence", passageId: "lt-kite", standardCode: "6국05-03", grade: 5,
  prompt: "이야기의 중요한 사건 다섯 가지를 일어난 차례대로 놓아 보세요.",
  events: [
    { id: "e1", text: "지우가 할머니와 방패연을 만들었어요." },
    { id: "e2", text: "도윤이가 지우의 연을 작고 촌스럽다고 놀렸어요." },
    { id: "e3", text: "지우가 날마다 모래밭에서 연날리기 연습을 했어요." },
    { id: "e4", text: "대회에서 도윤이의 연줄이 끊어져 연이 소나무에 걸렸어요." },
    { id: "e5", text: "지우가 도윤이를 도와 연을 내렸고, 둘은 친구가 되었어요." },
  ],
  correctOrder: ["e1", "e2", "e3", "e4", "e5"],
  principle: "이야기의 사건은 앞의 사건이 뒤의 사건의 까닭이 되며 이어져요. 시간을 나타내는 말과 사건이 일어난 까닭을 따라가면 차례를 알 수 있어요.",
  hints: [
    "'그날', '다음 날', '드디어', '그때'처럼 때를 알려 주는 말을 따라 이야기를 훑어 읽어 보세요.",
    "도윤이가 놀린 일이 있었기 때문에 지우가 어떻게 했는지, 대회 날 무슨 일이 생겼는지 이어서 생각해 보세요.",
  ],
  explanation: "연을 만들고, 놀림을 받고, 연습하고, 대회에서 사고가 생기고, 도와주며 화해하는 차례로 이어져요.",
};

const cm07: ChoiceWithEvidenceItem = {
  id: "cm-07", type: "choice-with-evidence", passageId: "lt-kite", standardCode: "6국05-03", grade: 6,
  prompt: "4문단의 연습 장면을 보면 지우는 어떤 성격일까요? 성격을 알 수 있는 행동이 나타난 문장도 눌러 보세요.",
  options: [
    "남이 하는 대로만 따라 하는 성격",
    "화가 나면 참지 못하고 싸우는 성격",
    "어려워도 포기하지 않고 끝까지 해내려는 성격",
    "겁이 많아 새로운 일을 피하는 성격",
  ],
  correctOption: 2,
  evidenceIds: ["s4-2", "s4-3"],
  principle: "인물의 성격은 어려운 일을 만났을 때 하는 행동과 말에서 잘 드러나요. 한 번의 행동보다 되풀이되는 행동을 살펴보면 더 정확해요.",
  hints: [
    "연이 말을 듣지 않을 때 지우가 어떻게 했는지 찾아보세요.",
    "지우가 힘든 일을 만나고도 같은 행동을 되풀이한 문장이 있는지 살펴보세요.",
  ],
  explanation: "연이 두 번이나 떨어졌어도 다시 붙여 날리고, 손가락이 얼어도 얼레를 놓지 않았어요. 포기하지 않는 성격이에요.",
};

// ───────── 비유적 표현의 효과(figurative) [6국05-02] ─────────
const FG_PRINCIPLE =
  "비유는 어떤 대상(원관념)을 다른 대상(보조관념)에 빗대어 말하는 표현이에요. '~처럼', '~같이'로 견주면 직유, 견주는 말 없이 'A는 B예요'라고 하면 은유예요.";

const fg01: SentencePickItem = {
  id: "fg-01", type: "sentence-pick", passageId: "lt-grandma-hand", standardCode: "6국05-02", grade: 5,
  prompt: "직유가 쓰인 행을 눌러 보세요.",
  correctSentenceIds: ["s1-2", "s1-3", "s3-1"],
  principle: FG_PRINCIPLE,
  hints: [
    "행마다 두 가지를 견주는 말이 들어 있는지 하나씩 살펴보세요.",
    "'A는 B예요'로 끝나는 행은 견주는 말이 없는 다른 종류의 비유예요. 견주는 말이 있는 행을 찾아보세요.",
  ],
  explanation: "'마른 나뭇가지처럼', '봄볕같이', '아기 고양이처럼'은 '~처럼', '~같이'로 견준 직유예요.",
};

const fg02: ChoiceWithEvidenceItem = {
  id: "fg-02", type: "choice-with-evidence", passageId: "lt-grandma-hand", standardCode: "6국05-02", grade: 5,
  prompt: "'따뜻한 난로'는 무엇을 무엇에 빗댄 표현일까요? 그렇게 생각한 근거가 되는 행도 눌러 보세요.",
  options: [
    "난로의 따뜻함을 할머니의 목소리에 빗댔어요.",
    "내 볼을 따뜻한 난로에 빗댔어요.",
    "할머니의 손을 따뜻한 난로에 빗댔어요.",
    "할머니의 손등을 마른 나뭇가지에 빗댔어요.",
  ],
  correctOption: 2,
  evidenceIds: ["s1-1"],
  principle: FG_PRINCIPLE,
  hints: [
    "빗대어 말하려는 대상(원관념)과 그 대상을 빗댄 다른 것(보조관념)을 나누어 찾아보세요.",
    "표현이 들어 있는 행에서 '~은(는)' 앞에 오는 낱말이 누구의 어떤 부분인지 살펴보세요.",
  ],
  explanation: "'할머니의 손'(원관념)을 '따뜻한 난로'(보조관념)에 빗댔어요. 손이 난로처럼 따뜻하다는 뜻이에요.",
};

const fg03: ChoiceWithEvidenceItem = {
  id: "fg-03", type: "choice-with-evidence", passageId: "lt-grandma-hand", standardCode: "6국05-02", grade: 5,
  prompt: "'마른 나뭇가지처럼'은 무엇을 무엇에 빗댄 표현일까요? 그렇게 생각한 근거가 되는 행도 눌러 보세요.",
  options: [
    "할머니의 손등을 봄볕에 빗댔어요.",
    "내 볼을 마른 나뭇가지에 빗댔어요.",
    "할머니의 머리카락을 마른 나뭇가지에 빗댔어요.",
    "할머니의 손등을 마른 나뭇가지에 빗댔어요.",
  ],
  correctOption: 3,
  evidenceIds: ["s1-2"],
  principle: FG_PRINCIPLE,
  hints: [
    "'~처럼' 바로 앞에 있는 낱말이 보조관념이에요. 그것에 빗대어진 대상이 무엇인지 찾아보세요.",
    "그 표현이 들어 있는 행에서 '~은(는)'으로 이어지는 주어를 살펴보세요.",
  ],
  explanation: "'주름진 손등'(원관념)을 '마른 나뭇가지'(보조관념)에 빗댔어요. 손등이 가늘고 거칠다는 뜻이에요.",
};

const fg04: LabelSentencesItem = {
  id: "fg-04", type: "label-sentences", passageId: "lt-grandma-hand", standardCode: "6국05-02", grade: 5,
  prompt: "시의 행마다 직유인지 은유인지 알맞은 꼬리표를 골라 보세요.",
  sentenceIds: ["s1-2", "s2-1", "s2-2", "s3-1"],
  labels: ["직유", "은유"],
  answers: { "s1-2": "직유", "s2-1": "은유", "s2-2": "은유", "s3-1": "직유" },
  principle: FG_PRINCIPLE,
  hints: [
    "행에 '~처럼', '~같이' 같은 견주는 말이 있는지 살펴보세요.",
    "견주는 말이 없고 'A는 B예요'처럼 곧바로 말한 행은 어느 쪽인지 생각해 보세요.",
  ],
  explanation: "견주는 말이 있는 '처럼' 행은 직유, 'A는 B예요'로 곧바로 말한 행은 은유예요.",
};

const fg05: ChoiceWithEvidenceItem = {
  id: "fg-05", type: "choice-with-evidence", passageId: "lt-grandma-hand", standardCode: "6국05-02", grade: 6,
  prompt: "'봄볕같이 포근해요'라고 표현하면 어떤 느낌이 더 잘 전해질까요? 근거가 되는 행도 눌러 보세요.",
  options: [
    "할머니의 손이 가늘고 거칠게 느껴져요.",
    "할머니의 손길이 가볍고 빠르게 느껴져요.",
    "할머니의 손길이 부드럽고 따뜻하게 느껴져요.",
    "할머니의 손이 아주 크고 힘이 세게 느껴져요.",
  ],
  correctOption: 2,
  evidenceIds: ["s1-3"],
  principle: "비유는 낯선 느낌을 누구나 아는 것에 빗대어 더 생생하게 전해 줘요. 보조관념이 주는 느낌이 곧 비유의 효과예요.",
  hints: [
    "봄볕을 쬘 때 몸과 마음이 어떤 느낌인지 떠올려 보세요.",
    "그 느낌이 할머니 손길에서 내 볼에 닿는 느낌으로 이어진다고 생각해 보세요.",
  ],
  explanation: "봄볕은 부드럽고 따뜻해요. 할머니의 손길을 봄볕에 빗대어 그 포근한 느낌이 생생하게 전해져요.",
};

const fg06: ChoiceWithEvidenceItem = {
  id: "fg-06", type: "choice-with-evidence", passageId: "lt-grandma-hand", standardCode: "6국05-02", grade: 6,
  prompt: "'오래된 자장가'라고 빗대면 할머니의 목소리가 어떻게 느껴질까요? 근거가 되는 행도 눌러 보세요.",
  options: [
    "목소리가 낯설고 새롭게 느껴져요.",
    "목소리가 크고 힘차게 느껴져요.",
    "목소리가 날카롭고 무섭게 느껴져요.",
    "목소리가 늘 듣던 것처럼 익숙하고 마음이 편안해지게 느껴져요.",
  ],
  correctOption: 3,
  evidenceIds: ["s2-1"],
  principle: "비유는 낯선 느낌을 누구나 아는 것에 빗대어 더 생생하게 전해 줘요. 보조관념이 주는 느낌이 곧 비유의 효과예요.",
  hints: [
    "자장가를 들으면 마음이 어떻게 되는지 떠올려 보세요.",
    "'오래된'이라는 말이 목소리를 얼마나 익숙하게 느끼게 하는지도 생각해 보세요.",
  ],
  explanation: "자장가는 편안하게 잠들게 해 주는 노래이고 '오래된'은 익숙하다는 뜻이에요. 늘 곁에서 듣던 편안한 목소리로 느껴져요.",
};

export const LITERATURE_ITEMS: readonly LiteratureItem[] = [
  mt01, mt02, mt03, mt04, mt05, mt06, mt07,
  sn01, sn02, sn03, sn04, sn05,
  cm01, cm02, cm03, cm04, cm05, cm06, cm07,
  fg01, fg02, fg03, fg04, fg05, fg06,
];

export function getLiteratureItem(id: string): LiteratureItem | undefined {
  return LITERATURE_ITEMS.find((i) => i.id === id);
}
