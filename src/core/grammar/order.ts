// 문장 만들기 블록 순서 분류(규칙은 여기 한 곳에만 둔다).
//  - wrong: 끝맺는 말(predicate)이 마지막이 아니거나, degree/modifier 블록이 끝맺는 말 바로 앞이 아님
//  - awkward: 뜻은 통하지만 어색함. manner 블록이 subject보다 앞이거나,
//             subject 앞 블록들이 "모두 time-place"도 아니고 "딱 한 개"도 아님
//  - natural: 그 밖의 모든 순서

import type { SentenceBuildItem } from "./types";

export type OrderClass = "natural" | "awkward" | "wrong";

export function classifyOrder(item: SentenceBuildItem, order: string[]): OrderClass {
  const role = new Map(item.blocks.map((b) => [b.id, b.role]));
  const pred = order[order.length - 1];
  if (role.get(pred) !== "predicate") return "wrong";
  for (let i = 0; i < order.length; i++) {
    const r = role.get(order[i]);
    if ((r === "degree" || r === "modifier") && order[i + 1] !== pred) return "wrong";
  }
  const subjectAt = order.findIndex((id) => role.get(id) === "subject");
  const before = subjectAt < 0 ? [] : order.slice(0, subjectAt);
  if (before.some((id) => role.get(id) === "manner")) return "awkward";
  if (before.every((id) => role.get(id) === "time-place") || before.length === 1) return "natural";
  return "awkward";
}
