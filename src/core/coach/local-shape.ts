import { safeFallback } from "./guard";
import { mockCoach } from "./mock";
import type { CoachContext, CoachOutput, InputFlags } from "./types";

// 내장 초소형 모델의 답을 '질문 중심'으로 다듬는다.
// 실측(2026-11-03, Qwen2.5 0.5B·Gemma 3 1B, 파인튜닝 전): 두 모델 모두 질문은 그럴듯하게 만들지만,
// reply에 내용을 대신 채워 넣거나(대필), highlights에 예시 문장을 지어내는 경우가 많았다.
// 그래서 모델에서는 '검증한 질문'만 쓰고, 말머리(reply)는 검증된 문장 은행에서 가져오며, highlights는 버린다.

const MAX_Q = 2;

export function isUsableQuestion(q: string, ctx: CoachContext): boolean {
  const t = q.trim();
  if (t.length < 6 || t.length > 90) return false;
  if (!/[?？]$/.test(t)) return false; // 질문이어야 함
  if (/다\s*[?？]$/.test(t)) return false; // 평서문에 물음표만 붙인 것("…필요하다?")은 질문이 아님
  if (/[.!](\s|$)/.test(t.slice(0, -1))) return false; // 질문 앞에 다른 문장이 붙은 경우 제외
  if (/(예를 들어|예시|이렇게 써|다음과 같이|정답)/.test(t)) return false;
  if (/[A-Za-z]{2,}/.test(t)) return false; // 영어가 섞인 질문("…why?") 제외
  if (ctx.studentMessage && t.replace(/\s/g, "") === ctx.studentMessage.trim().replace(/\s/g, "")) return false; // 학생 질문 되풀이
  // 학생 글의 문장을 그대로 반복하는 질문 제외("책장이 하나 더 필요하다?")
  const core = t.replace(/[?？\s]/g, "");
  const studentText = (ctx.draft + ctx.brainstorm + Object.values(ctx.organizerValues).join("")).replace(/\s/g, "");
  if (core.length >= 8 && studentText.includes(core)) return false;
  return true;
}

export function shapeLocalOutput(raw: CoachOutput, ctx: CoachContext, flags: InputFlags, trustModelGhostwrite = false): CoachOutput {
  // 위험 신호·개인 정보 표시는 안전망으로 그대로 넘긴다(엔진이 정해진 응답과 교사 알림으로 처리).
  if (raw.flag === "distress" || raw.flag === "personal_info") return { ...raw, flag: raw.flag };
  const questions = [...new Set(raw.questions.map((q) => q.trim()))].filter((q) => isUsableQuestion(q, ctx)).slice(0, MAX_Q);
  const bank = mockCoach(ctx);
  // 대필 요청 여부는 규칙 감지기로만 판단한다. 실측에서 초소형 모델은 거의 모든 요청을 대필 요청으로 표시해
  // 교사 대시보드에 거짓 알림이 쌓일 수 있었다(Qwen2.5 0.5B, 2026-11-03).
  // 단, 레드팀 시험을 통과한 파인튜닝 모델은 규칙이 놓친 대필 요청도 알아차리므로 그 판단을 함께 쓴다.
  if (flags.ghostwriteRequest || (trustModelGhostwrite && raw.flag === "ghostwrite_request")) {
    return {
      reply: "그 부분은 내가 대신 써 줄 수 없어요. 네 생각으로 써야 네 글이 되거든요.",
      questions: questions.length ? questions : bank.questions.slice(0, 1),
      highlights: [],
      flag: "ghostwrite_request",
    };
  }
  if (questions.length === 0) {
    // 쓸 만한 질문이 없으면 단계별 안전한 기본 응답
    return { ...safeFallback(ctx.stage), highlights: bank.highlights };
  }
  return { reply: bank.reply, questions, highlights: bank.highlights, flag: "none" };
}

// 깨진 JSON이나 평문에서 질문만 건져 낸다(실측: 괄호 짝이 안 맞거나 객체가 둘로 갈라진 답이 많았음).
export function recoverQuestions(text: string): { reply: string; questions: string[] } {
  const quoted = [...text.matchAll(/"([^"\n]{4,120}?[?？])"/g)].map((m) => m[1].trim());
  const plain = text
    .replace(/[{}\[\]"`]/g, " ")
    .split(/(?<=[?？])\s*/)
    .map((q) => q.replace(/^[\s,:]*(questions|flag|json)?[\s,:]*/i, "").trim())
    .filter((q) => /[?？]$/.test(q));
  return { reply: "", questions: quoted.length ? quoted : plain };
}
