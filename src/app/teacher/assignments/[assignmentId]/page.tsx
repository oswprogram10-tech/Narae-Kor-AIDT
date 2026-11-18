import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ownedAssignment, requireTeacher } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { TeacherHeader } from "@/components/TeacherHeader";
import { assignmentStatus } from "@/lib/dashboard";
import { setAssignmentOpen, setCoachEnabled, setCoachProvider } from "@/app/actions/teacher";
import { getGenre } from "@/core/data/genres";
import { assignableProviders } from "@/lib/coach";
import { PROVIDER_IDS, PROVIDER_LABELS } from "@/core/providers";
import { LiveStatus } from "./LiveStatus";
import { GrammarStatus } from "./GrammarStatus";
import { getActivity } from "@/core/grammar";
import { findActivity } from "@/lib/activities";
import { grammarStatus } from "@/lib/grammar-dashboard";
import { artifactStatus } from "@/lib/artifact-dashboard";
import { artifactActivity, isArtifactKind, type ArtifactKind } from "@/core/artifact";
import { CardnewsTeacher, DebateTeacher, DiaryTeacher, ImpressionTeacher, InterviewTeacher, PresentationTeacher } from "./ArtifactStatus";

export default async function AssignmentDashboard({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { teacherId } = await requireTeacher();
  const id = Number((await params).assignmentId);
  const owned = await ownedAssignment(teacherId, id);
  if (!owned) notFound();
  const { assignment: a, klass } = owned;
  const db = await getDb();
  const [teacher] = await db.select().from(schema.teachers).where(eq(schema.teachers.id, teacherId));
  const isArtifact = isArtifactKind(a.kind);
  const aStatus = isArtifact ? await artifactStatus(id, klass.id, a.kind as ArtifactKind) : null;
  const isGrammar = a.kind === "grammar" || a.kind === "reading" || a.kind === "media" || a.kind === "literature" || a.kind === "listening" || isArtifact;
  const rows = isGrammar ? [] : await assignmentStatus(id, klass.id);
  const gStatus = isGrammar && !isArtifact ? await grammarStatus(id, klass.id, a.activityId, a.kind === "reading" || a.kind === "media" || a.kind === "literature" || a.kind === "listening" ? a.kind : "grammar") : null;
  const available = assignableProviders();

  return (
    <>
      <TeacherHeader
        name={teacher?.displayName ?? ""}
        crumbs={[
          { href: `/teacher/classes/${klass.id}`, label: klass.name },
          { href: `/teacher/assignments/${id}`, label: a.title },
        ]}
      />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm text-stone-500">
              {isArtifact
                ? (artifactActivity(a.kind)?.title ?? "제작 활동")
                : a.kind === "reading" || a.kind === "media" || a.kind === "literature" || a.kind === "listening"
                ? (findActivity(a.activityId ?? "")?.title ?? (a.kind === "media" ? "매체 활동" : a.kind === "literature" ? "문학 활동" : a.kind === "listening" ? "듣기 활동" : "읽기 활동"))
                : isGrammar
                  ? (getActivity(a.activityId ?? "")?.title ?? "문법·어휘 활동")
                  : getGenre(a.genreId)?.name} · {a.standardCodes.map((c) => `[${c}]`).join(" ")}
            </div>
            <h1 className="text-2xl font-bold">{a.title}</h1>
            <p className="mt-1 max-w-2xl text-stone-600">{a.kind === "debate" ? `논제: ${a.prompt}` : a.prompt}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isGrammar && (
              <form action={setCoachEnabled.bind(null, id, !a.coachEnabled)}>
                <button className="btn-ghost text-sm">{a.coachEnabled ? "🤖 코치 끄기" : "🤖 코치 켜기"}</button>
              </form>
            )}
            <form action={setAssignmentOpen.bind(null, id, !a.isOpen)}>
              <button className="btn-ghost text-sm">{a.isOpen ? "과제 닫기" : "과제 다시 열기"}</button>
            </form>
            <a className="btn-ghost text-sm" href={`/api/teacher/assignments/${id}/export`}>연구용 CSV</a>
          </div>
        </div>
        {/* key: 저장 후 새 값으로 다시 그려서, 제출 뒤 폼 초기화로 예전 값이 보이는 문제를 막는다 */}
        {!isGrammar && (
        <form key={a.coachProvider} action={setCoachProvider.bind(null, id)} className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="coachProvider" className="text-stone-600">코치 AI</label>
          <select id="coachProvider" name="coachProvider" defaultValue={a.coachProvider} className="input w-auto py-1.5 text-sm">
            <option value="auto">자동 ({available.length ? available.map((p) => PROVIDER_LABELS[p]).join(" → ") : "모의 코치"})</option>
            {PROVIDER_IDS.map((p) => (
              <option key={p} value={p} disabled={!available.includes(p)}>
                {PROVIDER_LABELS[p]}
                {available.includes(p) ? (p === "local" ? " — 학생 기기 안에서만, 외부로 보내지 않음" : "") : p === "local" ? " (서버에 내장 모델 설정 없음)" : " (서버에 API 키 없음)"}
              </option>
            ))}
          </select>
          <button className="btn-ghost px-3 py-1.5 text-sm">적용</button>
          <span className="text-stone-500">
            · 코치 {a.coachEnabled ? "켜짐" : "꺼짐"} · 과제 {a.isOpen ? "열림" : "닫힘"} · 고른 AI가 실패하면 다음 AI, 마지막엔 모의 코치가 답해요.
          </span>
        </form>
        )}
        {aStatus ? (
          a.kind === "cardnews" ? <CardnewsTeacher status={aStatus} /> : a.kind === "impression" ? <ImpressionTeacher status={aStatus} /> : a.kind === "debate" ? <DebateTeacher status={aStatus} /> : a.kind === "interview" ? <InterviewTeacher status={aStatus} /> : a.kind === "presentation" ? <PresentationTeacher status={aStatus} /> : <DiaryTeacher status={aStatus} />
        ) : gStatus ? (
          <GrammarStatus assignmentId={id} initial={gStatus} />
        ) : (
          <LiveStatus assignmentId={id} initial={rows} />
        )}
      </main>
    </>
  );
}
