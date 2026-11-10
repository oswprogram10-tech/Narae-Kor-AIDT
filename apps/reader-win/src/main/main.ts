// 국어나래 낭독 도우미 — 메인 프로세스. 창, 보안 규칙(허용 목록·권한·이동 차단), IPC, 모델 설치, 인식 엔진 연결.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { app, BrowserWindow, ipcMain, Menu, protocol, session, type IpcMainInvokeEvent } from "electron";

import { allowConfigFromSettings, APP_ORIGIN, APP_SCHEME, isNavigationAllowed, isPermissionAllowed, isRequestAllowed, type AllowConfig } from "../lib/allowlist";
import type { BenchmarkOptions, DeviceInfo, TranscribeOptions, TranscribeResult } from "../lib/api";
import { availableDevices, cpuThreads } from "../lib/device";
import { parseSettingsText, type ReaderSettings } from "../lib/settings";
import { synthSpeechLike } from "../lib/synth";
import { checkAudio, checkBenchmarkSeconds, checkDtype, checkModelId, checkTranscribeOptions } from "../lib/validate";
import { EngineClient } from "./engine-client";
import { installedDtypes, installModel, modelStatus, removeModel } from "./models";
import { getSpeechModel, type SpeechDtype } from "../../../../src/core/speech";

// 시험용: 자동 검사에서 사용자 폴더를 바꿀 수 있게 한다.
if (process.env.NARAE_USER_DATA) app.setPath("userData", process.env.NARAE_USER_DATA);

protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json; charset=utf-8",
  ".onnx": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
};

let settings: ReaderSettings;
let settingsWarnings: string[] = [];
let allow: AllowConfig;
let engine: EngineClient;
let modelsDir = "";
let threads = 1;

function loadSettings(): void {
  const file = path.join(app.getPath("userData"), "settings.json");
  let text: string | null = null;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    /* 파일이 없으면 기본값 */
  }
  const parsed = parseSettingsText(text);
  settings = parsed.settings;
  settingsWarnings = parsed.warnings;
  allow = allowConfigFromSettings(settings);
}

function staticResponse(filePath: string, extra: Record<string, string> = {}): Response {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  const headers: Record<string, string> = {
    "content-type": MIME[ext] ?? "application/octet-stream",
    "content-length": String(stat.size),
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
    "cross-origin-resource-policy": "same-origin",
    "cache-control": "no-store",
    ...extra,
  };
  if (ext === ".html") headers["content-security-policy"] = CSP;
  return new Response(Readable.toWeb(fs.createReadStream(filePath)) as unknown as ReadableStream, { headers });
}

function insideDir(dir: string, target: string): boolean {
  const rel = path.relative(dir, target);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function handleAppProtocol(request: Request): Response {
  const url = new URL(request.url);
  if (url.host !== "app") return new Response("not found", { status: 404 });
  let p: string;
  try {
    p = decodeURIComponent(url.pathname);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (p.includes("\0")) return new Response("bad request", { status: 400 });
  const rendererDir = path.join(__dirname, "renderer");
  let base = rendererDir;
  let rel = p === "/" ? "index.html" : p.replace(/^\/+/, "");
  if (rel.startsWith("models/")) {
    // 설치한 모델 폴더(카탈로그에 있는 id만) — 브라우저 엔진 시험용
    const parts = rel.slice("models/".length).split("/");
    if (!getSpeechModel(parts[0]) || parts.length < 2) return new Response("not found", { status: 404 });
    base = modelsDir;
    rel = parts.join("/");
  }
  const target = path.resolve(base, rel);
  if (!insideDir(base, target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return new Response("not found", { status: 404 });
  return staticResponse(target);
}

function setupSession(): void {
  const ses = session.defaultSession;
  protocol.handle(APP_SCHEME, handleAppProtocol);
  // 네트워크 허용 목록: 자체 프로토콜, 웹 서버 출처, 모델 서버 출처만. 나머지는 모두 막는다.
  ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !isRequestAllowed(details.url, allow) }));
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const d = details as { requestingUrl?: string; mediaTypes?: string[] };
    const audioOnly = !d.mediaTypes || d.mediaTypes.every((t) => t === "audio");
    callback(audioOnly && isPermissionAllowed(permission, d.requestingUrl || wc.getURL(), allow));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => isPermissionAllowed(permission, requestingOrigin, allow));
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    title: "국어나래 낭독 도우미",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });
  win.once("ready-to-show", () => win.show());
  void win.loadURL(`${APP_ORIGIN}/index.html`);
  return win;
}

function trusted(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? "";
  return isNavigationAllowed(url, allow);
}

async function gpuNames(): Promise<string[]> {
  try {
    const info = (await app.getGPUInfo("basic")) as { gpuDevice?: Array<{ deviceString?: string; vendorId?: number; deviceId?: number; active?: boolean }>; auxAttributes?: { glRenderer?: string } };
    const names = new Set<string>();
    for (const g of info.gpuDevice ?? []) {
      names.add(g.deviceString || `제조사 0x${(g.vendorId ?? 0).toString(16)} 장치 0x${(g.deviceId ?? 0).toString(16)}`);
    }
    if (info.auxAttributes?.glRenderer) names.add(info.auxAttributes.glRenderer);
    return [...names];
  } catch {
    return [];
  }
}

function pickDtype(modelId: string, device: string, requested: SpeechDtype | undefined): SpeechDtype {
  const model = getSpeechModel(modelId)!;
  const have = installedDtypes(modelsDir, model);
  if (!have.length) throw new Error("먼저 이 모델을 설치해 주세요.");
  if (requested) {
    if (!have.includes(requested)) throw new Error(`${requested} 형식이 설치되어 있지 않아요.`);
    return requested;
  }
  // 그래픽(DirectML)은 fp16이 있으면 그것을 먼저, 아니면 q8
  if (device !== "cpu" && have.includes("fp16")) return "fp16";
  return have.includes("q8") ? "q8" : have[0];
}

async function runTranscribe(audio: Float32Array, optsIn: unknown): Promise<TranscribeResult> {
  const o = checkTranscribeOptions(optsIn);
  if (!o.ok) throw new Error(o.error);
  const a = checkAudio(audio);
  if (!a.ok) throw new Error(a.error);
  const dtype = pickDtype(o.model.id, o.device, o.dtype);
  return engine.transcribe({ modelId: o.model.id, device: o.device, dtype, audio: a.audio });
}

function registerIpc(): void {
  const guard = <T>(fn: (e: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T) => async (e: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!trusted(e)) throw new Error("허용하지 않은 화면이에요.");
    return fn(e, ...args);
  };

  ipcMain.handle(
    "narae:info",
    guard(async (): Promise<DeviceInfo> => {
      const cpus = os.cpus();
      return {
        appVersion: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        cpuModel: cpus[0]?.model ?? "",
        logicalCores: cpus.length,
        physicalCoresGuess: Math.max(1, Math.floor(cpus.length / 2)),
        ramGB: Math.round((os.totalmem() / 2 ** 30) * 10) / 10,
        gpu: await gpuNames(),
        devices: availableDevices(process.platform),
        serverUrl: settings.serverUrl,
        modelBaseUrl: settings.modelBaseUrl,
        trialMode: settings.trialMode,
        settingsPath: path.join(app.getPath("userData"), "settings.json"),
        settingsWarnings,
        cpuThreads: threads,
      };
    }),
  );
  ipcMain.handle("narae:models", guard(() => modelStatus(modelsDir)));
  ipcMain.handle(
    "narae:install",
    guard(async (e, modelId: unknown, dtype: unknown) => {
      await installModel(modelsDir, settings, modelId, dtype, (p) => e.sender.send("narae:install-progress", p));
      return modelStatus(modelsDir);
    }),
  );
  ipcMain.handle(
    "narae:remove",
    guard((_e, modelId: unknown) => {
      removeModel(modelsDir, modelId);
      return modelStatus(modelsDir);
    }),
  );
  ipcMain.handle(
    "narae:transcribe",
    guard((_e, audio: unknown, opts: unknown) => runTranscribe(audio as Float32Array, opts)),
  );
  ipcMain.handle(
    "narae:benchmark",
    guard((_e, opts: unknown) => {
      const o = opts as BenchmarkOptions | null;
      const s = checkBenchmarkSeconds(o && typeof o === "object" ? o.seconds : undefined);
      if (!s.ok) throw new Error(s.error);
      // 합성 소리는 이 호출 안에서 만들어 쓰고 버린다
      return runTranscribe(synthSpeechLike(s.seconds), opts as TranscribeOptions);
    }),
  );
}

app.on("web-contents-created", (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (ev, url) => {
    if (!isNavigationAllowed(url, allow)) ev.preventDefault();
  });
  contents.on("will-redirect", (ev, url) => {
    if (!isNavigationAllowed(url, allow)) ev.preventDefault();
  });
  contents.on("will-attach-webview", (ev) => ev.preventDefault());
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  loadSettings();
  modelsDir = path.join(app.getPath("userData"), "models");
  fs.mkdirSync(modelsDir, { recursive: true });
  threads = cpuThreads(os.cpus().length, settings.cpuThreads);
  engine = new EngineClient(path.join(__dirname, "engine.cjs"), { modelsDir, threads });
  setupSession();
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  engine?.stop();
  app.quit();
});
