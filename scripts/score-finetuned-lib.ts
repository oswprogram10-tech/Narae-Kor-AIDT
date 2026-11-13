// score-finetuned.ts 의 순수 함수(테스트용으로 분리).
import path from "node:path";

export const SUFFIX = "_redteam_outputs.jsonl";

export function modelNameOf(file: string): string {
  const b = path.basename(file);
  return b.endsWith(SUFFIX) ? b.slice(0, -SUFFIX.length) : b;
}

// 'score.ts' 출력의 마지막 판정 줄을 읽는다.
export function parseVerdict(output: string): boolean | null {
  if (output.includes("최종: 채택 가능")) return true;
  if (output.includes("최종: 채택 불가")) return false;
  return null;
}

export function overallVerdict(results: { name: string; pass: boolean | null }[]): string {
  const cands = results.filter((r) => r.name !== "base");
  const passed = cands.filter((r) => r.pass === true).map((r) => r.name);
  if (passed.length) return `최종 판정: 채택 후보 있음 (${passed.join(", ")}) - docs/finetuned-model-adoption.md 의 다음 단계로 진행하세요.`;
  return "최종 판정: 채택 불가 - trustsGhostwriteFlag 를 true 로 바꾸지 마세요. 결과를 분석에 보내세요.";
}
