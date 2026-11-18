import { LITERATURE_ITEMS } from "./items";
import type { LiteratureActivity } from "./types";

const ids = (prefix: string) => LITERATURE_ITEMS.filter((i) => i.id.startsWith(prefix)).map((i) => i.id);

export const LITERATURE_ACTIVITIES: readonly LiteratureActivity[] = [
  {
    id: "mood-thermometer",
    title: "마음 온도계로 이야기 따라가기",
    standardCode: "4국05-01",
    gradeBand: "3-4",
    description: "동화를 읽으며 장면마다 인물의 마음 온도와 마음 낱말을 고르고 근거 문장을 찾아요. 마지막에는 마음이 바뀐 흐름을 그래프로 봐요.",
    passageIds: ["lt-stage"],
    itemIds: ids("mt-"),
  },
  {
    id: "sensory",
    title: "감각적 표현 찾기",
    standardCode: "4국05-04",
    gradeBand: "3-4",
    description: "시의 행을 보는·듣는·맛보는·냄새 맡는·만지는 느낌으로 나누어 보고, 내가 느낀 것을 감각 낱말로 한 줄 써요.",
    passageIds: ["lt-rain-market"],
    itemIds: ids("sn-"),
  },
  {
    id: "character-map",
    title: "인물 관계도",
    standardCode: "6국05-03",
    gradeBand: "5-6",
    description: "이야기를 읽고 인물 사이의 관계와 성격, 배경, 사건의 차례를 근거를 찾으며 파악해요.",
    passageIds: ["lt-kite"],
    itemIds: ids("cm-"),
  },
  {
    id: "figurative",
    title: "비유적 표현의 효과",
    standardCode: "6국05-02",
    gradeBand: "5-6",
    description: "시에서 직유와 은유를 찾고, 무엇을 무엇에 빗댔는지와 그 비유가 주는 효과를 근거와 함께 골라요.",
    passageIds: ["lt-grandma-hand"],
    itemIds: ids("fg-"),
  },
];

export function getLiteratureActivity(id: string): LiteratureActivity | undefined {
  return LITERATURE_ACTIVITIES.find((a) => a.id === id);
}

export function literatureActivitiesForGrade(grade: number): LiteratureActivity[] {
  const band = grade <= 4 ? "3-4" : "5-6";
  return LITERATURE_ACTIVITIES.filter((a) => a.gradeBand === band);
}
