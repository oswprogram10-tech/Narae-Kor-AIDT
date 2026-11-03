import { getSession, ownedAssignment } from "@/lib/auth";
import { assignmentCsv } from "@/lib/dashboard";
import { grammarCsv } from "@/lib/grammar-dashboard";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.kind !== "teacher") return new Response("unauthorized", { status: 401 });
  const id = Number((await params).id);
  const owned = await ownedAssignment(session.teacherId, id);
  if (!owned) return new Response("not found", { status: 404 });
  const csv =
    owned.assignment.kind === "grammar"
      ? await grammarCsv(id, owned.klass.id, owned.assignment.activityId)
      : await assignmentCsv(id, owned.klass.id, owned.assignment.rubric.map((r) => r.key));
  // 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다.
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="assignment-${id}-research.csv"`,
    },
  });
}
