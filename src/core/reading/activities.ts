import { READING_ITEMS } from "./items";
import type { ReadingActivity } from "./types";

const ids = (prefix: string, code: string) =>
  READING_ITEMS.filter((i) => i.id.startsWith(prefix) && i.standardCode === code).map((i) => i.id);

export const READING_ACTIVITIES: readonly ReadingActivity[] = [
  {
    id: "main-idea",
    title: "문단의 중심 생각 찾기",
    standardCode: "4국02-02",
    gradeBand: "3-4",
    description: "설명하는 글을 읽고 문단마다 중심 문장을 찾은 뒤, 글 전체를 가장 잘 간추린 글을 골라요.",
    passageIds: ["mi-cat", "mi-signal"],
    itemIds: ids("ma-", "4국02-02"),
  },
  {
    id: "fact-opinion",
    title: "사실과 의견 구분하기",
    standardCode: "4국02-04",
    gradeBand: "3-4",
    description: "의견이 담긴 글을 읽고 문장마다 사실인지 의견인지 가려내고, 글쓴이의 의견을 찾아요.",
    passageIds: ["fo-library", "fo-hallway"],
    itemIds: ids("fo-", "4국02-04"),
  },
  {
    id: "text-structure",
    title: "글의 짜임 파악하기",
    standardCode: "6국02-01",
    gradeBand: "5-6",
    description: "논설문과 설명하는 글에서 문단이 하는 일을 살펴 짜임 칸에 놓고, 글의 주제와 주장을 찾아요.",
    passageIds: ["ts-lunch", "ts-neck"],
    itemIds: ids("ts-", "6국02-01"),
  },
  {
    id: "inference",
    title: "문맥으로 추론하기",
    standardCode: "6국02-02",
    gradeBand: "5-6",
    description: "이야기와 설명하는 글에서 낱말의 뜻과 생략된 내용을 짐작하고, 그렇게 생각한 문장을 찾아요.",
    passageIds: ["in-umbrella", "in-mudflat"],
    itemIds: ids("in-", "6국02-02"),
  },
];

export function getActivity(id: string): ReadingActivity | undefined {
  return READING_ACTIVITIES.find((a) => a.id === id);
}

export function activitiesForGrade(grade: number): ReadingActivity[] {
  const band = grade <= 4 ? "3-4" : "5-6";
  return READING_ACTIVITIES.filter((a) => a.gradeBand === band);
}
