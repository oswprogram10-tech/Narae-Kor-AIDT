"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { checkStudent, lookupClass, studentLogin } from "@/app/actions/student";
import { PIN_ICONS, PIN_LENGTH } from "@/lib/pin";

type Step = "code" | "number" | "pin";

export default function JoinPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState("");
  const [className, setClassName] = useState("");
  const [number, setNumber] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [nickname, setNickname] = useState("");
  const [pin, setPin] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await lookupClass(code);
    setBusy(false);
    if (r.error) return setError(r.error);
    setClassName(`${r.grade}학년 ${r.className}`);
    setStep("number");
  }

  async function submitNumber(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await checkStudent(code, Number(number));
    setBusy(false);
    if (r.error) return setError(r.error);
    setNeedsSetup(!!r.needsSetup);
    setNickname(r.nickname ?? "");
    setPin([]);
    setStep("pin");
  }

  async function submitPin() {
    setBusy(true);
    setError("");
    const r = await studentLogin({ code, number: Number(number), pin: pin.join(","), nickname: needsSetup ? nickname : undefined });
    setBusy(false);
    if (r.error) {
      setPin([]);
      return setError(r.error);
    }
    router.push("/student");
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-1 text-2xl font-bold">학생 입장 ✏️</h1>
      {className && <p className="mb-6 text-stone-600">{className}</p>}

      {step === "code" && (
        <form onSubmit={submitCode} className="card mt-6 space-y-4">
          <label className="label" htmlFor="code">선생님이 알려 준 참여 코드</label>
          <input
            id="code"
            className="input text-center font-mono text-2xl uppercase tracking-[0.3em]"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoComplete="off"
            autoFocus
          />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full text-lg" disabled={busy || code.length < 6}>다음</button>
        </form>
      )}

      {step === "number" && (
        <form onSubmit={submitNumber} className="card space-y-4">
          <label className="label" htmlFor="number">내 번호</label>
          <input
            id="number"
            className="input text-center text-2xl"
            inputMode="numeric"
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 2))}
            autoFocus
          />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setStep("code")}>이전</button>
            <button className="btn-primary flex-1 text-lg" disabled={busy || !number}>다음</button>
          </div>
        </form>
      )}

      {step === "pin" && (
        <div className="card space-y-4">
          {needsSetup ? (
            <>
              <p className="font-semibold">처음 왔네요! 별명과 그림 비밀번호를 정해요.</p>
              <div>
                <label className="label" htmlFor="nickname">별명 (실제 이름 말고!)</label>
                <input id="nickname" className="input" value={nickname} maxLength={12} onChange={(e) => setNickname(e.target.value)} />
              </div>
              <p className="text-sm text-stone-600">그림 4개를 순서대로 골라 기억해 두세요.</p>
            </>
          ) : (
            <p className="font-semibold">{nickname}, 반가워요! 그림 비밀번호를 순서대로 눌러요.</p>
          )}
          <div className="flex justify-center gap-2 text-3xl" aria-label="고른 그림">
            {Array.from({ length: PIN_LENGTH }, (_, i) => (
              <span key={i} className="flex h-12 w-12 items-center justify-center rounded-xl border border-black/10 bg-stone-50">
                {pin[i] !== undefined ? (needsSetup ? PIN_ICONS[pin[i]] : "●") : ""}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PIN_ICONS.map((icon, i) => (
              <button
                key={icon}
                type="button"
                aria-label={`그림 ${i + 1}`}
                className="rounded-xl border border-black/10 bg-white py-3 text-4xl transition active:scale-95 disabled:opacity-40"
                disabled={pin.length >= PIN_LENGTH}
                onClick={() => setPin((p) => [...p, i])}
              >
                {icon}
              </button>
            ))}
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setPin([])}>지우기</button>
            <button
              type="button"
              className="btn-primary flex-1 text-lg"
              disabled={busy || pin.length < PIN_LENGTH || (needsSetup && !nickname.trim())}
              onClick={submitPin}
            >
              들어가기
            </button>
          </div>
          <button type="button" className="text-sm text-stone-500 underline" onClick={() => setStep("number")}>번호 다시 입력</button>
        </div>
      )}
    </main>
  );
}
