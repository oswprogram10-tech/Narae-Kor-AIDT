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

interface ArtifactOption {
  kind: "cardnews" | "media-diary" | "impression";
  title: string;
  description: string;
  standardCode: string;
  statement: string;
}

export function NewAssignmentForm({
  classId,
  genres,
  activities: grammarActivities,
  readingActivities,
  mediaActivities,
  literatureActivities,
  artifactActivities,
}: {
  classId: number;
  genres: GenreOption[];
  activities: ActivityOption[];
  readingActivities: ActivityOption[];
  mediaActivities: ActivityOption[];
  literatureActivities: ActivityOption[];
  artifactActivities: ArtifactOption[];
}) {
  const [kind, setKind] = useState<"writing" | "grammar" | "reading" | "media" | "literature" | "cardnews" | "media-diary" | "impression">("writing");
  const activityMap = { grammar: grammarActivities, reading: readingActivities, media: mediaActivities, literature: literatureActivities };
  const artifact = artifactActivities.find((x) => x.kind === kind);
  const activities = kind === "writing" || artifact ? [] : activityMap[kind as "grammar" | "reading" | "media" | "literature"];
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
      <div role="group" aria-label="과제 종류" className="flex flex-wrap gap-2">
        {([
          ["writing", "글쓰기 과제"],
          ["grammar", "문법·어휘 활동"],
          ["reading", "읽기 활동"],
          ["media", "매체 활동"],
          ["literature", "문학 활동"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              if (k !== "writing") setActivityId(activityMap[k][0]?.id ?? "");
            }}
            className={kind === k ? "btn-primary" : "btn-ghost"}
          >
            {label}
          </button>
        ))}
        {artifactActivities.map((x) => (
          <button key={x.kind} type="button" aria-pressed={kind === x.kind} onClick={() => setKind(x.kind)} className={kind === x.kind ? "btn-primary" : "btn-ghost"}>
            {x.title}
          </button>
        ))}
      </div>

      {artifact ? (
        <>
          <div className="card space-y-1 border-brand-500 ring-2 ring-brand-100">
            <div className="font-semibold">{artifact.title}</div>
            <p className="text-sm text-stone-600">{artifact.description}</p>
            <p className="text-xs text-stone-500">[{artifact.standardCode}] {artifact.statement}</p>
          </div>
          <div>
            <label className="label" htmlFor="atitle">과제 제목 (비워 두면 활동 이름을 써요)</label>
            <input className="input" id="atitle" name="title" placeholder={artifact.title} />
          </div>
          <p className="text-sm text-stone-500">
            {artifact.kind === "cardnews"
              ? "정답 채점 없이 단계·스스로 점검·선생님 승인으로 운영해요. 학생이 쓴 모든 글에 위험 신호·개인 정보 점검이 돌아가고, 걸리면 이 화면에 알림이 떠요. 사진은 올리지 않아요."
              : artifact.kind === "impression"
              ? "채점하지 않아요. 학생이 작품에서 고른 문장과 쓴 글을 선생님이 읽고 공유를 승인하면, 같은 문장을 고른 친구끼리 모아 보여요. 친구는 정해 둔 스티커로만 반응하고, 글에는 위험 신호·개인 정보 점검이 돌아가요. 5~6학년 학급에서만 낼 수 있어요."
              : "채점하지 않아요. 선생님은 학생별 요약과 학급 평균만 보고, 학생끼리 공유하지 않아요. 자유로 쓴 글에는 위험 신호·개인 정보 점검이 돌아가요."}
          </p>
          <FormMessage state={state} />
          <button className="btn-primary" disabled={pending}>과제 만들기</button>
        </>
      ) : null}

      {artifact ? null : kind !== "writing" ? (
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
            {kind === "media" && " 모두 연습용 가상 페이지와 가상 검색 결과예요. 학생은 믿을 만한 단서를 찾고, 근거도 함께 골라요."}
            {kind === "literature" && " 모두 직접 지은 동화와 시예요. 마음 온도와 인물 관계는 글 속 근거로 확인할 수 있는 것만 채점하고, 내 한 줄 쓰기는 채점하지 않고 안전 점검만 해요."}
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
