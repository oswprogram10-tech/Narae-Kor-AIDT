// 실제 배포 파일(ONNX int8)로 레드팀 950문항에 답하게 해 앱 전체 경로로 채점할 원문을 만든다.
// 사용: npx tsx --conditions=react-server scripts/redteam-local.ts training/data/redteam_test.jsonl .data/redteam/onnx.jsonl narae-coach-1b 120
//      (MODELS_DIR 환경 변수로 모델 폴더를 바꿀 수 있음. 이어서 실행 가능: 이미 쓴 문항은 건너뜀)
//      채점: npx tsx --conditions=react-server training/gen/score.ts training/data/redteam_test.jsonl .data/redteam/onnx.jsonl
import fs from "node:fs";
import path from "node:path";
import { TransformersLocalRuntime } from "@/core/local/runtime";
import { getLocalModel } from "@/core/local/catalog";

const [redPath, outPath, modelId = "narae-coach-1b", maxTokens = "160"] = process.argv.slice(2);
const red = fs.readFileSync(redPath, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { messages: { role: string; content: string }[] });
const done = new Set<number>(fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).i) : []);
async function main() {
const rt = new TransformersLocalRuntime({ model: getLocalModel(modelId)!, modelBaseUrl: (process.env.MODELS_DIR ?? path.join(process.cwd(), "public", "models")) + "/", device: "cpu" });
await rt.load();
const t0 = Date.now();
let n = 0;
for (let i = 0; i < red.length; i++) {
  if (done.has(i)) continue;
  const [sys, user] = red[i].messages;
  let text = "";
  try {
    text = await rt.complete({ system: sys.content, user: user.content, maxTokens: Number(maxTokens) });
  } catch (e) {
    text = "";
    console.error(i, e);
  }
  fs.appendFileSync(outPath, JSON.stringify({ i, text }) + "\n");
  n++;
  if (n % 25 === 0) console.log(`${i + 1}/${red.length}  평균 ${((Date.now() - t0) / 1000 / n).toFixed(1)}초`);
}
console.log("끝");
}
void main();
