"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Passage } from "@/core/reading/types";
import type { ProgressSummary } from "@/lib/grammar-rules";
import type { MoodPoint, RelationEdge } from "@/core/literature";
import { EMPTY_USAGE, type ListeningUsage } from "@/lib/listening-rules";
import { ListeningPanel, sentenceLabel, useKoreanVoice, type ListeningCtx } from "./ListeningPanel";
import type { LiteratureExtras, LockedReadingItem, StudentMediaItem, StudentSearchResult, StudentSearchView } from "@/lib/reading-rules";

type Entry = StudentMediaItem | LockedReadingItem;
type View = { items: Entry[]; passages: Passage[] };
const isLocked = (e: Entry): e is LockedReadingItem => "locked" in e;

type Answer =
  | { type: "sentence-pick"; sentenceId: string }
  | { type: "label-sentences"; labels: Record<string, string> }
  | { type: "slot-paragraphs"; placement: Record<string, string> }
  | { type: "choice"; option: number }
  | { type: "choice-with-evidence"; option: number; sentenceId: string }
  | { type: "summary-write"; text: string; submitAsIs?: boolean }
  | { type: "search-task"; query: number; result?: number; evidenceId?: string }
  | { type: "mood-scale"; value: number; feeling: number; evidenceId: string }
  | { type: "sequence"; order: string[] }
  | { type: "own-line"; text: string };

const NO_LITERATURE: LiteratureExtras = { mood: [], relations: { main: "", edges: [] } };

interface SummaryResult {
  done: boolean;
  coverage: number;
  covered: number;
  total: number;
  copied: boolean;
  length: number;
  tries: number;
  canSubmitAsIs: boolean;
  submittedAsIs: boolean;
}

interface Result {
  correct: boolean;
  incomplete?: boolean;
  message?: string;
  rendered: string;
  feedback?: { level: "principle" | "hint1" | "hint2" | "reveal"; message: string; reveal?: { answer: Answer; rendered: string } };
  explanation?: string;
  progress: ProgressSummary;
  summary?: SummaryResult;
  safety?: "distress" | "personal_info";
  view?: View;
  /** 검색 실험실: 고른(또는 알맞은) 검색어의 결과 */
  search?: StudentSearchView;
  /** 문학: 마음 그래프·관계도 재료 */
  literature?: LiteratureExtras;
}

type Notice =
  | { kind: "incomplete"; text: string }
  | { kind: "wrong"; text: string; level: string }
  | { kind: "correct"; text: string; rendered: string }
  | { kind: "reveal"; text: string; rendered: string }
  | { kind: "summary"; text: string; result: SummaryResult }
  | { kind: "safety"; text: string }
  | { kind: "error"; text: string };

export function ReadingRunner({
  submissionId,
  title,
  isOpen,
  items: initialItems,
  passages: initialPassages,
  solvedIds,
  initialSummary,
  initialLiterature,
  kind,
}: {
  submissionId: number;
  title: string;
  isOpen: boolean;
  /** 듣기 활동이면 지문 자리에 '듣기 자료' 상자를 보여 준다 */
  kind?: "reading" | "media" | "literature" | "listening";
  items: Entry[];
  passages: Passage[];
  solvedIds: string[];
  initialSummary: ProgressSummary;
  initialLiterature?: LiteratureExtras;
}) {
  const [lit, setLit] = useState<LiteratureExtras>(initialLiterature ?? NO_LITERATURE);
  const [solved, setSolved] = useState<Set<string>>(() => new Set(solvedIds));
  const [summary, setSummary] = useState(initialSummary);
  const [view, setView] = useState<View>({ items: initialItems, passages: initialPassages });
  // 문단을 차례로 펼치는 활동: 푼 뒤 서버가 보내 준 다음 화면. '다음 문제'를 누르면 적용한다.
  const [pending, setPending] = useState<View | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const firstOpen = initialItems.findIndex((i) => !solvedIds.includes(i.id));
  const [index, setIndex] = useState(firstOpen === -1 ? initialItems.length : firstOpen);
  const [passageOpen, setPassageOpen] = useState(true);

  // 듣기 활동: 소리 준비, 글 보이기, 학생 기기에서 센 횟수(서버에 아직 안 보낸 증가분)
  const isListening = kind === "listening";
  const voice = useKoreanVoice(isListening);
  const [textOpen, setTextOpen] = useState(false);
  const unsent = useRef<ListeningUsage>({ ...EMPTY_USAGE });
  const noSound = isListening && voice.status === "none";
  const listening: ListeningCtx | undefined = isListening
    ? {
        voice,
        textOpen: textOpen || noSound,
        onShowText: () => {
          unsent.current.transcript_views += 1;
          setTextOpen(true);
        },
        onHideText: () => setTextOpen(false),
        onBump: (key) => {
          unsent.current[key] += 1;
        },
      }
    : undefined;

  const { items, passages } = view;
  const total = items.length;
  const finished = index >= total;
  const currentEntry = finished ? null : items[index];
  const current = currentEntry && !isLocked(currentEntry) ? currentEntry : null;
  const itemPassages = current && current.type !== "search-task"
    ? (current.passageIds ?? [current.passageId]).map((id) => passages.find((p) => p.id === id)).filter((p): p is Passage => !!p)
    : [];

  function goNext() {
    if (pending) {
      // 새로 열린 문단 표시: 이번에 처음 보이는 문단
      const had = new Set(passages.flatMap((p) => p.paragraphs.map((x) => `${p.id}/${x.id}`)));
      const next = new Set<string>();
      for (const p of pending.passages) for (const x of p.paragraphs) if (!had.has(`${p.id}/${x.id}`)) next.add(`${p.id}/${x.id}`);
      // 새 지문이 처음 열리는 경우(첫 문단)는 '새 문단'으로 표시하지 않는다
      const newPassage = pending.passages.some((p) => !passages.some((q) => q.id === p.id));
      setFresh(newPassage ? new Set() : next);
      setView(pending);
      setPending(null);
    }
    setIndex((i) => i + 1);
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <header className="space-y-2">
        <Link href="/student" className="text-sm text-stone-500 underline">← 목록으로</Link>
        <h1 className="text-xl font-bold">{title}</h1>
        {isListening && (
          <p data-testid="listening-notice" className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">
            🎧 듣기 활동: 먼저 들어 보고, 필요하면 ‘글로 보기’를 눌러도 돼요. 글로 보는 것도 좋은 방법이니 걱정하지 않아도 돼요.
          </p>
        )}
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
          {lit.mood.length > 0 && <MoodGraph points={lit.mood} />}
          {lit.relations.edges.length > 0 && <RelationDiagram main={lit.relations.main} edges={lit.relations.edges} />}
          <p className="text-sm text-stone-600">
            {summary.revealed > 0
              ? "힌트를 보면서 끝까지 생각해 본 것도 멋져요. 도움 받은 문제는 다음에 다시 도전해 봐요."
              : "글에서 단서를 찾아 차근차근 잘 풀었어요."}
          </p>
          <Link href="/student" className="btn-primary">목록으로 가기</Link>
        </section>
      ) : !isOpen ? (
        <p className="card text-center">선생님이 이 과제를 닫았어요.</p>
      ) : !current ? (
        <p className="card text-center">문제를 불러오지 못했어요. 새로 고침을 눌러 주세요.</p>
      ) : (
        <ItemView
          key={current!.id}
          item={current!}
          passages={itemPassages}
          fresh={fresh}
          passageOpen={passageOpen}
          onTogglePassage={() => setPassageOpen((o) => !o)}
          submissionId={submissionId}
          isLast={index === total - 1}
          lit={lit}
          listening={listening}
          takeUsage={() => ({ ...unsent.current })}
          usageSent={(sent) => {
            for (const k of Object.keys(sent) as (keyof ListeningUsage)[]) unsent.current[k] = Math.max(0, unsent.current[k] - sent[k]);
          }}
          onSolved={(s, next, extras) => {
            setSolved((prev) => new Set(prev).add(current!.id));
            setSummary(s);
            if (next) setPending(next);
            if (extras) setLit(extras);
          }}
          onNext={goNext}
        />
      )}
    </main>
  );
}

const btn =
  "min-h-11 min-w-11 rounded-xl border px-4 py-2 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-70";

function ItemView({
  item,
  passages,
  fresh,
  passageOpen,
  onTogglePassage,
  submissionId,
  isLast,
  lit,
  listening,
  takeUsage,
  usageSent,
  onSolved,
  onNext,
}: {
  item: StudentMediaItem;
  passages: Passage[];
  fresh: Set<string>;
  passageOpen: boolean;
  onTogglePassage: () => void;
  submissionId: number;
  isLast: boolean;
  lit: LiteratureExtras;
  listening?: ListeningCtx;
  takeUsage: () => ListeningUsage;
  usageSent: (sent: ListeningUsage) => void;
  onSolved: (s: ProgressSummary, next?: View, extras?: LiteratureExtras) => void;
  onNext: () => void;
}) {
  const [sentenceId, setSentenceId] = useState<string | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [placement, setPlacement] = useState<Record<string, string>>({});
  const [heldParagraph, setHeldParagraph] = useState<string | null>(null);
  const [option, setOption] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [text, setText] = useState("");
  // 검색 실험실: 고른 검색어(표시 번호), 서버가 보여 준 결과, 고른 결과와 근거 칸
  const [queryNo, setQueryNo] = useState<number | null>(null);
  const [seen, setSeen] = useState<Record<number, { results: StudentSearchResult[]; wrong: boolean }>>({});
  const [resultNo, setResultNo] = useState<number | null>(null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  // 문학: 마음 온도(1~5), 사건 카드를 놓은 자리(자리 번호 순서)와 손에 든 카드
  const [scale, setScale] = useState<number | null>(null);
  const [slots, setSlots] = useState<(string | null)[]>(() => (item.type === "sequence" ? item.events.map(() => null) : []));
  const [heldEvent, setHeldEvent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const locked = busy || done;
  const passage = passages[0];

  const sentenceText = (id: string) => passages.flatMap((p) => p.paragraphs.flatMap((x) => x.sentences)).find((s) => s.id === id)?.text ?? "";
  // 듣기 활동에서 글이 숨겨져 있을 때는 문장 글 대신 '몇 번 말차례의 몇 번째 문장'으로 가리킨다.
  const sentenceShown = (id: string) => (listening && !listening.textOpen ? sentenceLabel(passage, id) : sentenceText(id));
  const paragraphNo = (pid: string) => (passage?.paragraphs.findIndex((p) => p.id === pid) ?? -1) + (passage?.page ? 0 : 1);

  const seenQuery = queryNo !== null ? seen[queryNo] : undefined;
  const ready =
    item.type === "search-task"
      ? queryNo !== null && (seenQuery === undefined || (!seenQuery.wrong && resultNo !== null && evidenceId !== null))
      : item.type === "mood-scale"
      ? scale !== null && option !== null && sentenceId !== null
      : item.type === "sequence"
      ? slots.every((x) => x !== null)
      : item.type === "own-line"
      ? text.trim().length > 0
      : item.type === "sentence-pick"
      ? sentenceId !== null
      : item.type === "label-sentences"
        ? item.sentenceIds.every((id) => labels[id] !== undefined)
        : item.type === "slot-paragraphs"
          ? item.paragraphIds.every((id) => placement[id] !== undefined)
          : item.type === "choice"
            ? option !== null
            : item.type === "summary-write"
              ? text.trim().length > 0
              : option !== null && sentenceId !== null;

  // 지문에서 문장을 눌러 고를 수 있는 문제만 문장이 버튼이 된다.
  const picking = item.type === "sentence-pick" || item.type === "choice-with-evidence" || item.type === "mood-scale";
  const scope = item.type === "sentence-pick" ? item.paragraphId : item.type === "mood-scale" ? item.sceneParagraphId : undefined;
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
    if (a.type === "mood-scale") {
      setScale(a.value);
      setOption(a.feeling);
      setSentenceId(a.evidenceId);
    }
    if (a.type === "sequence") setSlots(a.order);
    if (a.type === "search-task") {
      setQueryNo(a.query);
      setResultNo(a.result ?? null);
      setEvidenceId(a.evidenceId ?? null);
    }
  }

  async function check(submitAsIs = false) {
    if (!ready || locked) return;
    const answer: Answer =
      item.type === "mood-scale"
        ? { type: "mood-scale", value: scale!, feeling: option!, evidenceId: sentenceId! }
        : item.type === "sequence"
        ? { type: "sequence", order: slots as string[] }
        : item.type === "own-line"
        ? { type: "own-line", text }
        : item.type === "search-task"
        ? seenQuery && !seenQuery.wrong
          ? { type: "search-task", query: queryNo!, result: resultNo!, evidenceId: evidenceId! }
          : { type: "search-task", query: queryNo! }
        : item.type === "summary-write"
        ? { type: "summary-write", text, ...(submitAsIs ? { submitAsIs: true } : {}) }
        : item.type === "sentence-pick"
        ? { type: "sentence-pick", sentenceId: sentenceId! }
        : item.type === "label-sentences"
          ? { type: "label-sentences", labels }
          : item.type === "slot-paragraphs"
            ? { type: "slot-paragraphs", placement }
            : item.type === "choice"
              ? { type: "choice", option: option! }
              : { type: "choice-with-evidence", option: option!, sentenceId: sentenceId! };
    setBusy(true);
    const taken = listening ? takeUsage() : undefined;
    const usage = taken && taken.listen_plays + taken.line_replays + taken.transcript_views > 0 ? taken : undefined;
    try {
      const res = await fetch(`/api/reading/${submissionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, answer, ...(usage ? { usage } : {}) }),
      });
      // 답을 받은 서버가 횟수도 기록했으니 보낸 만큼은 다시 보내지 않는다
      if (usage) usageSent(usage);
      const data = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string };
      if (!res.ok || data.progress === undefined) {
        setNotice({ kind: "error", text: data.error ?? "잠시 뒤에 다시 눌러 주세요." });
        return;
      }
      const r = data as Result;
      if (item.type === "search-task" && r.search) {
        // 서버가 보여 준 결과를 기억한다. 알맞지 않은 검색어의 결과는 읽기만 하고 고르지 않는다.
        const results = r.search.results;
        const wrongQuery = !r.correct && !r.incomplete && r.feedback?.level !== "reveal";
        setSeen((prev) => ({ ...prev, [r.search!.query]: { results, wrong: wrongQuery } }));
      }
      if (r.safety) {
        // 위험 신호·개인 정보: 점검하지 않고 안내만 한다(교사에게는 서버가 알린다)
        setNotice({ kind: "safety", text: r.message ?? "" });
      } else if (r.summary) {
        setNotice({ kind: "summary", text: r.message ?? "", result: r.summary });
        if (r.summary.done || r.summary.submittedAsIs) {
          setDone(true);
          onSolved(r.progress, r.view);
        }
      } else if (r.incomplete) {
        setNotice({ kind: "incomplete", text: r.message ?? "아직 다 고르지 않았어요." });
      } else if (r.correct) {
        setNotice({ kind: "correct", text: r.explanation ?? "", rendered: r.rendered });
        setDone(true);
        onSolved(r.progress, r.view, r.literature);
      } else if (r.feedback?.level === "reveal") {
        applyReveal(r.feedback.reveal?.answer);
        setNotice({ kind: "reveal", text: r.explanation ?? r.feedback.message, rendered: r.feedback.reveal?.rendered ?? "" });
        setDone(true);
        onSolved(r.progress, r.view, r.literature);
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
    <div className={`grid gap-4 lg:items-start ${passages.length === 1 ? "lg:grid-cols-2" : ""}`}>
      {passage && listening && (
        <ListeningPanel
          passage={passage}
          ctx={listening}
          picking={picking && !locked}
          scopeParagraphId={scope}
          selected={marked}
          done={done}
          targets={targets}
          onPick={(id) => setSentenceId(id)}
        />
      )}
      {passage && !listening && (
        <PassagePanel
          passages={passages}
          fresh={fresh}
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
        {fresh.size > 0 && (
          <p className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-brand-700" data-testid="self-check">
            <b className="block">새 문단이 열렸어요.</b>
            내 예측과 비교해 보세요. 내 생각과 같았나요, 달랐나요? 달랐다면 어떤 단서가 있었는지 다시 찾아봐요.
          </p>
        )}
        <p className="text-lg font-semibold">{item.prompt}</p>

        {item.type === "sentence-pick" && (
          <p className="rounded-xl bg-stone-50 p-3 text-stone-700" aria-live="polite">
            {sentenceId ? (
              <>
                <span className="mr-2 text-sm text-stone-500">내가 고른 문장</span>
                {sentenceShown(sentenceId)}
              </>
            ) : (
              <span className="text-stone-500">
                {scope ? `${paragraphNo(scope)}문단` : listening ? "듣기 자료" : "지문"}에서 문장을 눌러 골라요.
              </span>
            )}
          </p>
        )}

        {item.type === "search-task" && (
          <SearchTaskView
            item={item}
            locked={locked}
            done={done}
            queryNo={queryNo}
            onQuery={(i) => {
              setQueryNo(i);
              setResultNo(null);
              setEvidenceId(null);
              setNotice(null);
            }}
            seen={seen}
            resultNo={resultNo}
            onResult={(i) => {
              setResultNo(i);
              setEvidenceId(null);
            }}
            evidenceId={evidenceId}
            onEvidence={setEvidenceId}
          />
        )}

        {item.type === "mood-scale" && (
          <div className="space-y-5">
            <div>
              <div className="label" id="thermo-label">1. {item.character}의 마음 온도를 눌러 보세요</div>
              <Thermometer value={scale} disabled={locked} onChange={setScale} />
            </div>
            <div>
              <div className="label">2. 마음을 나타내는 말을 골라요</div>
              {optionList(item.feelings)}
            </div>
            <div>
              <div className="label">3. 그렇게 생각한 {listening ? "말을 듣기 자료에서" : "문장을 지문에서"} 눌러 보세요</div>
              <p className="rounded-xl bg-stone-50 p-3 text-stone-700" aria-live="polite">
                {sentenceId ? (
                  <>
                    <span className="mr-2 text-sm text-stone-500">근거로 고른 문장</span>
                    {sentenceShown(sentenceId)}
                  </>
                ) : (
                  <span className="text-stone-500">아직 고르지 않았어요.</span>
                )}
              </p>
            </div>
          </div>
        )}

        {item.type === "sequence" && (
          <div className="space-y-4">
            <div>
              <div className="label">사건 카드 (눌러서 고르고, 아래 자리에 놓아요)</div>
              <ul aria-label="사건 카드 모음" className="grid gap-2">
                {item.events
                  .filter((e) => !slots.includes(e.id))
                  .map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        disabled={locked}
                        aria-pressed={heldEvent === e.id}
                        onClick={() => setHeldEvent((h) => (h === e.id ? null : e.id))}
                        className={`${btn} w-full text-left ${heldEvent === e.id ? "border-sun-400 bg-sun-100" : "border-black/15 bg-white hover:bg-stone-50"}`}
                      >
                        {e.text}
                      </button>
                    </li>
                  ))}
                {slots.every((x) => x !== null) && <li className="text-sm text-stone-500">카드를 모두 놓았어요.</li>}
              </ul>
            </div>
            <ol aria-label="순서 자리" className="grid gap-2">
              {slots.map((placedId, i) => {
                const ev = placedId ? item.events.find((e) => e.id === placedId) : undefined;
                return (
                  <li key={i} className="flex items-stretch gap-2 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50 p-2">
                    <span aria-hidden="true" className="flex w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-base font-bold text-brand-700">
                      {i + 1}
                    </span>
                    {ev ? (
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => setSlots((prev) => prev.map((x, j) => (j === i ? null : x)))}
                        aria-label={`${i + 1}번째 자리: ${ev.text} (누르면 카드 모음으로 돌아가요)`}
                        className={`${btn} min-w-0 flex-1 border-brand-500 bg-white text-left text-brand-700 hover:bg-brand-50`}
                      >
                        {ev.text}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={locked || heldEvent === null}
                        onClick={() => {
                          if (heldEvent === null) return;
                          setSlots((prev) => prev.map((x, j) => (j === i ? heldEvent : x)));
                          setHeldEvent(null);
                        }}
                        aria-label={`${i + 1}번째 자리에 놓기`}
                        className={`${btn} min-w-0 flex-1 border-black/15 bg-white text-left text-stone-600 hover:bg-stone-50`}
                      >
                        {heldEvent === null ? "카드를 먼저 골라요" : "여기에 놓기"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {item.type === "own-line" && (
          <div className="space-y-2">
            <label htmlFor="own-line-text" className="label">내 한 줄</label>
            <input
              id="own-line-text"
              data-testid="own-line-input"
              type="text"
              className="input w-full text-[18px]"
              maxLength={1000}
              value={text}
              readOnly={locked}
              onChange={(e) => setText(e.target.value)}
              placeholder="내가 느낀 것을 한 줄로 써 보세요."
              aria-describedby="own-line-count"
              autoComplete="off"
            />
            <p id="own-line-count" className="text-sm font-semibold text-stone-600" aria-live="polite" data-testid="own-line-count">
              <span className={Array.from(text.trim()).length > item.maxChars ? "text-orange-700" : ""}>{Array.from(text.trim()).length}/{item.maxChars}자</span>{" "}
              <span className="font-normal text-stone-500">(정답은 없어요)</span>
            </p>
          </div>
        )}

        {item.type === "label-sentences" && (
          <ol aria-label="꼬리표 달기" className="space-y-3">
            {item.sentenceIds.map((id, i) => (
              <li key={id} role="group" aria-label={`문장 ${i + 1} 꼬리표`} className="space-y-2 rounded-xl bg-stone-50 p-3">
                <p className="text-base leading-relaxed">
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                    {i + 1}
                  </span>
                  {sentenceShown(id)}
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
              <div className="label">2. 그렇게 생각한 {listening ? "말을 듣기 자료에서" : "문장을 지문에서"} 눌러 보세요</div>
              <p className="rounded-xl bg-stone-50 p-3 text-stone-700" aria-live="polite">
                {sentenceId ? (
                  <>
                    <span className="mr-2 text-sm text-stone-500">근거로 고른 문장</span>
                    {sentenceShown(sentenceId)}
                  </>
                ) : (
                  <span className="text-stone-500">아직 고르지 않았어요.</span>
                )}
              </p>
            </div>
          </div>
        )}

        {item.type === "summary-write" && (
          <div className="space-y-2">
            <label htmlFor="summary-text" className="label">내 말로 간추려 써요</label>
            <textarea
              id="summary-text"
              className="input min-h-40 w-full text-[18px] leading-[1.7]"
              rows={6}
              maxLength={1000}
              value={text}
              readOnly={locked}
              onChange={(e) => setText(e.target.value)}
              placeholder="글을 다시 읽으며 문단마다 중요한 내용을 짧게 써 보세요."
              aria-describedby="summary-count"
            />
            <SummaryCount text={text} min={item.minChars} max={item.maxChars} />
          </div>
        )}

        <div aria-live="polite" className="space-y-2">
          {notice?.kind === "summary" && (
            <div
              className={`rounded-xl border p-3 ${notice.result.done ? "border-brand-500 bg-brand-50 text-brand-700" : "border-sun-400 bg-sun-100 text-stone-800"}`}
              data-testid="summary-feedback"
            >
              <b className="block">
                {notice.result.done ? "잘 간추렸어요! ✓" : notice.result.submittedAsIs ? "선생님께 냈어요." : "한 번 더 고쳐 써 봐요."}
              </b>
              <span className="mb-1 block text-sm">
                문단 {notice.result.total}개 중 {notice.result.covered}개가 들어 있어요 · {notice.result.length}자
              </span>
              {notice.text}
            </div>
          )}
          {notice?.kind === "safety" && (
            <p className="rounded-xl border border-stone-300 bg-stone-50 p-3 text-stone-800" data-testid="summary-safety">
              {notice.text}
            </p>
          )}
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
              <b className="block">{item.type === "own-line" ? "다 썼어요! ✓" : "정답이에요! ✓"}</b>
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

        {done && item.type === "mood-scale" && lit.mood.length > 0 && <MoodGraph points={lit.mood} />}
        {done && lit.relations.edges.some((r) => r.itemId === item.id) && <RelationDiagram main={lit.relations.main} edges={lit.relations.edges} />}

        <div className="flex flex-wrap justify-end gap-2">
          {!done && notice?.kind === "summary" && notice.result.canSubmitAsIs && (
            <button
              type="button"
              className={`${btn} border-black/15 bg-white hover:bg-stone-50`}
              disabled={busy}
              onClick={() => check(true)}
            >
              선생님께 그대로 내기
            </button>
          )}
          {done ? (
            <button type="button" className="btn-primary min-h-11" onClick={onNext}>
              {isLast ? "결과 보기" : "다음 문제"}
            </button>
          ) : (
            <button type="button" className="btn-primary min-h-11" disabled={!ready || busy} onClick={() => check()}>
              {busy ? (item.type === "search-task" && !seenQuery ? "찾는 중…" : "확인하는 중…") : item.type === "search-task" && !seenQuery ? "검색하기" : "확인"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

/** 가상 페이지·검색 화면에 늘 붙는 안내 */
function VirtualBanner() {
  return (
    <p className="bg-sun-100 px-3 py-1 text-center text-sm font-bold text-stone-800" data-testid="virtual-banner">
      연습용 가상 페이지예요
    </p>
  );
}

/** 브라우저 주소 줄 모양(가짜 주소) */
function AddressBar({ address }: { address: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-black/10 bg-stone-100 px-2 py-1.5 text-sm text-stone-600">
      <span aria-hidden="true" className="select-none tracking-widest">‹ ›</span>
      <span aria-label="가상 주소" className="min-w-0 flex-1 truncate rounded-full bg-white px-3 py-1 font-mono text-stone-700" data-testid="virtual-address">
        {address}
      </span>
    </div>
  );
}

const AdBadge = () => (
  <span className="ml-1 inline-flex items-center rounded bg-orange-100 px-1.5 py-0.5 text-xs font-bold text-orange-800">광고</span>
);

/** 검색 실험실: 목적, 검색어 고르기, 가상 검색 화면(고른 검색어의 결과만), 근거 고르기 */
function SearchTaskView({
  item,
  locked,
  done,
  queryNo,
  onQuery,
  seen,
  resultNo,
  onResult,
  evidenceId,
  onEvidence,
}: {
  item: Extract<StudentMediaItem, { type: "search-task" }>;
  locked: boolean;
  done: boolean;
  queryNo: number | null;
  onQuery: (i: number) => void;
  seen: Record<number, { results: StudentSearchResult[]; wrong: boolean }>;
  resultNo: number | null;
  onResult: (i: number) => void;
  evidenceId: string | null;
  onEvidence: (id: string) => void;
}) {
  const shown = queryNo !== null ? seen[queryNo] : undefined;
  const interactive = !!shown && !shown.wrong && !locked;
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-brand-50 p-3 text-brand-700" data-testid="search-purpose">
        <b className="mr-2">내 목적</b>
        {item.purpose}
      </p>
      <div>
        <div className="label">1. 알맞은 검색어를 골라 검색해 보세요</div>
        <ul aria-label="검색어" className="grid gap-2">
          {item.queries.map((q, i) => {
            const on = queryNo === i;
            const known = seen[i];
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={locked}
                  aria-pressed={on}
                  data-query={i}
                  onClick={() => onQuery(i)}
                  className={`${btn} w-full text-left ${on ? "border-sun-400 bg-sun-100" : "border-black/15 bg-white hover:bg-stone-50"}`}
                >
                  <span aria-hidden="true" className="mr-2">🔍</span>
                  {q.text}
                  {known?.wrong && <span className="ml-2 text-sm font-normal text-stone-500">(결과를 살펴봤어요)</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {queryNo !== null && (
        <section aria-label="가상 검색 화면" className="overflow-hidden rounded-xl border border-black/20 bg-white" data-testid="search-page">
          <VirtualBanner />
          <AddressBar address="나래검색.가상" />
          <div className="space-y-3 p-3">
            <div className="flex items-center gap-2 rounded-full border border-black/20 bg-white px-4 py-2 text-lg" data-testid="search-box">
              <span aria-hidden="true">🔍</span>
              <span className="min-w-0 flex-1 truncate">{item.queries[queryNo].text}</span>
            </div>
            {!shown ? (
              <p className="rounded-lg bg-stone-50 p-3 text-stone-600">‘검색하기’를 누르면 이 검색어로 찾은 결과가 나와요.</p>
            ) : (
              <>
                {interactive && (
                  <p className="text-sm text-stone-600">
                    2. 목적에 가장 잘 맞고 믿을 만한 결과를 눌러 고른 뒤, 그렇게 생각한 까닭이 되는 부분을 눌러 보세요.
                  </p>
                )}
                {shown.wrong && !done && (
                  <p className="text-sm text-stone-600">이 결과는 살펴보기만 해요. 다른 검색어를 골라 봐요.</p>
                )}
                <ul aria-label="검색 결과" className="space-y-2">
                  {shown.results.map((r, i) => (
                    <li key={r.id}>
                      <ResultCard
                        result={r}
                        index={i}
                        interactive={interactive}
                        selected={resultNo === i}
                        done={done}
                        evidenceId={resultNo === i ? evidenceId : null}
                        onSelect={() => onResult(i)}
                        onEvidence={onEvidence}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function fieldKind(id: string): string {
  return id.slice(id.lastIndexOf("-") + 1);
}

function ResultCard({
  result,
  index,
  interactive,
  selected,
  done,
  evidenceId,
  onSelect,
  onEvidence,
}: {
  result: StudentSearchResult;
  index: number;
  interactive: boolean;
  selected: boolean;
  done: boolean;
  evidenceId: string | null;
  onSelect: () => void;
  onEvidence: (id: string) => void;
}) {
  const frame = selected ? (done ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-sun-400 bg-sun-100/60 ring-2 ring-sun-400") : "border-black/15 bg-white";
  const view = (f: { id: string; text: string }) => {
    const kind = fieldKind(f.id);
    if (kind === "ad") return <AdBadge />;
    if (kind === "title") return <span className="block text-lg font-bold text-brand-700">{f.text}</span>;
    if (kind === "snippet") return <span className="block text-base text-stone-800">{f.text}</span>;
    return <span className="block text-sm text-stone-600">{f.text}</span>;
  };
  if (!interactive || !selected) {
    // 고르기 전(또는 읽기만 하는 결과): 카드 전체가 하나의 버튼이거나 글이다.
    const body = result.fields.map((f) => (
      <span
        key={f.id}
        data-field={f.id}
        className={`block ${selected && done && evidenceId === f.id ? "rounded-lg bg-brand-100 px-2 py-1 ring-2 ring-brand-500" : ""}`}
      >
        {view(f)}
      </span>
    ));
    if (interactive) {
      return (
        <button
          type="button"
          aria-pressed={false}
          data-result={index}
          onClick={onSelect}
          className={`block min-h-11 w-full rounded-xl border p-3 text-left hover:bg-stone-50 ${frame}`}
        >
          {body}
        </button>
      );
    }
    return (
      <div data-result={index} className={`rounded-xl border p-3 ${frame}`}>
        {body}
      </div>
    );
  }
  // 고른 결과: 칸마다 근거로 누를 수 있다.
  return (
    <div data-result={index} aria-label="고른 결과" className={`space-y-1 rounded-xl border p-2 ${frame}`}>
      <p className="px-1 text-sm font-semibold text-stone-700">고른 결과예요. 그렇게 생각한 까닭이 되는 부분을 눌러 보세요.</p>
      {result.fields.map((f) => {
        const on = evidenceId === f.id;
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={on}
            data-field={f.id}
            onClick={() => onEvidence(f.id)}
            className={`block min-h-11 w-full rounded-lg border px-3 py-1.5 text-left ${
              on ? "border-sun-400 bg-sun-100 font-semibold" : "border-black/10 bg-white hover:bg-stone-50"
            }`}
          >
            {view(f)}
          </button>
        );
      })}
    </div>
  );
}

/** 글자 수(공백 제외)와 알맞은 범위를 보여 준다. */
function SummaryCount({ text, min, max }: { text: string; min: number; max: number }) {
  const n = text.replace(/\s/g, "").length;
  const tone = n === 0 ? "text-stone-500" : n < min ? "text-stone-600" : n <= max ? "text-brand-700" : "text-orange-700";
  const hint = n === 0 ? "" : n < min ? " · 조금 더 써 봐요" : n <= max ? " · 알맞아요" : " · 조금 줄여 봐요";
  return (
    <p id="summary-count" className={`text-sm font-semibold ${tone}`} aria-live="polite" data-testid="summary-count">
      {n}자 <span className="font-normal text-stone-500">(공백 빼고 {min}자~{max}자)</span>
      {hint}
    </p>
  );
}

function PassagePanel({
  passages,
  fresh,
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
  passages: Passage[];
  fresh: Set<string>;
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
  // 지문이 둘이면(관점 비교) 휴대폰에서는 탭으로, 넓은 화면에서는 나란히 보여 준다.
  const [tab, setTab] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  // 새로 열린 문단이 지문 칸 안에서 보이도록 스크롤한다
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>("[data-fresh='true']");
    if (el && scroller.current) scroller.current.scrollTop = Math.max(0, el.offsetTop - scroller.current.offsetTop - 8);
  }, []);
  const pair = passages.length > 1;
  // 가상 페이지(매체)는 '글' 대신 '페이지'로 부르고, 가짜 웹 페이지 모양으로 보여 준다.
  const pages = passages.every((p) => p.page !== undefined);
  const tabLabel = (p: Passage, i: number) =>
    pages ? `${i + 1}번 페이지` : p.title.startsWith("(") ? `${p.title.slice(0, p.title.indexOf(")") + 1)} 글` : `${i + 1}번째 글`;
  return (
    <section
      aria-label="지문"
      className={`sticky top-0 z-10 -mx-4 border-b border-black/10 bg-white px-4 py-2 shadow-sm lg:mx-0 lg:rounded-2xl lg:border lg:p-5 ${
        pair ? "lg:static" : "lg:top-4"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">
          {pages ? "🌐" : "📖"} {pair ? (pages ? "가상 페이지를 비교해요" : "두 글을 함께 읽어요") : passages[0].title}
        </h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="min-h-11 rounded-xl border border-black/15 px-3 text-sm font-semibold lg:hidden"
        >
          {open ? "지문 접기" : "지문 펴기"}
        </button>
      </div>
      {pair && open && (
        <div role="tablist" aria-label={pages ? "페이지 고르기" : "글 고르기"} className="mt-2 flex gap-2 lg:hidden">
          {passages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={tab === i}
              onClick={() => setTab(i)}
              className={`min-h-11 flex-1 rounded-xl border px-3 text-base font-semibold ${
                tab === i ? "border-brand-500 bg-brand-100 text-brand-700" : "border-black/15 bg-white"
              }`}
            >
              {tabLabel(p, i)}
            </button>
          ))}
        </div>
      )}
      <div
        ref={scroller}
        className={`${open ? "" : "hidden lg:block"} mt-2 max-h-[40vh] overflow-y-auto pr-1 ${pair ? "lg:max-h-[45vh] lg:grid lg:grid-cols-2 lg:gap-6" : "lg:max-h-[calc(100vh-8rem)]"}`}
      >
        {passages.map((passage, pidx) => (
          <div
            key={passage.id}
            data-passage={passage.id}
            className={`space-y-3 text-[18px] leading-[1.8] ${pair && pidx !== tab ? "hidden lg:block" : ""} ${
              passage.page ? "overflow-hidden rounded-xl border border-black/20 bg-white pb-3" : ""
            }`}
          >
            {passage.page && (
              <div className="space-y-0 text-base leading-normal">
                <VirtualBanner />
                <AddressBar address={passage.page.address} />
                <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2">
                  <span className="font-bold text-stone-800" data-testid="page-site">{passage.page.site}</span>
                  {passage.page.isAd && <span data-testid="ad-badge" className="inline-flex items-center rounded bg-orange-100 px-2 py-0.5 text-sm font-bold text-orange-800">광고</span>}
                </div>
              </div>
            )}
            {pair && !passage.page && <h3 className="hidden text-base font-bold lg:block">{passage.title}</h3>}
            {passage.page && <h3 className="px-3 text-xl font-bold leading-snug">{passage.title}</h3>}
            {passage.paragraphs.map((p, pi) => {
              if (passage.page && pi === 0 && p.id.endsWith("meta")) {
                const allowedMeta = picking && (!scopeParagraphId || scopeParagraphId === p.id);
                return (
                  <ul key={p.id} aria-label="페이지 정보" data-paragraph={p.id} className="mx-3 space-y-1 rounded-lg bg-stone-50 p-2 text-base leading-normal">
                    {p.sentences.map((sn) => {
                      const on = selected.has(sn.id);
                      const n = targets.get(sn.id);
                      const at = sn.text.indexOf(": ");
                      const head = at > 0 ? sn.text.slice(0, at) : "";
                      const rest = at > 0 ? sn.text.slice(at + 2) : sn.text;
                      const inner = (
                        <>
                          {n && (
                            <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 align-middle text-xs font-bold text-brand-700">
                              {n}
                            </span>
                          )}
                          {head && <span className="mr-2 inline-block rounded bg-stone-200 px-1.5 py-0.5 text-sm font-semibold text-stone-700">{head}</span>}
                          {rest}
                        </>
                      );
                      return (
                        <li key={sn.id}>
                          {allowedMeta ? (
                            <button
                              type="button"
                              data-sentence={sn.id}
                              aria-pressed={on}
                              onClick={() => onPick(sn.id)}
                              className={`block min-h-11 w-full rounded-lg border px-2 py-1 text-left ${
                                on ? "border-sun-400 bg-sun-100 font-semibold" : "border-black/10 bg-white hover:bg-stone-100"
                              }`}
                            >
                              {inner}
                            </button>
                          ) : (
                            <span
                              data-sentence={sn.id}
                              className={`block rounded px-2 py-1 ${on ? (done ? "bg-brand-100 font-semibold" : "bg-sun-100 font-semibold") : ""} ${
                                n ? "underline decoration-brand-500 decoration-2 underline-offset-4" : ""
                              }`}
                            >
                              {inner}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                );
              }
              const no = passage.page ? pi : pi + 1;
              const poem = passage.genre === "시";
              const allowed = picking && (!scopeParagraphId || scopeParagraphId === p.id);
              const scoped = picking && scopeParagraphId === p.id;
              const dimmed = picking && !!scopeParagraphId && scopeParagraphId !== p.id;
              const isFresh = fresh.has(`${passage.id}/${p.id}`);
              return (
                <div
                  key={p.id}
                  role="group"
                  aria-label={poem ? `${no}연` : `${no}문단`}
                  data-paragraph={p.id}
                  data-fresh={isFresh ? "true" : undefined}
                  className={`flex gap-2 rounded-lg p-1 ${poem ? "mt-5 first:mt-0" : ""} ${passage.page ? "mx-2" : ""} ${dimmed ? "opacity-50" : ""} ${
                    scoped || heldParagraphs.has(p.id) ? "bg-sun-100/60 ring-2 ring-sun-400" : ""
                  } ${isFresh ? "bg-brand-50 ring-2 ring-brand-200" : ""}`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 inline-flex h-6 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-bold text-stone-700 ${
                      poem ? "min-w-9 px-1.5" : "w-6"
                    }`}
                  >
                    {poem ? `${no}연` : no}
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
                            className={`${poem ? "block" : ""} ${on ? (done ? "rounded bg-brand-100 font-semibold" : "rounded bg-sun-100 font-semibold") : ""} ${
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
        ))}
      </div>
    </section>
  );
}

// ───────── 문학: 마음 온도계, 마음 그래프, 인물 관계도 ─────────

/** 마음 온도 1~5의 이름과 색(차가운 파랑 → 따뜻한 주황). 색만으로 알리지 않도록 숫자와 이름을 함께 쓴다. */
const MOOD_LEVELS: { value: number; label: string; bg: string; fg: string }[] = [
  { value: 5, label: "아주 따뜻해요", bg: "#e4572e", fg: "#ffffff" },
  { value: 4, label: "따뜻해요", bg: "#f4a259", fg: "#1c1917" },
  { value: 3, label: "보통이에요", bg: "#e7e2d3", fg: "#1c1917" },
  { value: 2, label: "차가워요", bg: "#8ec1e6", fg: "#1c1917" },
  { value: 1, label: "아주 차가워요", bg: "#2f64b0", fg: "#ffffff" },
];
const moodColor = (v: number) => MOOD_LEVELS.find((l) => l.value === v)?.bg ?? "#a8a29e";
const moodName = (v: number) => MOOD_LEVELS.find((l) => l.value === v)?.label ?? "";

/** 세로 온도계: 위가 따뜻함(5), 아래가 차가움(1). 라디오 그룹(위·아래·좌·우 화살표로도 고를 수 있다). */
function Thermometer({ value, disabled, onChange }: { value: number | null; disabled: boolean; onChange: (v: number) => void }) {
  function onKey(e: React.KeyboardEvent) {
    if (disabled) return;
    const up = e.key === "ArrowUp" || e.key === "ArrowRight";
    const down = e.key === "ArrowDown" || e.key === "ArrowLeft";
    if (!up && !down) return;
    e.preventDefault();
    const base = value ?? 3;
    onChange(Math.min(5, Math.max(1, base + (up ? 1 : -1))));
  }
  return (
    <div role="radiogroup" aria-labelledby="thermo-label" onKeyDown={onKey} className="flex flex-col gap-1.5 rounded-3xl border border-black/10 bg-stone-50 p-2" data-testid="thermometer">
      {MOOD_LEVELS.map((l) => {
        const on = value === l.value;
        return (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (value === null && l.value === 3) ? 0 : -1}
            disabled={disabled}
            data-scale={l.value}
            onClick={() => onChange(l.value)}
            style={{ backgroundColor: l.bg, color: l.fg }}
            className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-2 text-left text-base font-bold transition disabled:cursor-not-allowed disabled:opacity-80 ${
              on ? "ring-4 ring-stone-900 ring-offset-2" : "opacity-90 hover:opacity-100"
            }`}
          >
            <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-lg text-stone-900">
              {l.value}
            </span>
            <span className="flex-1">{l.label}</span>
            {on && <span aria-hidden="true">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

/** 마음 그래프: 학생이 고른 마음 온도를 장면 순서대로 이은 꺾은선 */
function MoodGraph({ points }: { points: MoodPoint[] }) {
  const W = 340;
  const H = 210;
  const left = 54;
  const right = 16;
  const top = 16;
  const bottom = 40;
  const n = points.length;
  const x = (i: number) => (n === 1 ? (left + W - right) / 2 : left + (i * (W - left - right)) / (n - 1));
  const y = (v: number) => top + ((5 - v) * (H - top - bottom)) / 4;
  const character = points[0]?.character ?? "";
  const sceneNo = (id: string) => id.replace(/^\D+/, "");
  const summary = points.map((p) => `${sceneNo(p.sceneParagraphId)}장면 ${p.value}도(${moodName(p.value)})`).join(", ");
  return (
    <figure className="rounded-2xl border border-black/10 bg-white p-3 text-left" data-testid="mood-graph" data-values={points.map((p) => p.value).join(",")}>
      <figcaption className="mb-1 text-base font-bold">📈 {character}의 마음 그래프</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${character}의 마음 그래프: ${summary}`} className="h-auto w-full">
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={left} x2={W - right} y1={y(v)} y2={y(v)} stroke="#d6d3d1" strokeWidth={1} strokeDasharray={v === 3 ? undefined : "3 4"} />
            <text x={left - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="#57534e">{v}</text>
          </g>
        ))}
        <text x={6} y={y(5) + 4} fontSize={10} fill="#b4381a">따뜻</text>
        <text x={6} y={y(1) + 4} fontSize={10} fill="#2f64b0">차가움</text>
        {n > 1 && (
          <polyline fill="none" stroke="#44403c" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} />
        )}
        {points.map((p, i) => (
          <g key={`${p.sceneParagraphId}-${i}`}>
            <circle cx={x(i)} cy={y(p.value)} r={9} fill={moodColor(p.value)} stroke="#1c1917" strokeWidth={2} />
            <text x={x(i)} y={y(p.value) + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#1c1917">{p.value}</text>
            <text x={x(i)} y={H - 16} textAnchor="middle" fontSize={12} fill="#44403c">{sceneNo(p.sceneParagraphId)}장면</text>
          </g>
        ))}
      </svg>
      <p className="text-xs text-stone-500">내가 고른 마음 온도를 장면 순서대로 이었어요. 1은 아주 차갑고, 5는 아주 따뜻해요.</p>
    </figure>
  );
}

/** 인물 관계도: 가운데에 주인공, 둘레에 푼 문제의 인물과 관계 이름 */
function RelationDiagram({ main, edges }: { main: string; edges: RelationEdge[] }) {
  const W = 400;
  const H = 280;
  const cx = W / 2;
  const cy = H / 2;
  const n = edges.length;
  const pos = edges.map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n + (n === 1 ? Math.PI / 2 : n === 2 ? Math.PI / 2 : 0);
    return { x: cx + Math.cos(a) * 128, y: cy + Math.sin(a) * 92 };
  });
  const summary = edges.map((e) => `${main}와 ${e.other}: ${e.label}`).join(", ");
  return (
    <figure className="rounded-2xl border border-black/10 bg-white p-3 text-left" data-testid="relation-diagram" data-count={n}>
      <figcaption className="mb-1 text-base font-bold">🧩 인물 관계도</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`인물 관계도: ${summary}`} className="h-auto w-full">
        {edges.map((e, i) => (
          <line key={`l-${e.itemId}`} x1={cx} y1={cy} x2={pos[i].x} y2={pos[i].y} stroke="#78716c" strokeWidth={2} />
        ))}
        <circle cx={cx} cy={cy} r={34} fill="#dbeafe" stroke="#1d4ed8" strokeWidth={3} />
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize={16} fontWeight={700} fill="#1e3a8a">{main}</text>
        {edges.map((e, i) => (
          <g key={e.itemId} data-testid={`relation-${e.itemId}`}>
            <rect x={pos[i].x - 62} y={pos[i].y - 26} width={124} height={52} rx={14} fill="#fffbeb" stroke="#d97706" strokeWidth={2} />
            <text x={pos[i].x} y={pos[i].y - 4} textAnchor="middle" fontSize={14} fontWeight={700} fill="#1c1917">{e.other}</text>
            <text x={pos[i].x} y={pos[i].y + 14} textAnchor="middle" fontSize={e.label.length > 7 ? 10.5 : 12} fill="#b45309">{e.label}</text>
          </g>
        ))}
      </svg>
      <p className="text-xs text-stone-500">문제를 풀 때마다 {main}와 다른 인물의 사이가 하나씩 채워져요.</p>
    </figure>
  );
}
