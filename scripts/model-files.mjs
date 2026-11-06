// fetch-model.mjs가 쓰는 순수 함수와 목록(테스트 가능하도록 분리). 목록은 src/core/local/catalog.ts 와 같아야 한다(tests/local.test.ts가 확인).
export const CATALOG = {
  "qwen2.5-0.5b": { repo: "onnx-community/Qwen2.5-0.5B-Instruct", webgpu: true },
  "qwen3-0.6b": { repo: "onnx-community/Qwen3-0.6B-ONNX", webgpu: true },
  "gemma-3-1b": { repo: "onnx-community/gemma-3-1b-it-ONNX", webgpu: true },
  // 파인튜닝 모델: int8 파일 하나만 있다(WebGPU용 q4f16 없음).
  "narae-coach-1b": { repo: "LUDICERECIDUL/narae-coach-gemma3-1b", webgpu: false },
};

export const META_FILES = [
  "config.json",
  "generation_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "chat_template.jinja",
  "chat_template.json",
];

// 모델에 WebGPU용 파일이 없으면 인자와 상관없이 int8만 받는다.
export function resolveDtypes(id, dtypesArg) {
  const entry = CATALOG[id];
  if (entry && !entry.webgpu) return ["int8"];
  return (dtypesArg ?? "q4f16,q4").split(",").map((s) => s.trim()).filter(Boolean);
}

// rootPaths: 저장소 루트 파일 경로 목록, onnx: [{path,size}] (onnx/ 폴더). 내려받을 파일 목록을 돌려준다.
export function selectFiles(rootPaths, onnx, dtypes) {
  return [
    ...META_FILES.filter((f) => rootPaths.includes(f)).map((p) => ({ path: p, size: 0 })),
    ...onnx.filter((f) => dtypes.some((d) => f.path === `onnx/model_${d}.onnx` || f.path.startsWith(`onnx/model_${d}.onnx_data`))),
  ];
}
