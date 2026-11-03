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
