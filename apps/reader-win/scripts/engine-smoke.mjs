// Electron 없이 Node에서 인식 엔진(out/engine-core.cjs)이 도는지 확인한다.
//   npm run build
//   NODE_USE_ENV_PROXY=1 node scripts/engine-smoke.mjs --models-dir <캐시폴더> --model-id narae-asr-lite --hf-dir <whisper-base 폴더> --eval <eval.jsonl>
// --models-dir 아래에 <model-id> 폴더가 없으면 --hf-dir(onnx-community/whisper-base 같은 폴더)를 그 이름으로 이어 줘요(심볼릭 링크).
// 전사 글은 기본으로 출력하지 않고 숫자만 보여 줘요(--show-text 로 내 화면에만).
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? "1" : all[i + 1]]] : acc), []),
);
const modelsDir = path.resolve(args["models-dir"] ?? path.join(os.tmpdir(), "narae-reader-models"));
const modelId = args["model-id"] ?? "narae-asr-lite";
const dtype = args.dtype ?? "q8";
const device = args.device ?? "cpu";
const evalFile = args.eval;
if (!evalFile || !args["hf-dir"] && !fs.existsSync(path.join(modelsDir, modelId))) {
  console.error("필요한 것: --eval <eval.jsonl>, 그리고 --models-dir 안에 모델 폴더가 있거나 --hf-dir <폴더>");
  process.exit(1);
}
fs.mkdirSync(modelsDir, { recursive: true });
if (args["hf-dir"] && !fs.existsSync(path.join(modelsDir, modelId))) fs.symlinkSync(path.resolve(args["hf-dir"]), path.join(modelsDir, modelId), "dir");

function readWav16k(file) {
  const buf = fs.readFileSync(file);
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4), size = buf.readUInt32LE(pos + 4), body = pos + 8;
    if (id === "fmt ") fmt = { channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    else if (id === "data") { data = buf.subarray(body, Math.min(body + size, buf.length)); break; }
    pos = body + size + (size % 2);
  }
  if (!fmt || !data || fmt.bits !== 16 || fmt.rate !== 16000) throw new Error("16kHz 16비트 wav 만 읽어요");
  const n = Math.floor(data.length / (2 * fmt.channels));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < fmt.channels; c++) s += data.readInt16LE((i * fmt.channels + c) * 2) / 32768; out[i] = s / fmt.channels; }
  return out;
}

const { createEngine } = require(path.join(here, "../out/engine-core.cjs"));
const threads = Number(args.threads) || Math.max(1, Math.floor(os.cpus().length / 2));
const engine = createEngine({ modelsDir, threads });
const base = path.dirname(path.resolve(evalFile));
const items = fs.readFileSync(evalFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const rows = [];
for (const it of items) {
  const audio = readWav16k(path.resolve(base, it.audio));
  const r = await engine.transcribe({ modelId, device, dtype, audio });
  rows.push({ id: it.id, ...r });
  if (args["show-text"]) console.log(`  정답: ${it.text}\n  결과: ${r.text}`);
}
// 입력 검사도 확인: 길이 상한을 넘는 소리는 거부해야 한다
let rejected = false;
try {
  await engine.transcribe({ modelId, device, dtype, audio: new Float32Array(16000 * 601) });
} catch {
  rejected = true;
}
await engine.dispose();

console.log(`\n엔진 smoke | 모델 ${modelId} (${dtype}) | 장치 요청 ${device} | 스레드 ${threads} | ${os.cpus()[0]?.model} (논리 ${os.cpus().length})`);
console.log("| 발화 | 소리(초) | 실제 장치 | 불러오기(초) | 처리(초) | RTF | 1분 낭독 환산(초) | 글자 수 |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const r of rows) console.log(`| ${r.id} | ${r.audioSeconds} | ${r.device} | ${r.loadSeconds} | ${r.seconds} | ${r.rtf} | ${Math.round(r.rtf * 600) / 10} | ${Array.from(r.text.replace(/\s/g, "")).length} |`);
console.log(`10분 초과 입력 거부: ${rejected ? "예" : "아니요(문제)"}`);
if (!rejected || rows.some((r) => !r.text)) process.exit(1);
