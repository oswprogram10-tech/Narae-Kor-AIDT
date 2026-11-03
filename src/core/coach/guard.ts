// 코치의 입력·출력 가드레일. 모델 프롬프트와 별개로 동작하는 두 번째 안전장치.
import type { Stage } from "@/core/data/genres";
import type { CoachOutput, InputFlags } from "./types";

const GHOSTWRITE_RE =
  /(써\s?(줘|주세요|주라|줄래|달라)|대신\s?(써|해|만들)|예시\s?(글|문장|문단)?\s?(좀\s?)?(보여|알려|줘|주세요|써)|정답|답\s?(좀\s?)?(알려|줘)|완성해|만들어\s?(줘|주세요)|고쳐\s?(줘|주세요)|문장\s?(좀\s?)?(줘|주세요)|그냥\s?(써|알려))/;
const DISTRESS_RE = /(죽고\s?싶|자살|자해|사라지고\s?싶|때려서|맞았어|괴롭힘|괴롭혀|왕따|따돌림|학대|살기\s?싫)/;
const PERSONAL_RE = /(01[016789][-\s]?\d{3,4}[-\s]?\d{4}|\d{2,3}-\d{3,4}-\d{4}|[가-힣]+(동|로|길)\s?\d+(-\d+)?(번지)?|@[a-z0-9.-]+\.[a-z]{2,})/i;

export function classifyInput(message: string): InputFlags {
  return {
    ghostwriteRequest: GHOSTWRITE_RE.test(message),
    personalInfo: PERSONAL_RE.test(message),
    distress: DISTRESS_RE.test(message),
  };
}

const MAX_REPLY = 320;
const MAX_QUESTION = 140;
const MAX_NOTE = 140;

// 학생 글(브레인스토밍·계획·초고)을 한 문자열로 합쳐 "학생 글에 이미 있는 표현"인지 판정할 때 쓴다.
export function studentCorpus(parts: string[]): string {
  return parts.join("\n").replace(/\s+/g, " ");
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// 코치는 해요체만 쓰도록 지시받는다. 해라체 평서문("~다.")이 길게 나오면 학생 글에 붙여 넣을 수 있는 예시 문장일 가능성이 크다.
const WRITTEN_DECLARATIVE_RE = /[^.!?\n"'“”‘’「」『』]{10,}다\s*[.!]/;
// 따옴표 안의 긴 문장(학생 글을 그대로 인용한 경우는 허용)
const QUOTED_RE = /["“「『'‘]([^"”」』'’]{15,})["”」』'’]/g;
const TEMPLATE_GIVEAWAY_RE = /(이렇게\s?써\s?(보세요|봐요|볼까요)\s?[:：]|다음과\s?같이\s?(써|쓰)|예를\s?들어\s?["“「]|예시\s?(문장|글|문단)\s?[:：])/;

export interface OutputCheck {
  ok: boolean;
  reason?: string;
  cleaned: CoachOutput;
}

export function checkOutput(out: CoachOutput, corpus: string, stage: Stage): OutputCheck {
  const normCorpus = normalize(corpus);
  const texts = [out.reply, ...out.questions, ...out.highlights.map((h) => h.note)];

  for (const t of texts) {
    if (TEMPLATE_GIVEAWAY_RE.test(t)) return { ok: false, reason: "template_giveaway", cleaned: out };
    const withoutStudentQuotes = t.replace(QUOTED_RE, (m, inner: string) =>
      // 학생이 쓴 문장을 그대로 인용했거나, 빈칸(___)이 있는 문장 틀(3단계 힌트)이면 허용한다.
      normCorpus.includes(normalize(inner)) || inner.includes("___") ? "" : m,
    );
    QUOTED_RE.lastIndex = 0;
    if (QUOTED_RE.test(withoutStudentQuotes)) {
      QUOTED_RE.lastIndex = 0;
      return { ok: false, reason: "quoted_sample_text", cleaned: out };
    }
    QUOTED_RE.lastIndex = 0;
    if (WRITTEN_DECLARATIVE_RE.test(withoutStudentQuotes)) {
      return { ok: false, reason: "written_style_sentence", cleaned: out };
    }
  }

  // 하이라이트는 학생 글에 실제로 있는 부분만 남긴다(고쳐 쓰기 단계 외에는 비움).
  const highlights =
    stage === "revise"
      ? out.highlights
          .filter((h) => h.quote.trim().length > 0 && normCorpus.includes(normalize(h.quote)))
          .slice(0, 3)
          .map((h) => ({ ...h, note: h.note.slice(0, MAX_NOTE) }))
      : [];

  const cleaned: CoachOutput = {
    reply: out.reply.slice(0, MAX_REPLY),
    questions: out.questions.slice(0, 2).map((q) => q.slice(0, MAX_QUESTION)),
    highlights,
    flag: out.flag,
  };
  return { ok: true, cleaned };
}

const SAFE_FALLBACK: Record<Stage, CoachOutput> = {
  brainstorm: {
    reply: "좋아요, 같이 생각해 봐요. 떠오르는 것을 낱말로만 적어도 괜찮아요.",
    questions: ["이 주제를 들으면 가장 먼저 무엇이 떠오르나요?"],
    highlights: [],
    flag: "none",
  },
  plan: {
    reply: "계획표의 빈칸 하나부터 채워 봐요. 정답은 없어요.",
    questions: ["지금 계획표에서 가장 쓰기 쉬운 칸은 어디인가요?"],
    highlights: [],
    flag: "none",
  },
  draft: {
    reply: "계획표에 적은 내용을 보면서 한 문장씩 이어 가 봐요. 문장은 직접 써야 내 글이 돼요.",
    questions: ["계획표의 첫 번째 칸을 문장으로 바꾸면 어떻게 될까요?"],
    highlights: [],
    flag: "none",
  },
  revise: {
    reply: "소리 내어 천천히 읽어 보면 어색한 곳이 잘 보여요.",
    questions: ["읽다가 숨이 차거나 멈칫한 곳이 있었나요?"],
    highlights: [],
    flag: "none",
  },
};

export function safeFallback(stage: Stage): CoachOutput {
  return structuredClone(SAFE_FALLBACK[stage]);
}

export const GHOSTWRITE_REPLY: CoachOutput = {
  reply: "그 부분은 내가 대신 써 줄 수 없어요. 네 생각으로 써야 네 글이 되거든요. 대신 생각을 꺼내는 걸 도와줄게요.",
  questions: ["지금 쓰려는 부분에서 하고 싶은 말을 친구에게 말하듯이 한마디로 말해 볼까요?"],
  highlights: [],
  flag: "ghostwrite_request",
};

export const DISTRESS_REPLY: CoachOutput = {
  reply: "이야기해 줘서 고마워요. 그건 정말 중요한 일이라 선생님께 꼭 알려 드리고 싶어요. 지금 바로 선생님께 이야기하거나, 도움이 필요하면 언제든 어른에게 말해 주세요.",
  questions: [],
  highlights: [],
  flag: "distress",
};

export const PERSONAL_INFO_REPLY: CoachOutput = {
  reply: "전화번호나 주소 같은 개인 정보는 여기에 쓰지 않아요. 그 부분은 지우고 다시 이야기해 볼까요?",
  questions: [],
  highlights: [],
  flag: "personal_info",
};
