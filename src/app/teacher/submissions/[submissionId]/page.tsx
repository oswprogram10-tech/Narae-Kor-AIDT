import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireTeacher } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { TeacherHeader } from "@/components/TeacherHeader";
import { coachHistory, teacherSubmission } from "@/lib/submissions";
import { wordDiff } from "@/lib/diff";
import { returnSubmission } from "@/app/actions/teacher";
import { STAGE_LABELS, type Stage } from "@/core/data/genres";
import { RubricPanel } from "./RubricPanel";
import { PROVIDER_LABELS } from "@/core/providers";
import { CommentForm } from "./CommentForm";
import { CharacterReplyForm } from "./CharacterReplyForm";
import { getReplyCharacter, guessReplyCharacter } from "@/core/literature/replies";

const fmt = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });

export default async function SubmissionPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { teacherId } = await requireTeacher();
  const id = Number((await params).submissionId);
  const row = await teacherSubmission(teacherId, id);
  if (!row) notFound();
  const { submission: s, assignment: a, klass, student } = row;
  const db = await getDb();
  const [teacher] = await db.select().from(schema.teachers).where(eq(schema.teachers.id, teacherId));
  const versions = await db.select().from(schema.drafts).where(eq(schema.drafts.submissionId, id)).orderBy(asc(schema.drafts.createdAt));
  const messages = await coachHistory(id);
  const comments = await db.select().from(schema.teacherComments).where(eq(schema.teacherComments.submissionId, id)).orderBy(asc(schema.teacherComments.createdAt));
  const scores = await db.select().from(schema.rubricScores).where(eq(schema.rubricScores.submissionId, id));
  const first = versions.find((v) => v.content.trim())?.content ?? "";
  const diff = first && first !== s.draft ? wordDiff(first, s.draft) : null;

  return (
    <>
      <TeacherHeader
        name={teacher?.displayName ?? ""}
        crumbs={[
          { href: `/teacher/classes/${klass.id}`, label: klass.name },
          { href: `/teacher/assignments/${a.id}`, label: a.title },
          { href: `/teacher/submissions/${id}`, label: `${student.number}번` },
        ]}
      />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_380px]">
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold">
              {student.number}번 {student.nickname}
              <span className="ml-2 text-base font-normal text-stone-500">
                {s.status === "submitted" ? "제출함" : s.status === "returned" ? "돌려줌" : STAGE_LABELS[s.stage as Stage]}
              </span>
            </h1>
            {s.status === "submitted" && (
              <form action={returnSubmission.bind(null, id)}>
                <button className="btn-ghost text-sm">다시 고쳐 쓰도록 돌려주기</button>
              </form>
            )}
          </div>
          {s.pasteChars > 0 && (
            <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
              다른 곳에서 붙여 넣은 글자가 {s.pasteChars}자 있어요. 쓰기 과정을 함께 확인해 보세요.
            </p>
          )}

          <article className="card">
            <h2 className="mb-2 font-bold">현재 글</h2>
            <p className="whitespace-pre-wrap leading-8">{s.draft || <span className="text-stone-400">(아직 초고가 없어요)</span>}</p>
            <p className="mt-3 text-xs text-stone-500">공백 제외 {s.draft.replace(/\s/g, "").length}자 · 저장된 버전 {versions.length}개</p>
          </article>

          {diff && (
            <article className="card">
              <h2 className="mb-2 font-bold">처음 초고 → 현재 글 (고쳐 쓴 부분)</h2>
              <p className="whitespace-pre-wrap leading-8">
                {diff.map((p, i) =>
                  p.type === "same" ? (
                    <span key={i}>{p.text}</span>
                  ) : p.type === "add" ? (
                    <ins key={i} className="bg-brand-100 no-underline">{p.text}</ins>
                  ) : (
                    <del key={i} className="bg-red-100 text-red-700">{p.text}</del>
                  ),
                )}
              </p>
            </article>
          )}

          <article className="card">
            <h2 className="mb-2 font-bold">생각 열기 · 계획표</h2>
            {s.brainstorm && <p className="mb-3 whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-sm">{s.brainstorm}</p>}
            <dl className="grid gap-2 text-sm">
              {a.organizer.map((f) => (
                <div key={f.key} className="grid gap-1 sm:grid-cols-[160px_1fr]">
                  <dt className="font-semibold text-stone-600">{f.label}</dt>
                  <dd className="whitespace-pre-wrap">{s.organizerValues[f.key] || <span className="text-stone-400">(빈칸)</span>}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className="card">
            <h2 className="mb-3 font-bold">AI 코치 대화 ({messages.filter((m) => m.role === "student").length}회)</h2>
            <ol className="space-y-2 text-sm">
              {messages.map((m) => {
                const meta = (m.meta ?? {}) as { flags?: Record<string, boolean>; flag?: string };
                return (
                  <li key={m.id} className={`rounded-lg px-3 py-2 ${m.role === "student" ? "bg-stone-100" : "bg-brand-50"}`}>
                    <div className="mb-1 flex flex-wrap gap-2 text-xs text-stone-500">
                      <span>{m.role === "student" ? "학생" : "코치"}</span>
                      <span>{STAGE_LABELS[m.stage as Stage]}</span>
                      <span>{fmt.format(m.createdAt)}</span>
                      {meta.flags?.ghostwriteRequest && <span className="text-orange-700">대필 요청</span>}
                      {meta.flags?.distress && <span className="font-bold text-red-700">힘든 일 언급</span>}
                      {meta.flags?.personalInfo && <span className="text-red-700">개인 정보</span>}
                      {m.blocked && <span className="text-orange-700">가드레일이 응답 교체({m.blockReason})</span>}
                      {m.role === "coach" && m.provider && <span>{PROVIDER_LABELS[m.provider as keyof typeof PROVIDER_LABELS] ?? m.provider}{m.model && m.model !== m.provider ? ` · ${m.model}` : ""}</span>}
                    </div>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </li>
                );
              })}
              {messages.length === 0 && <li className="text-stone-500">코치와 나눈 대화가 없어요.</li>}
            </ol>
          </article>
        </section>

        <aside className="space-y-6">
          <RubricPanel
            submissionId={id}
            rubric={a.rubric}
            scores={scores.map((x) => ({ criterion: x.criterion, ai: x.aiSuggested, evidence: x.aiEvidence, final: x.teacherFinal }))}
          />
          <div className="card space-y-3">
            <h2 className="font-bold">선생님 코멘트</h2>
            <ul className="space-y-2 text-sm">
              {comments.map((c) => (
                <li key={c.id} className="rounded-lg bg-sun-100 px-3 py-2">
                  <div className="text-xs text-stone-500">
                    {fmt.format(c.createdAt)}
                    {c.asCharacter && getReplyCharacter(c.asCharacter) && ` · ${getReplyCharacter(c.asCharacter)?.name}의 답장`}
                  </div>
                  <p className="whitespace-pre-wrap">{c.content}</p>
                </li>
              ))}
            </ul>
            {a.genreId === "character-letter" ? (
              <CharacterReplyForm submissionId={id} defaultCharacterId={guessReplyCharacter(s.organizerValues.character ?? "")} />
            ) : (
              <CommentForm submissionId={id} />
            )}
            <p className="text-xs text-stone-500">코멘트는 학생 글쓰기 화면 위쪽에 보여요.</p>
          </div>
        </aside>
      </main>
    </>
  );
}
