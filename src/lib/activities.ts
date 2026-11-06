// 읽기 호스트가 읽기 활동과 매체(미디어 나래) 활동을 한 곳에서 찾도록 하는 조회 함수.
// 매체의 가상 페이지·이야기는 읽기 핵심부에 등록된 지문이고(registerPassages), 문제는 읽기 문제 형식에 검색 형식 하나를 더한 것이다.
import { getActivity as getReadingActivity, getItem as getReadingItem, type ReadingActivity } from "@/core/reading";
import { getMediaActivity, getMediaItem, type MediaItem } from "@/core/media";

/** 활동 id로 읽기 활동 또는 매체 활동을 찾는다. */
export function findActivity(id: string): ReadingActivity | undefined {
  return getReadingActivity(id) ?? getMediaActivity(id);
}

/** 문제 id로 읽기 문제 또는 매체 문제(검색 실험실 포함)를 찾는다. */
export function findItem(id: string): MediaItem | undefined {
  return getReadingItem(id) ?? getMediaItem(id);
}

/** 활동의 문제를 순서대로 */
export function activityItemsOf(activityId: string | null): MediaItem[] {
  const activity = activityId ? findActivity(activityId) : undefined;
  if (!activity) return [];
  return activity.itemIds.map((id) => findItem(id)).filter((x): x is MediaItem => !!x);
}

/** 읽기 화면을 쓰는 과제 종류인가 */
export const isReadingHostKind = (kind: string): kind is "reading" | "media" => kind === "reading" || kind === "media";
