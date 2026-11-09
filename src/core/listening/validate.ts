// 듣기 나래 자료 검증: 읽기 검증에 더해 갈래·말한 사람·id 규칙·실제 이름·성취기준을 확인한다.

import { getStandard } from "@/core/data/standards";
import { realNameProblems } from "@/core/media";
import { getPassage, validateItem, validatePassage, type Passage } from "@/core/reading";
import type { LISTENING_ITEMS } from "./items";

type ListeningItem = (typeof LISTENING_ITEMS)[number];

const LISTENING_GENRES = ["대화", "발표", "연설"];
/** 한 문장의 글자 수 한도(들어서 이해하려면 짧아야 한다) */
const MAX_SENTENCE_CHARS = 60;

export function validateListeningPassage(passage: Passage): string[] {
  const p = validatePassage(passage);
  if (!passage.id.startsWith("ls-")) p.push("듣기 지문의 id는 'ls-'로 시작해야 해요");
  if (!LISTENING_GENRES.includes(passage.genre)) p.push(`듣기 지문의 갈래가 아니에요: ${passage.genre}`);
  const n = passage.paragraphs.length;
  if (passage.genre === "대화") {
    const [lo, hi] = passage.gradeBand === "3-4" ? [6, 10] : [8, 14];
    if (n < lo || n > hi) p.push(`대화의 말차례는 ${lo}~${hi}개여야 해요(${n}개)`);
    const speakers = new Set(passage.paragraphs.map((x) => x.speaker));
    if (speakers.size < 2 || speakers.size > 3) p.push(`대화에서 말한 사람은 2~3명이어야 해요(${speakers.size}명)`);
  } else if (passage.genre === "발표" || passage.genre === "연설") {
    if (n < 4 || n > 7) p.push(`${passage.genre}의 말차례는 4~7개여야 해요(${n}개)`);
    if (new Set(passage.paragraphs.map((x) => x.speaker)).size !== 1) p.push(`${passage.genre}은 말한 사람이 한 명이어야 해요`);
  }
  passage.paragraphs.forEach((para, i) => {
    if (para.id !== `p${i + 1}`) p.push(`문단 id가 p${i + 1}이(가) 아니에요: ${para.id}`);
    if (!para.speaker || !para.speaker.trim()) p.push(`${para.id}에 말한 사람(speaker)이 없어요`);
    para.sentences.forEach((s, j) => {
      if (s.id !== `s${i + 1}-${j + 1}`) p.push(`문장 id가 s${i + 1}-${j + 1}이(가) 아니에요: ${s.id}`);
      if (s.text.length > MAX_SENTENCE_CHARS) p.push(`${s.id}이(가) 너무 길어요(${s.text.length}자)`);
    });
  });
  const texts = [passage.title, ...passage.paragraphs.flatMap((x) => [x.speaker ?? "", ...x.sentences.map((s) => s.text)])];
  for (const t of texts) p.push(...realNameProblems(t).map((m) => `${passage.id}: ${m}`));
  return p;
}

export function validateListeningItem(item: ListeningItem): string[] {
  const p = validateItem(item, getPassage(item.passageId));
  const std = getStandard(item.standardCode);
  if (!std) p.push(`성취기준 ${item.standardCode}이(가) standards.ts에 없어요`);
  else if (std.gradeBand === "3-4" ? item.grade > 4 : item.grade < 5) p.push("학년이 성취기준의 학년군과 맞지 않아요");
  const texts: string[] = [item.prompt, item.principle, item.hints[0], item.hints[1], item.explanation];
  if (item.type === "choice" || item.type === "choice-with-evidence") texts.push(...item.options);
  if (item.type === "label-sentences") texts.push(...item.labels);
  for (const t of texts) p.push(...realNameProblems(t).map((m) => `${item.id}: ${m}`));
  return p;
}
