import { describe, expect, it } from "vitest";
import { GENRES, genresForGrade, getGenre } from "@/core/data/genres";
import { getStandard } from "@/core/data/standards";
import {
  EXTRA_WORK_NAMES,
  REPLY_CHARACTERS,
  REPLY_SLOTS,
  getReplyCharacter,
  guessReplyCharacter,
} from "@/core/literature/replies";
import { LITERATURE_PASSAGES } from "@/core/literature";

describe("new writing genres (literature)", () => {
  const ids = ["character-letter", "experience-poem", "experience-story"];
  it("exist with valid literature standards, unique keys and 3-level rubrics", () => {
    for (const id of ids) {
      const g = getGenre(id)!;
      expect(g, id).toBeDefined();
      for (const c of g.standardCodes) expect(getStandard(c)?.area, `${id}:${c}`).toBe("문학");
      const keys = g.organizer.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
      const rk = g.rubric.map((r) => r.key);
      expect(new Set(rk).size).toBe(rk.length);
      expect(g.rubric.length).toBeGreaterThanOrEqual(3);
      for (const r of g.rubric) expect(r.levels).toHaveLength(3);
      expect(g.coachFocus).toMatch(/대신 (써|만들어) 주지 않/);
    }
    expect(new Set(GENRES.map((g) => g.id)).size).toBe(GENRES.length);
  });
  it("appears for the right grades", () => {
    expect(genresForGrade(3).map((g) => g.id)).toContain("character-letter");
    expect(genresForGrade(4).map((g) => g.id)).not.toContain("experience-poem");
    expect(genresForGrade(5).map((g) => g.id)).toEqual(expect.arrayContaining(["character-letter", "experience-poem", "experience-story"]));
    expect(getGenre("character-letter")!.organizer[0].key).toBe("character");
  });
});

const ALL_NAMES = new Set([...REPLY_CHARACTERS.flatMap((c) => [c.name.replace(/이$/, ""), ...c.aliases]), "달수"]);
const FORBIDDEN = /주소|전화|번호|만나|만날|비밀|약속|사랑|좋아해|사귀|보고 싶|어디 사|어디에 살|몇 살|연락|카톡|선물|\?/;

describe("character reply pieces", () => {
  it("cover the characters of our works, with the required slot counts", () => {
    expect(REPLY_CHARACTERS.map((c) => c.id)).toEqual(["hajun", "seoa", "jiwoo", "seorin", "doyun", "grandma"]);
    const want = { greeting: 2, thanks: 2, comfort: 2, praise: 2, answer: 2, inCharacter: 3, encourage: 2, closing: 2 };
    for (const c of REPLY_CHARACTERS) {
      expect(LITERATURE_PASSAGES.some((p) => p.id === c.workId && p.title === c.workTitle)).toBe(true);
      for (const slot of REPLY_SLOTS) expect(c.pieces[slot], `${c.id}:${slot}`).toHaveLength(want[slot]);
    }
  });
  it("are polite sentences without forbidden content", () => {
    for (const c of REPLY_CHARACTERS) {
      const seen = new Set<string>();
      for (const slot of REPLY_SLOTS) {
        for (const piece of c.pieces[slot]) {
          const where = `${c.id}:${slot}:${piece}`;
          expect(piece, where).toMatch(/요[.!]$/);
          expect(piece, where).not.toMatch(FORBIDDEN);
          expect(piece.length, where).toBeLessThanOrEqual(90);
          expect(seen.has(piece), where).toBe(false);
          seen.add(piece);
        }
      }
    }
  });
  it("mention only names that exist in the same work", () => {
    for (const c of REPLY_CHARACTERS) {
      const work = REPLY_CHARACTERS.filter((x) => x.workId === c.workId);
      const allowed = new Set([...work.flatMap((x) => [x.name.replace(/이$/, ""), ...x.aliases]), ...(EXTRA_WORK_NAMES[c.workId] ?? [])]);
      const text = Object.values(c.pieces).flat().join(" ");
      for (const name of ALL_NAMES) if (!allowed.has(name)) expect(text, `${c.id} mentions ${name}`).not.toContain(name);
    }
  });
  it("in-character lines match story events (key phrases appear in the passage)", () => {
    const keyPhrases: Record<string, string[]> = {
      hajun: ["갈라지", "새빨개", "힘찬 박수", "뿌듯"],
      seoa: ["보리차", "주먹을 꼭 쥐", "리코더 소리가 정말 좋았어"],
      jiwoo: ["한 번만 더", "파란 한지", "하얀 갈매기", "곤두박질"],
      seorin: ["손난로", "얼레", "우리 연이 제일 예뻐"],
      doyun: ["쭈뼛쭈뼛", "미안해", "소나무"],
      grandma: ["바람결을 타", "쓰다듬", "맨 앞줄"],
    };
    for (const c of REPLY_CHARACTERS) {
      const passage = LITERATURE_PASSAGES.find((p) => p.id === c.workId)!;
      const story = passage.paragraphs.flatMap((p) => p.sentences.map((s) => s.text)).join(" ");
      for (const k of keyPhrases[c.id]) {
        expect(story, `${c.id}:${k}`).toContain(k);
        expect(c.pieces.inCharacter.join(" ") + c.pieces.answer.join(" ") + c.pieces.comfort.join(" "), `${c.id}:${k} used`).toMatch(k.split(" ")[0]);
      }
    }
  });
  it("guesses the character from the receiver text, ignoring the work title", () => {
    expect(guessReplyCharacter("「하준이의 리코더」의 서아")).toBe("seoa");
    expect(guessReplyCharacter("바람을 타는 연의 지우에게")).toBe("jiwoo");
    expect(guessReplyCharacter("하준이의 리코더 하준이")).toBe("hajun");
    expect(guessReplyCharacter("할머니")).toBe("grandma");
    expect(guessReplyCharacter("도윤이에게")).toBe("doyun");
    expect(guessReplyCharacter("아무개")).toBeNull();
    expect(getReplyCharacter("nobody")).toBeUndefined();
  });
});
