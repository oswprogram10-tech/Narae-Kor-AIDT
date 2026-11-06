"use client";

import { useEffect, useState } from "react";
import type { GrammarStatus as Status, SummaryAttemptView, SummaryStudentRow } from "@/lib/grammar-dashboard";

const POLL_MS = 5000;

function minutesAgo(iso: string | null, now: number): number | null {
  if (!iso) return null;
  return Math.floor((now - new Date(iso).getTime()) / 60000);
}

export function GrammarStatus({ assignmentId, initial }: { assignmentId: number; initial: Status }) {
  const [data, setData] = useState(initial);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/teacher/assignments/${assignmentId}/grammar-status`, { cache: "no-store" });
        if (res.ok && alive) {
          const next = (await res.json()) as Status;
          setData({ students: next.students, items: next.items, summaries: next.summaries ?? [] });
          setNow(Date.now());
        }
      } catch {
        /* 다음 주기에 다시 시도 */
      }
    };
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [assignmentId]);

  const { students, items, summaries } = data;
  const alerts = students.filter((r) => r.alert);
  const started = students.filter((s) => s.submissionId && s.updatedAt);
  const done = students.filter((s) => s.total > 0 && s.solved === s.total);

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <b>살펴봐야 할 학생이 있어요.</b>{" "}
          {alerts.map((r) => `${r.number}번(${r.alert === "distress" ? "힘든 일 언급" : "개인 정보 입력"})`).join(", ")}
          — 아래 ‘요약 글’에서 내용을 확인해 주세요.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="시작" value={`${started.length}/${students.length}`} />
        <Stat label="모두 푼 학생" value={`${done.length}`} />
        <Stat label="도움 받아 완료(전체)" value={`${students.reduce((s, r) => s + r.revealed, 0)}`} />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-3 py-2">번호</th>
              <th className="px-3 py-2">별명</th>
              <th className="px-3 py-2">푼 문제</th>
              <th className="px-3 py-2">첫 시도 정답</th>
              <th className="px-3 py-2">도움 받아 완료</th>
              <th className="px-3 py-2">힌트 본 문제</th>
              <th className="px-3 py-2">마지막 활동</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {students.map((r) => {
              const m = minutesAgo(r.updatedAt, now);
              return (
                <tr key={r.studentId} className={r.alert ? "bg-red-50" : ""}>
                  <td className="px-3 py-2 font-semibold">{r.number}</td>
                  <td className="px-3 py-2">
                    {r.nickname}
                    {r.alert && (
                      <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                        {r.alert === "distress" ? "힘든 일 언급" : "개인 정보"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.solved}/{r.total}
                    {r.total > 0 && r.solved === r.total && (
                      <span className="ml-2 rounded bg-brand-100 px-2 py-0.5 text-brand-700">완료 ✓</span>
                    )}
                    {!r.updatedAt && <span className="ml-2 text-stone-400">시작 전</span>}
                  </td>
                  <td className="px-3 py-2">{r.firstTry}</td>
                  <td className="px-3 py-2">{r.revealed > 0 ? <span className="text-orange-700">{r.revealed}</span> : 0}</td>
                  <td className="px-3 py-2">{r.hintItems}</td>
                  <td className="px-3 py-2 text-stone-500">{m === null ? "-" : m === 0 ? "방금" : `${m}분 전`}</td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-stone-500">
                  아직 학급에 들어온 학생이 없어요. 학급 페이지의 참여 코드를 알려 주세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="border-b border-black/5 px-3 py-2 font-semibold">문제별 결과 (어려웠던 문제가 위에 있어요)</div>
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-3 py-2">문제</th>
              <th className="px-3 py-2">푼 학생 수</th>
              <th className="px-3 py-2">첫 시도 정답률</th>
              <th className="px-3 py-2">평균 시도 수</th>
              <th className="px-3 py-2">도움 받아 완료</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {items.map((it) => (
              <tr key={it.itemId}>
                <td className="px-3 py-2 font-semibold">
                  {it.no}번 <span className="text-xs font-normal text-stone-400">{it.itemId}</span>
                </td>
                <td className="px-3 py-2">{it.students}</td>
                <td className="px-3 py-2">{it.firstTryRate === null ? "-" : `${Math.round(it.firstTryRate * 100)}%`}</td>
                <td className="px-3 py-2">{it.avgAttempts === null ? "-" : it.avgAttempts.toFixed(1)}</td>
                <td className="px-3 py-2">{it.revealed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {summaries.length > 0 && <SummaryList rows={summaries} />}
      <p className="text-xs text-stone-500">5초마다 자동으로 새로 고칩니다. ‘도움 받아 완료’는 4번째 오답 뒤 정답과 설명을 보고 넘어간 문제예요.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

const REASON_LABEL: Record<string, string> = {
  ok: "잘 간추림",
  "too-short": "너무 짧음",
  "missing-paragraph": "빠진 문단 있음",
  copied: "지문을 그대로 옮김",
  "too-long": "너무 김",
  "submit-as-is": "그대로 냄",
  distress: "힘든 일 언급(점검 안 함)",
  personal_info: "개인 정보(점검 안 함·글은 저장 안 함)",
};

function SummaryList({ rows }: { rows: SummaryStudentRow[] }) {
  return (
    <section className="card space-y-3 p-0" aria-label="요약 글">
      <div className="border-b border-black/5 px-3 py-2 font-semibold">
        요약 글 <span className="text-xs font-normal text-stone-500">선생님만 볼 수 있어요. 눌러서 펼쳐 보세요.</span>
      </div>
      <ul className="divide-y divide-black/5">
        {rows.map((r) => {
          const last = [...r.attempts].reverse().find((a) => !a.safety);
          const flagged = r.attempts.some((a) => a.safety);
          return (
            <li key={`${r.studentId}-${r.itemId}`} className={flagged ? "bg-red-50" : ""}>
              <details className="px-3 py-2">
                <summary className="cursor-pointer text-sm">
                  <b>{r.number}번</b> {r.nickname} · {r.no}번 문제 · 제출 {r.attempts.length}번
                  {last?.coverage != null && <> · 문단 반영 {Math.round(last.coverage * 100)}%</>}
                  {last?.length != null && <> · {last.length}자</>}
                  {r.solved ? (
                    r.helped ? <span className="ml-2 text-orange-700">그대로 냄</span> : <span className="ml-2 text-brand-700">완료 ✓</span>
                  ) : (
                    <span className="ml-2 text-stone-400">쓰는 중</span>
                  )}
                  {flagged && <span className="ml-2 font-semibold text-red-800">알림</span>}
                </summary>
                <ol className="mt-2 space-y-2">
                  {r.attempts.map((a) => (
                    <AttemptItem key={a.no} a={a} />
                  ))}
                </ol>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AttemptItem({ a }: { a: SummaryAttemptView }) {
  return (
    <li className={`rounded-lg border p-3 text-sm ${a.safety ? "border-red-200 bg-red-50" : "border-black/10 bg-stone-50"}`}>
      <div className="mb-1 text-xs text-stone-500">
        {a.no}번째 제출 · {REASON_LABEL[a.reason] ?? a.reason}
        {a.coverage !== null && <> · 문단 반영 {Math.round(a.coverage * 100)}%</>}
        {a.length !== null && <> · {a.length}자</>}
        {a.copied && <> · 베껴 쓴 문장 있음</>}
      </div>
      {a.text ? <p className="whitespace-pre-wrap">{a.text}</p> : <p className="text-stone-400">(글 없음)</p>}
    </li>
  );
}
