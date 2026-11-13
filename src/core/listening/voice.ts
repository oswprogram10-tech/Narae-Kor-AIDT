// 듣기 자료를 소리로 들려줄 때 쓰는 순수 함수. 브라우저 API(speechSynthesis)는 호스트(화면)가 부른다.
// 같은 사람은 늘 같은 목소리 값을 받고, 사람마다 높낮이·빠르기를 조금씩 달리한다.

import type { Passage } from "@/core/reading";

export interface SpeakerVoice {
  /** 목소리 높낮이(0.8~1.25) */
  pitch: number;
  /** 빠르기(0.9~1.0) */
  rate: number;
}

/** 등장 순서대로 배정하는 목소리 목록. 첫 번째 사람이 기본 목소리다. */
export const VOICE_PRESETS: readonly SpeakerVoice[] = [
  { pitch: 1.0, rate: 0.95 },
  { pitch: 1.2, rate: 1.0 },
  { pitch: 0.85, rate: 0.92 },
  { pitch: 1.1, rate: 0.9 },
  { pitch: 0.92, rate: 1.0 },
  { pitch: 1.25, rate: 0.95 },
];

/** 지문에서 말한 사람이 처음 나온 순서 */
function speakersInOrder(passage: Passage): string[] {
  const out: string[] = [];
  for (const para of passage.paragraphs) if (para.speaker && !out.includes(para.speaker)) out.push(para.speaker);
  return out;
}

/** 지문 안에서 말한 사람이 처음 나온 순서로 목소리를 정한다. 지문에 없는 사람은 기본 목소리를 받는다. */
export function speakerVoice(passage: Passage, speaker: string): SpeakerVoice {
  const at = speakersInOrder(passage).indexOf(speaker);
  const preset = VOICE_PRESETS[(at < 0 ? 0 : at) % VOICE_PRESETS.length];
  return { pitch: preset.pitch, rate: preset.rate };
}

export interface ScriptLine {
  paragraphId: string;
  speaker: string;
  /** 말차례의 문장을 이어 붙인 읽어 줄 글 */
  text: string;
}

/** 말차례(문단)마다 한 줄씩. 소리로 읽어 줄 글이다. */
export function listeningScript(passage: Passage): ScriptLine[] {
  return passage.paragraphs.map((para) => ({
    paragraphId: para.id,
    speaker: para.speaker ?? "",
    text: para.sentences.map((s) => s.text).join(" "),
  }));
}
