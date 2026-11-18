import { describe, expect, it } from "vitest";
import { lintKorean } from "@/core/lint";

const rules = (t: string) => lintKorean(t).map((f) => f.rule);
const marked = (t: string) => lintKorean(t).map((f) => t.slice(f.start, f.end));

describe("lintKorean", () => {
  it("finds common misspellings", () => {
    expect(rules("숙제를 다 됬다.")).toContain("dwaet");
    expect(rules("이제 집에 가도 되요.")).toContain("doe-dwae");
    expect(rules("몇일 동안 비가 왔다.")).toContain("myeochil");
    expect(rules("내일 다시 할께.")).toContain("lge");
    expect(rules("오랫만에 친구를 만났다.")).toContain("oraenman");
  });

  it("does not flag correct sentences", () => {
    const ok = [
      "이제 집에 가도 돼요.",
      "숙제를 다 했다. 그래서 기분이 좋았다.",
      "나는 밥을 먹지 않았다.",
      "엄마를 꼭 안아 드렸다.",
      "며칠 동안 비가 왔다.",
      "선생님께 편지를 드렸다.",
      "돼지 저금통에 돈을 넣었다.",
      "나는 그 일을 할 수 있다.",
      "내가 좋아하는 것은 축구이다.",
    ];
    for (const s of ok) expect(lintKorean(s), s).toEqual([]);
  });

  it("flags 안/않 confusion", () => {
    expect(rules("나는 밥을 먹지 안았다.")).toContain("ji-an");
    expect(marked("나는 밥을 먹지 안았다.")).toContain("안");
    expect(rules("오늘은 않 갈래.")).toContain("an-anh");
  });

  it("flags dependent noun spacing", () => {
    expect(marked("나는 그 일을 할수있다.")).toContain("할수");
    expect(marked("내가 좋아하는것은 축구이다.")).toContain("는것");
  });

  it("flags punctuation spacing and long sentences", () => {
    expect(rules("나는 학교에 갔다.그리고 공부했다.")).toContain("space-after-punct");
    expect(marked("나는 학교에 갔다.그리고 공부했다.")).toContain("다.그");
    expect(rules("키가 3.5cm 자랐고 1,000원을 냈다.")).not.toContain("space-after-punct");
    expect(rules("나는 학교에 갔다 .")).toContain("space-before-punct");
    const long = "나는 오늘 아침에 일찍 일어나서 밥을 먹고 학교에 가서 친구들과 함께 운동장에서 축구를 하고 교실에 들어와서 공부를 열심히 했다.";
    expect(rules(long)).toContain("long-sentence");
  });

  it("reports positions inside the text, never a corrected string", () => {
    const text = "어제 몇일 쉬었다.";
    const [f] = lintKorean(text);
    expect(text.slice(f.start, f.end)).toBe("몇일");
    expect(f.message).not.toContain("며칠");
  });
});
