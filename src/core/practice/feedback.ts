// 연습 활동(문법·읽기)이 함께 쓰는 찍기 방지 단계.
// 1번째 오답 → 원리, 2번째 → 힌트1, 3번째 → 힌트2, 4번째 이상 → 정답 공개.

export type FeedbackLevel = "principle" | "hint1" | "hint2" | "reveal";

/** wrongCount: 지금까지 틀린 횟수(이번 오답 포함). */
export function feedbackLevel(wrongCount: number): FeedbackLevel {
  if (wrongCount <= 1) return "principle";
  if (wrongCount === 2) return "hint1";
  if (wrongCount === 3) return "hint2";
  return "reveal";
}
