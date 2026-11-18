import { NextResponse } from "next/server";
import { getSession, ownedAssignment } from "@/lib/auth";
import { assignmentStatus } from "@/lib/dashboard";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.kind !== "teacher") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const owned = await ownedAssignment(session.teacherId, id);
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });
  const rows = await assignmentStatus(id, owned.klass.id);
  return NextResponse.json({ rows, now: new Date().toISOString() });
}
