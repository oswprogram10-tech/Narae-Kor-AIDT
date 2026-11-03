// API 키 없이도 수업·시연·테스트를 할 수 있게 하는 규칙 기반 모의 코치.
// 정해진 질문 은행에서 단계와 힌트 단계에 맞는 질문을 고른다. 문장을 대신 쓰지 않는다는 원칙은 같다.
import type { Stage } from "@/data/genres";
import { lintKorean } from "@/lib/lint";
import type { CoachContext, CoachOutput } from "./types";

const BANK: Record<Stage, [string, string[]][]> = {
  brainstorm: [
    ["좋아요, 생각 열기부터 해 봐요. 떠오르는 낱말만 적어도 충분해요.", ["이 주제를 들으면 가장 먼저 어떤 장면이나 사람이 떠오르나요?"]],
    ["조금 더 넓혀 볼까요?", ["그 일이 있었던 때는 언제, 어디였나요?", "그때 어떤 소리나 냄새, 느낌이 있었나요?"]],
    ["아직 막막하다면 고르기부터 해 봐요.", ["'재미있었던 일', '속상했던 일', '뿌듯했던 일' 중에서 이야기하고 싶은 쪽은 어디인가요?"]],
  ],
  plan: [
    ["계획표를 채우는 중이네요. 빈칸 하나에 집중해 봐요.", ["아직 비어 있는 칸 중에서 가장 쓰기 쉬운 칸은 어디인가요?"]],
    ["적은 내용을 조금 더 구체적으로 만들어 볼까요?", ["그렇게 생각한 까닭이나 실제로 겪은 일이 있나요?"]],
    ["문장 틀을 하나 줄게요. 빈칸은 직접 채워 보세요: \"나는 ___(이)라고 생각해요. 왜냐하면 ___.\"", []],
  ],
  draft: [
    ["계획표를 옆에 두고 한 칸씩 문장으로 바꿔 봐요.", ["계획표의 첫 번째 칸을 내 말로 바꾸면 어떤 문장이 될까요?"]],
    ["잘 이어 가고 있어요. 다음 내용으로 넘어가 볼까요?", ["앞 문장 다음에 읽는 사람이 가장 궁금해할 것은 무엇일까요?"]],
    ["막힌 곳에서 잠깐 멈춰도 괜찮아요. 하고 싶은 말을 친구에게 말하듯이 소리 내어 말해 보고, 그 말을 그대로 적어 봐요.", []],
  ],
  revise: [
    ["고쳐 쓰기는 글을 더 좋게 만드는 과정이에요. 소리 내어 천천히 읽어 봐요.", ["읽다가 숨이 차거나 어색했던 곳이 있었나요?"]],
    ["이번에는 글 전체를 살펴봐요.", ["글 전체에서 가장 하고 싶은 말은 무엇인가요? 그 말과 관계없는 문장은 없나요?"]],
    ["문장 하나하나를 살펴봐요.", ["문장의 처음과 끝이 서로 잘 어울리나요? 예를 들어 '누가'와 '어찌하다'가 짝을 이루나요?"]],
  ],
};

export function mockCoach(ctx: CoachContext): CoachOutput {
  const level = Math.min(2, ctx.helpCountThisStage);
  const [reply, questions] = BANK[ctx.stage][level];
  const highlights: CoachOutput["highlights"] = [];
  if (ctx.stage === "revise" && ctx.draft.trim()) {
    for (const f of lintKorean(ctx.draft)) {
      if (highlights.length >= 2) break;
      const quote = ctx.draft.slice(f.start, f.end);
      if (quote.trim().length < 2) continue;
      highlights.push({ quote, lens: f.lens, note: f.message });
    }
  }
  return { reply, questions, highlights, flag: "none" };
}
