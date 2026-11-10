// Electron 앱을 실제로 띄워 확인한다(Playwright _electron 필요: 이 저장소에 설치하지 않았어요).
//   xvfb-run -a env PLAYWRIGHT_DIR=/경로/node_modules/playwright node scripts/electron-smoke.mjs \
//     --hf-dir <whisper-base 폴더> --wav <16kHz wav> --work <임시 작업 폴더>
// 하는 일: ① 시험 모드(HF 구조, sha256 확인 안 함) 설치·삭제 ② manifest 모드(sha256 맞음/틀림) 설치 ③ 화면에서 소리를 골라 앱 CPU·브라우저 엔진 재기
//   ④ 네트워크 허용 목록(허용하지 않은 주소 차단)과 창 열기·이동 차단.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(here, "..");
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const require = createRequire(import.meta.url);
const { _electron } = require(process.env.PLAYWRIGHT_DIR ?? "playwright");
const work = path.resolve(args.work);
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

// 서버에 둘 폴더: hf/ = HF 구조 그대로, files/narae-asr-lite = 맞는 manifest, files/narae-asr-standard = sha256 하나가 틀린 manifest
const serve = path.join(work, "serve");
const hf = path.resolve(args["hf-dir"]);
const FILES = ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "added_tokens.json", "vocab.json", "merges.txt", "normalizer.json", "onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"];
function copyModel(dst) {
  for (const f of FILES) {
    const to = path.join(dst, f);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (fs.existsSync(path.join(hf, f))) fs.copyFileSync(path.join(hf, f), to);
    else fs.writeFileSync(to, "{}"); // 읽지 않는 부속 파일은 빈 값으로
  }
}
function writeManifest(dir, id, breakOne) {
  const files = FILES.map((f) => {
    const b = fs.readFileSync(path.join(dir, f));
    return { path: f, bytes: b.length, sha256: createHash("sha256").update(b).digest("hex") };
  });
  if (breakOne) files.find((f) => f.path === "config.json").sha256 = "0".repeat(64);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ id, files }));
}
fs.mkdirSync(path.join(serve, "hf/whisper-base/resolve/main"), { recursive: true });
fs.cpSync(hf, path.join(serve, "hf/whisper-base/resolve/main"), { recursive: true });
copyModel(path.join(serve, "files/narae-asr-lite"));
writeManifest(path.join(serve, "files/narae-asr-lite"), "narae-asr-lite", false);
copyModel(path.join(serve, "files/narae-asr-standard"));
writeManifest(path.join(serve, "files/narae-asr-standard"), "narae-asr-standard", true);

let outside = 0; // 허용하지 않은 서버로 들어온 요청 수
const allowedServer = http.createServer((req, res) => {
  const p = path.join(serve, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(serve) || !fs.existsSync(p) || !fs.statSync(p).isFile()) return (res.writeHead(404), res.end("no"));
  res.writeHead(200, { "content-length": fs.statSync(p).size });
  fs.createReadStream(p).pipe(res);
});
const otherServer = http.createServer((_req, res) => (outside++, res.end("x")));
await new Promise((r) => allowedServer.listen(0, "127.0.0.1", r));
await new Promise((r) => otherServer.listen(0, "127.0.0.1", r));
const allowedUrl = `http://127.0.0.1:${allowedServer.address().port}/`;
const otherUrl = `http://127.0.0.1:${otherServer.address().port}/`;

let failed = 0;
const ok = (c, msg) => (console.log(`${c ? "통과" : "실패"}: ${msg}`), c || failed++);

async function launch(name, settings) {
  const userData = path.join(work, name);
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify(settings));
  const app = await _electron.launch({ executablePath: require("electron"), args: [appDir, "--no-sandbox"], env: { ...process.env, NARAE_USER_DATA: userData } });
  const win = await app.firstWindow();
  await win.waitForFunction(() => document.querySelectorAll("#model-table tbody tr").length > 0, null, { timeout: 30000 });
  return { app, win, userData };
}

// ---------------------------------------------------------------- A. 시험 모드
{
  const { app, win } = await launch("a", { modelBaseUrl: allowedUrl, trialMode: true, trialModelPaths: { "narae-asr-lite": "hf/whisper-base/resolve/main/" } });
  ok((await win.title()).includes("속도 시험"), "창이 떴고 제목이 맞아요");
  const info = await win.evaluate(() => window.naraeSpeech.info());
  ok(info.logicalCores > 0 && info.ramGB > 0 && Array.isArray(info.devices), `info() 응답: ${info.cpuModel} / 논리 ${info.logicalCores} / ${info.ramGB}GB / 장치 ${info.devices} / 그래픽 ${JSON.stringify(info.gpu)}`);
  ok(!(await win.locator("#trial-warn").isHidden()), "시험 모드 경고가 보여요");
  const secure = await win.evaluate(() => ({ require: typeof require, process: typeof process, keys: Object.keys(window.naraeSpeech) }));
  ok(secure.require === "undefined" && secure.process === "undefined", `renderer에 Node 기능이 없어요 (${JSON.stringify(secure.keys)})`);
  const st = await win.evaluate(() => window.naraeSpeech.install("narae-asr-lite", "q8"));
  const lite = st.find((m) => m.id === "narae-asr-lite");
  ok(lite.installed.includes("q8") && lite.unverified, "시험 모드 설치 완료(확인 안 함 표시)");
  const st2 = await win.evaluate(() => window.naraeSpeech.remove("narae-asr-lite"));
  ok(st2.find((m) => m.id === "narae-asr-lite").installed.length === 0, "삭제 완료");
  const bad = await win.evaluate(() => window.naraeSpeech.install("nope", "q8").then(() => "ok", (e) => String(e.message)));
  ok(bad !== "ok", `목록에 없는 모델 id 거부: ${bad}`);
  const tooLong = await win.evaluate(() => window.naraeSpeech.transcribe(new Float32Array(16000 * 601), { modelId: "narae-asr-lite" }).then(() => "ok", (e) => String(e.message)));
  ok(tooLong !== "ok", `10분 넘는 소리 거부: ${tooLong}`);
  await app.close();
}

// ---------------------------------------------------------------- B. manifest 모드 + 화면 조작 + 보안
{
  const { app, win, userData } = await launch("b", { modelBaseUrl: allowedUrl + "files/" });
  const good = await win.evaluate(() => window.naraeSpeech.install("narae-asr-lite", "q8").then((s) => s.find((m) => m.id === "narae-asr-lite"), (e) => ({ err: String(e.message) })));
  ok(good.installed?.includes("q8") && !good.unverified, `manifest 모드 설치(확인함): ${JSON.stringify(good).slice(0, 120)}`);
  const badInstall = await win.evaluate(() => window.naraeSpeech.install("narae-asr-standard", "q8").then(() => "ok", (e) => String(e.message)));
  ok(badInstall.includes("sha256"), `sha256이 틀리면 설치 실패: ${badInstall.slice(0, 100)}`);
  const left = fs.existsSync(path.join(userData, "models", "narae-asr-standard", "config.json"));
  const tmpLeft = fs.readdirSync(path.join(userData, "models")).filter((n) => n.startsWith(".tmp-"));
  ok(!left && tmpLeft.length === 0, "실패한 설치의 파일이 남지 않았어요");

  // 화면 조작: wav 고르기 → 재기(앱 CPU + 브라우저 엔진)
  await win.reload();
  await win.waitForFunction(() => document.querySelectorAll("#model-table tbody tr").length > 0);
  await win.locator("#file-wav").setInputFiles(args.wav);
  await win.waitForFunction(() => /wav 파일: [\d.]+초/.test(document.querySelector("#input-status").textContent), null, { timeout: 30000 });
  await win.locator("#chk-dml").uncheck({ force: true }).catch(() => {});
  await win.locator("#ref-text").fill("그는 괜찮은 척하려고 애쓰는 것 같았다");
  await win.locator("#btn-run").click();
  await win.waitForFunction(() => document.querySelectorAll("#result-table tbody tr").length >= 2, null, { timeout: 300000 });
  const rows = await win.evaluate(() => [...document.querySelectorAll("#result-table tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent)));
  console.log("속도 시험 표(화면에서 읽음):");
  console.log(["방식", "장치", "형식", "불러오기", "처리", "RTF", "1분환산", "비고"].join(" | "));
  for (const r of rows) console.log(r.join(" | "));
  ok(rows.length === 2 && rows.every((r) => r[4] !== "-"), "앱 CPU와 브라우저 엔진 모두 결과가 나왔어요");
  await win.locator("#btn-copy").click();
  await win.waitForFunction(() => document.querySelector("#copy-msg").textContent.length > 0, null, { timeout: 5000 }).catch(() => {});
  { const m = await win.locator("#copy-msg").textContent(); ok(m.includes("복사했어요"), `숫자만 복사 버튼: ${m}`); }
  const fl = await win.locator("#fluency-out").textContent();
  ok(fl.includes("어절"), `어절 결과 표시: ${fl.slice(0, 60)}`);
  const files = fs.readdirSync(userData, { recursive: true }).map(String).filter((f) => /\.(wav|webm|ogg|mp3|pcm)$/i.test(f));
  ok(files.length === 0, "userData에 소리 파일이 저장되지 않았어요");

  // 보안: 허용하지 않은 주소 차단, 새 창·이동 차단
  const fetchOther = await win.evaluate((u) => fetch(u, { mode: "no-cors" }).then(() => "열림", () => "막힘"), otherUrl);
  ok(fetchOther === "막힘" && outside === 0, `허용하지 않은 서버로의 요청 차단 (서버가 받은 요청 ${outside}개)`);
  await win.evaluate(() => window.open("https://example.com/"));
  await new Promise((r) => setTimeout(r, 500));
  ok(app.windows().length === 1, "새 창 열기 거부");
  await win.evaluate((u) => { location.href = u; }, otherUrl);
  await new Promise((r) => setTimeout(r, 700));
  ok(win.url().startsWith("narae-app://app/") && outside === 0, `다른 출처로 이동 차단 (현재 ${win.url()})`);
  await app.close();
}

allowedServer.close();
otherServer.close();
console.log(failed ? `\n실패 ${failed}건` : "\n모두 통과");
process.exit(failed ? 1 : 0);
