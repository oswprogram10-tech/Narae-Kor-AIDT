"use client";

import { useActionState, useState } from "react";
import { createAssignment, type FormState } from "@/app/actions/teacher";
import { FormMessage } from "@/components/FormMessage";

interface GenreOption {
  id: string;
  name: string;
  description: string;
  defaultPrompt: string;
  standards: { code: string; statement: string }[];
  organizer: string[];
  rubric: string[];
}

export function NewAssignmentForm({ classId, genres }: { classId: number; genres: GenreOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createAssignment, {});
  const [genreId, setGenreId] = useState(genres[0]?.id ?? "");
  const genre = genres.find((g) => g.id === genreId);
  const [prompt, setPrompt] = useState(genre?.defaultPrompt ?? "");
  const [title, setTitle] = useState("");

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="classId" value={classId} />
      <fieldset className="space-y-2">
        <legend className="label">1. 성취기준과 글의 종류</legend>
        <div className="grid gap-2">
          {genres.map((g) => (
            <label
              key={g.id}
              className={`card flex cursor-pointer gap-3 p-4 ${g.id === genreId ? "border-brand-500 ring-2 ring-brand-100" : ""}`}
            >
              <input
                type="radio"
                name="genreId"
                value={g.id}
                checked={g.id === genreId}
                onChange={() => {
                  setGenreId(g.id);
                  setPrompt(g.defaultPrompt);
                }}
                className="mt-1"
              />
              <span>
                <span className="font-semibold">{g.name}</span>
                <span className="block text-sm text-stone-600">{g.description}</span>
                {g.standards.map((s) => (
                  <span key={s.code} className="mt-1 block text-xs text-stone-500">
                    [{s.code}] {s.statement}
                  </span>
                ))}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="title">2. 과제 제목</label>
        <input
          className="input"
          id="title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={genre?.name}
        />
      </div>
      <div>
        <label className="label" htmlFor="prompt">3. 학생에게 보여 줄 과제 안내</label>
        <textarea className="input min-h-28" id="prompt" name="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </div>

      {genre && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card text-sm">
            <div className="mb-2 font-semibold">학생 계획표 항목</div>
            <ul className="list-disc space-y-1 pl-5 text-stone-600">
              {genre.organizer.map((o) => <li key={o}>{o}</li>)}
            </ul>
          </div>
          <div className="card text-sm">
            <div className="mb-2 font-semibold">평가 기준(3단계)</div>
            <ul className="list-disc space-y-1 pl-5 text-stone-600">
              {genre.rubric.map((o) => <li key={o}>{o}</li>)}
            </ul>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2">
        <input type="checkbox" name="coachEnabled" defaultChecked />
        <span>AI 생각 코치 켜기 <span className="text-sm text-stone-500">(대신 써 주지 않고 질문만 해요)</span></span>
      </label>

      <FormMessage state={state} />
      <button className="btn-primary" disabled={pending}>과제 만들기</button>
    </form>
  );
}
