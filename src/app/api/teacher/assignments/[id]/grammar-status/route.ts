import { NextResponse } from "next/server";
import { getSession, ownedAssignment } from "@/lib/auth";
import { grammarStatus } from "@/lib/grammar-dashboard";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.kind !== "teacher") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const owned = await ownedAssignment(session.teacherId, id);
  const kind = owned?.assignment.kind;
  if (!owned || (kind !== "grammar" && kind !== "reading" && kind !== "media")) return NextResponse.json({ error: "not found" }, { status: 404 });
  const status = await grammarStatus(id, owned.klass.id, owned.assignment.activityId, kind);
  return NextResponse.json({ ...status, now: new Date().toISOString() });
}
