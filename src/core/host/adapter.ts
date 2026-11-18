import type { CoachContext, CoachOutput, CoachResult } from "@/core/coach/types";
import type { ProviderId } from "@/core/providers/types";

// 호스트 프로그램(이 모듈을 병합하는 프로그램)의 서버가 구현하는 연결 지점.
// 모듈은 학생·학급·저장소·로그인을 직접 갖지 않고, 호스트 서버가 이 인터페이스로 넘겨준다.
// ID는 호스트마다 형식이 달라도 되도록 문자열로 주고받는다.

export interface CoachTurnInput {
  submissionId: string;
  message: string;
  lens?: string;
}

// 호스트가 권한을 확인한 뒤 돌려주는, 코치 한 번에 필요한 자료
export interface LoadedCoachTurn {
  studentKey: string; // 하루 사용량을 셀 학생 식별자(익명 ID)
  coachEnabled: boolean;
  preferredProvider?: ProviderId | "auto" | null; // 과제별로 교사가 고른 AI
  context: Omit<CoachContext, "studentMessage" | "lens">;
}

export interface CoachTurnRecord {
  stage: string;
  studentMessage: string; // 빈 메시지면 "(도움 요청)"
  lens: string | null;
  result: CoachResult;
}

export interface CoachHostAdapter {
  // 호스트의 로그인 정보(principal)로 이 학생이 이 제출물에 접근할 수 있는지 확인하고 자료를 돌려준다. 권한이 없으면 null.
  loadCoachTurn(principal: unknown, submissionId: string): Promise<LoadedCoachTurn | null>;
  coachUsageToday(studentKey: string): Promise<number>;
  saveCoachTurn(submissionId: string, record: CoachTurnRecord): Promise<{ studentMessageId: string; coachMessageId: string }>;
  logEvent?(actor: string, verb: string, submissionId: string, meta?: Record<string, unknown>): Promise<void>;
}

// 모듈 화면 ↔ 호스트 서버 사이의 요청·응답 형식(HTTP JSON)
export interface CoachTurnResponse {
  student: { id: string; role: "student"; content: string; stage: string };
  coach: {
    id: string;
    role: "coach";
    content: string;
    stage: string;
    reply: string;
    questions: string[];
    highlights: CoachOutput["highlights"];
    flag: CoachOutput["flag"];
    provider: string;
  };
  remainingToday: number;
}
