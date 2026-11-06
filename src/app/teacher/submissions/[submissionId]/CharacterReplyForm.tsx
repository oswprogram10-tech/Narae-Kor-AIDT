"use client";

import { useActionState, useEffect, useState } from "react";
import { addComment, type FormState } from "@/app/actions/teacher";
import { FormMessage } from "@/components/FormMessage";
import { REPLY_CHARACTERS, REPLY_SAFETY_NOTE, REPLY_SLOTS, REPLY_SLOT_LABELS } from "@/core/literature/replies";

// 인물 편지 과제의 제출물에서 교사가 '인물 답장'을 쓰는 도우미: 인물을 고르고 문장 조각을 눌러 넣은 뒤 고쳐서 보낸다.
export function CharacterReplyForm({ submissionId, defaultCharacterId }: { submissionId: number; defaultCharacterId: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addComment, {});
  const [characterId, setCharacterId] = useState(defaultCharacterId ?? "");
  const [text, setText] = useState("");
  const character = REPLY_CHARACTERS.find((c) => c.id === characterId);

  useEffect(() => {
    if (state.ok) setText("");
  }, [state]);

  function add(piece: string) {
    setText((t) => (t.trim() ? `${t.replace(/\s+$/, "")} ${piece}` : piece));
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="asCharacter" value={characterId} />
      <div className="space-y-1 rounded-lg border border-brand-200 bg-brand-50 p-3">
        <h3 className="text-sm font-bold">인물 답장 도우미</h3>
        <p className="text-xs text-orange-800">{REPLY_SAFETY_NOTE}</p>
        <label className="mt-2 block text-xs font-semibold text-stone-600" htmlFor="reply-character">누구의 답장을 쓸까요?</label>
        <select id="reply-character" className="input text-sm" value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
          <option value="">인물을 고르세요 (고르지 않으면 선생님 코멘트)</option>
          {REPLY_CHARACTERS.map((c) => (
            <option key={c.id} value={c.id}>{c.name} · 「{c.workTitle}」</option>
          ))}
        </select>
        {character && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-stone-500">문장 조각을 누르면 아래 칸에 붙어요. 학생 글에 맞게 고쳐서 보내세요.</p>
            {REPLY_SLOTS.map((slot) => (
              <div key={slot}>
                <p className="text-xs font-semibold text-stone-600">{REPLY_SLOT_LABELS[slot]}</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {character.pieces[slot].map((piece) => (
                    <li key={piece}>
                      <button type="button" className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1 text-left text-xs hover:bg-brand-100" onClick={() => add(piece)}>
                        {piece}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
      <textarea
        className="input min-h-32 text-sm"
        name="content"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={character ? `${character.name}가 되어 쓰는 답장이에요.` : "잘한 점과 다음에 생각해 볼 점을 적어 주세요."}
      />
      <FormMessage state={state} />
      <button className="btn-primary text-sm" disabled={pending}>{character ? `${character.name}의 답장 보내기` : "코멘트 남기기"}</button>
    </form>
  );
}
