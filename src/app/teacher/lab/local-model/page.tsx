import { eq } from "drizzle-orm";
import { requireTeacher } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { TeacherHeader } from "@/components/TeacherHeader";
import { getLocalModelConfig } from "@/lib/coach";
import { LOCAL_MODELS, DEFAULT_LOCAL_MODEL } from "@/core/local/catalog";
import { LocalModelLab } from "./LocalModelLab";

export default async function LocalModelLabPage() {
  const { teacherId } = await requireTeacher();
  const db = await getDb();
  const [teacher] = await db.select().from(schema.teachers).where(eq(schema.teachers.id, teacherId));
  const cfg = getLocalModelConfig();
  return (
    <>
      <TeacherHeader name={teacher?.displayName ?? ""} crumbs={[{ href: "/teacher/lab/local-model", label: "내장 AI 측정" }]} />
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <h1 className="text-2xl font-bold">내장 AI 측정 (학교 기기 시험)</h1>
        <p className="text-stone-600">
          학생들이 쓸 기기(크롬북·태블릿·PC)에서 이 페이지를 열고 측정해 주세요. 모델을 기기에 내려받아 실제 코치 요청을 몇 번 처리하고 속도와
          결과를 보여 줍니다. 학생 데이터는 쓰지 않습니다.
        </p>
        <LocalModelLab
          models={LOCAL_MODELS.map((m) => ({ id: m.id, label: `${m.label} (${m.license}, WebGPU ${m.webgpu.sizeMB}MB / 일반 ${m.wasm.sizeMB}MB)` }))}
          defaults={{ id: cfg?.id ?? DEFAULT_LOCAL_MODEL, baseUrl: cfg?.baseUrl ?? "/models/", allowRemote: cfg?.allowRemote ?? false }}
        />
      </main>
    </>
  );
}
