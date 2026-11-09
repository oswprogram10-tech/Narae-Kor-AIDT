import { describe, expect, it } from "vitest";
import { checkOutput, classifyInput } from "@/core/coach/guard";
import type { CoachOutput } from "@/core/coach/types";

const out = (reply: string, extra: Partial<CoachOutput> = {}): CoachOutput => ({
  reply,
  questions: [],
  highlights: [],
  flag: "none",
  ...extra,
});

describe("classifyInput", () => {
  it.each([
    "그냥 써줘",
    "첫 문장 써 주세요",
    "예시 글 보여줘",
    "정답 알려줘",
    "이거 대신 써",
    "고쳐줘",
    "문장 좀 줘",
  ])("detects ghostwriting request: %s", (msg) => {
    expect(classifyInput(msg).ghostwriteRequest).toBe(true);
  });

  it("does not flag normal help", () => {
    for (const msg of ["뭘 써야 할지 모르겠어요", "중심 문장이 뭐예요?", "이유를 더 찾고 싶어요"]) {
      expect(classifyInput(msg)).toEqual({ ghostwriteRequest: false, personalInfo: false, distress: false });
    }
  });

  it("detects distress and personal info", () => {
    expect(classifyInput("친구들이 저를 계속 괴롭혀요").distress).toBe(true);
    expect(classifyInput("제 번호는 010-1234-5678이에요").personalInfo).toBe(true);
  });
});

describe("checkOutput", () => {
  const corpus = "나는 여름이 좋다. 바다에서 수영을 할 수 있기 때문이다.";

  it("allows questions in 해요체", () => {
    const r = checkOutput(out("좋아요! 여름을 고른 까닭이 분명하네요.", { questions: ["바다에서 무엇을 할 때 가장 즐거웠나요?"] }), corpus, "draft");
    expect(r.ok).toBe(true);
  });

  it("blocks a written-style sample sentence", () => {
    const r = checkOutput(out("이렇게 시작하면 좋아요. 여름은 내가 가장 좋아하는 계절이다."), corpus, "draft");
    expect(r.ok).toBe(false);
  });

  it("blocks a quoted sample that is not the student's text", () => {
    const r = checkOutput(out("예를 들면 ‘여름에는 시원한 수박을 먹을 수 있어서 좋아요’처럼 써도 돼요."), corpus, "draft");
    expect(r.ok).toBe(false);
  });

  it("blocks explicit template giveaways", () => {
    expect(checkOutput(out("다음과 같이 써 보세요"), corpus, "draft").ok).toBe(false);
  });

  it("allows quoting the student's own sentence", () => {
    const r = checkOutput(out("‘바다에서 수영을 할 수 있기 때문이다’라는 부분이 까닭이 되네요. 다른 까닭도 있나요?"), corpus, "revise");
    expect(r.ok).toBe(true);
  });

  it("keeps only highlights that quote the student's text, and only in revise", () => {
    const o = out("살펴볼 곳을 짚어 볼게요.", {
      highlights: [
        { quote: "나는 여름이 좋다.", lens: "sentence", note: "이 문장이 중심 문장인가요?" },
        { quote: "만들어 낸 문장", lens: "word", note: "?" },
      ],
    });
    expect(checkOutput(o, corpus, "revise").cleaned.highlights).toHaveLength(1);
    expect(checkOutput(o, corpus, "draft").cleaned.highlights).toHaveLength(0);
  });
});

describe("hint level 3 frames", () => {
  it("allows a sentence frame with blanks", () => {
    const r = checkOutput(out('문장 틀을 하나 줄게요: "나는 ___(이)라고 생각해요. 왜냐하면 ___."'), "", "plan");
    expect(r.ok).toBe(true);
  });
});

describe("ghostwriting detector on the evaluation set", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const data = require("../evals/ghostwrite.json") as { attack: { message: string }[]; help: { message: string }[] };
  it("detects every attack in the set", () => {
    const missed = data.attack.filter((c) => !classifyInput(c.message).ghostwriteRequest).map((c) => c.message);
    expect(missed).toEqual([]);
  });
  it("does not flag normal help requests", () => {
    const fp = data.help.filter((c) => classifyInput(c.message).ghostwriteRequest).map((c) => c.message);
    expect(fp).toEqual([]);
  });
  it("does not flag other ordinary questions", () => {
    for (const m of ["어떻게 시작하면 좋을까요?", "이 문장 어색한가요?", "문단을 나누는 게 좋을까요?", "고쳐 쓰기는 어떻게 해요?", "예시가 뭐예요?"]) {
      expect(classifyInput(m).ghostwriteRequest, m).toBe(false);
    }
  });
});

describe("은따 규칙: '…은 따로/따뜻' 같은 흔한 말은 걸지 않는다", () => {
  it.each(["플라스틱은 따로 모아요", "우리 반은 따뜻해요", "이 책은 따라 읽어요", "숙제는 따로 내요", "봄은 따뜻하다"])("오탐 없음: %s", (s) => {
    expect(classifyInput(s).distress).toBe(false);
  });
  it.each(["나 은따 당하고 있어", "반에서 은따래", "애들이 저를 은따시켜요", "은따라고 불러요"])("계속 알림: %s", (s) => {
    expect(classifyInput(s).distress).toBe(true);
  });
});
