"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REVISION_LENSES, STAGES, STAGE_LABELS, type LensKey, type OrganizerField, type Stage } from "@/core/data/genres";
import { lintKorean } from "@/core/lint";

export interface CoachMessageView {
  id: number;
  role: "student" | "coach";
  content: string;
  stage: string;
  highlights: { quote: string; lens: string; note: string }[];
}

interface Props {
  submissionId: number;
  assignment: { title: string; prompt: string; organizer: OrganizerField[]; coachEnabled: boolean; isOpen: boolean };
  initial: { stage: Stage; status: string; brainstorm: string; organizerValues: Record<string, string>; draft: string };
  comments: { id: number; content: string }[];
  messages: CoachMessageView[];
}

type SaveState = "saved" | "dirty" | "saving" | "error";

const STAGE_GUIDE: Record<Stage, string> = {
  brainstorm: "주제와 관련해 떠오르는 낱말, 장면, 경험을 자유롭게 적어요. 문장이 아니어도 괜찮아요.",
  plan: "계획표의 칸을 채우며 쓸 내용을 정리해요. 칸마다 있는 질문을 참고하세요.",
  draft: "계획표를 보면서 내 말로 글을 써요. 완벽하지 않아도 괜찮아요. 고쳐 쓰기 단계가 있으니까요!",
  revise: "렌즈를 하나씩 골라 내 글을 살펴보고 직접 고쳐요. 다 고쳤으면 제출해요.",
};

export function Workbench({ submissionId, assignment, initial, comments, messages: initialMessages }: Props) {
  const [stage, setStage] = useState<Stage>(initial.stage);
  const [status, setStatus] = useState(initial.status);
  const [brainstorm, setBrainstorm] = useState(initial.brainstorm);
  const [organizerValues, setOrganizerValues] = useState<Record<string, string>>(initial.organizerValues);
  const [draft, setDraft] = useState(initial.draft);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [lens, setLens] = useState<LensKey>("whole");

  const readOnly = status === "submitted" || !assignment.isOpen;
  const pending = useRef<Record<string, unknown>>({});
  const pasteChars = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const body = { ...pending.current };
    if (pasteChars.current > 0) body.pasteChars = pasteChars.current;
    if (Object.keys(body).length === 0) return true;
    pending.current = {};
    pasteChars.current = 0;
    setSaveState("saving");
    try {
      const res = await fetch(`/api/submissions/${submissionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setSaveError(data.error ?? "저장하지 못했어요.");
        setSaveState("error");
        // 실패한 내용은 다음 저장 때 다시 보낸다.
        pending.current = { ...body, ...pending.current };
        return false;
      }
      setSaveState(Object.keys(pending.current).length ? "dirty" : "saved");
      setSaveError("");
      return true;
    } catch {
      pending.current = { ...body, ...pending.current };
      setSaveState("error");
      setSaveError("인터넷 연결을 확인해 주세요. 글은 화면에 그대로 있어요.");
      return false;
    }
  }, [submissionId]);

  const queue = useCallback(
    (patch: Record<string, unknown>, immediate = false) => {
      pending.current = { ...pending.current, ...patch };
      setSaveState("dirty");
      if (timer.current) clearTimeout(timer.current);
      if (immediate) void flush();
      else timer.current = setTimeout(() => void flush(), 1200);
    },
    [flush],
  );

  useEffect(() => {
    const onLeave = () => {
      if (Object.keys(pending.current).length) void flush();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [flush]);

  const onPaste = (e: React.ClipboardEvent) => {
    const n = e.clipboardData.getData("text").length;
    if (n > 0) pasteChars.current += n;
  };

  function goStage(next: Stage) {
    if (next === stage) return;
    setStage(next);
    if (!readOnly) queue({ stage: next }, true);
  }

  async function submit() {
    if (!confirm("소리 내어 한 번 더 읽어 보았나요? 제출하면 선생님이 돌려주기 전까지 고칠 수 없어요.")) return;
    const ok = await flush();
    if (!ok) return;
    const res = await fetch(`/api/submissions/${submissionId}/submit`, { method: "POST" });
    if (res.ok) setStatus("submitted");
    else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      alert(data.error ?? "제출하지 못했어요.");
    }
  }

  const stageIndex = STAGES.indexOf(stage);
  const latestRevise = [...messages].reverse().find((m) => m.role === "coach" && m.stage === "revise" && m.highlights.length);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/student" className="text-sm text-stone-500 underline">← 목록</Link>
          <h1 className="font-bold">{assignment.title}</h1>
          <span className="ml-auto text-xs text-stone-500" aria-live="polite">
            {readOnly
              ? status === "submitted"
                ? "제출했어요 ✓"
                : "과제가 닫혔어요"
              : saveState === "saved"
                ? "저장됨"
                : saveState === "saving"
                  ? "저장 중…"
                  : saveState === "dirty"
                    ? "작성 중"
                    : saveError}
          </span>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-3" aria-label="글쓰기 단계">
          {STAGES.map((s, i) => (
            <button
              key={s}
              onClick={() => goStage(s)}
              aria-current={s === stage ? "step" : undefined}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                s === stage ? "bg-brand-600 text-white" : i < stageIndex ? "bg-brand-100 text-brand-700" : "bg-stone-100 text-stone-600"
              }`}
            >
              {STAGE_LABELS[s]}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_360px]">
        <main className="space-y-4">
          {comments.length > 0 && (
            <section className="rounded-2xl border border-sun-400/40 bg-sun-100 p-4">
              <h2 className="mb-1 font-bold">💬 선생님 코멘트</h2>
              {comments.map((c) => (
                <p key={c.id} className="whitespace-pre-wrap">{c.content}</p>
              ))}
            </section>
          )}
          <section className="card">
            <p className="text-sm font-semibold text-brand-700">과제</p>
            <p className="mt-1 text-lg">{assignment.prompt}</p>
            <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">{STAGE_GUIDE[stage]}</p>
          </section>

          {stage === "brainstorm" && (
            <section className="card">
              <label className="label" htmlFor="brainstorm">생각 메모</label>
              <textarea
                id="brainstorm"
                className="input min-h-64 text-lg leading-8"
                value={brainstorm}
                readOnly={readOnly}
                onPaste={onPaste}
                onChange={(e) => {
                  setBrainstorm(e.target.value);
                  queue({ brainstorm: e.target.value });
                }}
                placeholder="예: 바다, 수박, 할머니 댁, 매미 소리…"
              />
            </section>
          )}

          {stage === "plan" && (
            <section className="card space-y-4">
              {assignment.organizer.map((f) => (
                <div key={f.key}>
                  <label className="label" htmlFor={`org-${f.key}`}>{f.label}</label>
                  <p className="mb-1 text-sm text-stone-500">{f.hint}</p>
                  {f.multiline ? (
                    <textarea
                      id={`org-${f.key}`}
                      className="input min-h-20 text-lg"
                      value={organizerValues[f.key] ?? ""}
                      readOnly={readOnly}
                      onPaste={onPaste}
                      onChange={(e) => {
                        const v = { ...organizerValues, [f.key]: e.target.value };
                        setOrganizerValues(v);
                        queue({ organizerValues: v });
                      }}
                    />
                  ) : (
                    <input
                      id={`org-${f.key}`}
                      className="input text-lg"
                      value={organizerValues[f.key] ?? ""}
                      readOnly={readOnly}
                      onPaste={onPaste}
                      onChange={(e) => {
                        const v = { ...organizerValues, [f.key]: e.target.value };
                        setOrganizerValues(v);
                        queue({ organizerValues: v });
                      }}
                    />
                  )}
                </div>
              ))}
            </section>
          )}

          {(stage === "draft" || stage === "revise") && (
            <>
              {stage === "draft" && (
                <details className="card" open>
                  <summary className="cursor-pointer font-semibold">내 계획표 보기</summary>
                  <dl className="mt-3 grid gap-2 text-sm">
                    {assignment.organizer.map((f) => (
                      <div key={f.key} className="grid gap-1 sm:grid-cols-[140px_1fr]">
                        <dt className="font-semibold text-stone-600">{f.label}</dt>
                        <dd className="whitespace-pre-wrap">{organizerValues[f.key] || <span className="text-stone-400">(빈칸)</span>}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
              {stage === "revise" && (
                <RevisePanel
                  draft={draft}
                  lens={lens}
                  setLens={setLens}
                  coachHighlights={latestRevise?.highlights ?? []}
                  onSelect={(start, end) => {
                    const ta = draftRef.current;
                    if (!ta) return;
                    ta.focus();
                    ta.setSelectionRange(start, end);
                  }}
                />
              )}
              <section className="card">
                <label className="label" htmlFor="draft">{stage === "draft" ? "초고" : "고쳐 쓰기"}</label>
                <textarea
                  id="draft"
                  ref={draftRef}
                  className="input min-h-96 text-lg leading-9"
                  value={draft}
                  readOnly={readOnly}
                  onPaste={onPaste}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    queue({ draft: e.target.value });
                  }}
                />
                <div className="mt-2 flex items-center justify-between text-sm text-stone-500">
                  <span>공백 제외 {draft.replace(/\s/g, "").length}자</span>
                  {stage === "draft" && !readOnly && (
                    <button className="btn-ghost text-sm" onClick={() => goStage("revise")}>고쳐 쓰기로 →</button>
                  )}
                  {stage === "revise" && !readOnly && (
                    <button className="btn-primary" onClick={submit} disabled={!draft.trim()}>제출하기</button>
                  )}
                </div>
              </section>
            </>
          )}

          {stage !== "revise" && stage !== "draft" && !readOnly && (
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => goStage(STAGES[stageIndex + 1])}>
                다음: {STAGE_LABELS[STAGES[stageIndex + 1]]} →
              </button>
            </div>
          )}
        </main>

        <CoachPanel
          submissionId={submissionId}
          enabled={assignment.coachEnabled && !readOnly}
          stage={stage}
          lens={stage === "revise" ? lens : undefined}
          messages={messages}
          setMessages={setMessages}
          beforeAsk={flush}
        />
      </div>
    </div>
  );
}

function RevisePanel({
  draft,
  lens,
  setLens,
  coachHighlights,
  onSelect,
}: {
  draft: string;
  lens: LensKey;
  setLens: (l: LensKey) => void;
  coachHighlights: CoachMessageView["highlights"];
  onSelect: (start: number, end: number) => void;
}) {
  const findings = useMemo(() => lintKorean(draft), [draft]);
  const current = REVISION_LENSES.find((l) => l.key === lens)!;
  const items = [
    ...findings
      .filter((f) => f.lens === lens)
      .map((f) => ({ start: f.start, end: f.end, note: f.message, source: "점검기" as const })),
    ...coachHighlights
      .filter((h) => h.lens === lens)
      .map((h) => {
        const start = draft.indexOf(h.quote);
        return start < 0 ? null : { start, end: start + h.quote.length, note: h.note, source: "코치" as const };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  ].sort((a, b) => a.start - b.start);

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="고쳐 쓰기 렌즈">
        {REVISION_LENSES.map((l) => (
          <button
            key={l.key}
            role="tab"
            aria-selected={l.key === lens}
            onClick={() => setLens(l.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${l.key === lens ? "bg-brand-600 text-white" : "bg-stone-100"}`}
          >
            🔍 {l.label}
          </button>
        ))}
      </div>
      <p className="font-semibold">{current.question}</p>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i}>
              <button
                onClick={() => onSelect(it.start, it.end)}
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-left hover:bg-stone-50"
              >
                <mark className="rounded bg-sun-100 px-1">{draft.slice(it.start, it.end)}</mark>
                <span className="ml-2 text-xs text-stone-500">{it.source}</span>
                <span className="mt-1 block text-sm text-stone-700">{it.note}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-500">
          {lens === "whole" || lens === "paragraph"
            ? "이 렌즈는 스스로 읽으며 살펴봐요. 코치에게 ‘도움 요청’을 하면 살펴볼 곳을 짚어 줄 거예요."
            : "점검기가 찾은 곳이 없어요. 그래도 소리 내어 읽으며 한 번 더 살펴봐요."}
        </p>
      )}
    </section>
  );
}

function CoachPanel({
  submissionId,
  enabled,
  stage,
  lens,
  messages,
  setMessages,
  beforeAsk,
}: {
  submissionId: number;
  enabled: boolean;
  stage: Stage;
  lens?: LensKey;
  messages: CoachMessageView[];
  setMessages: React.Dispatch<React.SetStateAction<CoachMessageView[]>>;
  beforeAsk: () => Promise<boolean>;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function ask(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    await beforeAsk(); // 코치가 최신 글을 보도록 먼저 저장
    try {
      const res = await fetch(`/api/submissions/${submissionId}/coach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, lens }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "코치가 대답하지 못했어요.");
      } else {
        setMessages((m) => [
          ...m,
          { ...data.student, highlights: [] },
          { id: data.coach.id, role: "coach", content: data.coach.content, stage: data.coach.stage, highlights: data.coach.highlights },
        ]);
        setInput("");
      }
    } catch {
      setError("인터넷 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="card flex h-fit flex-col gap-3 lg:sticky lg:top-32">
      <div>
        <h2 className="font-bold">🤖 생각 코치</h2>
        <p className="text-xs text-stone-500">코치는 글을 대신 써 주지 않아요. 질문으로 생각을 꺼내도록 도와줘요.</p>
      </div>
      <ol ref={listRef} className="max-h-[50vh] space-y-2 overflow-y-auto pr-1" aria-live="polite">
        {messages.length === 0 && <li className="text-sm text-stone-500">막히면 ‘도움 요청’을 눌러 보세요.</li>}
        {messages.map((m) => (
          <li
            key={m.id}
            className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-[15px] leading-7 ${
              m.role === "student" ? "ml-8 bg-stone-100" : "mr-4 bg-brand-50"
            }`}
          >
            {m.content}
          </li>
        ))}
      </ol>
      {enabled ? (
        <form onSubmit={ask} className="space-y-2">
          <textarea
            className="input min-h-16 text-base"
            value={input}
            maxLength={500}
            onChange={(e) => setInput(e.target.value)}
            placeholder={stage === "revise" ? "어디를 고치면 좋을지 물어보세요" : "궁금한 점이나 막힌 곳을 적어도 돼요(선택)"}
          />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "코치가 생각 중…" : input.trim() ? "코치에게 묻기" : "도움 요청"}
          </button>
        </form>
      ) : (
        <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-500">지금은 코치를 쓸 수 없어요.</p>
      )}
    </aside>
  );
}
