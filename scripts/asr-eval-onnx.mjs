// 배포 형식 그대로(transformers.js + ONNX 8비트) 음성 인식 모델의 정확도와 속도를 잰다.
// 앱이 실제로 쓰는 것과 같은 라이브러리(@huggingface/transformers, Node에서는 onnxruntime-node CPU)로 돌려서
// 낭독 채점 규칙(src/core/fluency, 파이썬 training/asr/fluency.py 와 같음)으로 CER·WER·오경보율을 내고 RTF·1분 낭독 처리 시간·최대 메모리를 알려 준다.
//
// 사용(저장소의 tsx가 src/core/fluency 의 .ts 를 바로 불러와요):
//   npx tsx scripts/asr-eval-onnx.mjs --model work/export/narae-asr-lite --eval training/asr/work/eval.jsonl
//   npx tsx scripts/asr-eval-onnx.mjs --model onnx-community/whisper-base --eval 평가.jsonl --threads 6 --cache /tmp/asr-cache
//   npx tsx scripts/asr-eval-onnx.mjs --model 폴더 --audio-dir 소리폴더 --refs 정답.tsv      (wav 이름<TAB>정답 글)
//
// 옵션
//   --model <폴더|HF id>   내보낸 폴더(onnx/encoder_model_quantized.onnx …) 또는 HF 저장소 id (필수)
//   --eval <eval.jsonl>    줄마다 {"id","audio","text","seconds"?}. audio 가 상대 경로면 jsonl 이 있는 폴더 기준
//   --audio-dir/--refs     jsonl 대신 wav 폴더 + "이름<TAB>정답" 목록
//   --dtype q8             불러올 형식(기본 q8 = *_quantized.onnx)
//   --threads N            onnxruntime 스레드 수(기본: 물리 코어 어림 = 논리 스레드/2)
//   --limit N              앞에서 N개만
//   --warmup N             시간 재기 전에 먼저 돌려 볼 횟수(기본 1, 첫 실행의 준비 시간을 빼요)
//   --no-minute            '1분 낭독' 실측을 건너뜀(기본은 소리를 이어 붙여 60초짜리를 한 번 더 돌려 걸린 시간을 잼)
//   --cache <폴더>         HF 에서 받은 파일을 둘 곳(기본: 시스템 임시 폴더 안 narae-asr-cache). 모델 파일을 저장소 안에 두지 마세요
//   --remote-host <주소>   HF 대신 쓸 서버 주소(국내 미러나 막힌 네트워크용, 끝에 / 필수)
//   --out <파일.json>      숫자 결과를 저장
//   --show-examples N      정답과 인식 결과 글 N개를 내 화면에만 보여 줘요(기본: 글은 출력하지 않아요)
// 전사 글은 기본으로 출력도 저장도 하지 않아요(아동 음성 약관). 숫자만 나와요.
//
// 모델 하나당 프로세스 하나로 실행하세요(최대 메모리는 프로세스 전체의 최댓값이에요).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { alignEojeol, charErrorRate } from "../src/core/fluency/index.ts";

// ---------------------------------------------------------------- 인자
const argv = process.argv.slice(2);
const opt = { dtype: "q8", warmup: 1, minute: true, showExamples: 0, limit: 0 };
const flags = {
  "--model": (v) => (opt.model = v),
  "--eval": (v) => (opt.eval = v),
  "--audio-dir": (v) => (opt.audioDir = v),
  "--refs": (v) => (opt.refs = v),
  "--dtype": (v) => (opt.dtype = v),
  "--threads": (v) => (opt.threads = Number(v)),
  "--limit": (v) => (opt.limit = Number(v)),
  "--warmup": (v) => (opt.warmup = Number(v)),
  "--cache": (v) => (opt.cache = v),
  "--remote-host": (v) => (opt.remoteHost = v),
  "--out": (v) => (opt.out = v),
  "--show-examples": (v) => (opt.showExamples = Number(v)),
};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--no-minute") opt.minute = false;
  else if (argv[i] === "--help" || argv[i] === "-h") {
    console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
    process.exit(0);
  } else if (flags[argv[i]]) flags[argv[i]](argv[++i]);
  else {
    console.error(`모르는 옵션이에요: ${argv[i]} (--help 로 보세요)`);
    process.exit(1);
  }
}
if (!opt.model || (!opt.eval && !(opt.audioDir && opt.refs))) {
  console.error("필요한 것: --model <폴더|HF id> 와 --eval <eval.jsonl> (또는 --audio-dir + --refs). 자세한 설명은 --help");
  process.exit(1);
}
// 논리 스레드의 절반을 물리 코어로 어림(5625U: 12 → 6). 정확하지 않으니 --threads 로 직접 주면 좋아요.
const threads = opt.threads > 0 ? opt.threads : Math.max(1, Math.floor(os.cpus().length / 2));

// ---------------------------------------------------------------- 자료 읽기
function readWav16k(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error(`wav 가 아니에요: ${path.basename(file)}`);
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    else if (id === "data") {
      data = buf.subarray(body, Math.min(body + size, buf.length));
      break;
    }
    pos = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`wav 구조를 읽지 못했어요: ${path.basename(file)}`);
  if (!(fmt.format === 1 && fmt.bits === 16) && !(fmt.format === 3 && fmt.bits === 32)) throw new Error("16비트 PCM 또는 32비트 float wav 만 읽어요");
  const bytes = fmt.bits / 8;
  const frames = Math.floor(data.length / (bytes * fmt.channels));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const o = (i * fmt.channels + c) * bytes;
      s += fmt.bits === 16 ? data.readInt16LE(o) / 32768 : data.readFloatLE(o);
    }
    mono[i] = s / fmt.channels;
  }
  if (fmt.rate === 16000) return mono;
  // 16kHz 가 아니면 선형 보간(평가 묶음 wav 는 이미 16kHz 예요)
  const ratio = fmt.rate / 16000;
  const out = new Float32Array(Math.floor(frames / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const j = Math.floor(x);
    out[i] = mono[j] + (mono[Math.min(j + 1, frames - 1)] - mono[j]) * (x - j);
  }
  return out;
}

function loadItems() {
  let items = [];
  if (opt.eval) {
    const base = path.dirname(path.resolve(opt.eval));
    for (const line of fs.readFileSync(opt.eval, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      items.push({ id: String(r.id ?? items.length), audio: path.resolve(base, r.audio), text: r.text, grade: r.grade, noise: r.noise });
    }
  } else {
    for (const line of fs.readFileSync(opt.refs, "utf8").split("\n")) {
      const [name, ...rest] = line.split("\t");
      if (name && rest.length) items.push({ id: name, audio: path.resolve(opt.audioDir, name), text: rest.join("\t") });
    }
  }
  if (opt.limit > 0) items = items.slice(0, opt.limit);
  return items;
}

// ---------------------------------------------------------------- 점수
const nospace = (s) => Array.from(s.normalize("NFC")).filter((c) => !/\s/u.test(c)).join("");

function score(items, hyps) {
  let ce = 0;
  let cn = 0;
  let we = 0;
  let wn = 0;
  let faEoj = 0;
  let faUtt = 0;
  items.forEach((it, i) => {
    const r = nospace(it.text);
    const h = nospace(hyps[i]);
    ce += Math.round(charErrorRate(r, h) * Array.from(r).length);
    cn += Array.from(r).length;
    const a = alignEojeol(it.text, hyps[i]); // 띄어쓰기 무시, 어절 같음 기준 0(정확히 같을 때만)
    const bad = a.items.filter((x) => x.op !== "match").length;
    we += bad + a.insertions.length;
    wn += a.items.length;
    faEoj += bad; // 오경보: 맞게 읽은 소리를 틀렸다고 한 어절(대치·삭제만, 끼워 넣기는 오류 아님)
    faUtt += bad ? 1 : 0;
  });
  const r4 = (x) => Math.round(x * 10000) / 10000;
  return { n: items.length, cer: r4(ce / Math.max(cn, 1)), wer: r4(we / Math.max(wn, 1)), falseAlarmEojeol: r4(faEoj / Math.max(wn, 1)), falseAlarmUtterance: r4(faUtt / Math.max(items.length, 1)), eojeols: wn };
}

// ---------------------------------------------------------------- 실행
const tf = await import("@huggingface/transformers");
const isDir = fs.existsSync(opt.model) && fs.statSync(opt.model).isDirectory();
if (isDir) {
  const abs = path.resolve(opt.model);
  tf.env.localModelPath = path.dirname(abs) + path.sep;
  tf.env.allowLocalModels = true;
  tf.env.allowRemoteModels = false;
} else {
  tf.env.allowRemoteModels = true;
  tf.env.cacheDir = path.resolve(opt.cache ?? path.join(os.tmpdir(), "narae-asr-cache"));
  if (opt.remoteHost) tf.env.remoteHost = opt.remoteHost;
}
const modelName = isDir ? path.basename(path.resolve(opt.model)) : opt.model;

const items = loadItems();
if (!items.length) {
  console.error("평가할 소리가 없어요.");
  process.exit(1);
}
const audios = items.map((it) => readWav16k(it.audio));
const seconds = audios.map((a) => a.length / 16000);
const totalAudio = seconds.reduce((a, b) => a + b, 0);

const tLoad = performance.now();
const pipe = await tf.pipeline("automatic-speech-recognition", modelName, {
  device: "cpu",
  dtype: opt.dtype,
  session_options: { intra_op_num_threads: threads, inter_op_num_threads: 1 },
});
const loadSec = (performance.now() - tLoad) / 1000;
const modelType = pipe.model?.config?.model_type ?? "";
const callOpts = modelType === "whisper" ? { language: "korean", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 } : {};

async function transcribe(audio) {
  const res = await pipe(audio, callOpts);
  return String(Array.isArray(res) ? res[0].text : res.text).trim();
}

for (let i = 0; i < opt.warmup; i++) await transcribe(audios[i % audios.length]);
const rssAfterWarmup = process.resourceUsage().maxRSS / 1024;

const hyps = [];
const t0 = performance.now();
for (let i = 0; i < audios.length; i++) {
  hyps.push(await transcribe(audios[i]));
  if ((i + 1) % 20 === 0) console.error(`  ${i + 1}/${audios.length}`);
}
const inferSec = (performance.now() - t0) / 1000;

// '1분 낭독'을 실제로 재 본다: 소리를 이어 붙여 60초짜리를 만들어 한 번 돌린다(Whisper 는 30초씩 나눠 읽어요).
let minute = null;
if (opt.minute) {
  const parts = [];
  let len = 0;
  for (let i = 0; len < 60 * 16000; i++) {
    const a = audios[i % audios.length];
    parts.push(a);
    len += a.length;
  }
  const joined = new Float32Array(60 * 16000);
  let off = 0;
  for (const a of parts) {
    const n = Math.min(a.length, joined.length - off);
    joined.set(a.subarray(0, n), off);
    off += n;
    if (off >= joined.length) break;
  }
  const t1 = performance.now();
  await transcribe(joined);
  minute = (performance.now() - t1) / 1000;
}
const maxRssMB = process.resourceUsage().maxRSS / 1024;

// ---------------------------------------------------------------- 출력
const sc = score(items, hyps);
const modelBytes = isDir
  ? (() => {
      let sum = 0;
      for (const f of fs.readdirSync(path.join(opt.model, "onnx"), { withFileTypes: true })) if (f.isFile() && f.name.includes("_quantized")) sum += fs.statSync(path.join(opt.model, "onnx", f.name)).size;
      return sum;
    })()
  : null;
const result = {
  model: modelName,
  modelType,
  dtype: opt.dtype,
  threads,
  cpu: os.cpus()[0]?.model,
  logicalCpus: os.cpus().length,
  utterances: sc.n,
  audioSeconds: Math.round(totalAudio * 10) / 10,
  loadSeconds: Math.round(loadSec * 10) / 10,
  inferSeconds: Math.round(inferSec * 100) / 100,
  rtf: Math.round((inferSec / totalAudio) * 1000) / 1000,
  secPerMinuteAudio: Math.round((inferSec / totalAudio) * 60 * 10) / 10,
  measuredMinuteSeconds: minute === null ? null : Math.round(minute * 10) / 10,
  maxRssMB: Math.round(maxRssMB),
  maxRssAfterWarmupMB: Math.round(rssAfterWarmup),
  modelMB: modelBytes === null ? null : Math.round(modelBytes / 2 ** 20),
  ...sc,
};
console.log(`\n모델 ${result.model} (${result.modelType}, ${result.dtype}) | 스레드 ${threads} | ${result.cpu} (논리 ${result.logicalCpus})`);
console.log("| 발화 | 소리(초) | CER | 어절 WER(띄어쓰기 무시) | 오경보율 어절 | 오경보율 발화 | RTF | 1분 낭독 환산(초) | 1분 실측(초) | 불러오기(초) | 최대 메모리(MB) |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
console.log(
  `| ${result.utterances} | ${result.audioSeconds} | ${result.cer} | ${result.wer} | ${result.falseAlarmEojeol} | ${result.falseAlarmUtterance} | ${result.rtf} | ${result.secPerMinuteAudio} | ${result.measuredMinuteSeconds ?? "-"} | ${result.loadSeconds} | ${result.maxRssMB} |`,
);
if (opt.showExamples > 0) {
  console.log("\n[전사 예시: 내 화면에만 보세요. 저장·공유하지 마세요]");
  items.slice(0, opt.showExamples).forEach((it, i) => console.log(`  정답: ${it.text}\n  결과: ${hyps[i]}`));
}
if (opt.out) {
  fs.writeFileSync(opt.out, JSON.stringify(result, null, 2));
  console.log(`\n숫자 결과를 저장했어요: ${opt.out}`);
}
