// 모듈에 내장할 수 있는 공개 모델 목록(결정 10: 0.5B~1B, 약 500MB~1GB).
// 크기는 Hugging Face onnx-community 저장소 기준(2026-11-03 확인). 실제 내장 시에는 파일을 모듈과 함께 배포한다.

export interface LocalModelInfo {
  id: string; // 모듈 안에서 쓰는 이름(폴더 이름)
  label: string;
  hfRepo: string; // 원본 위치(내려받기 스크립트가 사용)
  license: string;
  params: string;
  // 기기 종류별로 쓸 압축 형식과 크기(MB)
  webgpu: { dtype: "q4f16"; sizeMB: number };
  wasm: { dtype: "q4"; sizeMB: number };
  note: string;
}

export const LOCAL_MODELS: readonly LocalModelInfo[] = [
  {
    id: "qwen2.5-0.5b",
    label: "Qwen2.5 0.5B Instruct",
    hfRepo: "onnx-community/Qwen2.5-0.5B-Instruct",
    license: "Apache-2.0",
    params: "0.5B",
    webgpu: { dtype: "q4f16", sizeMB: 483 },
    wasm: { dtype: "q4", sizeMB: 786 },
    note: "기본값. 가장 작고 라이선스 제약이 적음. 한국어는 가능하지만 단순한 편",
  },
  {
    id: "qwen3-0.6b",
    label: "Qwen3 0.6B",
    hfRepo: "onnx-community/Qwen3-0.6B-ONNX",
    license: "Apache-2.0",
    params: "0.6B",
    webgpu: { dtype: "q4f16", sizeMB: 570 },
    wasm: { dtype: "q4", sizeMB: 919 },
    note: "생각 모드가 있어 응답이 길어질 수 있음(프롬프트로 바로 답하게 함)",
  },
  {
    id: "gemma-3-1b",
    label: "Gemma 3 1B Instruct",
    hfRepo: "onnx-community/gemma-3-1b-it-ONNX",
    license: "Gemma Terms of Use",
    params: "1B",
    webgpu: { dtype: "q4f16", sizeMB: 763 },
    wasm: { dtype: "q4", sizeMB: 859 },
    note: "한국어 품질 기대치가 가장 높음. 배포 전 Gemma 이용약관 확인 필요",
  },
];

export const DEFAULT_LOCAL_MODEL = "qwen2.5-0.5b";

export function getLocalModel(id: string | undefined | null): LocalModelInfo | undefined {
  return LOCAL_MODELS.find((m) => m.id === id);
}
