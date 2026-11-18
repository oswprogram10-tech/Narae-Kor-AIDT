// 듣기 활동의 연구 기록(학생 기기에서 센 횟수) 순수 규칙. DB·서버 의존 없음.
// 학생 화면은 마지막으로 보낸 뒤 늘어난 횟수(증가분)를 답안과 함께 보내고, 서버는 events 표에 '듣기 사용' 기록으로 남긴다.
// 학생·문제별 합계는 증가분을 더해 구한다(화면을 새로 열어도 합계가 이어진다).

export const USAGE_MAX = 1000;

export interface ListeningUsage {
  /** 전체 들려주기를 누른 횟수 */
  listen_plays: number;
  /** 말차례·문장 다시 듣기를 누른 횟수 */
  line_replays: number;
  /** 글로 보기를 누른 횟수 */
  transcript_views: number;
}

export const EMPTY_USAGE: ListeningUsage = { listen_plays: 0, line_replays: 0, transcript_views: 0 };

const count = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? Math.min(USAGE_MAX, Math.max(0, Math.floor(x))) : 0);

/** 요청으로 들어온 값을 안전한 횟수로 고친다: 숫자만 받고 0~1000으로 자른다. 객체가 아니거나 모두 0이면 null. */
export function parseListeningUsage(raw: unknown): ListeningUsage | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const u: ListeningUsage = { listen_plays: count(r.listen_plays), line_replays: count(r.line_replays), transcript_views: count(r.transcript_views) };
  return u.listen_plays + u.line_replays + u.transcript_views === 0 ? null : u;
}

/** 기록(events.meta) 여러 개의 증가분을 더한다. 문제 id를 주면 그 문제의 것만. 한 칸은 1000을 넘기지 않는다. */
export function sumListeningUsage(metas: readonly (Record<string, unknown> | null)[], itemId?: string): ListeningUsage {
  const total: ListeningUsage = { ...EMPTY_USAGE };
  for (const m of metas) {
    if (!m || (itemId !== undefined && m.itemId !== itemId)) continue;
    total.listen_plays += count(m.listen_plays);
    total.line_replays += count(m.line_replays);
    total.transcript_views += count(m.transcript_views);
  }
  return { listen_plays: Math.min(USAGE_MAX, total.listen_plays), line_replays: Math.min(USAGE_MAX, total.line_replays), transcript_views: Math.min(USAGE_MAX, total.transcript_views) };
}
