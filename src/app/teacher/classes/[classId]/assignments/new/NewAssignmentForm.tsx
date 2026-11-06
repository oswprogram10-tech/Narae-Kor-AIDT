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

interface ActivityOption {
  id: string;
  title: string;
  description: string;
  standardCode: string;
  statement: string;
  itemCount: number;
}

export function NewAssignmentForm({
  classId,
  genres,
  activities: grammarActivities,
  readingActivities,
}: {
  classId: number;
  genres: GenreOption[];
  activities: ActivityOption[];
  readingActivities: ActivityOption[];
}) {
  const [kind, setKind] = useState<"writing" | "grammar" | "reading">("writing");
  const activities = kind === "reading" ? readingActivities : grammarActivities;
  const [activityId, setActivityId] = useState(grammarActivities[0]?.id ?? "");
  const [state, action, pending] = useActionState<FormState, FormData>(createAssignment, {});
  const [genreId, setGenreId] = useState(genres[0]?.id ?? "");
  const genre = genres.find((g) => g.id === genreId);
  const [prompt, setPrompt] = useState(genre?.defaultPrompt ?? "");
  const [title, setTitle] = useState("");

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="kind" value={kind} />
      <div role="group" aria-label="과제 종류" className="flex gap-2">
        {([
          ["writing", "글쓰기 과제"],
          ["grammar", "문법·어휘 활동"],
          ["reading", "읽기 활동"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              if (k !== "writing") setActivityId((k === "reading" ? readingActivities : grammarActivities)[0]?.id ?? "");
            }}
            className={kind === k ? "btn-primary" : "btn-ghost"}
          >
            {label}
          </button>
        ))}
      </div>

      {kind !== "writing" ? (
        <>
          <fieldset className="space-y-2">
            <legend className="label">1. 활동 고르기</legend>
            <div className="grid gap-2">
              {activities.map((x) => (
                <label
                  key={x.id}
                  className={`card flex cursor-pointer gap-3 p-4 ${x.id === activityId ? "border-brand-500 ring-2 ring-brand-100" : ""}`}
                >
                  <input
                    type="radio"
                    name="activityId"
                    value={x.id}
                    checked={x.id === activityId}
                    onChange={() => setActivityId(x.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-semibold">{x.title}</span>
                    <span className="ml-2 text-sm text-stone-500">문제 {x.itemCount}개</span>
                    <span className="block text-sm text-stone-600">{x.description}</span>
                    <span className="mt-1 block text-xs text-stone-500">
                      [{x.standardCode}] {x.statement}
                    </span>
                  </span>
                </label>
              ))}
              {activities.length === 0 && <p className="card text-stone-600">이 학년에 맞는 활동이 아직 없어요.</p>}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="gtitle">2. 과제 제목 (비워 두면 활동 이름을 써요)</label>
            <input className="input" id="gtitle" name="title" placeholder={activities.find((x) => x.id === activityId)?.title} />
          </div>
          <p className="text-sm text-stone-500">
            AI 없이 규칙으로 채점해요. 틀리면 원리와 힌트를 차례로 보여 주고, 학생 기록은 문제별로 남아요.
            {kind === "reading" && " 학생은 지문을 보면서 문제를 풀고, 근거 문장도 함께 골라요."}
          </p>
          <FormMessage state={state} />
          <button className="btn-primary" disabled={pending || activities.length === 0}>과제 만들기</button>
        </>
      ) : (
      <>
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
      </>
      )}
    </form>
  );
}
