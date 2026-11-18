// 모델 설치·삭제·상태. 받은 파일은 manifest.json의 sha256과 맞을 때만 설치를 마친다(시험 모드 제외).
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { net } from "electron";

import { SPEECH_MODELS, speechModelFileUrl, speechModelFiles, type SpeechDtype, type SpeechModelInfo } from "../../../../src/core/speech";
import { allowConfigFromSettings, isRequestAllowed } from "../lib/allowlist";
import type { InstallProgress, ModelStatus } from "../lib/api";
import { isOptionalTrialFile, parseManifest, planInstall, verifyDownloaded, type ManifestFile } from "../lib/manifest";
import type { ReaderSettings } from "../lib/settings";
import { checkDtype, checkModelId } from "../lib/validate";

const MARKER = ".narae-install.json";

interface Marker {
  dtypes: SpeechDtype[];
  unverified: boolean;
}

function readMarker(dir: string): Marker | null {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, MARKER), "utf8")) as Marker;
    if (Array.isArray(m.dtypes)) return { dtypes: m.dtypes.filter((d) => d === "q8" || d === "fp16"), unverified: !!m.unverified };
  } catch {
    /* 없음 */
  }
  return null;
}

export function modelStatus(modelsDir: string): ModelStatus[] {
  return SPEECH_MODELS.map((m) => {
    const dir = path.join(modelsDir, m.id);
    const marker = readMarker(dir);
    // 표시한 형식의 파일이 실제로 있는지도 확인(지워졌으면 설치 안 된 것으로)
    const installed = (marker?.dtypes ?? []).filter((d) => speechModelFiles(m, d).filter((f) => f.startsWith("onnx/")).every((f) => fs.existsSync(path.join(dir, f))));
    return {
      id: m.id,
      label: m.label,
      tier: m.tier,
      dtypes: m.dtypes,
      sizeMB: m.sizeMB,
      installed,
      unverified: !!marker?.unverified && installed.length > 0,
      license: m.license.name,
      optional: !!m.optional,
    };
  });
}

export function installedDtypes(modelsDir: string, model: SpeechModelInfo): SpeechDtype[] {
  return modelStatus(modelsDir).find((s) => s.id === model.id)?.installed ?? [];
}

export function removeModel(modelsDir: string, modelId: unknown): void {
  const m = checkModelId(modelId);
  if (!m.ok) throw new Error(m.error);
  fs.rmSync(path.join(modelsDir, m.model.id), { recursive: true, force: true });
}

const installing = new Set<string>();

function fileUrl(settings: ReaderSettings, model: SpeechModelInfo, file: string): string {
  if (settings.trialMode) {
    const sub = settings.trialModelPaths[model.id];
    if (!sub) throw new Error(`시험 모드인데 settings.json의 trialModelPaths에 ${model.id} 항목이 없어요.`);
    return `${settings.modelBaseUrl}${sub}${file}`;
  }
  return speechModelFileUrl(settings.modelBaseUrl, model, file);
}

async function getChecked(url: string, settings: ReaderSettings, signal?: AbortSignal): Promise<Response> {
  // 세션 허용 목록과 별개로 여기서도 한 번 더 확인한다(모델 서버 출처만)
  if (!isRequestAllowed(url, allowConfigFromSettings(settings))) throw new Error("허용하지 않은 주소라서 받지 않아요.");
  try {
    return await net.fetch(url, { signal, redirect: "follow" });
  } catch (err) {
    // 모델 서버가 허용 목록에 없는 주소로 넘기면 세션이 막는다(ERR_BLOCKED_BY_CLIENT). 어느 주소인지 알려 준다.
    const blocked = lastBlockedOrigin();
    if (blocked && /BLOCKED_BY_CLIENT/i.test(String(err))) {
      throw new Error(`모델 서버가 허용하지 않은 주소(${blocked})로 넘겨서 받지 않았어요. 믿을 수 있는 주소라면 settings.json의 modelRedirectOrigins에 "${blocked}"를 더하고 앱을 다시 열어요.`);
    }
    throw err;
  }
}

let blockedOrigin = "";
/** 세션 요청 필터가 마지막으로 막은 주소의 출처(오류 안내용) */
export function noteBlockedRequest(url: string): void {
  try {
    blockedOrigin = new URL(url).origin;
  } catch {
    /* 무시 */
  }
}
function lastBlockedOrigin(): string {
  return blockedOrigin;
}

export async function installModel(
  modelsDir: string,
  settings: ReaderSettings,
  modelIdArg: unknown,
  dtypeArg: unknown,
  onProgress: (p: InstallProgress) => void,
): Promise<void> {
  const mc = checkModelId(modelIdArg);
  if (!mc.ok) throw new Error(mc.error);
  const model = mc.model;
  const dc = checkDtype(model, dtypeArg);
  if (!dc.ok) throw new Error(dc.error);
  const dtype = dc.dtype;
  if (!settings.modelBaseUrl) throw new Error("모델 서버 주소(modelBaseUrl)가 settings.json에 없어요. README의 '모델 받기'를 보세요.");
  const key = model.id;
  if (installing.has(key)) throw new Error("이미 설치하고 있어요.");
  installing.add(key);

  const finalDir = path.join(modelsDir, model.id);
  const tmpDir = path.join(modelsDir, `.tmp-${model.id}-${randomUUID().slice(0, 8)}`);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    const trial = settings.trialMode;
    let entries: Array<{ path: string; bytes: number | null; sha256: string | null }>;
    if (trial) {
      entries = speechModelFiles(model, dtype).map((f) => ({ path: f, bytes: null, sha256: null }));
    } else {
      const res = await getChecked(fileUrl(settings, model, "manifest.json"), settings, AbortSignal.timeout(30_000));
      if (!res.ok) throw new Error(`manifest.json를 받지 못했어요(${res.status}).`);
      const parsed = parseManifest(await res.json());
      if (!parsed.ok) throw new Error(parsed.error);
      const plan = planInstall(model, dtype, parsed.manifest);
      if (!plan.ok) throw new Error(plan.error);
      entries = plan.plan.files;
      fs.writeFileSync(path.join(tmpDir, "manifest.json"), JSON.stringify(parsed.manifest));
    }

    const kept: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const res = await getChecked(fileUrl(settings, model, e.path), settings);
      if (!res.ok || !res.body) {
        if (trial && res.status === 404 && isOptionalTrialFile(e.path)) continue;
        throw new Error(`${e.path}를 받지 못했어요(${res.status}).`);
      }
      const total = Number(res.headers.get("content-length")) || e.bytes;
      const dest = path.join(tmpDir, e.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const out = fs.createWriteStream(dest);
      const hash = createHash("sha256");
      let received = 0;
      let lastReport = 0;
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          hash.update(value);
          received += value.length;
          if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
          const now = Date.now();
          if (now - lastReport > 150) {
            lastReport = now;
            onProgress({ modelId: model.id, dtype, file: e.path, fileIndex: i + 1, fileCount: entries.length, receivedBytes: received, totalBytes: total });
          }
        }
        await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
      } catch (err) {
        out.destroy();
        throw err;
      }
      onProgress({ modelId: model.id, dtype, file: e.path, fileIndex: i + 1, fileCount: entries.length, receivedBytes: received, totalBytes: total });
      if (!trial) {
        const problem = verifyDownloaded(e as ManifestFile, { bytes: received, sha256: hash.digest("hex") });
        if (problem) throw new Error(problem);
      }
      kept.push(e.path);
    }
    if (!kept.some((f) => f.startsWith("onnx/"))) throw new Error("모델 파일(onnx)이 받아지지 않았어요.");

    // 모두 맞을 때만 제자리로 옮긴다
    fs.mkdirSync(finalDir, { recursive: true });
    for (const rel of [...kept, ...(trial ? [] : ["manifest.json"])]) {
      const to = path.join(finalDir, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.rmSync(to, { force: true });
      fs.renameSync(path.join(tmpDir, rel), to);
    }
    const prev = readMarker(finalDir);
    const marker: Marker = {
      dtypes: [...new Set([...(prev?.dtypes ?? []), dtype])],
      unverified: trial || !!prev?.unverified,
    };
    fs.writeFileSync(path.join(finalDir, MARKER), JSON.stringify(marker));
  } finally {
    installing.delete(key);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
