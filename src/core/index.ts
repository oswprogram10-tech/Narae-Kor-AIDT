// 국어나래 모듈 핵심부(공개 API).
// 이 폴더는 Next.js·Node 전용 기능·데이터베이스에 의존하지 않는다(ESLint 규칙으로 강제).
// 웹·안드로이드(WebView)·윈도우(Electron/Tauri) 어디에 병합하든 같은 코드를 쓴다.

export * from "./coach/types";
export { runCoachEngine } from "./coach/engine";
export { POLICY_VERSION } from "./coach/policy";
export { classifyInput, checkOutput } from "./coach/guard";
export { lintKorean, type LintFinding } from "./lint";
export * from "./data/standards";
export * from "./data/genres";
export * from "./providers";
export * from "./host/adapter";
export {
  processCoachTurn,
  prepareCoachTurn,
  recordLocalCoachTurn,
  type CoachTurnOptions,
  type CoachTurnOutcome,
  type PrepareOutcome,
} from "./host/coach-turn";
export * from "./local/catalog";
export { TransformersLocalRuntime, detectDevice, type LocalRuntimeOptions, type LoadProgress, type LocalDevice } from "./local/runtime";
