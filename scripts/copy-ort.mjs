// 브라우저용 ONNX Runtime(WASM) 파일을 모듈 안(public/ort/)에 복사한다.
// transformers.js는 기본값으로 이 파일을 cdn.jsdelivr.net에서 받는데, 학교 방화벽·오프라인에서는 실패하므로
// 내장 AI가 외부 CDN 없이 동작하도록 모듈과 함께 배포한다. (npm install 때 자동 실행)
import fs from "node:fs";
import path from "node:path";

const src = path.join(process.cwd(), "node_modules", "onnxruntime-web", "dist");
const dest = path.join(process.cwd(), "public", "ort");
const files = ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"];
if (!fs.existsSync(src)) {
  console.warn("[copy-ort] onnxruntime-web이 설치되지 않아 건너뜀");
  process.exit(0);
}
fs.mkdirSync(dest, { recursive: true });
for (const f of files) fs.copyFileSync(path.join(src, f), path.join(dest, f));
console.log(`[copy-ort] ${files.length}개 파일 → public/ort/`);
