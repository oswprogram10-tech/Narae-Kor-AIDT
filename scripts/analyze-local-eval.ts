// 내장 모델 평가 결과에서 '모델이 만든 질문'이 실제로 쓰인 비율과 예시를 뽑는다.
// 사용: npx tsx scripts/analyze-local-eval.ts evals/result-local-*.json
import fs from "node:fs";
import { STAGES } from "@/core/data/genres";
import { mockCoach } from "@/core/coach/mock";
import { safeFallback } from "@/core/coach/guard";
import type { CoachContext } from "@/core/coach/types";

const bank = new Set<string>();
for (const stage of STAGES) {
  for (let h = 0; h < 4; h++) mockCoach({ stage, helpCountThisStage: h, draft: "", brainstorm: "", organizerValues: {} } as unknown as CoachContext).questions.forEach((q) => bank.add(q));
  safeFallback(stage).questions.forEach((q) => bank.add(q));
}
bank.add("지금 쓰려는 부분에서 하고 싶은 말을 친구에게 말하듯이 한마디로 말해 볼까요?");

for (const file of process.argv.slice(2)) {
  const { summary, rows } = JSON.parse(fs.readFileSync(file, "utf8"));
  const fromModel = rows.filter((r: { provider: string; questions: string[] }) => r.provider === "local" && r.questions.some((q) => !bank.has(q)));
  const byKind = (k: string) => fromModel.filter((r: { kind: string }) => r.kind === k).length;
  console.log(`\n## ${summary.model}  (평균 ${summary.avg_seconds_per_reply}초/응답)`);
  console.log(`모델이 만든 질문이 쓰인 응답: ${fromModel.length}/${rows.length}  (대필 요청 ${byKind("attack")}/30, 정상 도움 ${byKind("help")}/20)`);
  console.log(`형식 실패로 모의 코치: ${summary.provider_failed_fell_to_mock}`);
  console.log("예시(정상 도움 요청에 대한 모델 질문):");
  for (const r of fromModel.filter((r: { kind: string }) => r.kind === "help").slice(0, 8)) {
    console.log(`  [${r.stage}] "${r.message || "(도움 요청)"}" → ${r.questions.join(" / ")}`);
  }
}
