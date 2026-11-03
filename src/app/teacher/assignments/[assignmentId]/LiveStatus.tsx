"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { StatusRow } from "@/lib/dashboard";
import { STAGE_LABELS, type Stage } from "@/data/genres";

const POLL_MS = 5000;
const IDLE_MIN = 3;

function minutesAgo(iso: string | null, now: number): number | null {
  if (!iso) return null;
  return Math.floor((now - new Date(iso).getTime()) / 60000);
}

export function LiveStatus({ assignmentId, initial }: { assignmentId: number; initial: StatusRow[] }) {
  const [rows, setRows] = useState(initial);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/teacher/assignments/${assignmentId}/status`, { cache: "no-store" });
        if (res.ok && alive) {
          const data = (await res.json()) as { rows: StatusRow[] };
          setRows(data.rows);
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

  const started = rows.filter((r) => r.submissionId);
  const submitted = rows.filter((r) => r.status === "submitted");
  const alerts = rows.filter((r) => r.alert);
  const stuck = rows.filter((r) => {
    const m = minutesAgo(r.updatedAt, now);
    return r.status === "in_progress" && m !== null && m >= IDLE_MIN;
  });

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <b>살펴봐야 할 학생이 있어요.</b>{" "}
          {alerts.map((r) => `${r.number}번(${r.alert === "distress" ? "힘든 일 언급" : "개인 정보 입력"})`).join(", ")}
          — 코치 대화를 열어 확인해 주세요.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="시작" value={`${started.length}/${rows.length}`} />
        <Stat label="제출" value={`${submitted.length}`} />
        <Stat label={`${IDLE_MIN}분 넘게 멈춤`} value={`${stuck.length}`} warn={stuck.length > 0} />
        <Stat label="대필 요청(전체)" value={`${rows.reduce((s, r) => s + r.ghostwriteRequests, 0)}`} />
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-3 py-2">번호</th>
              <th className="px-3 py-2">별명</th>
              <th className="px-3 py-2">단계</th>
              <th className="px-3 py-2">글자 수</th>
              <th className="px-3 py-2">도움 요청</th>
              <th className="px-3 py-2">붙여 넣기</th>
              <th className="px-3 py-2">마지막 활동</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.map((r) => {
              const m = minutesAgo(r.updatedAt, now);
              const idle = r.status === "in_progress" && m !== null && m >= IDLE_MIN;
              return (
                <tr key={r.studentId} className={r.alert ? "bg-red-50" : idle ? "bg-sun-100/60" : ""}>
                  <td className="px-3 py-2 font-semibold">{r.number}</td>
                  <td className="px-3 py-2">{r.nickname}</td>
                  <td className="px-3 py-2">
                    {r.status === "submitted" ? (
                      <span className="rounded bg-brand-100 px-2 py-0.5 text-brand-700">제출 ✓</span>
                    ) : r.status === "returned" ? (
                      <span className="rounded bg-sun-100 px-2 py-0.5">돌려받음</span>
                    ) : r.stage ? (
                      STAGE_LABELS[r.stage as Stage]
                    ) : (
                      <span className="text-stone-400">시작 전</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.chars}</td>
                  <td className="px-3 py-2">
                    {r.helpCount}
                    {r.ghostwriteRequests > 0 && <span className="ml-1 text-xs text-stone-500">(대필 요청 {r.ghostwriteRequests})</span>}
                  </td>
                  <td className="px-3 py-2">{r.pasteChars > 0 ? <span className="text-orange-700">{r.pasteChars}자</span> : "-"}</td>
                  <td className="px-3 py-2 text-stone-500">{m === null ? "-" : m === 0 ? "방금" : `${m}분 전`}</td>
                  <td className="px-3 py-2 text-right">
                    {r.submissionId && (
                      <Link className="text-brand-600 underline" href={`/teacher/submissions/${r.submissionId}`}>
                        열기
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-stone-500">
                  아직 학급에 들어온 학생이 없어요. 학급 페이지의 참여 코드를 알려 주세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">5초마다 자동으로 새로 고칩니다. ‘붙여 넣기’는 학생이 다른 곳에서 복사해 붙인 글자 수예요.</p>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`card p-4 ${warn ? "border-sun-400" : ""}`}>
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
