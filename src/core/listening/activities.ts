import type { ReadingActivity } from "@/core/reading";
import { LISTENING_ITEMS } from "./items";

const ids = (prefix: string) => LISTENING_ITEMS.filter((i) => i.id.startsWith(prefix)).map((i) => i.id);

export type ListeningActivity = ReadingActivity;

export const LISTENING_ACTIVITIES: readonly ListeningActivity[] = [
  {
    id: "listen-main",
    title: "중요한 내용 듣고 간추리기",
    standardCode: "4국01-01",
    gradeBand: "3-4",
    description: "친구의 발표를 들으며 주제와 중요한 내용을 찾고, 들은 내용을 알맞게 간추려 봐요.",
    passageIds: ["ls-main-worm", "ls-main-water"],
    itemIds: ids("lm-"),
  },
  {
    id: "polite-talk",
    title: "상대를 생각하며 대화하기",
    standardCode: "4국01-04",
    gradeBand: "3-4",
    description: "친구들의 대화를 들으며 상대의 마음과 입장을 헤아리고, 예의를 지켜 말하는 방법과 알맞지 않은 말을 찾아봐요.",
    passageIds: ["ls-polite-poster", "ls-polite-book"],
    itemIds: ids("pt-"),
  },
  {
    id: "listen-infer",
    title: "생략된 내용 추론하며 듣기",
    standardCode: "6국01-01",
    gradeBand: "5-6",
    description: "대화를 들으며 말하지 않은 내용과 까닭을 대화 속 말을 근거로 짐작해 봐요.",
    passageIds: ["ls-infer-umbrella", "ls-infer-race"],
    itemIds: ids("li-"),
  },
  {
    id: "argument-check",
    title: "근거가 타당한지 따지며 듣기",
    standardCode: "6국01-02",
    gradeBand: "5-6",
    description: "연설을 들으며 주장을 찾고, 근거마다 타당한지 따져 보고, 타당하지 않은 까닭을 말해 봐요.",
    passageIds: ["ls-arg-reading", "ls-arg-food"],
    itemIds: ids("ac-"),
  },
];

export function getListeningActivity(id: string): ListeningActivity | undefined {
  return LISTENING_ACTIVITIES.find((a) => a.id === id);
}

export function listeningActivitiesForGrade(grade: number): ListeningActivity[] {
  const band = grade <= 4 ? "3-4" : "5-6";
  return LISTENING_ACTIVITIES.filter((a) => a.gradeBand === band);
}
