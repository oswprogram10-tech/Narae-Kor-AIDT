// 읽기 호스트가 읽기·매체(미디어 나래)·문학(상상·울림 나래) 활동을 한 곳에서 찾도록 하는 조회 함수.
// 매체·문학의 가상 페이지·이야기·시는 읽기 핵심부에 등록된 지문이고(registerPassages),
// 문제는 읽기 문제 형식에 검색 형식(매체) 또는 마음 온도·순서 놓기·내 한 줄 형식(문학)을 더한 것이다.
import { getActivity as getReadingActivity, getItem as getReadingItem, type ReadingActivity } from "@/core/reading";
import { getMediaActivity, getMediaItem, type MediaItem } from "@/core/media";
import { getLiteratureActivity, getLiteratureItem, type LiteratureItem } from "@/core/literature";

/** 읽기 화면이 다루는 모든 문제 형식 */
export type HostItem = MediaItem | LiteratureItem;

/** 활동 id로 읽기·매체·문학 활동을 찾는다. */
export function findActivity(id: string): ReadingActivity | undefined {
  return getReadingActivity(id) ?? getMediaActivity(id) ?? getLiteratureActivity(id);
}

/** 문제 id로 읽기·매체·문학 문제를 찾는다. */
export function findItem(id: string): HostItem | undefined {
  return getReadingItem(id) ?? getMediaItem(id) ?? getLiteratureItem(id);
}

/** 문학 은행의 문제인가(문학 채점·안내를 쓴다) */
export function isLiteratureItem(item: HostItem): item is LiteratureItem {
  return getLiteratureItem(item.id) !== undefined;
}

/** 활동의 문제를 순서대로 */
export function activityItemsOf(activityId: string | null): HostItem[] {
  const activity = activityId ? findActivity(activityId) : undefined;
  if (!activity) return [];
  return activity.itemIds.map((id) => findItem(id)).filter((x): x is HostItem => !!x);
}

/** 읽기 화면을 쓰는 과제 종류인가 */
export const isReadingHostKind = (kind: string): kind is "reading" | "media" | "literature" =>
  kind === "reading" || kind === "media" || kind === "literature";
