// esbuild로 main / preload / engine / renderer를 묶는다. 루트의 src/core 코드는 복사하지 않고 상대 경로로 가져와 번들에 넣는다.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, "out");
fs.rmSync(out, { recursive: true, force: true });

const common = { bundle: true, sourcemap: false, logLevel: "info", target: "node22", legalComments: "none" };

// 인식 엔진은 네이티브 모듈(onnxruntime-node)을 쓰는 transformers.js를 번들에 넣지 않고 node_modules에서 불러온다.
const nodeExternal = ["electron", "@huggingface/transformers", "onnxruntime-node", "sharp"];

await build({
  ...common,
  platform: "node",
  format: "cjs",
  entryPoints: {
    main: path.join(root, "src/main/main.ts"),
    preload: path.join(root, "src/preload/preload.ts"),
    engine: path.join(root, "src/engine/process.ts"),
    "engine-core": path.join(root, "src/engine/core.ts"),
  },
  outdir: out,
  outExtension: { ".js": ".cjs" },
  external: nodeExternal,
});

// 화면(renderer): 브라우저용 transformers.js를 함께 묶는다(외부 CDN 없음).
await build({
  ...common,
  platform: "browser",
  format: "esm",
  target: "chrome140",
  splitting: true,
  entryPoints: [path.join(root, "src/renderer/app.ts")],
  outdir: path.join(out, "renderer"),
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
});

fs.copyFileSync(path.join(root, "src/renderer/index.html"), path.join(out, "renderer/index.html"));
fs.copyFileSync(path.join(root, "src/renderer/style.css"), path.join(out, "renderer/style.css"));

// onnxruntime-web의 wasm 파일을 앱 안에 둔다(웹 모듈의 scripts/copy-ort.mjs와 같은 파일).
const ortSrc = path.join(root, "node_modules/onnxruntime-web/dist");
const ortDest = path.join(out, "renderer/ort");
fs.mkdirSync(ortDest, { recursive: true });
for (const f of ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"]) {
  fs.copyFileSync(path.join(ortSrc, f), path.join(ortDest, f));
}
console.log("[build] 완료 → out/");
