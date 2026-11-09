"use client";

import { useActionState, useState } from "react";
import { createAssignment, type FormState } from "@/app/actions/teacher";
import { FormMessage } from "@/components/FormMessage";
import { DEBATE_LIMITS, DEBATE_MOTIONS, DEBATE_STEPS, STEP_SECONDS_MAX, STEP_SECONDS_MIN } from "@/core/speaking";

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
  kind: "cardnews" | "media-diary" | "impression" | "debate" | "interview";
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
  listeningActivities,
  artifactActivities,
}: {
  classId: number;
  genres: GenreOption[];
  activities: ActivityOption[];
  readingActivities: ActivityOption[];
  mediaActivities: ActivityOption[];
  literatureActivities: ActivityOption[];
  listeningActivities: ActivityOption[];
  artifactActivities: ArtifactOption[];
}) {
  const [kind, setKind] = useState<"writing" | "grammar" | "reading" | "media" | "literature" | "listening" | "cardnews" | "media-diary" | "impression" | "debate" | "interview">("writing");
  const activityMap = { grammar: grammarActivities, reading: readingActivities, media: mediaActivities, literature: literatureActivities, listening: listeningActivities };
  const artifact = artifactActivities.find((x) => x.kind === kind);
  const activities = kind === "writing" || artifact ? [] : activityMap[kind as "grammar" | "reading" | "media" | "literature" | "listening"];
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
          ["listening", "듣기 활동"],
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
          {artifact.kind === "debate" && (
            <div className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="label">논제 (찬성·반대로 나뉘는 문장)</legend>
                <div className="grid gap-2">
                  {/* 라디오·입력칸은 폼이 직접 다룬다(오류 뒤 폼이 처음 상태로 돌아가도 화면과 값이 어긋나지 않는다) */}
                  {DEBATE_MOTIONS.map((m, i) => (
                    <label key={m.id} className="card flex cursor-pointer gap-3 p-3 has-[:checked]:border-brand-500 has-[:checked]:ring-2 has-[:checked]:ring-brand-100">
                      <input type="radio" name="motionChoice" value={m.id} defaultChecked={i === 0} className="mt-1" />
                      <span>{m.text}</span>
                    </label>
                  ))}
                  <label className="card flex cursor-pointer gap-3 p-3 has-[:checked]:border-brand-500 has-[:checked]:ring-2 has-[:checked]:ring-brand-100">
                    <input type="radio" name="motionChoice" value="custom" className="mt-1" />
                    <span className="flex-1">
                      <span className="block">직접 쓰기</span>
                      <input
                        className="input mt-1"
                        name="motionCustom"
                        aria-label="논제 직접 쓰기"
                        maxLength={DEBATE_LIMITS.motion}
                        onFocus={(e) => {
                          const radio = e.currentTarget.closest("label")?.querySelector<HTMLInputElement>("input[type=radio]");
                          if (radio) radio.checked = true;
                        }}
                        placeholder={`예: 우리 반은 점심시간에 음악을 틀어야 한다 (${DEBATE_LIMITS.motion}자 안)`}
                      />
                    </span>
                  </label>
                </div>
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="label">단계별 시간 (선택, 비워 두면 기본 시간 · {STEP_SECONDS_MIN}~{STEP_SECONDS_MAX}초)</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DEBATE_STEPS.map((st) => (
                    <label key={st.id} className="flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">
                      <span>{st.label}</span>
                      <span className="flex items-center gap-1">
                        <input
                          className="input w-20 py-1"
                          type="number"
                          inputMode="numeric"
                          name={`sec_${st.id}`}
                          min={STEP_SECONDS_MIN}
                          max={STEP_SECONDS_MAX}
                          placeholder={String(st.seconds)}
                          aria-label={`${st.label} 시간(초)`}
                        />
                        초
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
          <p className="text-sm text-stone-500">
            {artifact.kind === "cardnews"
              ? "정답 채점 없이 단계·스스로 점검·선생님 승인으로 운영해요. 학생이 쓴 모든 글에 위험 신호·개인 정보 점검이 돌아가고, 걸리면 이 화면에 알림이 떠요. 사진은 올리지 않아요."
              : artifact.kind === "impression"
              ? "채점하지 않아요. 학생이 작품에서 고른 문장과 쓴 글을 선생님이 읽고 공유를 승인하면, 같은 문장을 고른 친구끼리 모아 보여요. 친구는 정해 둔 스티커로만 반응하고, 글에는 위험 신호·개인 정보 점검이 돌아가요. 5~6학년 학급에서만 낼 수 있어요."
              : artifact.kind === "debate"
              ? "채점하지 않아요. 학생은 논제에서 내 편을 고르고 논거 나무와 예상 반론을 준비한 뒤 스스로 점검하고 제출해요. 타이머는 학생 기기 안에서만 돌고, 녹음하지 않아요. 글에는 위험 신호·개인 정보 점검이 돌아가고 반 친구와 공유하지 않아요."
              : artifact.kind === "interview"
              ? "채점하지 않아요. 학생은 면담 계획과 질문 3~8개를 만들고 절차 확인표와 스스로 점검을 거쳐 제출해요. 녹음 기능은 없고, 면담할 사람은 이름 대신 하는 일로 적게 안내해요. 반 친구와 공유하지 않아요."
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
            {kind === "listening" && " 모두 직접 지은 대화·발표·연설이고, 기기의 읽어 주기 기능으로 들려줘요(학생의 목소리는 모으지 않아요). 처음에는 글이 숨겨져 있고, 학생은 언제든 '글로 보기'를 눌러도 괜찮아요. 들은 횟수와 글로 본 횟수는 연구용으로만 남아요."}
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
