// 내장 모델 파일을 Hugging Face에서 내려받아 모듈 안(public/models/<id>/)에 넣는다.
// 사용: node scripts/fetch-model.mjs qwen2.5-0.5b [q4f16,q4]
//  - q4f16: WebGPU 기기용, q4: WebGPU가 없는 기기(WASM)용. 둘 다 넣으면 모든 기기를 지원한다.
// 파일이 커서(수백 MB) git에는 넣지 않는다(.gitignore). 배포할 때 함께 복사하거나 호스트가 제공하는 저장소에 둔다.
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const CATALOG = {
  "qwen2.5-0.5b": "onnx-community/Qwen2.5-0.5B-Instruct",
  "qwen3-0.6b": "onnx-community/Qwen3-0.6B-ONNX",
  "gemma-3-1b": "onnx-community/gemma-3-1b-it-ONNX",
};
const META_FILES = [
  "config.json",
  "generation_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "chat_template.jinja",
  "chat_template.json",
];

const [id, dtypesArg = "q4f16,q4"] = process.argv.slice(2);
const repo = CATALOG[id];
if (!repo) {
  console.error(`모델 id를 확인하세요: ${Object.keys(CATALOG).join(", ")}`);
  process.exit(1);
}
const dtypes = dtypesArg.split(",").map((s) => s.trim());
const outDir = path.join(process.cwd(), "public", "models", id);
const hf = "https://huggingface.co";

// 429(요청 과다)·5xx는 잠시 기다렸다가 다시 시도한다(2·4·8·16초).
async function fetchRetry(url) {
  for (let i = 0; ; i++) {
    const r = await fetch(url);
    if ((r.status === 429 || r.status >= 500) && i < 4) {
      const wait = Number(r.headers.get("retry-after")) * 1000 || 2000 * 2 ** i;
      console.log(`    (서버가 잠시 기다리라고 해요: ${r.status}, ${Math.round(wait / 1000)}초 뒤 다시 시도)`);
      await new Promise((res) => setTimeout(res, wait));
      continue;
    }
    return r;
  }
}

const tree = async (sub) => {
  const r = await fetchRetry(`${hf}/api/models/${repo}/tree/main${sub ? "/" + sub : ""}`);
  if (!r.ok) throw new Error(`목록을 가져오지 못했어요(${r.status})`);
  return r.json();
};
const root = (await tree("")).map((f) => f.path);
const onnx = (await tree("onnx")).map((f) => ({ path: f.path, size: f.size }));
const wanted = [
  ...META_FILES.filter((f) => root.includes(f)).map((p) => ({ path: p, size: 0 })),
  ...onnx.filter((f) => dtypes.some((d) => f.path === `onnx/model_${d}.onnx` || f.path.startsWith(`onnx/model_${d}.onnx_data`))),
];
const total = wanted.reduce((a, f) => a + (f.size || 0), 0);
console.log(`${repo} → ${path.relative(process.cwd(), outDir)}  (${wanted.length}개 파일, 약 ${Math.round(total / 1e6)}MB)`);

for (const f of wanted) {
  const dest = path.join(outDir, f.path);
  if (fs.existsSync(dest) && f.size && fs.statSync(dest).size === f.size) {
    console.log(`  ✓ ${f.path} (이미 있음)`);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    const r = await fetchRetry(`${hf}/${repo}/resolve/main/${f.path}`);
    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(dest + ".part"));
  } catch (err) {
    console.error(`  ✗ ${f.path} 내려받기 실패: ${err.cause?.message ?? err.message}`);
    console.error("    큰 파일은 Hugging Face의 다른 주소(*.hf.co CDN)에서 내려옵니다. 방화벽·네트워크 설정을 확인하세요.");
    process.exit(1);
  }
  fs.renameSync(dest + ".part", dest);
  console.log(`  ↓ ${f.path} ${f.size ? Math.round(f.size / 1e6) + "MB" : ""}`);
}
console.log("완료. .env.local 에 NARAE_LOCAL_MODEL=" + id + " 을 넣으면 학생 화면에서 내장 AI를 쓸 수 있어요.");
