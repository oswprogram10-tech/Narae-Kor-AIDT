// 문학 나래 자료 검증: 읽기 검증에 더해 실제 이름 검사, 시·이야기 구조, 새 문제 형식의 구조를 확인한다.

import { getStandard } from "@/core/data/standards";
import { realNameProblems } from "@/core/media";
import { getPassage, haeyoProblems, validateItem, validatePassage, type Passage } from "@/core/reading";
import type { LiteratureItem, MoodScaleItem, SequenceItem } from "./types";

const stripEnd = (s: string) => s.replace(/[.?!,]+$/u, "");

/** 지문 검사: 읽기 지문 검사 + 갈래별 구조(시: 연 3~4개·연마다 3~4행, 동화: 문단 5~8개) + 실제 이름 검사 */
export function validateLiteraturePassage(passage: Passage): string[] {
  const p = validatePassage(passage);
  if (passage.genre === "시") {
    if (passage.paragraphs.length < 3 || passage.paragraphs.length > 4) p.push(`시의 연은 3~4개여야 해요(${passage.paragraphs.length}개)`);
    for (const para of passage.paragraphs) {
      if (para.sentences.length < 3 || para.sentences.length > 4) p.push(`${para.id}의 행은 3~4개여야 해요(${para.sentences.length}개)`);
    }
  } else if (passage.genre === "동화" || passage.genre === "이야기") {
    if (passage.paragraphs.length < 5 || passage.paragraphs.length > 8) p.push(`이야기의 문단은 5~8개여야 해요(${passage.paragraphs.length}개)`);
  } else {
    p.push(`문학 지문의 갈래가 아니에요: ${passage.genre}`);
  }
  for (const t of [passage.title, ...passage.paragraphs.flatMap((x) => x.sentences.map((s) => s.text))]) {
    p.push(...realNameProblems(t).map((m) => `${passage.id}: ${m}`));
  }
  return p;
}

function visibleTexts(item: LiteratureItem): [string, string][] {
  const out: [string, string][] = [
    ["prompt", item.prompt], ["principle", item.principle], ["hints[0]", item.hints[0]], ["hints[1]", item.hints[1]], ["explanation", item.explanation],
  ];
  if (item.type === "choice" || item.type === "choice-with-evidence") item.options.forEach((o, i) => out.push([`options[${i}]`, o]));
  if (item.type === "label-sentences") item.labels.forEach((o, i) => out.push([`labels[${i}]`, o]));
  if (item.type === "mood-scale") {
    out.push(["character", item.character]);
    item.feelingOptions.forEach((o, i) => out.push([`feelingOptions[${i}]`, o]));
  }
  if (item.type === "sequence") item.events.forEach((e, i) => out.push([`events[${i}]`, e.text]));
  return out;
}

/** 새 형식 공통 검사: 필드, 해요체, 지문, 학년군 */
function validateCommon(item: LiteratureItem, passage: Passage | undefined): string[] {
  const p: string[] = [];
  if (!item.id.trim()) p.push("id가 비었어요");
  const std = getStandard(item.standardCode);
  if (!std) p.push(`성취기준 ${item.standardCode}이(가) 없어요`);
  else if (std.gradeBand === "3-4" ? item.grade > 4 : item.grade < 5) p.push("학년이 성취기준의 학년군과 맞지 않아요");
  for (const [k, v] of [["prompt", item.prompt], ["principle", item.principle], ["explanation", item.explanation]] as const) {
    if (!v.trim()) p.push(`${k}이(가) 비었어요`);
    p.push(...haeyoProblems(v).map((m) => `${k}: ${m}`));
  }
  item.hints.forEach((h, i) => {
    if (!h.trim()) p.push(`hints[${i}]이(가) 비었어요`);
    if (h === item.explanation) p.push(`hints[${i}]이(가) explanation과 같아요`);
    p.push(...haeyoProblems(h).map((m) => `hints[${i}]: ${m}`));
  });
  if (item.hints[0] === item.hints[1]) p.push("두 힌트가 같아요");
  if (!passage) p.push(`지문 ${item.passageId}이(가) 없어요`);
  else if (passage.gradeBand === "3-4" ? item.grade > 4 : item.grade < 5) p.push(`학년이 지문 ${passage.id}의 학년군과 맞지 않아요`);
  return p;
}

function validateMood(item: MoodScaleItem, passage: Passage | undefined): string[] {
  const p = validateCommon(item, passage);
  if (!item.character.trim()) p.push("character가 비었어요");
  if (![item.minOk, item.maxOk].every((n) => Number.isInteger(n) && n >= 1 && n <= 5)) p.push("minOk·maxOk는 1~5의 정수여야 해요");
  else {
    if (item.minOk > item.maxOk) p.push("minOk가 maxOk보다 커요");
    if (item.maxOk - item.minOk > 2) p.push("인정 범위가 너무 넓어요(폭 2 이하)");
  }
  const o = item.feelingOptions;
  if (o.length < 3 || o.length > 4) p.push(`마음 낱말 보기는 3~4개여야 해요(${o.length}개)`);
  if (new Set(o).size !== o.length) p.push("마음 낱말 보기가 겹쳐요");
  if (o.some((x) => !x.trim())) p.push("빈 보기가 있어요");
  if (!Number.isInteger(item.correctFeeling) || o[item.correctFeeling] === undefined) p.push("correctFeeling이 범위를 벗어나요");
  if (!passage) return p;
  const scene = passage.paragraphs.find((x) => x.id === item.sceneParagraphId);
  if (!scene) {
    p.push(`장면 문단 ${item.sceneParagraphId}이(가) 지문에 없어요`);
    return p;
  }
  if (item.evidenceIds.length === 0) p.push("근거 문장이 하나도 없어요");
  if (new Set(item.evidenceIds).size !== item.evidenceIds.length) p.push("근거 문장 id가 겹쳐요");
  if (item.evidenceIds.length >= scene.sentences.length) p.push("장면의 모든 문장이 근거예요");
  for (const id of item.evidenceIds) if (!scene.sentences.some((s) => s.id === id)) p.push(`근거 문장 ${id}이(가) 장면 문단에 없어요`);
  // 안내 문구에 정답(마음 낱말, 근거 문장)이 그대로 들어 있으면 안 된다.
  const secrets: [string, string][] = [];
  if (o[item.correctFeeling] !== undefined) secrets.push(["정답 마음 낱말", o[item.correctFeeling]]);
  for (const id of item.evidenceIds) {
    const s = scene.sentences.find((x) => x.id === id);
    if (s) secrets.push([`근거 문장(${id})`, s.text]);
  }
  const guarded: [string, string][] = [["prompt", item.prompt], ["principle", item.principle], ["hints[0]", item.hints[0]], ["hints[1]", item.hints[1]]];
  for (const [name, text] of guarded) for (const [label, secret] of secrets) if (text.includes(stripEnd(secret))) p.push(`${name}에 ${label}이(가) 그대로 들어 있어요`);
  return p;
}

function validateSequence(item: SequenceItem, passage: Passage | undefined): string[] {
  const p = validateCommon(item, passage);
  const ev = item.events;
  if (ev.length < 3 || ev.length > 5) p.push(`사건 카드는 3~5장이어야 해요(${ev.length}장)`);
  const ids = ev.map((e) => e.id);
  if (new Set(ids).size !== ids.length) p.push("사건 id가 겹쳐요");
  if (new Set(ev.map((e) => e.text)).size !== ev.length) p.push("사건 글이 겹쳐요");
  for (const e of ev) {
    if (!e.id.trim() || !e.text.trim()) p.push(`사건 ${e.id}에 빈 칸이 있어요`);
    p.push(...haeyoProblems(e.text).map((m) => `사건 ${e.id}: ${m}`));
  }
  if (item.correctOrder.length !== ev.length || new Set(item.correctOrder).size !== ev.length || !item.correctOrder.every((id) => ids.includes(id))) {
    p.push("correctOrder가 사건 카드 전체를 한 번씩 담고 있지 않아요");
  }
  const guarded: [string, string][] = [["prompt", item.prompt], ["principle", item.principle], ["hints[0]", item.hints[0]], ["hints[1]", item.hints[1]]];
  for (const [name, text] of guarded) for (const e of ev) if (text.includes(stripEnd(e.text))) p.push(`${name}에 사건 ${e.id}의 글이 그대로 들어 있어요`);
  return p;
}

export function validateLiteratureItem(item: LiteratureItem): string[] {
  const passage = getPassage(item.passageId);
  let p: string[];
  if (item.type === "mood-scale") p = validateMood(item, passage);
  else if (item.type === "sequence") p = validateSequence(item, passage);
  else if (item.type === "own-line") p = validateCommon(item, passage);
  else {
    p = validateItem(item, passage);
    const std = getStandard(item.standardCode);
    if (std && (std.gradeBand === "3-4" ? item.grade > 4 : item.grade < 5)) p.push("학년이 성취기준의 학년군과 맞지 않아요");
  }
  for (const [name, text] of visibleTexts(item)) p.push(...realNameProblems(text).map((m) => `${name}: ${m}`));
  return p;
}
