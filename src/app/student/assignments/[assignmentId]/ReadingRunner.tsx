"use client";

import Link from "next/link";
import { useState } from "react";
import type { Passage } from "@/core/reading/types";
import type { ProgressSummary } from "@/lib/grammar-rules";
import type { StudentReadingItem } from "@/lib/reading-rules";

type Answer =
  | { type: "sentence-pick"; sentenceId: string }
  | { type: "label-sentences"; labels: Record<string, string> }
  | { type: "slot-paragraphs"; placement: Record<string, string> }
  | { type: "choice"; option: number }
  | { type: "choice-with-evidence"; option: number; sentenceId: string };

interface Result {
  correct: boolean;
  incomplete?: boolean;
  message?: string;
  rendered: string;
  feedback?: { level: "principle" | "hint1" | "hint2" | "reveal"; message: string; reveal?: { answer: Answer; rendered: string } };
  explanation?: string;
  progress: ProgressSummary;
}

type Notice =
  | { kind: "incomplete"; text: string }
  | { kind: "wrong"; text: string; level: string }
  | { kind: "correct"; text: string; rendered: string }
  | { kind: "reveal"; text: string; rendered: string }
  | { kind: "error"; text: string };

export function ReadingRunner({
  submissionId,
  title,
  isOpen,
  items,
  passages,
  solvedIds,
  initialSummary,
}: {
  submissionId: number;
  title: string;
  isOpen: boolean;
  items: StudentReadingItem[];
  passages: Passage[];
  solvedIds: string[];
  initialSummary: ProgressSummary;
}) {
  const [solved, setSolved] = useState<Set<string>>(() => new Set(solvedIds));
  const [summary, setSummary] = useState(initialSummary);
  const firstOpen = items.findIndex((i) => !solvedIds.includes(i.id));
  const [index, setIndex] = useState(firstOpen === -1 ? items.length : firstOpen);
  const [passageOpen, setPassageOpen] = useState(true);

  const total = items.length;
  const finished = index >= total;
  const current = finished ? null : items[index];
  const passage = current ? passages.find((p) => p.id === current.passageId) : undefined;

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <header className="space-y-2">
        <Link href="/student" className="text-sm text-stone-500 underline">← 목록으로</Link>
        <h1 className="text-xl font-bold">{title}</h1>
        <div className="flex items-center gap-3">
          <div
            className="h-3 flex-1 overflow-hidden rounded-full bg-stone-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={solved.size}
            aria-label="푼 문제"
          >
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${total ? (solved.size / total) * 100 : 0}%` }} />
          </div>
          <span className="text-sm font-semibold text-stone-600">{solved.size}/{total} 문제</span>
        </div>
      </header>

      {finished ? (
        <section className="card mx-auto max-w-2xl space-y-3 text-center" aria-live="polite">
          <h2 className="text-2xl font-bold">끝까지 읽고 풀었어요! 🎉</h2>
          <p className="text-stone-700">풀었어요: <b>{summary.solved}문제</b></p>
          <p className="text-stone-700">한 번에 맞힌 문제: <b>{summary.firstTry}개</b></p>
          <p className="text-stone-700">도움 받아 완료한 문제: <b>{summary.revealed}개</b></p>
          <p className="text-sm text-stone-600">
            {summary.revealed > 0
              ? "힌트를 보면서 끝까지 생각해 본 것도 멋져요. 도움 받은 문제는 다음에 다시 도전해 봐요."
              : "글에서 단서를 찾아 차근차근 잘 풀었어요."}
          </p>
          <Link href="/student" className="btn-primary">목록으로 가기</Link>
        </section>
      ) : !isOpen ? (
        <p className="card text-center">선생님이 이 과제를 닫았어요.</p>
      ) : (
        <ItemView
          key={current!.id}
          item={current!}
          passage={passage}
          passageOpen={passageOpen}
          onTogglePassage={() => setPassageOpen((o) => !o)}
          submissionId={submissionId}
          isLast={index === total - 1}
          onSolved={(s) => {
            setSolved((prev) => new Set(prev).add(current!.id));
            setSummary(s);
          }}
          onNext={() => setIndex((i) => i + 1)}
        />
      )}
    </main>
  );
}

const btn =
  "min-h-11 min-w-11 rounded-xl border px-4 py-2 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-70";

function ItemView({
  item,
  passage,
  passageOpen,
  onTogglePassage,
  submissionId,
  isLast,
  onSolved,
  onNext,
}: {
  item: StudentReadingItem;
  passage: Passage | undefined;
  passageOpen: boolean;
  onTogglePassage: () => void;
  submissionId: number;
  isLast: boolean;
  onSolved: (s: ProgressSummary) => void;
  onNext: () => void;
}) {
  const [sentenceId, setSentenceId] = useState<string | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [placement, setPlacement] = useState<Record<string, string>>({});
  const [heldParagraph, setHeldParagraph] = useState<string | null>(null);
  const [option, setOption] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const locked = busy || done;

  const sentenceText = (id: string) => passage?.paragraphs.flatMap((p) => p.sentences).find((s) => s.id === id)?.text ?? "";
  const paragraphNo = (pid: string) => (passage?.paragraphs.findIndex((p) => p.id === pid) ?? -1) + 1;

  const ready =
    item.type === "sentence-pick"
      ? sentenceId !== null
      : item.type === "label-sentences"
        ? item.sentenceIds.every((id) => labels[id] !== undefined)
        : item.type === "slot-paragraphs"
          ? item.paragraphIds.every((id) => placement[id] !== undefined)
          : item.type === "choice"
            ? option !== null
            : option !== null && sentenceId !== null;

  // 지문에서 문장을 눌러 고를 수 있는 문제만 문장이 버튼이 된다.
  const picking = item.type === "sentence-pick" || item.type === "choice-with-evidence";
  const scope = item.type === "sentence-pick" ? item.paragraphId : undefined;
  const marked = new Set<string>(sentenceId ? [sentenceId] : []);
  const targets = new Map<string, number>(item.type === "label-sentences" ? item.sentenceIds.map((id, i) => [id, i + 1]) : []);
  const heldParagraphs = new Set<string>(heldParagraph ? [heldParagraph] : []);

  function applyReveal(a: Answer | undefined) {
    if (!a) return;
    if (a.type === "sentence-pick") setSentenceId(a.sentenceId);
    if (a.type === "label-sentences") setLabels(a.labels);
    if (a.type === "slot-paragraphs") setPlacement(a.placement);
    if (a.type === "choice") setOption(a.option);
    if (a.type === "choice-with-evidence") {
      setOption(a.option);
      setSentenceId(a.sentenceId);
    }
  }

  async function check() {
    if (!ready || locked) return;
    const answer: Answer =
      item.type === "sentence-pick"
        ? { type: "sentence-pick", sentenceId: sentenceId! }
        : item.type === "label-sentences"
          ? { type: "label-sentences", labels }
          : item.type === "slot-paragraphs"
            ? { type: "slot-paragraphs", placement }
            : item.type === "choice"
              ? { type: "choice", option: option! }
              : { type: "choice-with-evidence", option: option!, sentenceId: sentenceId! };
    setBusy(true);
    try {
      const res = await fetch(`/api/reading/${submissionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, answer }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string };
      if (!res.ok || data.progress === undefined) {
        setNotice({ kind: "error", text: data.error ?? "잠시 뒤에 다시 눌러 주세요." });
        return;
      }
      const r = data as Result;
      if (r.incomplete) {
        setNotice({ kind: "incomplete", text: r.message ?? "아직 다 고르지 않았어요." });
      } else if (r.correct) {
        setNotice({ kind: "correct", text: r.explanation ?? "", rendered: r.rendered });
        setDone(true);
        onSolved(r.progress);
      } else if (r.feedback?.level === "reveal") {
        applyReveal(r.feedback.reveal?.answer);
        setNotice({ kind: "reveal", text: r.explanation ?? r.feedback.message, rendered: r.feedback.reveal?.rendered ?? "" });
        setDone(true);
        onSolved(r.progress);
      } else {
        setNotice({ kind: "wrong", text: r.feedback?.message ?? "", level: r.feedback?.level ?? "principle" });
      }
    } catch {
      setNotice({ kind: "error", text: "인터넷이 잠깐 끊겼어요. 다시 눌러 주세요." });
    } finally {
      setBusy(false);
    }
  }

  const optionList = (options: string[]) => (
    <ul aria-label="보기" className="grid gap-2">
      {options.map((o, i) => (
        <li key={i}>
          <button
            type="button"
            disabled={locked}
            aria-pressed={option === i}
            onClick={() => setOption(i)}
            className={`${btn} w-full text-left ${option === i ? "border-sun-400 bg-sun-100" : "border-black/15 bg-white hover:bg-stone-50"}`}
          >
            {o}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {passage && (
        <PassagePanel
          passage={passage}
          open={passageOpen}
          onToggle={onTogglePassage}
          picking={picking && !locked}
          scopeParagraphId={scope}
          selected={marked}
          done={done}
          targets={targets}
          heldParagraphs={heldParagraphs}
          onPick={(id) => setSentenceId(id)}
        />
      )}

      <section className="card space-y-5">
        <p className="text-lg font-semibold">{item.prompt}</p>

        {item.type === "sentence-pick" && (
          <p className="rounded-xl bg-stone-50 p-3 text-stone-700" aria-live="polite">
            {sentenceId ? (
              <>
                <span className="mr-2 text-sm text-stone-500">내가 고른 문장</span>
                {sentenceText(sentenceId)}
              </>
            ) : (
              <span className="text-stone-500">
                {scope ? `${paragraphNo(scope)}문단` : "지문"}에서 문장을 눌러 골라요.
              </span>
            )}
          </p>
        )}

        {item.type === "label-sentences" && (
          <ol aria-label="꼬리표 달기" className="space-y-3">
            {item.sentenceIds.map((id, i) => (
              <li key={id} role="group" aria-label={`문장 ${i + 1} 꼬리표`} className="space-y-2 rounded-xl bg-stone-50 p-3">
                <p className="text-base leading-relaxed">
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                    {i + 1}
                  </span>
                  {sentenceText(id)}
                </p>
                <div className="flex gap-2">
                  {item.labels.map((l) => (
                    <button
                      key={l}
                      type="button"
                      disabled={locked}
                      aria-pressed={labels[id] === l}
                      onClick={() => setLabels((prev) => ({ ...prev, [id]: l }))}
                      className={`${btn} flex-1 text-lg ${
                        labels[id] === l ? "border-brand-500 bg-brand-100 text-brand-700" : "border-black/15 bg-white hover:bg-stone-50"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}

        {item.type === "slot-paragraphs" && (
          <div className="space-y-4">
            <div>
              <div className="label">문단 (눌러서 고르고, 아래 칸에 놓아요)</div>
              <ul aria-label="문단 모음" className="flex min-h-12 flex-wrap gap-2">
                {item.paragraphIds
                  .filter((pid) => placement[pid] === undefined)
                  .map((pid) => (
                    <li key={pid}>
                      <button
                        type="button"
                        disabled={locked}
                        aria-pressed={heldParagraph === pid}
                        onClick={() => setHeldParagraph((h) => (h === pid ? null : pid))}
                        className={`${btn} ${heldParagraph === pid ? "border-sun-400 bg-sun-100" : "border-black/15 bg-white hover:bg-stone-50"}`}
                      >
                        {paragraphNo(pid)}문단
                      </button>
                    </li>
                  ))}
                {item.paragraphIds.every((pid) => placement[pid] !== undefined) && (
                  <li className="text-sm text-stone-500">문단을 모두 놓았어요.</li>
                )}
              </ul>
            </div>
            <ul aria-label="짜임 칸" className="grid gap-3">
              {item.slots.map((slot) => {
                const placed = item.paragraphIds.filter((pid) => placement[pid] === slot.id);
                return (
                  <li key={slot.id} className="rounded-xl border-2 border-dashed border-brand-200 bg-brand-50 p-3">
                    <div className="mb-2 font-semibold text-brand-700">{slot.label}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {placed.map((pid) => (
                        <button
                          key={pid}
                          type="button"
                          disabled={locked}
                          onClick={() =>
                            setPlacement((prev) => {
                              const next = { ...prev };
                              delete next[pid];
                              return next;
                            })
                          }
                          aria-label={`${paragraphNo(pid)}문단, 누르면 문단 모음으로 돌아가요`}
                          className={`${btn} border-brand-500 bg-white text-brand-700 hover:bg-brand-50`}
                        >
                          {paragraphNo(pid)}문단
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={locked || heldParagraph === null}
                        onClick={() => {
                          if (heldParagraph === null) return;
                          setPlacement((prev) => ({ ...prev, [heldParagraph]: slot.id }));
                          setHeldParagraph(null);
                        }}
                        aria-label={`${slot.label} 칸에 놓기`}
                        className={`${btn} border-black/15 bg-white text-stone-600 hover:bg-stone-50`}
                      >
                        {heldParagraph === null ? "문단을 먼저 골라요" : `${paragraphNo(heldParagraph)}문단 여기에 놓기`}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {item.type === "choice" && (
          <div>
            <div className="label">알맞은 것을 눌러 보세요</div>
            {optionList(item.options)}
          </div>
        )}

        {item.type === "choice-with-evidence" && (
          <div className="space-y-4">
            <div>
              <div className="label">1. 알맞은 것을 눌러 보세요</div>
              {optionList(item.options)}
            </div>
            <div>
              <div className="label">2. 그렇게 생각한 문장을 지문에서 눌러 보세요</div>
              <p className="rounded-xl bg-stone-50 p-3 text-stone-700" aria-live="polite">
                {sentenceId ? (
                  <>
                    <span className="mr-2 text-sm text-stone-500">근거로 고른 문장</span>
                    {sentenceText(sentenceId)}
                  </>
                ) : (
                  <span className="text-stone-500">아직 고르지 않았어요.</span>
                )}
              </p>
            </div>
          </div>
        )}

        <div aria-live="polite" className="space-y-2">
          {notice?.kind === "incomplete" && (
            <p className="rounded-xl border border-stone-300 bg-stone-50 p-3 text-stone-800">{notice.text}</p>
          )}
          {notice?.kind === "wrong" && (
            <p className="rounded-xl border border-sun-400 bg-sun-100 p-3 text-stone-800">
              <b className="block">{notice.level === "principle" ? "한 번 더 생각해 봐요." : "힌트를 드릴게요."}</b>
              {notice.text}
            </p>
          )}
          {notice?.kind === "correct" && (
            <p className="rounded-xl border border-brand-500 bg-brand-50 p-3 text-brand-700">
              <b className="block">정답이에요! ✓</b>
              {notice.text}
            </p>
          )}
          {notice?.kind === "reveal" && (
            <p className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-stone-800">
              <b className="block">도움 받아 완료했어요.</b>
              {notice.rendered && <span className="block whitespace-pre-line text-base font-semibold">{notice.rendered}</span>}
              {notice.text}
            </p>
          )}
          {notice?.kind === "error" && (
            <p role="alert" className="rounded-xl border border-black/10 bg-stone-50 p-3 text-stone-700">{notice.text}</p>
          )}
        </div>

        <div className="flex justify-end">
          {done ? (
            <button type="button" className="btn-primary min-h-11" onClick={onNext}>
              {isLast ? "결과 보기" : "다음 문제"}
            </button>
          ) : (
            <button type="button" className="btn-primary min-h-11" disabled={!ready || busy} onClick={check}>
              {busy ? "확인하는 중…" : "확인"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function PassagePanel({
  passage,
  open,
  onToggle,
  picking,
  scopeParagraphId,
  selected,
  done,
  targets,
  heldParagraphs,
  onPick,
}: {
  passage: Passage;
  open: boolean;
  onToggle: () => void;
  picking: boolean;
  scopeParagraphId?: string;
  selected: Set<string>;
  done: boolean;
  targets: Map<string, number>;
  heldParagraphs: Set<string>;
  onPick: (sentenceId: string) => void;
}) {
  return (
    <section
      aria-label="지문"
      className="sticky top-0 z-10 -mx-4 border-b border-black/10 bg-white px-4 py-2 shadow-sm lg:top-4 lg:mx-0 lg:rounded-2xl lg:border lg:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">📖 {passage.title}</h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="min-h-11 rounded-xl border border-black/15 px-3 text-sm font-semibold lg:hidden"
        >
          {open ? "지문 접기" : "지문 펴기"}
        </button>
      </div>
      <div
        className={`${open ? "" : "hidden lg:block"} mt-2 max-h-[40vh] space-y-3 overflow-y-auto pr-1 text-[18px] leading-[1.8] lg:max-h-[calc(100vh-8rem)]`}
      >
        {passage.paragraphs.map((p, pi) => {
          const allowed = picking && (!scopeParagraphId || scopeParagraphId === p.id);
          const scoped = picking && scopeParagraphId === p.id;
          const dimmed = picking && !!scopeParagraphId && scopeParagraphId !== p.id;
          return (
            <div
              key={p.id}
              role="group"
              aria-label={`${pi + 1}문단`}
              className={`flex gap-2 rounded-lg p-1 ${dimmed ? "opacity-50" : ""} ${
                scoped || heldParagraphs.has(p.id) ? "bg-sun-100/60 ring-2 ring-sun-400" : ""
              }`}
            >
              <span
                aria-hidden="true"
                className="mt-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-bold text-stone-700"
              >
                {pi + 1}
              </span>
              {allowed ? (
                <div className="min-w-0 flex-1">
                  {p.sentences.map((s) => {
                    const on = selected.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        data-sentence={s.id}
                        aria-pressed={on}
                        onClick={() => onPick(s.id)}
                        className={`my-0.5 block min-h-11 w-full rounded-lg border px-2 py-1 text-left ${
                          on ? "border-sun-400 bg-sun-100 font-semibold" : "border-transparent hover:bg-stone-100"
                        }`}
                      >
                        {s.text}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="min-w-0 flex-1">
                  {p.sentences.map((s) => {
                    const on = selected.has(s.id);
                    const n = targets.get(s.id);
                    return (
                      <span
                        key={s.id}
                        data-sentence={s.id}
                        className={`${on ? (done ? "rounded bg-brand-100 font-semibold" : "rounded bg-sun-100 font-semibold") : ""} ${
                          n ? "underline decoration-brand-500 decoration-2 underline-offset-4" : ""
                        }`}
                      >
                        {n && (
                          <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 align-middle text-xs font-bold text-brand-700">
                            {n}
                          </span>
                        )}
                        {s.text}{" "}
                      </span>
                    );
                  })}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
