// 모델 폴더의 manifest.json(training/asr/export_asr.py가 만듦) 검사. sha256이 맞아야만 설치를 마친다.
import { speechModelFiles, type SpeechDtype, type SpeechModelInfo } from "../../../../src/core/speech";

export interface ManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}
export interface Manifest {
  id?: string;
  files: ManifestFile[];
}

/** 폴더 밖으로 나가거나 절대 경로인 이름은 거부(경로 조작 방지) */
export function isSafeRelPath(p: unknown): p is string {
  if (typeof p !== "string" || !p || p.length > 200) return false;
  if (p.startsWith("/") || p.includes("\\") || p.includes("\0") || /^[a-zA-Z]:/.test(p)) return false;
  return !p.split("/").some((s) => s === ".." || s === "." || s === "");
}

export function parseManifest(raw: unknown): { ok: true; manifest: Manifest } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "manifest.json 모양이 맞지 않아요." };
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.files) || r.files.length === 0) return { ok: false, error: "manifest.json에 파일 목록이 없어요." };
  const files: ManifestFile[] = [];
  const seen = new Set<string>();
  for (const f of r.files) {
    const e = f as Record<string, unknown> | null;
    if (!e || !isSafeRelPath(e.path)) return { ok: false, error: "manifest.json에 안전하지 않은 파일 이름이 있어요." };
    if (typeof e.bytes !== "number" || !Number.isInteger(e.bytes) || e.bytes < 0) return { ok: false, error: `${e.path}의 크기가 맞지 않아요.` };
    if (typeof e.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(e.sha256)) return { ok: false, error: `${e.path}의 sha256이 맞지 않아요.` };
    if (seen.has(e.path)) return { ok: false, error: `${e.path}가 두 번 있어요.` };
    seen.add(e.path);
    files.push({ path: e.path, bytes: e.bytes, sha256: e.sha256.toLowerCase() });
  }
  return { ok: true, manifest: { id: typeof r.id === "string" ? r.id : undefined, files } };
}

export interface InstallPlan {
  files: ManifestFile[];
}

/** 이 모델·형식에 필요한 파일이 모두 manifest에 있는지 확인하고 받을 목록을 만든다. */
export function planInstall(model: SpeechModelInfo, dtype: SpeechDtype, manifest: Manifest): { ok: true; plan: InstallPlan } | { ok: false; error: string } {
  if (manifest.id && manifest.id !== model.id) return { ok: false, error: `manifest.json의 id(${manifest.id})가 모델(${model.id})과 달라요.` };
  const wanted = speechModelFiles(model, dtype);
  if (!wanted.length) return { ok: false, error: `이 모델은 ${dtype} 형식이 없어요.` };
  const byPath = new Map(manifest.files.map((f) => [f.path, f]));
  const files: ManifestFile[] = [];
  for (const w of wanted) {
    const e = byPath.get(w);
    if (!e) return { ok: false, error: `manifest.json에 ${w}가 없어요.` };
    files.push(e);
  }
  return { ok: true, plan: { files } };
}

/** 내려받은 파일이 manifest와 같은지. 같으면 null, 다르면 오류 문장. */
export function verifyDownloaded(entry: ManifestFile, actual: { bytes: number; sha256: string }): string | null {
  if (actual.bytes !== entry.bytes) return `${entry.path}의 크기가 달라요(받은 ${actual.bytes}바이트, 기대 ${entry.bytes}바이트).`;
  if (actual.sha256.toLowerCase() !== entry.sha256) return `${entry.path}의 sha256이 달라요. 파일이 바뀌었거나 깨졌을 수 있어서 설치하지 않아요.`;
  return null;
}

/** 시험 모드에서 404가 나도 건너뛸 수 있는 파일(꼭 필요한 것은 제외) */
export function isOptionalTrialFile(file: string): boolean {
  const required = ["config.json", "tokenizer.json", "tokenizer_config.json", "preprocessor_config.json"];
  if (required.includes(file)) return false;
  if (file.startsWith("onnx/")) return false;
  return true;
}
