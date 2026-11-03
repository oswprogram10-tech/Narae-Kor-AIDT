// 문제 은행 검증: 문제를 추가·수정할 때 실수를 잡아 준다.

import { getStandard } from "@/core/data/standards";
import type { GrammarItem } from "./types";

const stripEnd = (s: string) => s.replace(/[.?!,]+$/u, "");

export function validateItem(item: GrammarItem): string[] {
  const p: string[] = [];
  if (!item.id.trim()) p.push("id가 비었어요");
  if (!getStandard(item.standardCode)) p.push(`성취기준 ${item.standardCode}이(가) 없어요`);
  for (const [k, v] of [["prompt", item.prompt], ["principle", item.principle], ["explanation", item.explanation]] as const) {
    if (!v.trim()) p.push(`${k}이(가) 비었어요`);
  }
  item.hints.forEach((h, i) => {
    if (!h.trim()) p.push(`hints[${i}]이(가) 비었어요`);
    if (h === item.explanation) p.push(`hints[${i}]이(가) explanation과 같아요`);
  });
  if (item.hints[0] === item.hints[1]) p.push("두 힌트가 같아요");

  if (item.type === "sentence-build") {
    const n = item.blocks.length;
    if (n < 3 || n > 5) p.push(`블록은 3~5개여야 해요(${n}개)`);
    const ids = item.blocks.map((b) => b.id);
    if (new Set(ids).size !== ids.length) p.push("블록 id가 겹쳐요");
    item.blocks.forEach((b) => {
      if (!b.text.trim()) p.push(`블록 ${b.id}의 글이 비었어요`);
    });
    if (item.answers.length === 0) p.push("정답이 하나도 없어요");
    const seen = new Set<string>();
    for (const a of item.answers) {
      const used = new Set(a);
      if (a.length !== n || used.size !== n || !ids.every((id) => used.has(id))) {
        p.push(`정답 [${a.join(",")}]이(가) 모든 블록을 한 번씩 쓰지 않아요`);
      }
      const key = a.join(",");
      if (seen.has(key)) p.push(`정답 [${key}]이(가) 겹쳐요`);
      seen.add(key);
    }
    if (seen.has(ids.join(","))) p.push("처음 주어진 블록 순서가 이미 정답이에요");
    const soft = new Set<string>();
    for (const a of item.awkward) {
      const used = new Set(a);
      if (a.length !== n || used.size !== n || !ids.every((id) => used.has(id))) {
        p.push(`어색한 순서 [${a.join(",")}]이(가) 모든 블록을 한 번씩 쓰지 않아요`);
      }
      const key = a.join(",");
      if (soft.has(key)) p.push(`어색한 순서 [${key}]이(가) 겹쳐요`);
      if (seen.has(key)) p.push(`순서 [${key}]이(가) 정답과 어색한 순서에 모두 있어요`);
      soft.add(key);
    }
  } else {
    const { tokens, options } = item;
    if (tokens.length < 2) p.push("어절이 너무 적어요");
    if (!Number.isInteger(item.wrongIndex) || item.wrongIndex < 0 || item.wrongIndex >= tokens.length) {
      p.push("wrongIndex가 범위를 벗어나요");
    }
    if (options.length < 3 || options.length > 4) p.push(`보기는 3~4개여야 해요(${options.length}개)`);
    if (new Set(options).size !== options.length) p.push("보기가 겹쳐요");
    if (options.some((o) => !o.trim())) p.push("빈 보기가 있어요");
    const correct = options[item.correctOption];
    if (!Number.isInteger(item.correctOption) || correct === undefined) {
      p.push("correctOption이 범위를 벗어나요");
    } else {
      if (correct === tokens[item.wrongIndex]) p.push("정답 보기가 틀린 어절과 같아요");
      const leaks = [correct, stripEnd(correct)].filter((s) => s.length > 0);
      const fields: [string, string][] = [
        ["prompt", item.prompt],
        ["principle", item.principle],
        ["hints[0]", item.hints[0]],
        ["hints[1]", item.hints[1]],
      ];
      for (const [name, text] of fields) {
        if (leaks.some((s) => text.includes(s))) p.push(`${name}에 정답 보기(${correct})가 그대로 들어 있어요`);
      }
    }
  }
  return p;
}
