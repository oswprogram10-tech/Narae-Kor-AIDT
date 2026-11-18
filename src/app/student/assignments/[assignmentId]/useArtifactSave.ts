"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fieldsOf, withFields, type Artifact } from "@/core/artifact";

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface SafetyNotice {
  kind: "distress" | "personal_info";
  reply: string;
  keys: string[];
}

const DEBOUNCE_MS = 900;

/**
 * 제작물 자동 저장. 바꾼 뒤 잠시 쉬면 서버에 저장하고, 서버가 안전 점검에서 걸러 낸 칸은
 * 이전 글로 되돌린 뒤 정해진 안내를 보여 준다(그 칸의 새 글은 서버에 저장되지 않는다).
 */
export function useArtifactSave<T extends Artifact>(submissionId: number, initial: T, locked: boolean) {
  const [art, setArt] = useState<T>(initial);
  const ref = useRef<T>(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const dirty = useRef(false);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [safety, setSafety] = useState<SafetyNotice | null>(null);

  const persist = useCallback(() => {
    chain.current = chain.current.then(async () => {
      dirty.current = false;
      setState("saving");
      try {
        const res = await fetch(`/api/artifacts/${submissionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artifact: ref.current }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; artifact?: Artifact; safety?: SafetyNotice | null };
        if (!res.ok) {
          setState("error");
          setError(data.error ?? "저장하지 못했어요.");
          return;
        }
        if (data.safety && data.artifact) {
          const saved = new Map(fieldsOf(data.artifact).map((f) => [f.key, f.text]));
          const values: Record<string, string> = {};
          for (const k of data.safety.keys) values[k] = saved.get(k) ?? "";
          // 칸 길이로 잘리기 전 원문에서 걸린 경우("raw")는 어느 칸인지 알 수 없으므로 서버에 저장된 글로 되돌린다.
          ref.current = (data.safety.keys.includes("raw") ? data.artifact : withFields(ref.current, values)) as T;
          setArt(ref.current);
          setSafety(data.safety);
        }
        setError(null);
        setState("saved");
      } catch {
        setState("error");
        setError("저장하지 못했어요. 인터넷을 확인해 주세요.");
      }
    });
    return chain.current;
  }, [submissionId]);

  const change = useCallback(
    (next: T, immediate = false) => {
      if (locked) return;
      ref.current = next;
      dirty.current = true;
      setArt(next);
      if (timer.current) clearTimeout(timer.current);
      if (immediate) void persist();
      else timer.current = setTimeout(() => void persist(), DEBOUNCE_MS);
    },
    [locked, persist],
  );

  /** 서버에 바로 저장하고 끝날 때까지 기다린다(단계 이동·제출 전) */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (!locked && (dirty.current || state === "error")) await persist();
    else await chain.current;
  }, [locked, persist, state]);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (dirty.current) void persist();
      }
    },
    [persist],
  );

  return { art, ref, change, flush, state, error, safety, clearSafety: () => setSafety(null) };
}
