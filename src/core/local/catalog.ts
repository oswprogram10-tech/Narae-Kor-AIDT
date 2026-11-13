// 모듈에 내장할 수 있는 공개 모델 목록(결정 10: 0.5B~1B, 약 500MB~1GB).
// 크기는 Hugging Face onnx-community 저장소 기준(2026-11-03 확인). 실제 내장 시에는 파일을 모듈과 함께 배포한다.

export interface LocalModelInfo {
  id: string; // 모듈 안에서 쓰는 이름(폴더 이름)
  label: string;
  hfRepo: string; // 원본 위치(내려받기 스크립트가 사용)
  license: string;
  params: string;
  // 기기 종류별로 쓸 압축 형식과 크기(MB)
  // 없으면 int8 WASM 파일만 제공하는 모델(항상 WASM으로 실행)
  webgpu?: { dtype: "q4f16"; sizeMB: number };
  // externalData: 모델 설정과 달리 별도 데이터 파일(.onnx_data)이 없는 형식이면 false
  wasm: { dtype: "q4" | "int8"; sizeMB: number; externalData?: false };
  note: string;
  // 레드팀 안전 시험(training/)을 통과한 파인튜닝 모델만 true: 모델의 '대필 요청' 판단을 함께 쓴다
  trustsGhostwriteFlag?: boolean;
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
    note: "가장 작고 라이선스 제약이 적음. 실측에서 질문 품질이 낮아 파인튜닝 없이는 권장하지 않음",
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
    // q4 파일은 브라우저 WASM 엔진이 지원하지 않는 연산(GatherBlockQuantized)을 써서 int8을 쓴다(2026-11-03 실측)
    wasm: { dtype: "int8", sizeMB: 1001, externalData: false },
    note: "파인튜닝 전 원본. 실측에서 질문 품질이 원본 중 가장 좋음(50건 중 35건 사용). 브라우저 CPU에서는 느림(평균 36초). 배포 전 Gemma 이용약관 확인 필요",
  },
  {
    id: "narae-coach-1b",
    label: "국어나래 코치 1B (Gemma 3 파인튜닝)",
    hfRepo: "LUDICERECIDUL/narae-coach-gemma3-1b",
    license: "Gemma Terms of Use",
    params: "1B",
    // 내보내기(training/export_onnx.py): 대부분 층은 동적 int8, down_proj만 GPTQ 4비트(처음·끝 3층 8비트), 어휘 표는 출력층과 공유.
    // 처음 쓴 int8 동적 양자화(전 층)는 down_proj 입력 활성값 때문에 안전 동작이 무너졌다(evals/results/2026-11-04-finetuned/README.md).
    wasm: { dtype: "int8", sizeMB: 951, externalData: false },
    note: "기본값(2026-11-05). 안전 중심 파인튜닝(SFT→DPO). 배포 파일 그대로 레드팀 950문항: 유출 0, 위험 신호→교사 알림 0.993, 개인 정보 1.000, 거짓 위험 알림 0.036. 대필 요청은 과잉 표시가 있어 모델 판단을 믿지 않고 규칙·가드레일이 막음. 배포 전 Gemma 이용약관 확인 필요",
    // 대필 판단은 믿지 않는다: 배포 파일이 정상 요청을 대필로 오판 0.069(기준 0.05). 위험 신호·개인 정보 표시는 엔진 안전망에서 그대로 쓴다.
    trustsGhostwriteFlag: false,
  },
];

// 실측(docs/local-model-eval.md): Qwen2.5 0.5B는 쓸 만한 질문을 거의 만들지 못해 Gemma 3 1B를 기본으로 한다.
// 2026-11-05: 새 양자화로 다시 만든 파인튜닝 모델이 배포 파일 레드팀(대필 판단 미신뢰 설정) 통과 → 기본값(evals/results/2026-11-05-quant/README.md).
export const DEFAULT_LOCAL_MODEL = "narae-coach-1b";

export function getLocalModel(id: string | undefined | null): LocalModelInfo | undefined {
  return LOCAL_MODELS.find((m) => m.id === id);
}
