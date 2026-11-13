// 파인튜닝 모델의 레드팀 결과를 앱 전체 경로 기준으로 다시 채점한다(채점 논리는 training/gen/score.ts 그대로 사용).
// 사용:
//   npm run score:finetuned -- <폴더>                        (폴더 안의 *_redteam_outputs.jsonl 모두)
//   npm run score:finetuned -- a_redteam_outputs.jsonl ...    (파일 직접 지정)
//   npm run score:finetuned -- --download LUDICERECIDUL/narae-coach-gemma3-1b [--dir .data/redteam]
//      Hugging Face의 redteam/{base,sft,dpo}_redteam_outputs.jsonl 을 받아 채점한다. 비공개면 HF_TOKEN 환경 변수에 읽기 토큰.
//      이 환경(클라우드)에서는 Node가 프록시를 쓰도록 NODE_USE_ENV_PROXY=1 을 앞에 붙인다.
// 판정: base는 학습 전 기준선이라 채택 대상이 아니다. sft·dpo 중 하나라도 모든 기준을 통과하면 그 이름을 보여 준다.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { modelNameOf, overallVerdict, parseVerdict, SUFFIX } from "./score-finetuned-lib";

const NAMES = ["base", "sft", "dpo"];
const RED = path.join(process.cwd(), "training", "data", "redteam_test.jsonl");

async function download(repo: string, dir: string): Promise<string[]> {
  fs.mkdirSync(dir, { recursive: true });
  const headers: Record<string, string> = process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {};
  const files: string[] = [];
  for (const n of NAMES) {
    const rel = `redteam/${n}${SUFFIX}`;
    const r = await fetch(`https://huggingface.co/${repo}/resolve/main/${rel}`, { headers });
    if (!r.ok) {
      console.error(`- ${rel}: 받지 못했어요(HTTP ${r.status}). 저장소 이름·HF_TOKEN·NODE_USE_ENV_PROXY=1 을 확인하세요.`);
      continue;
    }
    const dest = path.join(dir, `${n}${SUFFIX}`);
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    console.log(`- ${rel} → ${path.relative(process.cwd(), dest)}`);
    files.push(dest);
  }
  return files;
}

function collect(inputs: string[]): string[] {
  const out: string[] = [];
  for (const p of inputs) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      out.push(...fs.readdirSync(p).filter((f) => f.endsWith(SUFFIX)).sort().map((f) => path.join(p, f)));
    } else out.push(p);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const take = (flag: string): string | null => {
    const i = args.indexOf(flag);
    return i >= 0 ? (args.splice(i, 2)[1] ?? null) : null;
  };
  const repo = take("--download");
  const dir = take("--dir") ?? path.join(".data", "redteam");
  let files: string[];
  if (repo) {
    console.log(`${repo} 에서 레드팀 결과를 받습니다.`);
    files = await download(repo, dir);
  } else {
    files = collect(args);
  }
  if (!files.length) {
    console.error("채점할 *_redteam_outputs.jsonl 파일이 없어요. 폴더·파일 경로 또는 --download <hfRepo> 를 주세요.");
    process.exit(1);
  }
  const results: { name: string; pass: boolean | null }[] = [];
  for (const f of files) {
    const name = modelNameOf(f);
    console.log(`\n=== ${name} (${f}) ===`);
    // 채점 논리는 training/gen/score.ts 하나만 둔다(복제 금지). 별도 프로세스로 실행한다.
    const r = spawnSync("npx", ["tsx", "--conditions=react-server", "training/gen/score.ts", RED, f], { encoding: "utf8", env: process.env });
    const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    process.stdout.write(text);
    results.push({ name, pass: r.status === 0 ? parseVerdict(text) : null });
  }
  console.log(`\n${overallVerdict(results)}`);
  if (!results.some((r) => r.name !== "base" && r.pass)) process.exitCode = 2;
}

void main();
