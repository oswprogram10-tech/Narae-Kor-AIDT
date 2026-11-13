"use client";

import type { Passage } from "@/core/reading";

/** 작품을 읽고 문장 하나를 눌러 고르는 간단한 읽기 화면. 시는 한 행이 문장 하나, 이야기는 문단 안의 문장 하나다. */
export function SentencePicker({ work, selectedId, disabled, onSelect }: { work: Passage; selectedId: string; disabled: boolean; onSelect: (sentenceId: string) => void }) {
  const poem = work.genre === "시";
  return (
    <div className="space-y-4" role="group" aria-label={`「${work.title}」 문장 고르기`} data-testid="sentence-picker">
      {work.paragraphs.map((p, pi) => (
        <div key={p.id} className={poem ? "space-y-1" : ""}>
          {poem && <div className="text-xs font-semibold text-stone-500">{pi + 1}연</div>}
          <p className={poem ? "space-y-1" : "leading-8"}>
            {p.sentences.map((s) => {
              const on = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-sentence={s.id}
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => onSelect(s.id)}
                  className={`${poem ? "block w-full text-left" : "inline text-left"} rounded px-1 py-0.5 transition ${
                    on ? "bg-sun-100 font-semibold ring-2 ring-sun-400" : "hover:bg-stone-100"
                  } disabled:cursor-default`}
                >
                  {s.text}
                </button>
              );
            })}
          </p>
        </div>
      ))}
    </div>
  );
}
