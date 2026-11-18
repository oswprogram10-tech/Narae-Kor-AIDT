// 속도 시험 화면(교사용). 입력 소리는 메모리에만 두고, 인식된 글도 화면에만 보여 준다(저장·전송 없음).
import { fluencyScore, splitEojeols } from "../../../../src/core/fluency";
import type { SpeechDtype } from "../../../../src/core/speech";
import type { DeviceInfo, InstallProgress, ModelStatus, TranscribeResult } from "../lib/api";
import { perMinuteSeconds } from "../lib/device";
import { decodeTo16k, startRecording, type Recorder } from "./audio";
import { browserTranscribe } from "./browser-engine";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el as T;
};
const api = window.naraeSpeech;

interface Row {
  method: string;
  device: string;
  dtype: string;
  loadSeconds: number | null;
  seconds: number | null;
  rtf: number | null;
  perMinute: number | null;
  note: string;
}

const state = {
  audio: null as Float32Array | null,
  models: [] as ModelStatus[],
  info: null as DeviceInfo | null,
  rows: [] as Row[],
  texts: [] as Array<{ label: string; text: string }>,
  recorder: null as Recorder | null,
  busy: false,
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

// ------------------------------------------------------------ 기기 정보
async function showInfo(): Promise<void> {
  const info = await api.info();
  state.info = info;
  const dl = $("device-info");
  dl.replaceChildren();
  const add = (k: string, v: string) => {
    dl.append(el("dt", k), el("dd", v));
  };
  add("프로세서", `${info.cpuModel || "알 수 없음"} (논리 ${info.logicalCores}개, 물리 어림 ${info.physicalCoresGuess}개)`);
  add("메모리", `${info.ramGB} GB`);
  add("그래픽", info.gpu.length ? info.gpu.join(", ") : "알 수 없어요");
  add("운영체제", `${info.platform} ${info.arch}`);
  add("앱 인식 장치", `${info.devices.map((d) => (d === "dml" ? "DirectML" : "CPU")).join(", ")} (CPU 스레드 ${info.cpuThreads}개)`);
  add("앱 버전", info.appVersion);
  add("웹 서버", info.serverUrl || "설정 안 함");
  add("모델 서버", info.modelBaseUrl || "설정 안 함");
  const lines: string[] = [];
  if (!info.modelBaseUrl) lines.push(`모델을 받으려면 설정 파일에 모델 서버 주소를 넣어야 해요: ${info.settingsPath}`);
  for (const w of info.settingsWarnings) lines.push(w);
  $("settings-note").textContent = lines.join(" ");
  $("trial-warn").hidden = !info.trialMode;
  if (!info.devices.includes("dml")) {
    const chk = $<HTMLInputElement>("chk-dml");
    chk.checked = false;
    chk.disabled = true;
  }
}

// ------------------------------------------------------------ 모델
function fmtMB(m: ModelStatus): string {
  return Object.entries(m.sizeMB)
    .map(([d, mb]) => `${d} 약 ${mb}MB`)
    .join(" · ");
}

function renderModels(): void {
  const tbody = document.querySelector("#model-table tbody")!;
  tbody.replaceChildren();
  for (const m of state.models) {
    const tr = el("tr");
    const name = el("td");
    name.append(el("strong", m.label), el("br"), el("span", `${m.id} · ${m.license}${m.optional ? " · 연구용" : ""}`, "note"));
    const size = el("td", fmtMB(m));
    const inst = el("td", m.installed.length ? `${m.installed.join(", ")}${m.unverified ? " (시험 모드: 확인 안 함)" : ""}` : "아직 없어요");
    const act = el("td");
    for (const d of m.dtypes) {
      if (m.installed.includes(d)) continue;
      const b = el("button", `${d} 받기`);
      b.type = "button";
      b.addEventListener("click", () => void doInstall(m.id, d));
      act.append(b, " ");
    }
    if (m.installed.length) {
      const b = el("button", "지우기");
      b.type = "button";
      b.addEventListener("click", () => void doRemove(m.id));
      act.append(b);
    }
    tr.append(name, size, inst, act);
    tbody.append(tr);
  }
  const sel = $<HTMLSelectElement>("sel-model");
  const keep = sel.value;
  sel.replaceChildren();
  for (const m of state.models.filter((x) => x.installed.length)) sel.append(new Option(`${m.label} (${m.id})`, m.id));
  if (keep) sel.value = keep;
  updateRunButtons();
}

async function refreshModels(list?: ModelStatus[]): Promise<void> {
  state.models = list ?? (await api.models());
  renderModels();
}

function showProgress(p: InstallProgress): void {
  $("install-progress").hidden = false;
  const bar = $<HTMLProgressElement>("install-bar");
  bar.max = p.totalBytes ?? Math.max(p.receivedBytes, 1);
  bar.value = p.receivedBytes;
  $("install-text").textContent = `${p.fileIndex}/${p.fileCount} ${p.file} — ${(p.receivedBytes / 2 ** 20).toFixed(1)}${p.totalBytes ? ` / ${(p.totalBytes / 2 ** 20).toFixed(1)}` : ""} MB`;
}

async function doInstall(id: string, dtype: SpeechDtype): Promise<void> {
  if (state.busy) return;
  state.busy = true;
  $("model-msg").textContent = "받고 있어요. 잠시만 기다려 주세요.";
  $("model-msg").classList.remove("err");
  const off = api.onInstallProgress(showProgress);
  try {
    await api.install(id, dtype);
    await refreshModels();
    $("model-msg").textContent = "설치를 마쳤어요.";
  } catch (e) {
    $("model-msg").textContent = `설치하지 못했어요: ${errText(e)}`;
    $("model-msg").classList.add("err");
  } finally {
    off();
    $("install-progress").hidden = true;
    state.busy = false;
    updateRunButtons();
  }
}

async function doRemove(id: string): Promise<void> {
  if (state.busy) return;
  try {
    await refreshModels(await api.remove(id));
    $("model-msg").textContent = "지웠어요.";
  } catch (e) {
    $("model-msg").textContent = `지우지 못했어요: ${errText(e)}`;
  }
}

// ------------------------------------------------------------ 소리
function setAudio(a: Float32Array, label: string): void {
  state.audio = a;
  $("input-status").textContent = `${label}: ${(a.length / 16000).toFixed(1)}초 (16kHz, 메모리에만 있어요)`;
  updateRunButtons();
}

async function onRecord(): Promise<void> {
  try {
    $("btn-rec").hidden = true;
    $("btn-stop").hidden = false;
    $("input-status").textContent = "녹음하고 있어요… 읽어 보세요.";
    const auto = () => void onStop();
    state.recorder = await startRecording(60, auto);
  } catch (e) {
    $("btn-rec").hidden = false;
    $("btn-stop").hidden = true;
    $("input-status").textContent = `마이크를 쓰지 못했어요: ${errText(e)}`;
  }
}

async function onStop(): Promise<void> {
  const r = state.recorder;
  if (!r) return;
  state.recorder = null;
  $("btn-stop").hidden = true;
  $("btn-rec").hidden = false;
  try {
    setAudio(await r.stop(), "녹음");
  } catch (e) {
    $("input-status").textContent = `녹음을 처리하지 못했어요: ${errText(e)}`;
  }
}

async function onFile(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = "";
  if (!f) return;
  if (f.size > 100 * 2 ** 20) {
    $("input-status").textContent = "파일이 너무 커요(100MB까지).";
    return;
  }
  try {
    $("input-status").textContent = "파일을 읽고 있어요…";
    const a = await decodeTo16k(await f.arrayBuffer());
    setAudio(a, "wav 파일");
  } catch (e) {
    $("input-status").textContent = `이 파일은 읽지 못했어요: ${errText(e)}`;
  }
}

// ------------------------------------------------------------ 속도 재기
function updateRunButtons(): void {
  const ready = !!state.audio && state.models.some((m) => m.installed.length) && !state.busy;
  $<HTMLButtonElement>("btn-run").disabled = !ready;
  $<HTMLButtonElement>("btn-synth").disabled = !(state.models.some((m) => m.installed.length) && !state.busy);
}

const round = (x: number, n = 2) => Math.round(x * 10 ** n) / 10 ** n;

function rowFrom(method: string, r: TranscribeResult, extraLoad = 0): Row {
  return {
    method,
    device: r.device === "dml" ? "DirectML" : method.startsWith("브라우저") ? "WASM" : "CPU",
    dtype: r.dtype,
    loadSeconds: round(r.loadSeconds + extraLoad),
    seconds: r.seconds,
    rtf: r.rtf,
    perMinute: perMinuteSeconds(r.rtf),
    note: r.note ?? "",
  };
}

function failRow(method: string, dtype: string, e: unknown): Row {
  return { method, device: "-", dtype, loadSeconds: null, seconds: null, rtf: null, perMinute: null, note: `안 됐어요: ${errText(e).slice(0, 160)}` };
}

function renderRows(): void {
  const table = $("result-table");
  table.hidden = state.rows.length === 0;
  $("btn-copy").hidden = state.rows.length === 0;
  const tbody = table.querySelector("tbody")!;
  tbody.replaceChildren();
  const f = (v: number | null) => (v === null ? "-" : String(v));
  for (const r of state.rows) {
    const tr = el("tr");
    tr.append(el("td", r.method), el("td", r.device), el("td", r.dtype));
    for (const v of [r.loadSeconds, r.seconds, r.rtf, r.perMinute]) tr.append(el("td", f(v), "num"));
    tr.append(el("td", r.note));
    tbody.append(tr);
  }
}

function renderTexts(): void {
  const box = $("texts");
  box.replaceChildren();
  const ref = $<HTMLTextAreaElement>("ref-text").value.trim();
  const out = $("fluency-out");
  out.replaceChildren();
  for (const t of state.texts) {
    const card = el("div", undefined, "textcard");
    card.append(el("h3", t.label), el("div", t.text || "(인식된 글이 없어요)"));
    box.append(card);
    if (ref && state.audio) {
      const s = fluencyScore(ref, t.text, state.audio.length / 16000);
      const words = splitEojeols(ref);
      const line = el("div", undefined, "textcard");
      line.append(el("h3", `${t.label} — 어절 결과`));
      line.append(el("div", `원문 ${s.total}어절 중 ${s.correct}어절을 맞게 읽었어요(${Math.round(s.accuracy * 100)}%). 1분에 바르게 읽은 어절 수는 약 ${Math.round(s.wcpm)}개예요.`));
      if (s.errors.length) {
        const p = el("div", "다시 읽어 볼 곳: ");
        s.errors.forEach((i, k) => {
          p.append(el("mark", words[i] ?? "", "bad"), k < s.errors.length - 1 ? " " : "");
        });
        line.append(p);
      }
      out.append(line);
    }
  }
}

async function runAll(): Promise<void> {
  const audio = state.audio;
  const modelId = $<HTMLSelectElement>("sel-model").value;
  const model = state.models.find((m) => m.id === modelId);
  if (!audio || !model || state.busy) return;
  state.busy = true;
  updateRunButtons();
  state.rows = [];
  state.texts = [];
  renderRows();
  renderTexts();
  const dtypePick = $<HTMLSelectElement>("sel-dtype").value as SpeechDtype | "";
  const warm = $<HTMLInputElement>("chk-warm").checked;
  const status = $("run-status");
  const warmAudio = audio.subarray(0, Math.min(audio.length, 5 * 16000));
  const note = (m: string) => (status.textContent = m);

  const appRun = async (label: string, device: "cpu" | "dml") => {
    note(`${label}: 재고 있어요…`);
    const dtype = dtypePick || undefined;
    try {
      let extra = 0;
      if (warm && warmAudio.length >= 1600) extra = (await api.transcribe(warmAudio, { modelId, device, dtype })).loadSeconds;
      const r = await api.transcribe(audio, { modelId, device, dtype });
      state.rows.push(rowFrom(label, r, extra));
      state.texts.push({ label, text: r.text });
    } catch (e) {
      state.rows.push(failRow(label, dtype ?? "자동", e));
    }
    renderRows();
  };

  try {
    if ($<HTMLInputElement>("chk-cpu").checked) await appRun("앱 CPU", "cpu");
    if ($<HTMLInputElement>("chk-dml").checked) await appRun("앱 DirectML", "dml");
    if ($<HTMLInputElement>("chk-web").checked) {
      const label = "브라우저 엔진(WASM)";
      note(`${label}: 재고 있어요…`);
      const dtype: SpeechDtype = dtypePick || "q8";
      try {
        if (!model.installed.includes(dtype)) throw new Error(`${dtype} 형식이 설치되어 있지 않아요.`);
        let extra = 0;
        if (warm && warmAudio.length >= 1600) extra = (await browserTranscribe(modelId, dtype, warmAudio)).loadSeconds;
        const r = await browserTranscribe(modelId, dtype, audio);
        state.rows.push(rowFrom(label, r, extra));
        state.texts.push({ label, text: r.text });
      } catch (e) {
        state.rows.push(failRow(label, dtype, e));
      }
      renderRows();
    }
    note("다 쟀어요. 아래 표의 숫자를 복사해서 보내 주세요.");
  } finally {
    renderTexts();
    state.busy = false;
    updateRunButtons();
  }
}

async function runSynth(): Promise<void> {
  const modelId = $<HTMLSelectElement>("sel-model").value;
  if (!modelId || state.busy) return;
  state.busy = true;
  updateRunButtons();
  $("run-status").textContent = "합성 소리로 앱 CPU를 재고 있어요…";
  try {
    const dtype = ($<HTMLSelectElement>("sel-dtype").value as SpeechDtype | "") || undefined;
    const r = await api.benchmark({ modelId, device: "cpu", dtype, seconds: 60 });
    state.rows.push(rowFrom("앱 CPU(합성 60초)", r));
    renderRows();
    $("run-status").textContent = "합성 소리는 말소리와 달라서 어림값이에요. 진짜 목소리로도 재 보세요.";
  } catch (e) {
    $("run-status").textContent = `재지 못했어요: ${errText(e)}`;
  } finally {
    state.busy = false;
    updateRunButtons();
  }
}

// ------------------------------------------------------------ 숫자만 복사(인식된 글·소리는 들어가지 않아요)
function numbersTsv(): string {
  const i = state.info;
  const head = [
    `기기\t${i?.cpuModel ?? ""}\t논리${i?.logicalCores ?? ""}\tRAM ${i?.ramGB ?? ""}GB\t${(i?.gpu ?? []).join("/")}\t${i?.platform ?? ""}`,
    `모델\t${$<HTMLSelectElement>("sel-model").value}\t소리 ${state.audio ? round(state.audio.length / 16000, 1) : "-"}초\t스레드 ${i?.cpuThreads ?? ""}`,
    ["방식", "장치", "형식", "불러오기(초)", "처리(초)", "RTF", "1분 낭독 환산(초)", "비고"].join("\t"),
  ];
  const f = (v: number | null) => (v === null ? "" : String(v));
  const body = state.rows.map((r) => [r.method, r.device, r.dtype, f(r.loadSeconds), f(r.seconds), f(r.rtf), f(r.perMinute), r.note].join("\t"));
  return [...head, ...body].join("\n");
}

async function copyNumbers(): Promise<void> {
  const text = numbersTsv();
  try {
    await navigator.clipboard.writeText(text);
    $("copy-msg").textContent = "복사했어요.";
    return;
  } catch {
    /* 아래 방법으로 */
  }
  const area = $<HTMLTextAreaElement>("copy-area");
  area.value = text;
  area.select();
  $("copy-msg").textContent = document.execCommand("copy") ? "복사했어요." : "복사하지 못했어요. 표를 직접 선택해 복사해 주세요.";
}

// ------------------------------------------------------------ 시작
$("btn-rec").addEventListener("click", () => void onRecord());
$("btn-stop").addEventListener("click", () => void onStop());
$("file-wav").addEventListener("change", (e) => void onFile(e));
$("btn-run").addEventListener("click", () => void runAll());
$("btn-synth").addEventListener("click", () => void runSynth());
$("btn-copy").addEventListener("click", () => void copyNumbers());
$("ref-text").addEventListener("input", renderTexts);

void (async () => {
  try {
    await showInfo();
    await refreshModels();
  } catch (e) {
    $("settings-note").textContent = `앱 정보를 불러오지 못했어요: ${errText(e)}`;
  }
})();
