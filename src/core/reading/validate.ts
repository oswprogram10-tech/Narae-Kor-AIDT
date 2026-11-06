// 읽기 지문·문제 은행 검증: 지문과 문제를 추가·수정할 때 실수를 잡아 준다.

import { getStandard } from "@/core/data/standards";
import { allSentences, getPassage } from "./passages";
import type { Passage, ReadingItem } from "./types";

const stripEnd = (s: string) => s.replace(/[.?!,]+$/u, "");

/** 지문 구조 검사: 문단 id·문장 id가 겹치지 않고, 문단마다 문장이 둘 이상. */
export function validatePassage(passage: Passage): string[] {
  const p: string[] = [];
  if (!passage.id.trim()) p.push("지문 id가 비었어요");
  if (!passage.title.trim()) p.push("제목이 비었어요");
  const pids = passage.paragraphs.map((x) => x.id);
  if (new Set(pids).size !== pids.length) p.push("문단 id가 겹쳐요");
  const sids = passage.paragraphs.flatMap((x) => x.sentences.map((s) => s.id));
  if (new Set(sids).size !== sids.length) p.push("문장 id가 겹쳐요");
  for (const para of passage.paragraphs) {
    if (para.sentences.length < 2) p.push(`${para.id}에 문장이 둘보다 적어요`);
    for (const s of para.sentences) if (!s.text.trim()) p.push(`${s.id}의 글이 비었어요`);
  }
  return p;
}

/** 학생에게 보이는 글이 해요체인지(문장마다 '요'로 끝나는지). 따옴표 안의 글은 건너뛴다. */
export function haeyoProblems(text: string): string[] {
  const body = text.replace(/'[^']*'/g, "").replace(/"[^"]*"/g, "").trim();
  const parts = body.split(/(?<=[.?!])\s+/u).filter((x) => x.trim().length > 0);
  return parts.filter((x) => !/요[.?!]$/u.test(x.trim())).map((x) => `해요체가 아니에요: ${x}`);
}

export function validateItem(item: ReadingItem, passage: Passage | undefined = getPassage(item.passageId)): string[] {
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
  for (const [k, v] of [["prompt", item.prompt], ["principle", item.principle], ["hints[0]", item.hints[0]], ["hints[1]", item.hints[1]], ["explanation", item.explanation]] as const) {
    p.push(...haeyoProblems(v).map((m) => `${k}: ${m}`));
  }
  if (!passage) {
    p.push(`지문 ${item.passageId}이(가) 없어요`);
    return p;
  }
  if (passage.gradeBand === "3-4" ? item.grade > 4 : item.grade < 5) p.push("학년이 지문의 학년군과 맞지 않아요");

  const sentences = new Map(allSentences(passage).map((s) => [s.id, s]));
  const paragraphIds = new Set(passage.paragraphs.map((x) => x.id));
  const guarded: [string, string][] = [
    ["prompt", item.prompt],
    ["principle", item.principle],
    ["hints[0]", item.hints[0]],
    ["hints[1]", item.hints[1]],
  ];
  /** 안내 문구에 정답 글이 그대로 들어 있는지 */
  const leaks = (secret: string, label: string) => {
    const candidates = [secret, stripEnd(secret)].filter((s) => s.length > 0);
    for (const [name, text] of guarded) {
      if (candidates.some((s) => text.includes(s))) p.push(`${name}에 ${label}이(가) 그대로 들어 있어요`);
    }
  };
  const checkOptions = (options: string[], correct: number) => {
    if (options.length < 3 || options.length > 4) p.push(`보기는 3~4개여야 해요(${options.length}개)`);
    if (new Set(options).size !== options.length) p.push("보기가 겹쳐요");
    if (options.some((o) => !o.trim())) p.push("빈 보기가 있어요");
    const text = options[correct];
    if (!Number.isInteger(correct) || text === undefined) p.push("correctOption이 범위를 벗어나요");
    else leaks(text, "정답 보기");
  };

  switch (item.type) {
    case "sentence-pick": {
      const scope = item.paragraphId === undefined ? undefined : passage.paragraphs.find((x) => x.id === item.paragraphId);
      if (item.paragraphId !== undefined && !scope) p.push(`문단 ${item.paragraphId}이(가) 지문에 없어요`);
      const pool = scope ? scope.sentences : allSentences(passage);
      if (item.correctSentenceIds.length === 0) p.push("정답 문장이 하나도 없어요");
      if (new Set(item.correctSentenceIds).size !== item.correctSentenceIds.length) p.push("정답 문장 id가 겹쳐요");
      for (const id of item.correctSentenceIds) {
        if (!pool.some((s) => s.id === id)) p.push(`정답 문장 ${id}이(가) ${scope ? "그 문단" : "지문"}에 없어요`);
        const s = sentences.get(id);
        if (s) leaks(s.text, `정답 문장(${id})`);
      }
      if (item.correctSentenceIds.length >= pool.length) p.push("모든 문장이 정답이에요");
      break;
    }
    case "label-sentences": {
      if (item.sentenceIds.length < 2 || item.sentenceIds.length > 4) p.push(`문장은 2~4개여야 해요(${item.sentenceIds.length}개)`);
      if (new Set(item.sentenceIds).size !== item.sentenceIds.length) p.push("문장 id가 겹쳐요");
      if (item.labels.length < 2 || item.labels.length > 3) p.push(`꼬리표는 2~3개여야 해요(${item.labels.length}개)`);
      if (new Set(item.labels).size !== item.labels.length) p.push("꼬리표가 겹쳐요");
      for (const id of item.sentenceIds) {
        const s = sentences.get(id);
        if (!s) p.push(`문장 ${id}이(가) 지문에 없어요`);
        else leaks(s.text, `문장(${id})`);
        const label = item.answers[id];
        if (label === undefined) p.push(`문장 ${id}의 정답 꼬리표가 없어요`);
        else if (!item.labels.includes(label)) p.push(`문장 ${id}의 정답 꼬리표(${label})가 꼬리표 목록에 없어요`);
      }
      for (const id of Object.keys(item.answers)) if (!item.sentenceIds.includes(id)) p.push(`answers에 목록에 없는 문장 ${id}이(가) 있어요`);
      if (new Set(item.sentenceIds.map((id) => item.answers[id])).size < 2) p.push("정답 꼬리표가 모두 같아요");
      break;
    }
    case "slot-paragraphs": {
      const slotIds = item.slots.map((s) => s.id);
      if (item.slots.length < 2 || item.slots.length > 4) p.push(`칸은 2~4개여야 해요(${item.slots.length}개)`);
      if (new Set(slotIds).size !== slotIds.length) p.push("칸 id가 겹쳐요");
      if (new Set(item.slots.map((s) => s.label)).size !== item.slots.length) p.push("칸 이름이 겹쳐요");
      if (new Set(item.paragraphIds).size !== item.paragraphIds.length) p.push("문단 id가 겹쳐요");
      for (const id of item.paragraphIds) if (!paragraphIds.has(id)) p.push(`문단 ${id}이(가) 지문에 없어요`);
      const placed: string[] = [];
      for (const slot of item.slots) {
        if (!slot.label.trim()) p.push(`칸 ${slot.id}의 이름이 비었어요`);
        if (slot.paragraphIds.length === 0) p.push(`칸 ${slot.id}에 들어갈 문단이 없어요`);
        placed.push(...slot.paragraphIds);
      }
      if (new Set(placed).size !== placed.length) p.push("한 문단이 두 칸 이상에 들어 있어요");
      if (placed.length !== item.paragraphIds.length || !item.paragraphIds.every((id) => placed.includes(id))) {
        p.push("칸에 놓는 문단 전체가 칸의 정답과 맞지 않아요");
      }
      break;
    }
    case "choice":
      checkOptions(item.options, item.correctOption);
      break;
    case "choice-with-evidence": {
      checkOptions(item.options, item.correctOption);
      if (item.evidenceIds.length === 0) p.push("근거 문장이 하나도 없어요");
      if (new Set(item.evidenceIds).size !== item.evidenceIds.length) p.push("근거 문장 id가 겹쳐요");
      if (item.evidenceIds.length >= sentences.size) p.push("모든 문장이 근거예요");
      for (const id of item.evidenceIds) {
        const s = sentences.get(id);
        if (!s) p.push(`근거 문장 ${id}이(가) 지문에 없어요`);
        else leaks(s.text, `근거 문장(${id})`);
      }
      break;
    }
  }
  return p;
}
