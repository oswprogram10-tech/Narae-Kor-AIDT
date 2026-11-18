import { describe, expect, it } from "vitest";
import { STAGES } from "@/core/data/genres";
import { checkOutput } from "@/core/coach/guard";
import { mockCoach } from "@/core/coach/mock";
import type { CoachContext } from "@/core/coach/types";

const base: CoachContext = {
  grade: 4, genreName: "문단", coachFocus: "", standardStatements: [], prompt: "", organizer: [], rubric: [],
  stage: "brainstorm", brainstorm: "", organizerValues: {}, draft: "나는 여름이 좋다.그리고 몇일 동안 바다에 갔다.",
  studentMessage: "", history: [], helpCountThisStage: 0,
};

describe("mockCoach", () => {
  it("every canned reply passes the output guard", () => {
    for (const stage of STAGES) {
      for (let h = 0; h < 4; h++) {
        const o = mockCoach({ ...base, stage, helpCountThisStage: h });
        const r = checkOutput(o, base.draft, stage);
        expect(r.ok, `${stage}/${h}: ${o.reply}`).toBe(true);
      }
    }
  });

  it("highlights lint findings from the draft in revise", () => {
    const o = mockCoach({ ...base, stage: "revise" });
    expect(o.highlights.length).toBeGreaterThan(0);
    for (const h of o.highlights) expect(base.draft).toContain(h.quote);
  });
});
