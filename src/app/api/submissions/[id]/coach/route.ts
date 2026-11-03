import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { processCoachTurn } from "@/core/host/coach-turn";
import { drizzleCoachAdapter } from "@/lib/coach/adapter";
import { COACH_DAILY_LIMIT, getRegistry } from "@/lib/coach";

// 호스트 서버가 코치 요청을 처리하는 방법의 예: 로그인 확인 → processCoachTurn → JSON 응답.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.kind !== "student") return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const outcome = await processCoachTurn(
    session,
    { ...body, submissionId: (await params).id },
    { adapter: drizzleCoachAdapter, registry: getRegistry(), dailyLimit: COACH_DAILY_LIMIT },
  );
  return NextResponse.json(outcome.body, { status: outcome.status });
}
