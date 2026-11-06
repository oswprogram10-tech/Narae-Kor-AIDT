// 읽기 지문·문제 은행 검증: 지문과 문제를 추가·수정할 때 실수를 잡아 준다.

import { getStandard } from "@/core/data/standards";
import { allSentences, getPassage } from "./passages";
import { groupMatches, normalizeText, paragraphCovered } from "./summary";
import type { Passage, ReadingItem, SummaryWriteItem } from "./types";

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
  if (passage.page) p.push(...validatePageMeta(passage));
  return p;
}

/** 가상 웹 페이지: 첫 문단이 페이지 정보 문단이고, page 정보와 줄이 맞는지 */
function validatePageMeta(passage: Passage): string[] {
  const p: string[] = [];
  const page = passage.page!;
  const first = passage.paragraphs[0];
  if (!first || !/(^|-)meta$/u.test(first.id)) {
    p.push("가상 페이지의 첫 문단은 페이지 정보 문단(meta)이어야 해요");
    return p;
  }
  const lines = first.sentences.map((s) => s.text);
  const need = (prefix: string, value: string | undefined) => {
    if (value === undefined) return;
    if (!lines.includes(`${prefix}: ${value}`)) p.push(`페이지 정보 문단에 '${prefix}: ${value}' 줄이 없어요`);
  };
  if (!page.site.trim()) p.push("사이트 이름이 비었어요");
  if (!page.address.trim()) p.push("주소가 비었어요");
  need("사이트", page.site);
  need("주소", page.address);
  need("글쓴이", page.author);
  need("날짜", page.date);
  need("출처", page.sourceNote);
  if (page.isAd && !lines.some((l) => l.startsWith("광고"))) p.push("광고 페이지인데 '광고' 표시 줄이 없어요");
  if (!page.isAd && lines.some((l) => l.startsWith("광고:"))) p.push("광고 페이지가 아닌데 '광고' 표시 줄이 있어요");
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

  // 지문 쌍(관점 비교): 첫 지문은 passageId와 같고, 문단·문장 id가 두 지문 사이에서도 겹치지 않아야 한다.
  const passages: Passage[] = [passage];
  if (item.passageIds !== undefined) {
    if (item.passageIds.length < 2 || item.passageIds.length > 3) p.push("passageIds는 지문 둘(가상 페이지 비교는 셋까지)이어야 해요");
    if (item.passageIds[0] !== item.passageId) p.push("passageIds의 첫 번째가 passageId와 달라요");
    if (new Set(item.passageIds).size !== item.passageIds.length) p.push("passageIds가 겹쳐요");
    for (const id of item.passageIds.slice(1)) {
      const other = getPassage(id);
      if (!other) p.push(`지문 ${id}이(가) 없어요`);
      else passages.push(other);
    }
    const sids = passages.flatMap((x) => x.paragraphs.flatMap((para) => para.sentences.map((s) => s.id)));
    if (new Set(sids).size !== sids.length) p.push("지문 쌍의 문장 id가 겹쳐요");
    const pids = passages.flatMap((x) => x.paragraphs.map((para) => para.id));
    if (new Set(pids).size !== pids.length) p.push("지문 쌍의 문단 id가 겹쳐요");
    if (item.type === "slot-paragraphs" || item.type === "sentence-pick" || item.type === "summary-write") {
      p.push("이 형식은 지문 쌍에 쓸 수 없어요");
    }
  }
  for (const x of passages) {
    if (x.gradeBand === "3-4" ? item.grade > 4 : item.grade < 5) p.push(`학년이 지문 ${x.id}의 학년군과 맞지 않아요`);
  }

  // 예측하며 읽기: revealUpTo 문단까지만 보이므로, 근거·고를 문장은 그 안에 있어야 한다.
  let revealed = passage.paragraphs;
  if (item.revealUpTo !== undefined) {
    const at = passage.paragraphs.findIndex((x) => x.id === item.revealUpTo);
    if (at < 0) p.push(`revealUpTo ${item.revealUpTo}이(가) 지문에 없어요`);
    else revealed = passage.paragraphs.slice(0, at + 1);
    if (item.passageIds !== undefined) p.push("revealUpTo는 지문 쌍에 쓸 수 없어요");
  }
  const visibleParagraphs = [...revealed, ...passages.slice(1).flatMap((x) => x.paragraphs)];
  const sentences = new Map(visibleParagraphs.flatMap((para) => para.sentences).map((s) => [s.id, s]));
  const paragraphIds = new Set(passage.paragraphs.map((x) => x.id));
  if (item.revealUpTo !== undefined) {
    // 보이지 않는 문단의 글이 문제 글·보기에 그대로 들어 있으면 미리 알려 주는 셈이다.
    const hiddenSentences = passage.paragraphs.slice(revealed.length).flatMap((para) => para.sentences);
    const optionTexts = item.type === "choice" || item.type === "choice-with-evidence" ? item.options : [];
    for (const [name, text] of [["prompt", item.prompt], ["principle", item.principle], ["hints[0]", item.hints[0]], ["hints[1]", item.hints[1]], ...optionTexts.map((o, i) => [`options[${i}]`, o] as const)] as [string, string][]) {
      for (const h of hiddenSentences) {
        if (text.includes(stripEnd(h.text))) p.push(`${name}에 아직 보이지 않는 문단의 문장(${h.id})이 그대로 들어 있어요`);
      }
    }
  }
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
    case "summary-write":
      p.push(...validateSummary(item, passage));
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

/** 요약 쓰기 문제 검사: 문단 구성, 길이 범위, 핵심 낱말 묶음의 품질(다른 문단 글만으로 채워지지 않는지 등) */
function validateSummary(item: SummaryWriteItem, passage: Passage): string[] {
  const p: string[] = [];
  if (!Number.isInteger(item.minChars) || !Number.isInteger(item.maxChars) || item.minChars < 20 || item.maxChars <= item.minChars) {
    p.push(`글자 수 범위(${item.minChars}~${item.maxChars})가 알맞지 않아요`);
  }
  const total = passage.paragraphs.reduce((n, para) => n + para.sentences.reduce((m, s) => m + normalizeText(s.text).length, 0), 0);
  if (item.maxChars > total * 0.6) p.push("maxChars가 지문 길이의 절반을 많이 넘어요");
  if (item.paragraphs.map((x) => x.paragraphId).join() !== passage.paragraphs.map((x) => x.id).join()) {
    p.push("paragraphs가 지문의 모든 문단을 순서대로 담고 있지 않아요");
    return p;
  }
  const guarded: [string, string][] = [
    ["prompt", item.prompt],
    ["principle", item.principle],
    ["hints[0]", item.hints[0]],
    ["hints[1]", item.hints[1]],
  ];
  passage.paragraphs.forEach((para, i) => {
    const spec = item.paragraphs[i];
    const no = i + 1;
    if (spec.keyGroups.length === 0) p.push(`${no}문단의 핵심 낱말 묶음이 없어요`);
    const seen = new Set<string>();
    for (const g of spec.keyGroups) {
      const key = g.map(normalizeText).join("+");
      if (seen.has(key)) p.push(`${no}문단의 핵심 낱말 묶음이 겹쳐요: ${g.join("+")}`);
      seen.add(key);
      const words = g.map(normalizeText);
      if (words.length === 0 || words.some((w) => w.length === 0)) p.push(`${no}문단에 빈 낱말이 있어요`);
      // 한 글자 낱말이 홀로 있으면 아무 글에나 맞는다. 두 글자 이상이거나 다른 낱말과 함께 써야 한다.
      if (words.length === 1 && words[0].length < 2) p.push(`${no}문단의 핵심 낱말 '${g[0]}'이(가) 너무 짧아요`);
    }
    if (!spec.topicHint.trim()) p.push(`${no}문단의 topicHint가 비었어요`);
    p.push(...haeyoProblems(spec.topicHint).map((m) => `${no}문단 topicHint: ${m}`));
    // 힌트 글(문단 힌트·안내·원리·힌트)에 핵심 낱말이 들어 있으면 내용을 미리 알려 주는 셈
    for (const [name, text] of [["topicHint", spec.topicHint], ...guarded] as [string, string][]) {
      const t = normalizeText(text);
      for (const g of spec.keyGroups) for (const w of g) {
        const nw = normalizeText(w);
        if (nw.length >= 2 && t.includes(nw)) p.push(`${no}문단의 핵심 낱말 '${w}'이(가) ${name}에 들어 있어요`);
      }
    }
    // 자기 문단의 글로 채워져야 하고, 다른 문단의 글만으로는 채워지지 않아야 한다.
    const own = normalizeText(para.sentences.map((s) => s.text).join(""));
    const others = normalizeText(
      passage.paragraphs.filter((_, j) => j !== i).flatMap((x) => x.sentences.map((s) => s.text)).join(""),
    );
    if (!paragraphCovered(spec, own)) p.push(`${no}문단의 핵심 낱말이 그 문단 글과 맞지 않아요`);
    for (const g of spec.keyGroups) {
      if (groupMatches(g, others)) p.push(`${no}문단의 핵심 낱말 묶음 ${g.join("+")}이(가) 다른 문단 글만으로도 채워져요`);
    }
  });
  return p;
}
