import { GRAMMAR_ITEMS } from "./items";
import type { GrammarActivity } from "./types";

const ids = (prefix: string, code: string) =>
  GRAMMAR_ITEMS.filter((i) => i.id.startsWith(prefix) && i.standardCode === code).map((i) => i.id);

export const GRAMMAR_ACTIVITIES: readonly GrammarActivity[] = [
  {
    id: "sentence-structure",
    title: "문장 짜임 블록",
    standardCode: "4국04-03",
    gradeBand: "3-4",
    description: "낱말 블록을 알맞은 순서로 놓아 '누가 무엇을 어찌하다'처럼 짜임이 갖춰진 문장을 만들어요.",
    itemIds: ids("sb-", "4국04-03"),
  },
  {
    id: "honorific",
    title: "높임 표현 바로 쓰기",
    standardCode: "4국04-04",
    gradeBand: "3-4",
    description: "할머니, 선생님처럼 높여야 할 분에게 알맞은 높임 표현을 찾아 문장을 바르게 고쳐요.",
    itemIds: ids("hn-", "4국04-04"),
  },
  {
    id: "agreement",
    title: "문장 호응 클리닉",
    standardCode: "6국04-04",
    gradeBand: "5-6",
    description: "짝이 되는 말(부사어와 서술어, 주어와 서술어, 시간 표현)이 맞지 않는 곳을 찾아 바르게 고쳐요.",
    itemIds: ids("ag-", "6국04-04"),
  },
  {
    id: "word-relations",
    title: "낱말 사이의 관계",
    standardCode: "4국04-01",
    gradeBand: "3-4",
    description: "비슷한말, 반대말, 포함하는 말, 뜻이 여러 개인 낱말을 문장 속에서 살펴보며 낱말 사이의 관계를 알아봐요.",
    itemIds: ids("wr-", "4국04-01"),
  },
  {
    id: "dictionary-form",
    title: "국어사전에서 낱말 찾기",
    standardCode: "4국04-02",
    gradeBand: "3-4",
    description: "모양이 바뀐 낱말의 기본형을 찾고, 국어사전에 낱말이 실린 순서를 알아봐요.",
    itemIds: ids("df-", "4국04-02"),
  },
  {
    id: "time-expression",
    title: "시간 표현 바로 쓰기",
    standardCode: "6국04-05",
    gradeBand: "5-6",
    description: "어제, 내일, 지금처럼 때를 나타내는 말과 끝맺는 말의 때가 맞는지 살펴 바르게 고쳐요.",
    itemIds: ids("te-", "6국04-05"),
  },
  {
    id: "spelling-spacing",
    title: "맞춤법·띄어쓰기 고치기",
    standardCode: "6국04-06",
    gradeBand: "5-6",
    description: "헷갈리기 쉬운 맞춤법과 띄어쓰기를 꼼꼼히 살펴 바르게 고쳐요.",
    itemIds: ids("ss-", "6국04-06"),
  },
];

export function getActivity(id: string): GrammarActivity | undefined {
  return GRAMMAR_ACTIVITIES.find((a) => a.id === id);
}

export function activitiesForGrade(grade: number): GrammarActivity[] {
  const band = grade <= 4 ? "3-4" : "5-6";
  return GRAMMAR_ACTIVITIES.filter((a) => a.gradeBand === band);
}
