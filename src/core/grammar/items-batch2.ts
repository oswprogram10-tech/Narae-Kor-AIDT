// 문법 활동 문제 은행 2차분: 낱말 관계, 사전 기본형, 시간 표현, 맞춤법·띄어쓰기.
// 문제를 추가하면 tests/grammar.test.ts가 validateItem과 내용 규칙으로 검사한다.

import type { AgreementFixItem, ChoiceItem } from "./types";

const WR = "4국04-01";

/** 낱말 사이의 관계(비슷한말·반대말·포함 관계·뜻이 여러 개인 낱말). 3~4학년 */
export const WORD_RELATIONS: ChoiceItem[] = [
  {
    id: "wr-01", type: "choice", standardCode: WR, grade: 3,
    prompt: "'아름답다'와 뜻이 비슷한 낱말을 골라 보세요.",
    options: ["무섭다", "예쁘다", "느리다", "차갑다"], correctOption: 1,
    principle: "뜻이 서로 비슷한 낱말을 비슷한말이라고 해요. 문장에서 바꿔 읽어도 뜻이 거의 달라지지 않아요.",
    hints: ["'아름답다'는 꽃이나 경치를 보고 기분이 좋을 때 쓰는 말이에요. 그런 때 쓸 수 있는 다른 말을 떠올려 보세요.", "'무섭다', '느리다', '차갑다'는 느낌이나 모습을 나타내지만 뜻이 서로 달라요. 보는 사람의 기분이 좋아지는 말이 어느 것인지 생각해 보세요."],
    explanation: "'아름답다'와 '예쁘다'는 보기에 좋다는 뜻이 비슷해서 비슷한말이에요. 나머지 낱말은 뜻이 달라요.",
  },
  {
    id: "wr-02", type: "choice", standardCode: WR, grade: 3,
    prompt: "'마을'과 뜻이 비슷한 낱말을 골라 보세요.",
    options: ["시장", "동네", "병원", "운동장"], correctOption: 1,
    principle: "비슷한말은 뜻이 거의 같아서 문장 속에서 서로 바꿔 쓸 수 있는 낱말이에요.",
    hints: ["'마을'은 사람들이 모여 사는 곳을 말해요. 내가 사는 곳 가까이를 부르는 다른 말을 떠올려 보세요.", "'우리 ○○에는 공원이 있어요'에서 '마을'을 넣어도 되고, 뜻이 거의 같은 말을 넣어도 말이 되는 보기를 찾아보세요."],
    explanation: "'마을'과 '동네'는 사람들이 모여 사는 곳을 가리켜서 비슷한말이에요. 시장, 병원, 운동장은 어떤 일을 하는 장소라서 뜻이 달라요.",
  },
  {
    id: "wr-03", type: "choice", standardCode: WR, grade: 3,
    prompt: "'깊다'와 뜻이 반대인 낱말을 골라 보세요.",
    options: ["넓다", "높다", "얕다", "길다"], correctOption: 2,
    principle: "뜻이 서로 반대되는 낱말을 반대말이라고 해요. 같은 기준에서 한쪽 끝과 다른 쪽 끝을 나타내요.",
    hints: ["'깊다'는 물이나 구덩이의 위에서 바닥까지의 거리를 말할 때 써요. 같은 기준으로 그 반대를 말해 보세요.", "'넓다', '높다', '길다'는 다른 기준(너비, 높이, 길이)을 말하는 낱말이에요. 물의 바닥이 가까울 때 쓰는 말을 찾아보세요."],
    explanation: "'깊다'는 바닥까지의 거리가 멀다는 뜻이고, 반대로 가깝다는 뜻의 낱말이 '얕다'예요.",
  },
  {
    id: "wr-04", type: "choice", standardCode: WR, grade: 3,
    prompt: "'밝다'와 뜻이 반대인 낱말을 골라 보세요.",
    options: ["환하다", "맑다", "따뜻하다", "어둡다"], correctOption: 3,
    principle: "반대말은 같은 기준에서 뜻이 서로 맞서는 낱말이에요. 뜻이 비슷한 낱말과 헷갈리지 않게 살펴봐요.",
    hints: ["'밝다'는 빛이 환하게 비치는 모습을 말해요. 빛이 거의 없는 모습을 나타내는 말을 떠올려 보세요.", "보기 중에는 '밝다'와 뜻이 비슷한 낱말도 있어요. 비슷한말이 아니라 반대로 말하는 낱말을 찾아보세요."],
    explanation: "빛이 환한 '밝다'의 반대는 빛이 없는 '어둡다'예요. '환하다'는 '밝다'와 비슷한말이에요.",
  },
  {
    id: "wr-05", type: "choice", standardCode: WR, grade: 4,
    prompt: "'이기다'와 뜻이 반대인 낱말을 골라 보세요.",
    options: ["싸우다", "겨루다", "놀다", "지다"], correctOption: 3,
    principle: "움직임을 나타내는 낱말에도 반대말이 있어요. 경기나 놀이의 결과를 말하는 낱말을 생각해 봐요.",
    hints: ["축구 경기가 끝났을 때 한 팀은 '이겼다'라고 하고, 다른 팀은 어떻게 말하는지 생각해 보세요.", "'싸우다', '겨루다'는 경기가 진행되는 모습이에요. 경기가 끝난 뒤의 결과 중 '이기다'와 맞서는 말을 찾아보세요."],
    explanation: "경기에서 '이기다'와 맞서는 결과는 '지다'예요. '싸우다', '겨루다'는 승부를 내는 과정을 말해요.",
  },
  {
    id: "wr-06", type: "choice", standardCode: WR, grade: 3,
    prompt: "'사과', '배', '포도'를 모두 한 묶음으로 부를 수 있는 말(포함하는 말)을 골라 보세요.",
    options: ["채소", "과일", "곡식", "동물"], correctOption: 1,
    principle: "여러 낱말을 한꺼번에 품는 넓은 뜻의 낱말을 '포함하는 말'이라고 해요. 포함되는 낱말들은 같은 종류예요.",
    hints: ["사과, 배, 포도의 공통점이 무엇인지 생각해 보세요. 시장에서 같은 칸에 놓여 있어요.", "나무에서 열려 달콤한 맛이 나는 먹을거리를 부르는 말을 찾아보세요. 채소나 곡식과는 달라요."],
    explanation: "사과, 배, 포도는 모두 '과일'에 포함돼요. '과일'은 사과, 배, 포도를 포함하는 말이에요.",
  },
  {
    id: "wr-07", type: "choice", standardCode: WR, grade: 4,
    prompt: "'축구'는 어떤 말에 포함되는 낱말인지 골라 보세요.",
    options: ["악기", "음식", "운동", "과목"], correctOption: 2,
    principle: "'축구'처럼 좁은 뜻의 낱말은 더 넓은 뜻의 낱말에 포함돼요. '○○는 ◇◇의 한 종류예요'라고 말해 보면 알 수 있어요.",
    hints: ["축구는 어떤 종류의 활동인지 생각해 보세요. '축구는 ○○의 한 종류예요'라고 말해 볼 수 있어요.", "몸을 움직여 규칙에 따라 겨루는 활동을 모두 부르는 말이 무엇인지 떠올려 보세요."],
    explanation: "축구, 야구, 달리기는 모두 몸을 움직이는 '운동'에 포함돼요. 그래서 '운동'이 포함하는 말이에요.",
  },
  {
    id: "wr-08", type: "choice", standardCode: WR, grade: 4,
    prompt: "문장에서 '먹었어요'는 어떤 뜻으로 쓰였을까요?",
    context: "나는 매일 책을 읽겠다고 마음을 먹었어요.", target: "먹었어요",
    options: ["음식을 입으로 삼켰다", "어떻게 하겠다고 생각을 정했다", "나이가 많아졌다"], correctOption: 1,
    principle: "뜻이 여러 개인 낱말은 앞뒤에 어떤 말이 함께 쓰였는지 보면 어떤 뜻인지 알 수 있어요.",
    hints: ["'먹었어요' 앞에 어떤 낱말이 있는지 살펴보세요. 입으로 무엇을 삼키는 일과 어울리나요?", "'마음을 먹다'는 자주 쓰는 표현이에요. 다짐하거나 결심할 때 하는 말과 뜻이 이어지는 보기를 찾아보세요."],
    explanation: "'마음을 먹다'는 어떻게 하겠다고 생각을 정한다는 뜻이에요. 같은 '먹다'라도 함께 쓰인 말에 따라 뜻이 달라져요.",
  },
  {
    id: "wr-09", type: "choice", standardCode: WR, grade: 4,
    prompt: "문장에서 '타서'는 어떤 뜻으로 쓰였을까요?",
    context: "나는 아침마다 우유에 코코아 가루를 타서 마셔요.", target: "타서",
    options: ["버스나 자전거 같은 탈것에 올랐다", "물이나 우유에 다른 것을 섞었다", "불에 닿아 검게 되었다"], correctOption: 1,
    principle: "소리와 모양이 같아도 뜻이 여러 개인 낱말이 있어요. 문장 속의 다른 낱말을 단서로 삼아 알맞은 뜻을 찾아요.",
    hints: ["이 문장에서 '타서'와 함께 나온 '우유'와 '가루'가 무엇을 하는 모습인지 그려 보세요.", "마시기 전에 무엇을 하는 장면인지 떠올려 보세요. 올라타는 일이나 불에 닿는 일과는 거리가 멀어요."],
    explanation: "우유에 가루를 넣어 섞는 모습이므로, 이때 '타다'는 다른 것을 섞는다는 뜻이에요.",
  },
  {
    id: "wr-10", type: "choice", standardCode: WR, grade: 4,
    prompt: "문장에서 '쓰고'는 어떤 뜻으로 쓰였을까요?",
    context: "나는 모자를 쓰고 공원에 갔어요.", target: "쓰고",
    options: ["연필로 글자를 적고", "맛이 쓰고", "머리에 얹어 덮고", "돈을 들이고"], correctOption: 2,
    principle: "'쓰다'처럼 뜻이 여러 개인 낱말은 앞에 오는 낱말과 함께 읽어 보면 뜻을 알 수 있어요.",
    hints: ["'쓰고' 앞에 있는 '모자를'을 보세요. 모자를 가지고 하는 일이 무엇인지 생각해 보세요.", "공원에 가기 전에 모자를 몸의 어디에 했을지 떠올려 보세요. 글씨, 맛, 돈과는 어울리지 않아요."],
    explanation: "'모자를 쓰다'는 모자를 머리에 얹어 덮는다는 뜻이에요. 같은 '쓰다'라도 글씨를 쓰거나 돈을 쓸 때는 뜻이 달라요.",
  },
];

const DF = "4국04-02";
const DF_PRINCIPLE =
  "국어사전에는 문장 속에서 모양이 바뀐 낱말이 아니라, 바뀌지 않는 부분에 '-다'를 붙인 꼴(기본형)이 실려 있어요.";

/** 국어사전에서 낱말 찾기(기본형, 사전에 실린 순서). 3~4학년 */
export const DICTIONARY_FORM: ChoiceItem[] = [
  {
    id: "df-01", type: "choice", standardCode: DF, grade: 3,
    prompt: "국어사전에서 '먹었어요'를 찾으려면 어떤 꼴로 찾아야 할까요?",
    context: "동생이 밥을 먹었어요.", target: "먹었어요",
    options: ["먹었다", "먹어요", "먹다", "먹"], correctOption: 2,
    principle: DF_PRINCIPLE,
    hints: ["'먹었어요'에서 때나 말투에 따라 바뀌는 부분을 빼고, 바뀌지 않는 부분만 남겨 보세요.", "바뀌지 않는 부분 뒤에 '-다'를 붙여 마무리한 꼴을 찾아보세요. '-었-'이나 '-어요'가 붙어 있으면 아직 바뀐 꼴이에요."],
    explanation: "'먹었어요'에서 바뀌지 않는 부분은 '먹-'이에요. 여기에 '-다'를 붙인 '먹다'가 사전에 실려 있어요.",
  },
  {
    id: "df-02", type: "choice", standardCode: DF, grade: 4,
    prompt: "국어사전에서 '도와요'를 찾으려면 어떤 꼴로 찾아야 할까요?",
    context: "민수가 할머니를 도와요.", target: "도와요",
    options: ["돕다", "도다", "도우다", "도와다"], correctOption: 0,
    principle: DF_PRINCIPLE + " 그런데 어떤 낱말은 모양이 바뀌면서 받침이 달라 보이기도 해요.",
    hints: ["'도와요'에서 '와'는 원래 어떤 받침이 있던 글자가 바뀐 모습일 수 있어요. 받침이 있던 모습을 떠올려 보세요.", "'도와요'를 '도우+어요'처럼 읽어 보지 말고, '도'에 받침을 붙여 '-아요/-어요'가 이어졌을 때의 소리를 생각해 보세요."],
    explanation: "'돕다'는 '도와요', '도우니'처럼 모양이 바뀌어요. 그래서 사전에는 '돕다'로 실려 있어요.",
  },
  {
    id: "df-03", type: "choice", standardCode: DF, grade: 4,
    prompt: "국어사전에서 '들었어요'를 찾으려면 어떤 꼴로 찾아야 할까요?",
    context: "나는 좋아하는 음악을 들었어요.", target: "들었어요",
    options: ["들다", "들었다", "듣다"], correctOption: 2,
    principle: DF_PRINCIPLE + " 모양이 같아 보여도 문장에서의 뜻에 따라 기본형이 달라질 수 있어요.",
    hints: ["문장에서 '들었어요'가 어떤 일을 하는 말인지 생각해 보세요. 음악과 함께 쓰는 동작을 떠올려 보세요.", "소리를 귀로 받아들이는 일을 가리키는 낱말이에요. 이 낱말은 모양이 바뀔 때 받침이 달라져요."],
    explanation: "음악을 '들었어요'는 소리를 귀로 받아들인다는 뜻의 '듣다'예요. '가방을 들었어요'처럼 손으로 올릴 때는 '들다'를 써요.",
  },
  {
    id: "df-04", type: "choice", standardCode: DF, grade: 4,
    prompt: "국어사전에서 '지어요'를 찾으려면 어떤 꼴로 찾아야 할까요?",
    context: "엄마가 맛있는 밥을 지어요.", target: "지어요",
    options: ["짖다", "지다", "짓다"], correctOption: 2,
    principle: DF_PRINCIPLE + " 받침이 사라진 것처럼 보이는 낱말도 있으니 뜻을 함께 생각해요.",
    hints: ["'밥을 ○○요'에서 밥으로 할 수 있는 일을 생각해 보세요. 쌀로 밥을 만드는 일을 가리켜요.", "'집을 지어요', '옷을 지어요'에도 쓰는 낱말이에요. 모양이 바뀌기 전에는 받침이 있었어요."],
    explanation: "밥, 집, 옷을 만든다는 뜻의 낱말은 '짓다'예요. '짓다'는 '지어요', '지으니'처럼 모양이 바뀌어서 사전에는 '짓다'로 실려 있어요.",
  },
  {
    id: "df-05", type: "choice", standardCode: DF, grade: 4,
    prompt: "국어사전에서 '나아서'를 찾으려면 어떤 꼴로 찾아야 할까요?",
    context: "감기가 다 나아서 학교에 갔어요.", target: "나아서",
    options: ["나다", "낫다", "낳다"], correctOption: 1,
    principle: DF_PRINCIPLE + " 소리가 비슷한 낱말이 여러 개 있을 수 있으니 문장의 뜻을 확인해요.",
    hints: ["문장에서 감기에 걸렸던 사람이 어떻게 되었는지 생각해 보세요. 아픈 것이 없어졌다는 뜻이에요.", "소리가 비슷한 낱말이 있어요. 아기를 세상에 태어나게 할 때 쓰는 말이 아니라, 병이 없어지는 뜻의 낱말이에요. 모양이 바뀔 때 받침 하나가 사라져요."],
    explanation: "병이 없어진다는 뜻의 낱말은 '낫다'예요. '나아서', '나으니'처럼 모양이 바뀌지만 사전에는 '낫다'로 실려 있어요.",
  },
  {
    id: "df-06", type: "choice", standardCode: DF, grade: 4,
    prompt: "국어사전에서 '걸어요'를 찾으려면 어떤 꼴로 찾아야 할까요?",
    context: "우리는 공원에서 천천히 걸어요.", target: "걸어요",
    options: ["걷다", "걸다", "걸었다"], correctOption: 0,
    principle: DF_PRINCIPLE + " 문장의 뜻이 다르면 같은 모양이어도 기본형이 달라요.",
    hints: ["문장에서 '천천히' 다음에 오는 '걸어요'가 어떤 동작을 하는 말인지 생각해 보세요.", "벽에 그림을 '걸어요'와 달리, 이 문장은 발로 땅을 딛으며 가는 동작이에요. 그 낱말은 모양이 바뀔 때 받침이 달라져요."],
    explanation: "발로 걸어서 가는 동작은 '걷다'예요. '걷다'는 '걸어요', '걸으니'처럼 바뀌어서 사전에는 '걷다'로 실려 있어요.",
  },
  {
    id: "df-07", type: "choice", standardCode: DF, grade: 3,
    prompt: "국어사전에서 '추워요'를 찾으려면 어떤 꼴로 찾아야 할까요?",
    context: "오늘은 날씨가 추워요.", target: "추워요",
    options: ["추다", "추웠다", "춥다"], correctOption: 2,
    principle: DF_PRINCIPLE + " 모양이 바뀌면서 받침이 사라진 것처럼 보일 수 있어요.",
    hints: ["'추워요'에서 '워'는 원래 받침이 있던 글자일 수 있어요. 어떤 받침이 있었는지 떠올려 보세요.", "'춤을 추다'의 '추다'와는 뜻이 달라요. 날씨가 차가울 때 쓰는 말이에요."],
    explanation: "날씨가 차갑다는 뜻의 낱말은 '춥다'예요. '추워요', '추우니'처럼 바뀌지만 사전에는 '춥다'로 실려 있어요.",
  },
  {
    id: "df-08", type: "choice", standardCode: DF, grade: 3,
    prompt: "국어사전에서 가장 먼저 나오는 낱말을 골라 보세요.",
    options: ["하늘", "바다", "나무", "사과"], correctOption: 2,
    principle: "국어사전은 첫 글자의 자음자 순서대로 낱말을 실어요. 자음자 순서는 ㄱ, ㄲ, ㄴ, ㄷ, ㄸ, ㄹ, ㅁ, ㅂ, ㅃ, ㅅ, ㅆ, ㅇ, ㅈ, ㅉ, ㅊ, ㅋ, ㅌ, ㅍ, ㅎ이에요.",
    hints: ["낱말마다 첫 글자의 자음자만 떼어서 써 보세요.", "자음자를 ㄱ, ㄴ, ㄷ, ㄹ, ㅁ, ㅂ, ㅅ, ㅇ, ㅈ, ㅊ, ㅋ, ㅌ, ㅍ, ㅎ 순서로 외워 보며 어느 자음자가 가장 앞에 있는지 비교해 보세요."],
    explanation: "첫 글자의 자음자는 나무 ㄴ, 바다 ㅂ, 사과 ㅅ, 하늘 ㅎ이에요. ㄴ이 가장 앞에 있어서 '나무'가 가장 먼저 나와요.",
  },
  {
    id: "df-09", type: "choice", standardCode: DF, grade: 3,
    prompt: "국어사전에서 가장 나중에 나오는 낱말을 골라 보세요.",
    options: ["고래", "구름", "거미", "가방"], correctOption: 1,
    principle: "첫 글자의 자음자가 같으면, 다음으로 모음자 순서를 봐요. 모음자 순서는 ㅏ, ㅐ, ㅑ, ㅒ, ㅓ, ㅔ, ㅕ, ㅖ, ㅗ, ㅘ, ㅙ, ㅚ, ㅛ, ㅜ, ㅝ, ㅞ, ㅟ, ㅠ, ㅡ, ㅢ, ㅣ예요.",
    hints: ["네 낱말 모두 첫 글자의 자음자가 같아요. 그러면 첫 글자의 모음자를 비교해야 해요.", "ㅏ, ㅓ, ㅗ, ㅜ를 사전에 실리는 순서대로 늘어놓고, 그중 가장 뒤에 오는 것을 찾아보세요."],
    explanation: "첫 글자의 모음자는 가방 ㅏ, 거미 ㅓ, 고래 ㅗ, 구름 ㅜ예요. ㅜ가 가장 뒤에 있어서 '구름'이 가장 나중에 나와요.",
  },
  {
    id: "df-10", type: "choice", standardCode: DF, grade: 4,
    prompt: "국어사전에서 가장 먼저 나오는 낱말을 골라 보세요.",
    options: ["강아지", "감자", "간식", "갑옷"], correctOption: 2,
    principle: "첫 글자의 자음자와 모음자가 모두 같으면, 그다음에는 받침의 순서를 봐요. 받침이 없는 글자가 있다면 그것이 가장 앞이에요.",
    hints: ["네 낱말은 첫 글자의 자음자와 모음자가 모두 같아요. 그럼 첫 글자의 받침을 비교해야 해요.", "받침을 ㄱ, ㄴ, ㄷ, ㄹ, ㅁ, ㅂ, ㅅ, ㅇ 순서로 늘어놓고 어느 받침이 가장 앞에 있는지 찾아보세요."],
    explanation: "첫 글자의 받침은 간식 ㄴ, 감자 ㅁ, 갑옷 ㅂ, 강아지 ㅇ이에요. ㄴ이 가장 앞에 있어서 '간식'이 가장 먼저 나와요.",
  },
];

const TE = "6국04-05";
const TE_PROMPT = "시간을 나타내는 말과 어울리지 않는 말을 눌러 고르고, 알맞게 바꿀 말을 골라 보세요.";
const TE_PRINCIPLE = "시간을 나타내는 말(어제, 내일, 지금 같은 말)과 끝맺는 말의 때가 서로 맞아야 해요. 먼저 그 일이 지난 일인지, 지금 하는 일인지, 앞으로 할 일인지 살펴요.";

/** 시간 표현 바로 쓰기. 5~6학년 */
export const TIME_EXPRESSION: AgreementFixItem[] = [
  {
    id: "te-01", type: "agreement-fix", standardCode: TE, grade: 5, category: "tense", prompt: TE_PROMPT,
    tokens: ["어제", "나는", "일기를", "써요."], wrongIndex: 3,
    options: ["썼어요.", "쓸 거예요.", "쓰고 있어요."], correctOption: 0,
    principle: TE_PRINCIPLE,
    hints: ["'어제'가 지난 때인지 앞으로 올 때인지 확인하고, 끝맺는 말이 그 때와 맞는지 읽어 보세요.", "이미 끝난 일을 말할 때 끝맺는 말에 붙이는 모양을 떠올려 보세요. '지금'이나 '앞으로'를 나타내는 모양과는 달라요."],
    explanation: "'어제'는 지난 때이므로 끝맺는 말도 지난 일을 나타내는 '썼어요'로 써야 해요.",
  },
  {
    id: "te-02", type: "agreement-fix", standardCode: TE, grade: 5, category: "tense", prompt: TE_PROMPT,
    tokens: ["다음", "주에", "삼촌이", "우리", "집에", "왔어요."], wrongIndex: 5,
    options: ["올 거예요.", "오고 있었어요.", "왔었어요."], correctOption: 0,
    principle: TE_PRINCIPLE,
    hints: ["'다음 주'가 지난 때인지 앞으로 올 때인지 확인해 보세요.", "앞으로 일어날 일을 말할 때 끝맺는 말에 붙이는 모양을 떠올려 보세요. 지난 일을 나타내는 보기들은 어울리지 않아요."],
    explanation: "'다음 주'는 아직 오지 않은 때이므로 끝맺는 말도 앞날을 나타내는 '올 거예요'로 써야 해요.",
  },
  {
    id: "te-03", type: "agreement-fix", standardCode: TE, grade: 5, category: "tense", prompt: TE_PROMPT,
    tokens: ["지금", "동생이", "마당에서", "놀았어요."], wrongIndex: 3,
    options: ["놀고 있어요.", "놀 거예요.", "놀았었어요."], correctOption: 0,
    principle: TE_PRINCIPLE,
    hints: ["'지금'은 말하는 바로 그때를 나타내요. 끝맺는 말이 지난 일을 나타내고 있지는 않은지 살펴보세요.", "말하는 때에 일이 한창 진행되는 모습을 나타내는 말을 찾아보세요. 이미 끝난 일이나 앞으로의 일과는 달라요."],
    explanation: "'지금'은 말하는 바로 그때를 나타내므로, 지금 진행되는 일을 말하는 '놀고 있어요'가 어울려요.",
  },
  {
    id: "te-04", type: "agreement-fix", standardCode: TE, grade: 5, category: "tense", prompt: TE_PROMPT,
    tokens: ["아까", "민지가", "교실에서", "청소를", "할 거예요."], wrongIndex: 4,
    options: ["했어요.", "하고 있어요.", "하겠어요."], correctOption: 0,
    principle: TE_PRINCIPLE,
    hints: ["'아까'는 얼마 전을 가리키는 말이에요. 끝맺는 말이 그 때와 어울리는지 읽어 보세요.", "조금 전에 이미 끝난 일을 말할 때 끝맺는 말에 붙이는 모양을 떠올려 보세요."],
    explanation: "'아까'는 얼마 전, 곧 지난 때이므로 끝맺는 말도 지난 일을 나타내는 '했어요'로 써야 해요.",
  },
  {
    id: "te-05", type: "agreement-fix", standardCode: TE, grade: 5, category: "tense", prompt: TE_PROMPT,
    tokens: ["작년에", "나는", "처음으로", "자전거를", "타요."], wrongIndex: 4,
    options: ["탔어요.", "타고 있어요.", "탈 거예요."], correctOption: 0,
    principle: TE_PRINCIPLE,
    hints: ["'작년'이 지난 때인지 앞으로 올 때인지 생각해 보세요. 그리고 끝맺는 말과 비교해 보세요.", "지난해에 일어난 일을 말할 때 끝맺는 말에 붙이는 모양을 떠올려 보세요."],
    explanation: "'작년'은 지난 때이므로 끝맺는 말도 지난 일을 나타내는 '탔어요'로 써야 해요.",
  },
  {
    id: "te-06", type: "agreement-fix", standardCode: TE, grade: 6, category: "tense", prompt: TE_PROMPT,
    tokens: ["방금", "버스가", "정류장에", "도착해요."], wrongIndex: 3,
    options: ["도착했어요.", "도착할 거예요.", "도착하고 있어요."], correctOption: 0,
    principle: TE_PRINCIPLE,
    hints: ["'방금'은 아주 조금 전을 가리키는 말이에요. 끝맺는 말이 그 때와 어울리는지 읽어 보세요.", "방금 끝난 일을 말할 때 끝맺는 말에 붙이는 모양을 떠올려 보세요. 앞으로의 일이나 한창 하는 일과는 달라요."],
    explanation: "'방금'은 아주 조금 전, 곧 지난 때이므로 끝맺는 말도 지난 일을 나타내는 '도착했어요'로 써야 해요.",
  },
  {
    id: "te-07", type: "agreement-fix", standardCode: TE, grade: 6, category: "tense", prompt: TE_PROMPT,
    tokens: ["내년에", "나는", "중학생이", "되었어요."], wrongIndex: 3,
    options: ["될 거예요.", "되고 있어요.", "되었었어요."], correctOption: 0,
    principle: TE_PRINCIPLE,
    hints: ["'내년'이 이미 지난 때인지 아직 오지 않은 때인지 생각해 보세요.", "아직 오지 않은 때의 일을 말할 때 끝맺는 말에 붙이는 모양을 떠올려 보세요."],
    explanation: "'내년'은 아직 오지 않은 때이므로 끝맺는 말도 앞날을 나타내는 '될 거예요'로 써야 해요.",
  },
  {
    id: "te-08", type: "agreement-fix", standardCode: TE, grade: 6, category: "tense", prompt: TE_PROMPT,
    tokens: ["어제", "내가", "읽을", "책은", "재미있었어요."], wrongIndex: 2,
    options: ["읽은", "읽는", "읽겠던"], correctOption: 0,
    principle: "뒤에 오는 명사를 꾸며 주는 말도 때를 나타내요. '어제'처럼 때를 나타내는 말이 있으면 꾸며 주는 말의 때도 맞춰야 해요.",
    hints: ["'책은'을 꾸며 주는 말이 어떤 때의 일을 말하는지 살펴보세요. 문장 앞에 있는 때를 나타내는 말과 비교해 보세요.", "이미 끝난 일이 책을 꾸며 줄 때 말 끝에 붙이는 모양을 떠올려 보세요. '-ㄴ' 소리로 끝나요."],
    explanation: "'어제' 읽은 책이므로 꾸며 주는 말도 지난 일을 나타내는 '읽은'으로 써야 해요. '읽을'은 앞으로 읽을 책에 써요.",
  },
  {
    id: "te-09", type: "agreement-fix", standardCode: TE, grade: 6, category: "tense", prompt: TE_PROMPT,
    tokens: ["모레", "엄마는", "케이크를", "만들었어요."], wrongIndex: 3,
    options: ["만들 거예요.", "만들고 있었어요.", "만들었었어요."], correctOption: 0,
    principle: TE_PRINCIPLE,
    hints: ["'모레'가 지난 때인지 앞으로 올 때인지 생각해 보세요.", "내일의 다음 날에 하려는 일을 말할 때 끝맺는 말에 붙이는 모양을 떠올려 보세요."],
    explanation: "'모레'는 아직 오지 않은 때이므로 끝맺는 말도 앞날을 나타내는 '만들 거예요'로 써야 해요.",
  },
  {
    id: "te-10", type: "agreement-fix", standardCode: TE, grade: 6, category: "tense", prompt: TE_PROMPT,
    tokens: ["어젯밤에", "나는", "일찍", "자요."], wrongIndex: 3,
    options: ["잤어요.", "잘 거예요.", "자고 있어요."], correctOption: 0,
    principle: TE_PRINCIPLE,
    hints: ["'어젯밤'은 오늘보다 앞선 때인지 뒤인 때인지 확인해 보세요.", "이미 지나간 밤의 일을 말할 때 끝맺는 말에 붙이는 모양을 떠올려 보세요."],
    explanation: "'어젯밤'은 지난 때이므로 끝맺는 말도 지난 일을 나타내는 '잤어요'로 써야 해요.",
  },
];

const SS = "6국04-06";
const SPELL_PROMPT = "맞춤법에 맞지 않는 말을 눌러 고르고, 바르게 고친 말을 골라 보세요.";
const SPACE_PROMPT = "띄어쓰기가 바르지 않은 말을 눌러 고르고, 바르게 띄어 쓴 것을 골라 보세요.";

/** 맞춤법·띄어쓰기 고치기. 5~6학년. 띄어쓰기 문제는 고쳐야 할 덩어리가 한 어절이고 보기에 띄어쓰기가 들어 있다 */
export const SPELLING_SPACING: AgreementFixItem[] = [
  {
    id: "ss-01", type: "agreement-fix", standardCode: SS, grade: 5, category: "spelling", prompt: SPELL_PROMPT,
    tokens: ["숙제를", "다", "끝내면", "놀아도", "되요."], wrongIndex: 4,
    options: ["돼요.", "대요.", "돼어요."], correctOption: 0,
    principle: "'되'와 '돼'는 소리가 비슷해서 헷갈리기 쉬워요. 둘 중 무엇을 쓸지는 소리가 아니라 줄여 쓴 말인지 아닌지로 정해요.",
    hints: ["이 말을 '되어요'로 풀어 써도 뜻이 같은지 확인해 보세요.", "'되어'를 줄여 쓴 글자가 무엇인지 떠올려 보세요. '하'와 '해'를 넣어 읽어 보는 방법도 있어요."],
    explanation: "'되어요'를 줄이면 '돼요'가 돼요. '되어'를 줄인 글자는 '돼'예요. 그래서 '놀아도 돼요'라고 써요.",
  },
  {
    id: "ss-02", type: "agreement-fix", standardCode: SS, grade: 5, category: "spelling", prompt: SPELL_PROMPT,
    tokens: ["약속을", "지키지", "안으면", "친구가", "속상해요."], wrongIndex: 2,
    options: ["않으면", "앉으면", "않은데"], correctOption: 0,
    principle: "'~하지 않다'처럼 어떤 일을 하지 않는다는 뜻을 나타내는 말은 '안'이 아니라 다른 글자로 쓸 때가 있어요. '지' 뒤에서는 어떤 글자를 쓰는지 살펴봐요.",
    hints: ["'지키지' 다음에 오는 말이 '지키지 아니하면'을 줄인 말인지 생각해 보세요.", "'아니하-'를 줄이면 'ㅎ'이 받침으로 남아요. 받침에 'ㅎ'이 들어간 글자를 쓴 보기를 찾아보세요."],
    explanation: "'지키지 아니하면'을 줄인 말이 '지키지 않으면'이에요. '-지' 뒤에서는 '않-'을 써요.",
  },
  {
    id: "ss-03", type: "agreement-fix", standardCode: SS, grade: 5, category: "spelling", prompt: SPELL_PROMPT,
    tokens: ["우리", "가족은", "몇일", "동안", "여행을", "갔어요."], wrongIndex: 2,
    options: ["며칠", "몇 일", "몇칠"], correctOption: 0,
    principle: "날짜를 물을 때 쓰는 낱말은 '몇'과 '일'로 나누어 적지 않고, 소리 나는 대로 적어요.",
    hints: ["달력에서 날짜를 말할 때 '몇 월' 뒤에 이어 오는 말을 소리 내어 읽어 보세요. '일'로 소리 나나요?", "'몇'과 '일'을 따로 쓰지 않고, 소리 나는 대로 한 낱말로 적는 낱말을 찾아보세요."],
    explanation: "며칠은 '몇 일'이 아니라 소리 나는 대로 '며칠'로 적어요. 그래서 '며칠 동안'이라고 써요.",
  },
  {
    id: "ss-04", type: "agreement-fix", standardCode: SS, grade: 6, category: "spelling", prompt: SPELL_PROMPT,
    tokens: ["어머", "이게", "왠일이에요?"], wrongIndex: 2,
    options: ["웬일이에요?", "웬일이예요?", "왠일이예요?"], correctOption: 0,
    principle: "'웬'과 '왠'은 소리가 같아서 헷갈려요. 어떤 일이냐고 놀라서 물을 때 어느 글자를 쓰는지 따져 봐요.",
    hints: ["'왜인지'의 뜻으로 쓸 수 있는지 바꿔 읽어 보세요. 그렇게 바꿔 읽으면 말이 이상해져요.", "'어찌 된'이라는 뜻의 낱말과 '일'이 합쳐진 말이에요. 앞부분의 글자를 먼저 고른 뒤, 끝의 '이에요'가 알맞은지도 확인해 보세요."],
    explanation: "'어찌 된 일'이라는 뜻의 낱말은 '웬일'이에요. '왠지'는 '왜인지'를 줄인 말이라서 쓰임이 달라요. 받침 있는 '일' 뒤에는 '이에요'를 써요.",
  },
  {
    id: "ss-05", type: "agreement-fix", standardCode: SS, grade: 6, category: "spelling", prompt: SPELL_PROMPT,
    tokens: ["친구가", "낸", "수수께끼를", "맞춰", "보세요."], wrongIndex: 3,
    options: ["맞혀", "맞쳐", "맞헤"], correctOption: 0,
    principle: "소리가 비슷해도 뜻에 따라 다르게 쓰는 낱말이 있어요. '맞추다'와 '맞히다'는 뜻이 다르니 문장에서 어떤 뜻인지 먼저 생각해 봐요.",
    hints: ["수수께끼에서 우리가 하는 일이 무엇인지 생각해 보세요. 여러 가지 중에서 답을 알아내는 일이에요.", "물건 두 개를 어긋나지 않게 대어 보는 '맞추다'와 달리, 답을 알아내는 뜻으로 쓰는 낱말은 'ㅎ' 소리가 나요. 그 소리가 들어간 보기를 찾아보세요."],
    explanation: "수수께끼의 답을 알아내는 것은 '맞히다'예요. 그래서 '수수께끼를 맞혀 보세요'라고 써요. '맞추다'는 퍼즐 조각을 맞출 때처럼 서로 어긋나지 않게 대는 뜻이에요.",
  },
  {
    id: "ss-06", type: "agreement-fix", standardCode: SS, grade: 5, category: "spacing", prompt: SPACE_PROMPT,
    tokens: ["나는", "혼자서", "줄넘기를", "할수있어요."], wrongIndex: 3,
    options: ["할 수 있어요.", "할수 있어요.", "할 수있어요."], correctOption: 0,
    principle: "'수'처럼 혼자서는 쓰지 못하고 앞의 꾸며 주는 말과 함께 쓰는 낱말(의존 명사)은 앞말과 띄어 써요. 또 낱말과 낱말은 서로 띄어 써요.",
    hints: ["이 덩어리가 몇 개의 낱말로 이루어져 있는지 세어 보세요. '할', '수', '있어요'가 각각 따로 쓰이는 낱말이에요.", "'수'는 앞에 꾸며 주는 말이 있어야 쓸 수 있는 낱말이에요. 앞말과 뒷말을 각각 어떻게 띄어야 할지 생각해 보세요."],
    explanation: "'할 수 있어요'는 '할', '수', '있어요'가 각각 한 낱말이라서 모두 띄어 써요.",
  },
  {
    id: "ss-07", type: "agreement-fix", standardCode: SS, grade: 5, category: "spacing", prompt: SPACE_PROMPT,
    tokens: ["냉장고에", "먹을것이", "하나도", "없어요."], wrongIndex: 1,
    options: ["먹을 것이", "먹을것 이", "먹을 것 이"], correctOption: 0,
    principle: "'것'은 앞의 꾸며 주는 말과 띄어 쓰는 낱말(의존 명사)이에요. 그리고 '이', '을'처럼 낱말 뒤에 붙는 말은 붙여 써요.",
    hints: ["'먹을'과 '것'은 각각 따로 쓰이는 낱말이에요. 두 낱말 사이는 어떻게 쓸지 생각해 보세요.", "'~이', '~을'처럼 낱말 뒤에 붙어서 도와주는 말은 앞말에 붙여 써요. '것'과 '이'는 어떻게 써야 할까요?"],
    explanation: "'것'은 앞말과 띄어 쓰고, '것' 뒤의 '이'는 앞말에 붙여 써요. 그래서 '먹을 것이'라고 써요.",
  },
  {
    id: "ss-08", type: "agreement-fix", standardCode: SS, grade: 5, category: "spacing", prompt: SPACE_PROMPT,
    tokens: ["우리", "집에는", "강아지가", "두마리", "있어요."], wrongIndex: 3,
    options: ["두 마리", "두마 리", "두 마 리"], correctOption: 0,
    principle: "'마리', '명', '개'처럼 수를 세는 단위를 나타내는 낱말은 수를 나타내는 말과 띄어 써요.",
    hints: ["이 덩어리는 수를 나타내는 말과 수를 세는 단위로 이루어져 있어요. 각각 몇 글자인지 나누어 보세요.", "수를 나타내는 말과 단위를 나타내는 말 사이를 어떻게 써야 할지 생각해 보세요. 한 낱말이 끊기지 않도록 해야 해요."],
    explanation: "수를 세는 단위인 '마리'는 앞의 '두'와 띄어 써서 '두 마리'가 돼요. '마리'는 한 낱말이라 더 나누지 않아요.",
  },
  {
    id: "ss-09", type: "agreement-fix", standardCode: SS, grade: 6, category: "spacing", prompt: SPACE_PROMPT,
    tokens: ["친구들과", "함께", "먹을만큼", "충분히", "샀어요."], wrongIndex: 2,
    options: ["먹을 만큼", "먹을만 큼", "먹 을만큼"], correctOption: 0,
    principle: "'만큼'은 쓰임에 따라 달라요. '너만큼'처럼 사람이나 물건을 가리키는 말 바로 뒤에서는 붙여 쓰고, '볼'처럼 꾸며 주는 말 뒤에서 '정도'를 나타낼 때는 띄어 써요.",
    hints: ["'만큼' 바로 앞에 있는 말이 명사인지, 뒤의 말을 꾸며 주는 말인지 살펴보세요.", "'먹을'은 뒤에 오는 말을 꾸며 주는 말이에요. 이런 말 뒤에서 '만큼'은 어떻게 써야 할지 생각해 보세요."],
    explanation: "'먹을'은 꾸며 주는 말이라서 그 뒤의 '만큼'은 정도를 나타내는 낱말(의존 명사)이에요. 그래서 띄어 써서 '먹을 만큼'이라고 해요.",
  },
  {
    id: "ss-10", type: "agreement-fix", standardCode: SS, grade: 6, category: "spacing", prompt: SPACE_PROMPT,
    tokens: ["어제는", "비가", "와서", "운동을", "안했어요."], wrongIndex: 4,
    options: ["안 했어요.", "안했 어요.", "안 했어 요."], correctOption: 0,
    principle: "'안'은 뒤에 오는 말을 부정하는 꾸며 주는 낱말이에요. 낱말은 서로 띄어 써요.",
    hints: ["이 덩어리에는 '안'과 '했어요'가 들어 있어요. 이 둘이 각각 한 낱말인지 생각해 보세요.", "'안'은 '아니'를 줄인 낱말이에요. 다른 낱말 앞에 놓인 이 말과 뒷말 사이를 어떻게 쓸지 생각해 보세요."],
    explanation: "'안'은 뒤의 말을 부정하는 한 낱말이에요. 그래서 '안 했어요'처럼 띄어 써요.",
  },
];
