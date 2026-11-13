"use client";

import Link from "next/link";
import { useState } from "react";
import { AWKWARD_MESSAGE } from "@/core/grammar/grade";
import type { StudentItem, ProgressSummary } from "@/lib/grammar-rules";

type Answer =
  | { type: "sentence-build"; order: string[] }
  | { type: "agreement-fix"; index: number; option: number }
  | { type: "choice"; option: number };

interface Result {
  correct: boolean;
  awkward?: boolean;
  message?: string;
  rendered: string;
  feedback?: { level: "principle" | "hint1" | "hint2" | "reveal"; message: string; reveal?: { answer: Answer; rendered: string } };
  explanation?: string;
  progress: ProgressSummary;
}

type Notice =
  | { kind: "awkward"; text: string }
  | { kind: "wrong"; text: string; level: string }
  | { kind: "correct"; text: string; rendered: string }
  | { kind: "reveal"; text: string; rendered: string }
  | { kind: "error"; text: string };

export function GrammarRunner({
  submissionId,
  title,
  isOpen,
  items,
  solvedIds,
  initialSummary,
}: {
  submissionId: number;
  title: string;
  isOpen: boolean;
  items: StudentItem[];
  solvedIds: string[];
  initialSummary: ProgressSummary;
}) {
  const [solved, setSolved] = useState<Set<string>>(() => new Set(solvedIds));
  const [summary, setSummary] = useState(initialSummary);
  const firstOpen = items.findIndex((i) => !solvedIds.includes(i.id));
  const [index, setIndex] = useState(firstOpen === -1 ? items.length : firstOpen);

  const total = items.length;
  const finished = index >= total;

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
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
        <section className="card space-y-3 text-center" aria-live="polite">
          <h2 className="text-2xl font-bold">끝까지 해냈어요! 🎉</h2>
          <p className="text-stone-700">풀었어요: <b>{summary.solved}문제</b></p>
          <p className="text-stone-700">한 번에 맞힌 문제: <b>{summary.firstTry}개</b></p>
          <p className="text-stone-700">도움 받아 완료한 문제: <b>{summary.revealed}개</b></p>
          <p className="text-sm text-stone-600">
            {summary.revealed > 0
              ? "힌트를 보면서 끝까지 생각해 본 것도 멋져요. 도움 받은 문제는 다음에 다시 도전해 봐요."
              : "차근차근 생각해서 잘 풀었어요."}
          </p>
          <Link href="/student" className="btn-primary">목록으로 가기</Link>
        </section>
      ) : !isOpen ? (
        <p className="card text-center">선생님이 이 과제를 닫았어요.</p>
      ) : (
        <ItemView
          key={items[index].id}
          item={items[index]}
          submissionId={submissionId}
          isLast={index === total - 1}
          onSolved={(s) => {
            setSolved((prev) => new Set(prev).add(items[index].id));
            setSummary(s);
          }}
          onNext={() => setIndex((i) => i + 1)}
        />
      )}
    </main>
  );
}

function ItemView({
  item,
  submissionId,
  isLast,
  onSolved,
  onNext,
}: {
  item: StudentItem;
  submissionId: number;
  isLast: boolean;
  onSolved: (s: ProgressSummary) => void;
  onNext: () => void;
}) {
  const [order, setOrder] = useState<string[]>([]);
  const [tokenIndex, setTokenIndex] = useState<number | null>(null);
  const [option, setOption] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const blocks = item.type === "sentence-build" ? item.blocks : [];
  const text = (id: string) => blocks.find((b) => b.id === id)?.text ?? "";
  const tray = blocks.filter((b) => !order.includes(b.id));
  const ready =
    item.type === "sentence-build" ? tray.length === 0 : item.type === "choice" ? option !== null : tokenIndex !== null && option !== null;
  const locked = busy || done;

  async function check() {
    if (!ready || locked) return;
    const answer: Answer =
      item.type === "sentence-build"
        ? { type: "sentence-build", order }
        : item.type === "choice"
          ? { type: "choice", option: option! }
          : { type: "agreement-fix", index: tokenIndex!, option: option! };
    setBusy(true);
    try {
      const res = await fetch(`/api/grammar/${submissionId}/answer`, {
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
      if (r.awkward) {
        setNotice({ kind: "awkward", text: r.message ?? AWKWARD_MESSAGE });
      } else if (r.correct) {
        setNotice({ kind: "correct", text: r.explanation ?? "", rendered: r.rendered });
        setDone(true);
        onSolved(r.progress);
      } else if (r.feedback?.level === "reveal") {
        const rev = r.feedback.reveal;
        const ra = rev?.answer;
        if (ra?.type === "sentence-build") setOrder(ra.order);
        if (ra?.type === "agreement-fix") {
          setTokenIndex(ra.index);
          setOption(ra.option);
        }
        if (ra?.type === "choice") setOption(ra.option);
        setNotice({ kind: "reveal", text: r.explanation ?? r.feedback.message, rendered: rev?.rendered ?? "" });
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

  const blockBtn =
    "min-h-11 min-w-11 rounded-xl border px-4 py-2 text-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-70";

  return (
    <section className="card space-y-5">
      <p className="text-lg font-semibold">{item.prompt}</p>

      {item.type === "sentence-build" ? (
        <div className="space-y-4">
          <div>
            <div className="label">문장 줄 (눌러서 빼요)</div>
            <ol
              aria-label="문장 줄"
              className="flex min-h-16 flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50 p-3"
            >
              {order.length === 0 && <li className="text-sm text-stone-500">아래 낱말 블록을 눌러 여기에 놓아요.</li>}
              {order.map((id, i) => (
                <li key={id}>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      setOrder((o) => o.filter((x) => x !== id));
                    }}
                    aria-label={`문장 ${i + 1}번째 ${text(id)}, 누르면 블록 모음으로 돌아가요`}
                    className={`${blockBtn} border-brand-500 bg-white text-brand-700 hover:bg-brand-50`}
                  >
                    {text(id)}
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <div className="label">낱말 블록 (눌러서 놓아요)</div>
            <ul aria-label="낱말 블록" className="flex min-h-14 flex-wrap gap-2">
              {tray.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setOrder((o) => [...o, b.id])}
                    className={`${blockBtn} border-black/15 bg-white hover:bg-stone-50`}
                  >
                    {b.text}
                  </button>
                </li>
              ))}
              {tray.length === 0 && <li className="text-sm text-stone-500">블록을 모두 놓았어요.</li>}
            </ul>
          </div>
          <p className="rounded-xl bg-stone-50 p-3 text-lg" aria-live="polite">
            <span className="mr-2 text-sm text-stone-500">내가 만든 문장</span>
            {order.length ? `${order.map(text).join(" ")}.` : <span className="text-stone-400">아직 없어요</span>}
          </p>
        </div>
      ) : item.type === "choice" ? (
        <div className="space-y-4">
          {item.context && (
            <p className="rounded-xl bg-stone-50 p-4 text-lg leading-relaxed" aria-label="문장">
              <Marked text={item.context} target={item.target} />
            </p>
          )}
          <div>
            <div className="label">알맞은 것을 눌러 보세요</div>
            <ul aria-label="보기" className="grid gap-2">
              {item.options.map((o, i) => (
                <li key={i}>
                  <button
                    type="button"
                    disabled={locked}
                    aria-pressed={option === i}
                    onClick={() => setOption(i)}
                    className={`${blockBtn} w-full text-left ${
                      option === i ? "border-sun-400 bg-sun-100" : "border-black/15 bg-white hover:bg-stone-50"
                    }`}
                  >
                    {o}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="label">1. 어색한 곳을 눌러 보세요</div>
            <ul aria-label="문장" className="flex flex-wrap gap-2">
              {item.tokens.map((t, i) => (
                <li key={i}>
                  <button
                    type="button"
                    disabled={locked}
                    aria-pressed={tokenIndex === i}
                    onClick={() => setTokenIndex(i)}
                    className={`${blockBtn} ${
                      tokenIndex === i ? "border-brand-500 bg-brand-100 text-brand-700" : "border-black/15 bg-white hover:bg-stone-50"
                    }`}
                  >
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {tokenIndex !== null && (
            <div>
              <div className="label">2. 어떻게 고치면 좋을까요?</div>
              <ul aria-label="고칠 말" className="flex flex-wrap gap-2">
                {item.options.map((o, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={locked}
                      aria-pressed={option === i}
                      onClick={() => setOption(i)}
                      className={`${blockBtn} ${
                        option === i ? "border-sun-400 bg-sun-100" : "border-black/15 bg-white hover:bg-stone-50"
                      }`}
                    >
                      {o}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div aria-live="polite" className="space-y-2">
        {notice?.kind === "awkward" && (
          <p className="rounded-xl border border-stone-300 bg-stone-50 p-3 text-stone-800">{notice.text} 블록을 눌러 바꿔 볼 수 있어요.</p>
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
            {notice.rendered && <span className="block text-lg font-semibold">{notice.rendered}</span>}
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
  );
}

/** context 안에서 target을 굵게 보여 준다. */
function Marked({ text, target }: { text: string; target?: string }) {
  const at = target ? text.indexOf(target) : -1;
  if (!target || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <b className="rounded bg-sun-100 px-1 underline decoration-2 underline-offset-4">{target}</b>
      {text.slice(at + target.length)}
    </>
  );
}
