import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prepareCoachTurn, processCoachTurn, recordLocalCoachTurn } from "@/core/host/coach-turn";
import { drizzleCoachAdapter } from "@/lib/coach/adapter";
import { COACH_DAILY_LIMIT, getRegistry } from "@/lib/coach";

// 호스트 서버가 코치 요청을 처리하는 방법의 예: 로그인 확인 → core 함수 → JSON 응답.
// mode 없음: 서버의 외부 AI(또는 모의 코치)로 답함
// mode=prepare: 기기의 내장 모델이 쓸 자료를 돌려줌
// mode=record: 기기의 내장 모델이 만든 답을 다시 검사해 저장
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.kind !== "student") return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const input = { ...body, submissionId: (await params).id };
  const outcome =
    body.mode === "prepare"
      ? await prepareCoachTurn(session, input, drizzleCoachAdapter)
      : body.mode === "record"
        ? await recordLocalCoachTurn(session, input, drizzleCoachAdapter)
        : await processCoachTurn(session, input, { adapter: drizzleCoachAdapter, registry: getRegistry(), dailyLimit: COACH_DAILY_LIMIT });
  return NextResponse.json(outcome.body, { status: outcome.status });
}
