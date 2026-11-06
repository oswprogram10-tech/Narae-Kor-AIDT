import { CATEGORIES, MOODS, type CategoryId } from "@/core/diary";
import { STICKERS, sourceCardOf } from "@/core/cardnews";
import { CardView, SourceCardView } from "@/components/CardView";
import { BarChart } from "@/components/BarChart";
import { AutoRefresh } from "@/components/AutoRefresh";
import { setShareApproved } from "@/app/actions/teacher";
import type { ArtifactAlert, ArtifactStatus as Status } from "@/lib/artifact-dashboard";

const STATUS_LABEL: Record<string, string> = { in_progress: "만드는 중", submitted: "제출함", returned: "돌려줌" };
const STEP_LABEL: Record<number, string> = { 0: "시작 전", 1: "1 계획", 2: "2 카드", 3: "3 점검", 4: "4 제출" };
const DIARY_STEP_LABEL: Record<number, string> = { 0: "시작 전", 1: "1 기록", 2: "2 성찰", 3: "3 제출" };

function Alerts({ rows }: { rows: Status["rows"] }) {
  const flagged = rows.filter((r) => r.alert);
  if (flagged.length === 0) return null;
  return (
    <div role="alert" data-testid="teacher-alert" className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
      <b>살펴봐야 할 학생이 있어요.</b>
      <ul className="space-y-1 text-sm">
        {flagged.map((r) => (
          <li key={r.studentId}>
            <b>{r.number}번</b> ({r.alert!.kind === "distress" ? "힘든 일 언급" : "개인 정보 입력"}) · {r.alert!.fields.join(", ")} 칸은 저장하지 않았어요.
            {r.alert!.excerpts.map((x, i) => (
              <span key={i} className="mt-1 block rounded bg-white/70 px-2 py-1 text-stone-800">
                {x.field}: {x.text}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

const AlertBadge = ({ alert }: { alert: ArtifactAlert | null }) =>
  alert ? <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">{alert.kind === "distress" ? "힘든 일 언급" : "개인 정보"}</span> : null;

export function CardnewsTeacher({ status }: { status: Status }) {
  const rows = status.rows;
  const submitted = rows.filter((r) => r.status === "submitted").length;
  const approved = rows.filter((r) => r.cardnews?.approved);
  return (
    <div className="space-y-4">
      <AutoRefresh />
      <Alerts rows={rows} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="시작" value={`${rows.filter((r) => r.submissionId).length}/${rows.length}`} />
        <Stat label="제출" value={`${submitted}`} />
        <Stat label="공유 승인" value={`${approved.length}`} />
        <Stat label="받은 스티커(전체)" value={`${rows.reduce((s, r) => s + (r.cardnews?.reactionTotal ?? 0), 0)}`} />
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-3 py-2">번호</th>
              <th className="px-3 py-2">별명</th>
              <th className="px-3 py-2">단계</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">카드</th>
              <th className="px-3 py-2">점검 경고(지금/제출 때)</th>
              <th className="px-3 py-2">고친 횟수</th>
              <th className="px-3 py-2">받은 스티커</th>
              <th className="px-3 py-2">공유</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.map((r) => (
              <tr key={r.studentId} className={r.alert ? "bg-red-50" : ""} data-student={r.number}>
                <td className="px-3 py-2 font-semibold">{r.number}</td>
                <td className="px-3 py-2">{r.nickname}<AlertBadge alert={r.alert} /></td>
                <td className="px-3 py-2">{STEP_LABEL[r.maxStep] ?? r.maxStep}</td>
                <td className="px-3 py-2">{r.status ? STATUS_LABEL[r.status] ?? r.status : "시작 전"}</td>
                <td className="px-3 py-2">{r.cardnews?.cards ?? "-"}</td>
                <td className="px-3 py-2">{r.cardnews ? `${r.cardnews.warningsNow} / ${r.cardnews.warningsAtSubmit ?? "-"}` : "-"}</td>
                <td className="px-3 py-2">{r.cardnews?.revisions ?? 0}</td>
                <td className="px-3 py-2" data-testid={`got-${r.number}`}>{r.cardnews?.reactionTotal ?? 0}</td>
                <td className="px-3 py-2">
                  {r.cardnews && r.submissionId && (
                    <form action={setShareApproved.bind(null, r.submissionId, !r.cardnews.approved)}>
                      {r.cardnews.approved ? (
                        <button className="btn-ghost px-3 py-1 text-xs">승인 취소</button>
                      ) : (
                        <button className="btn-primary px-3 py-1 text-xs" disabled={r.status !== "submitted"}>공유 승인</button>
                      )}
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-stone-500">아직 학급에 들어온 학생이 없어요.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="card space-y-3 p-0" aria-label="학생 작품">
        <div className="border-b border-black/5 px-3 py-2 font-semibold">학생 작품 <span className="text-xs font-normal text-stone-500">선생님만 볼 수 있어요. 눌러서 펼쳐 보세요.</span></div>
        <ul className="divide-y divide-black/5">
          {rows.filter((r) => r.cardnews && r.submissionId).map((r) => {
            const c = r.cardnews!;
            const a = c.artifact;
            return (
              <li key={r.studentId} data-work={r.number}>
                <details className="px-3 py-2">
                  <summary className="cursor-pointer text-sm">
                    <b>{r.number}번</b> {r.nickname} · {a.plan.topic || "(주제 없음)"} · 카드 {c.cards}장 · {r.status ? STATUS_LABEL[r.status] : ""}
                    {c.approved && <span className="ml-2 rounded bg-brand-100 px-2 py-0.5 text-xs text-brand-700">공유 중</span>}
                  </summary>
                  <div className="mt-3 space-y-3">
                    <p className="text-sm text-stone-600">읽을 사람: {a.plan.audience || "-"} · 핵심 문장: {a.plan.keyMessage || "-"}</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {a.cards.map((card, i) => <CardView key={card.id} card={card} size="sm" label={`${r.number}번 학생의 ${i + 1}번 카드`} />)}
                      <SourceCardView source={sourceCardOf(a.plan)} size="sm" />
                    </div>
                    {c.reflection.trim() && <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm">반응을 보고 고칠 점: {c.reflection}</p>}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card space-y-3" aria-label="공유 중인 작품" data-testid="teacher-gallery">
        <h2 className="font-bold">반 갤러리에 공유 중인 작품 ({approved.length})</h2>
        {approved.length === 0 ? (
          <p className="text-sm text-stone-500">제출한 작품을 확인하고 ‘공유 승인’을 누르면 반 학생들에게 보여요.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {approved.map((r) => (
              <li key={r.studentId} className="rounded-xl border border-black/10 p-3">
                <div className="mb-2 text-sm font-semibold">{r.number}번 · {r.cardnews!.artifact.plan.topic}</div>
                <CardView card={r.cardnews!.artifact.cards[0]} size="sm" label={`${r.number}번 표지`} />
                <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                  {STICKERS.map((s) => <li key={s.id} className="rounded bg-stone-100 px-2 py-0.5">{s.emoji} {r.cardnews!.reactions[s.id] ?? 0}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-stone-500">8초마다 자동으로 새로 고칩니다. 연구용 CSV에는 번호별 단계, 제출 때 경고 수, 고친 횟수, 받은 스티커, 반응 뒤 고친 점 작성 여부가 들어가요(글 내용은 없어요).</p>
    </div>
  );
}

export function DiaryTeacher({ status }: { status: Status }) {
  const rows = status.rows;
  const avg = status.classAverage;
  return (
    <div className="space-y-4">
      <AutoRefresh />
      <Alerts rows={rows} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="시작" value={`${rows.filter((r) => r.submissionId).length}/${rows.length}`} />
        <Stat label="제출" value={`${rows.filter((r) => r.status === "submitted").length}`} />
        <Stat label="기록한 학생" value={`${avg?.students ?? 0}`} />
      </div>
      <section className="card" aria-label="학급 평균">
        {avg && avg.students > 0 ? (
          <BarChart
            title={`학급 평균: 기록한 날 하루 평균 이용 시간 (학생 ${avg.students}명)`}
            bars={CATEGORIES.map((c) => ({ id: c.id, label: c.label, value: avg.averages[c.id as CategoryId], color: c.color }))}
          />
        ) : (
          <p className="text-sm text-stone-500">아직 기록한 학생이 없어요.</p>
        )}
      </section>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-3 py-2">번호</th>
              <th className="px-3 py-2">별명</th>
              <th className="px-3 py-2">단계</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">기록한 날</th>
              {CATEGORIES.map((c) => <th key={c.id} className="px-3 py-2">{c.label}(분)</th>)}
              <th className="px-3 py-2">성찰</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.map((r) => (
              <tr key={r.studentId} className={r.alert ? "bg-red-50" : ""} data-student={r.number}>
                <td className="px-3 py-2 font-semibold">{r.number}</td>
                <td className="px-3 py-2">{r.nickname}<AlertBadge alert={r.alert} /></td>
                <td className="px-3 py-2">{DIARY_STEP_LABEL[r.maxStep] ?? r.maxStep}</td>
                <td className="px-3 py-2">{r.status ? STATUS_LABEL[r.status] ?? r.status : "시작 전"}</td>
                <td className="px-3 py-2" data-testid={`days-${r.number}`}>{r.diary?.summary.daysLogged ?? 0}</td>
                {CATEGORIES.map((c) => <td key={c.id} className="px-3 py-2">{r.diary?.summary.totals[c.id as CategoryId] ?? 0}</td>)}
                <td className="px-3 py-2">{r.diary?.summary.reflectionComplete ? "완료 ✓" : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card space-y-3 p-0" aria-label="학생별 일지">
        <div className="border-b border-black/5 px-3 py-2 font-semibold">학생별 요약 <span className="text-xs font-normal text-stone-500">선생님만 볼 수 있어요.</span></div>
        <ul className="divide-y divide-black/5">
          {rows.filter((r) => r.diary && r.diary.summary.daysLogged > 0).map((r) => {
            const d = r.diary!;
            const moods = MOODS.filter((m) => d.summary.moodCounts[m.id]).map((m) => `${m.emoji}${d.summary.moodCounts[m.id]}`).join(" ");
            return (
              <li key={r.studentId} data-work={r.number}>
                <details className="px-3 py-2">
                  <summary className="cursor-pointer text-sm"><b>{r.number}번</b> {r.nickname} · {d.summary.daysLogged}일 기록 · 합계 {d.summary.totalMinutes}분</summary>
                  <div className="mt-3 space-y-3">
                    <BarChart title="매체별 합계" bars={CATEGORIES.map((c) => ({ id: c.id, label: c.label, value: d.summary.totals[c.id as CategoryId], color: c.color }))} />
                    {moods && <p className="text-sm">기분: {moods}</p>}
                    <dl className="space-y-1 text-sm">
                      <dt className="font-semibold">잘한 점</dt><dd className="whitespace-pre-wrap">{d.artifact.reflection.good || "-"}</dd>
                      <dt className="font-semibold">바꾸고 싶은 점</dt><dd className="whitespace-pre-wrap">{d.artifact.reflection.change || "-"}</dd>
                      <dt className="font-semibold">다음 약속</dt><dd className="whitespace-pre-wrap">{d.artifact.reflection.promise || "-"}</dd>
                    </dl>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="text-xs text-stone-500">8초마다 자동으로 새로 고칩니다. 학생끼리 일지를 공유하지 않아요. 평균은 기록한 날이 있는 학생의 ‘하루 평균’을 다시 평균 낸 값이에요.</p>
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
