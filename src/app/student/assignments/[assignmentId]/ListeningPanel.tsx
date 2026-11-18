"use client";

// 듣기 활동의 '듣기 자료' 상자. 소리는 브라우저의 읽어 주기 기능(speechSynthesis)으로 내고, 학생의 목소리는 모으지 않는다.
// 처음에는 글을 숨기고, 말차례를 카드로 보여 준다. '글로 보기'는 언제든 눌러도 되고 불리하지 않다(연구용으로 횟수만 센다).
import { useCallback, useEffect, useRef, useState } from "react";
import type { Passage } from "@/core/reading/types";
import { listeningScript, speakerVoice } from "@/core/listening";
import type { ListeningUsage } from "@/lib/listening-rules";

export interface VoiceInfo {
  /** checking: 목소리 목록을 기다리는 중, ready: 한국어 목소리가 있음, none: 소리를 낼 수 없음 */
  status: "checking" | "ready" | "none";
  voice: SpeechSynthesisVoice | null;
}

export const NO_SOUND_MESSAGE = "이 기기에서는 소리를 낼 수 없어요. 글로 읽어요.";

/** 한국어 목소리를 찾는다. 목록은 늦게 채워질 수 있으므로 voiceschanged 뒤에 다시 보고, 1초 남짓 기다려도 없으면 소리를 낼 수 없다고 본다. */
export function useKoreanVoice(enabled: boolean): VoiceInfo {
  const [info, setInfo] = useState<VoiceInfo>({ status: "checking", voice: null });
  useEffect(() => {
    if (!enabled) return;
    if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance === "undefined") {
      setInfo({ status: "none", voice: null });
      return;
    }
    const synth = window.speechSynthesis;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const voice = synth.getVoices().find((v) => (v.lang ?? "").toLowerCase().startsWith("ko")) ?? null;
      if (voice) {
        if (timer) clearTimeout(timer);
        setInfo({ status: "ready", voice });
      }
      return voice !== null;
    };
    if (!check()) timer = setTimeout(() => setInfo((prev) => (prev.status === "ready" ? prev : { status: "none", voice: null })), 1200);
    if (typeof synth.addEventListener === "function") synth.addEventListener("voiceschanged", check);
    else synth.onvoiceschanged = check;
    return () => {
      if (timer) clearTimeout(timer);
      if (typeof synth.removeEventListener === "function") synth.removeEventListener("voiceschanged", check);
      else synth.onvoiceschanged = null;
    };
  }, [enabled]);
  return info;
}

/** 듣기 화면과 문제 화면이 함께 쓰는 값 */
export interface ListeningCtx {
  voice: VoiceInfo;
  textOpen: boolean;
  /** '글로 보기'를 눌렀다(횟수를 센다) */
  onShowText: () => void;
  onHideText: () => void;
  onBump: (key: keyof ListeningUsage) => void;
}

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫"];
export const circled = (n: number): string => CIRCLED[n - 1] ?? String(n);

/** 문장이 몇 번째 말차례의 몇 번째 문장인지 */
export function sentenceRef(passage: Passage | undefined, sentenceId: string) {
  if (!passage) return null;
  for (const [pi, para] of passage.paragraphs.entries()) {
    const si = para.sentences.findIndex((s) => s.id === sentenceId);
    if (si >= 0) return { turn: pi + 1, speaker: para.speaker ?? "", no: si + 1, text: para.sentences[si].text };
  }
  return null;
}

/** 글이 숨겨져 있을 때 문장을 가리키는 말: "2번 말차례(지호)의 ①번 문장" */
export function sentenceLabel(passage: Passage | undefined, sentenceId: string): string {
  const r = sentenceRef(passage, sentenceId);
  return r ? `${r.turn}번 말차례${r.speaker ? `(${r.speaker})` : ""}의 ${circled(r.no)}번 문장` : "고른 문장";
}

interface Playing {
  mode: "all" | "line" | "sentence";
  turn: string;
  sentence?: string;
}

interface QueueStep {
  text: string;
  speaker: string;
  turn: string;
  sentence?: string;
}

/** 말차례·문장을 차례로 읽어 주는 재생기. 다른 소리를 시작하면 앞의 소리는 멈추고, 화면을 떠나면 소리도 멈춘다. */
export function useSpeechPlayer(passage: Passage, voice: VoiceInfo) {
  const [playing, setPlaying] = useState<Playing | null>(null);
  const run = useRef(0);
  const holder = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    run.current += 1;
    holder.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setPlaying(null);
  }, []);

  useEffect(() => {
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      run.current += 1;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [stop]);

  const start = useCallback(
    (queue: QueueStep[], mode: Playing["mode"]) => {
      if (voice.status !== "ready" || !("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const id = ++run.current;
      let i = 0;
      const next = () => {
        if (id !== run.current) return;
        const q = queue[i++];
        if (!q) {
          holder.current = null;
          setPlaying(null);
          return;
        }
        const u = new SpeechSynthesisUtterance(q.text);
        u.lang = "ko-KR";
        if (voice.voice) u.voice = voice.voice;
        const v = speakerVoice(passage, q.speaker);
        u.pitch = v.pitch;
        u.rate = v.rate;
        u.onend = next;
        u.onerror = () => {
          if (id === run.current) {
            holder.current = null;
            setPlaying(null);
          }
        };
        holder.current = u; // 일부 브라우저는 참조가 사라지면 끝 알림이 오지 않는다
        setPlaying({ mode, turn: q.turn, ...(q.sentence ? { sentence: q.sentence } : {}) });
        synth.speak(u);
      };
      next();
    },
    [passage, voice],
  );

  const playAll = useCallback(() => start(listeningScript(passage).map((l) => ({ text: l.text, speaker: l.speaker, turn: l.paragraphId })), "all"), [passage, start]);
  const playLine = useCallback(
    (turn: string) => {
      const l = listeningScript(passage).find((x) => x.paragraphId === turn);
      if (l) start([{ text: l.text, speaker: l.speaker, turn: l.paragraphId }], "line");
    },
    [passage, start],
  );
  const playSentence = useCallback(
    (turn: string, sentence: string) => {
      const para = passage.paragraphs.find((p) => p.id === turn);
      const s = para?.sentences.find((x) => x.id === sentence);
      if (para && s) start([{ text: s.text, speaker: para.speaker ?? "", turn, sentence }], "sentence");
    },
    [passage, start],
  );
  return { playing, stop, playAll, playLine, playSentence };
}

const chip =
  "min-h-11 rounded-xl border px-3 py-1 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

export function ListeningPanel({
  passage,
  ctx,
  picking,
  scopeParagraphId,
  selected,
  done,
  targets,
  onPick,
}: {
  passage: Passage;
  ctx: ListeningCtx;
  picking: boolean;
  scopeParagraphId?: string;
  selected: Set<string>;
  done: boolean;
  targets: Map<string, number>;
  onPick: (sentenceId: string) => void;
}) {
  const player = useSpeechPlayer(passage, ctx.voice);
  const canSpeak = ctx.voice.status === "ready";
  const { textOpen } = ctx;

  return (
    <section
      aria-label="듣기 자료"
      data-testid="listening-panel"
      className="sticky top-0 z-10 -mx-4 border-b border-black/10 bg-white px-4 py-2 shadow-sm lg:static lg:mx-0 lg:rounded-2xl lg:border lg:p-5"
    >
      <h2 className="text-base font-bold">🎧 듣기 자료 · {passage.title}</h2>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="play-all"
          disabled={!canSpeak}
          onClick={() => {
            ctx.onBump("listen_plays");
            player.playAll();
          }}
          className={`${chip} border-brand-500 bg-brand-50 text-brand-700 hover:bg-brand-100`}
        >
          ▶ 들려주기
        </button>
        <button
          type="button"
          data-testid="stop"
          disabled={!canSpeak || player.playing === null}
          onClick={player.stop}
          className={`${chip} border-black/15 bg-white hover:bg-stone-50`}
        >
          ■ 멈추기
        </button>
        {ctx.voice.status !== "none" && (
          <button
            type="button"
            data-testid="toggle-text"
            aria-expanded={textOpen}
            onClick={textOpen ? ctx.onHideText : ctx.onShowText}
            className={`${chip} border-black/15 bg-white hover:bg-stone-50`}
          >
            {textOpen ? "글 숨기기" : "글로 보기"}
          </button>
        )}
      </div>

      <div aria-live="polite" className="mt-2 text-sm">
        {ctx.voice.status === "checking" && <p className="text-stone-500">소리를 준비하고 있어요…</p>}
        {ctx.voice.status === "none" && (
          <p data-testid="no-sound" className="rounded-xl border border-sun-400 bg-sun-100 p-2 text-stone-800">
            {NO_SOUND_MESSAGE}
          </p>
        )}
        {player.playing && (
          <p data-testid="now-playing" className="text-brand-700">
            {passage.paragraphs.findIndex((p) => p.id === player.playing!.turn) + 1}번 말차례를 들려주고 있어요.
          </p>
        )}
      </div>

      <ol aria-label="말차례" className="mt-3 max-h-[40vh] space-y-2 overflow-y-auto pr-1 lg:max-h-[calc(100vh-14rem)]">
        {passage.paragraphs.map((p, pi) => {
          const no = pi + 1;
          const now = player.playing?.turn === p.id;
          const allowed = picking && (!scopeParagraphId || scopeParagraphId === p.id);
          const dimmed = picking && !!scopeParagraphId && scopeParagraphId !== p.id;
          const hasTarget = p.sentences.some((s) => targets.has(s.id));
          const name = p.speaker ?? "";
          return (
            <li
              key={p.id}
              data-turn={p.id}
              data-playing={now ? "true" : undefined}
              aria-label={`${no}번 말차례${name ? ` ${name}` : ""}`}
              className={`rounded-xl border p-2 ${now ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-black/10 bg-white"} ${
                allowed && scopeParagraphId ? "ring-2 ring-sun-400" : ""
              } ${dimmed ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">
                  {no}. {name}
                </span>
                {canSpeak && (
                  <button
                    type="button"
                    data-replay={p.id}
                    aria-label={`${no}번 말차례${name ? `(${name})` : ""} 다시 듣기`}
                    onClick={() => {
                      ctx.onBump("line_replays");
                      player.playLine(p.id);
                    }}
                    className={`${chip} border-black/15 bg-white px-2 hover:bg-stone-50`}
                  >
                    ▶ <span className="text-sm">다시 듣기</span>
                  </button>
                )}
              </div>

              {textOpen ? (
                allowed ? (
                  <div className="mt-1">
                    {p.sentences.map((s) => {
                      const on = selected.has(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          data-sentence={s.id}
                          aria-pressed={on}
                          onClick={() => onPick(s.id)}
                          className={`my-0.5 block min-h-11 w-full rounded-lg border px-2 py-1 text-left text-[18px] leading-[1.7] ${
                            on ? "border-sun-400 bg-sun-100 font-semibold" : "border-transparent hover:bg-stone-100"
                          }`}
                        >
                          {s.text}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-1 text-[18px] leading-[1.8]">
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
                )
              ) : (
                (allowed || hasTarget) && (
                  <ul aria-label={`${no}번 말차례의 문장`} className="mt-1 flex flex-wrap gap-2">
                    {p.sentences.map((s, si) => {
                      const selectable = allowed;
                      const n = targets.get(s.id);
                      if (!selectable && n === undefined) return null;
                      const on = selected.has(s.id);
                      const label = `${circled(si + 1)}번 문장`;
                      return (
                        <li key={s.id} className="flex items-center gap-1">
                          {selectable ? (
                            <button
                              type="button"
                              data-sentence={s.id}
                              aria-pressed={on}
                              onClick={() => onPick(s.id)}
                              className={`${chip} ${on ? "border-sun-400 bg-sun-100" : "border-black/15 bg-white hover:bg-stone-50"}`}
                            >
                              {label}
                              {n !== undefined && <span className="ml-1 text-sm text-brand-700">(문제 {n}번)</span>}
                            </button>
                          ) : (
                            <span data-sentence={s.id} className="inline-flex min-h-11 items-center rounded-xl bg-brand-50 px-3 font-semibold text-brand-700">
                              <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-xs font-bold">{n}</span>
                              {label}
                            </span>
                          )}
                          {canSpeak && (
                            <button
                              type="button"
                              data-listen-sentence={s.id}
                              aria-label={`${no}번 말차례의 ${label} 듣기`}
                              onClick={() => {
                                ctx.onBump("line_replays");
                                player.playSentence(p.id, s.id);
                              }}
                              className={`${chip} border-black/15 bg-white px-3 hover:bg-stone-50`}
                              aria-pressed={player.playing?.sentence === s.id}
                            >
                              ▶
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
