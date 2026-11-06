import { MEDIA_ITEMS } from "./items";
import type { MediaActivity } from "./types";

const ids = (prefix: string) => MEDIA_ITEMS.filter((i) => i.id.startsWith(prefix)).map((i) => i.id);

export const MEDIA_ACTIVITIES: readonly MediaActivity[] = [
  {
    id: "source-detective",
    family: "source-detective",
    title: "출처 탐정단",
    standardCode: "4국02-05",
    gradeBand: "3-4",
    description: "같은 질문을 다룬 연습용 가상 페이지 세 개를 비교해, 믿을 만한 단서와 의심스러운 단서를 찾고 숙제 자료로 알맞은 페이지를 골라요.",
    passageIds: ["sd-frog-a", "sd-frog-b", "sd-frog-c", "sd-leaf-a", "sd-leaf-b", "sd-leaf-c"],
    itemIds: ids("sd-"),
  },
  {
    id: "search-lab-34",
    family: "search-lab",
    title: "검색 실험실",
    standardCode: "4국06-01",
    gradeBand: "3-4",
    description: "알고 싶은 것에 맞는 검색어를 고르고, 연습용 가상 검색 결과에서 가장 알맞은 결과를 찾아요.",
    passageIds: [],
    itemIds: ["sl-01", "sl-02", "sl-03"],
  },
  {
    id: "search-lab-56",
    family: "search-lab",
    title: "검색 실험실",
    standardCode: "6국06-01",
    gradeBand: "5-6",
    description: "비교하기, 최신 정보 찾기, 광고 가려내기처럼 까다로운 목적에 맞는 검색어와 믿을 만한 결과를 연습용 가상 검색 결과에서 찾아요.",
    passageIds: [],
    itemIds: ["sl-04", "sl-05", "sl-06"],
  },
  {
    id: "fact-check",
    family: "fact-check",
    title: "뉴스·광고 팩트체크",
    standardCode: "6국06-02",
    gradeBand: "5-6",
    description: "연습용 가상 기사와 광고의 문장을 사실, 과장·광고 표현, 근거 없는 주장으로 가르고 공식 자료 카드와 맞춰 봐요.",
    passageIds: ["fc-news-a", "fc-card-a", "fc-news-b", "fc-ad-a"],
    itemIds: ids("fc-"),
  },
  {
    id: "media-ethics",
    family: "media-ethics",
    title: "매체 소통 예절",
    standardCode: "4국06-03",
    gradeBand: "3-4",
    description: "그림 가져다 쓰기, 친구 사진 올리기, 댓글, 소문 전달, 출처 밝히기 같은 상황에서 알맞은 행동을 골라요.",
    passageIds: ["me-pic", "me-photo", "me-comment", "me-rumor", "me-source", "me-secret"],
    itemIds: ids("me-"),
  },
];

export function getMediaActivity(id: string): MediaActivity | undefined {
  return MEDIA_ACTIVITIES.find((a) => a.id === id);
}

export function mediaActivitiesForGrade(grade: number): MediaActivity[] {
  const band = grade <= 4 ? "3-4" : "5-6";
  return MEDIA_ACTIVITIES.filter((a) => a.gradeBand === band);
}
