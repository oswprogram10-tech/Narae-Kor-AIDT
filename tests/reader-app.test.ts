// 낭독 도우미 윈도우 앱(apps/reader-win)의 순수 로직 시험: 허용 목록, 입력 검사, manifest 검증, 설정 읽기, 장치 순서.
import { describe, expect, it } from "vitest";

import { allowConfigFromSettings, isNavigationAllowed, isPermissionAllowed, isRequestAllowed } from "../apps/reader-win/src/lib/allowlist";
import { availableDevices, cpuThreads, deviceOrder, perMinuteSeconds } from "../apps/reader-win/src/lib/device";
import { isOptionalTrialFile, isSafeRelPath, parseManifest, planInstall, verifyDownloaded } from "../apps/reader-win/src/lib/manifest";
import { normalizeBaseUrl, normalizeOrigin, parseSettings, parseSettingsText } from "../apps/reader-win/src/lib/settings";
import { synthSpeechLike } from "../apps/reader-win/src/lib/synth";
import { checkAudio, checkBenchmarkSeconds, checkDtype, checkModelId, checkTranscribeOptions, MAX_AUDIO_SECONDS } from "../apps/reader-win/src/lib/validate";
import { getSpeechModel, speechModelFiles } from "../src/core/speech";

const cfg = allowConfigFromSettings(parseSettings({ serverUrl: "https://narae.school.kr", modelBaseUrl: "https://models.school.kr/asr/", modelRedirectOrigins: ["https://cdn.school.kr"] }).settings);

describe("네트워크 허용 목록", () => {
  it("앱 자체 프로토콜, 웹 서버, 모델 서버(와 넘김 출처)만 허용", () => {
    expect(isRequestAllowed("narae-app://app/index.html", cfg)).toBe(true);
    expect(isRequestAllowed("narae-app://app/models/narae-asr-lite/config.json", cfg)).toBe(true);
    expect(isRequestAllowed("https://narae.school.kr/api/x", cfg)).toBe(true);
    expect(isRequestAllowed("https://models.school.kr/asr/narae-asr-lite/manifest.json", cfg)).toBe(true);
    expect(isRequestAllowed("https://cdn.school.kr/blob", cfg)).toBe(true);
    expect(isRequestAllowed("blob:narae-app://app/abc", cfg)).toBe(true);
  });
  it("나머지는 모두 차단(해외 CDN, 비슷한 이름, http, file, ftp, 다른 앱 호스트)", () => {
    for (const u of [
      "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/x.wasm",
      "https://huggingface.co/x",
      "https://narae.school.kr.evil.com/",
      "http://narae.school.kr/",
      "https://narae.school.kr:8443/",
      "file:///C:/Windows/win.ini",
      "ftp://models.school.kr/",
      "ws://narae.school.kr/",
      "narae-app://other/index.html",
      "not a url",
      "",
    ])
      expect(isRequestAllowed(u, cfg), u).toBe(false);
  });
  it("설정이 비어 있으면 앱 안 화면만", () => {
    const empty = allowConfigFromSettings(parseSettings(null).settings);
    expect(isRequestAllowed("narae-app://app/index.html", empty)).toBe(true);
    expect(isRequestAllowed("https://narae.school.kr/", empty)).toBe(false);
    expect(isRequestAllowed("https://huggingface.co/", empty)).toBe(false);
  });
  it("같은 기기(localhost)의 http는 설정했을 때만 허용", () => {
    const local = allowConfigFromSettings(parseSettings({ modelBaseUrl: "http://127.0.0.1:8080/" }).settings);
    expect(isRequestAllowed("http://127.0.0.1:8080/narae-asr-lite/manifest.json", local)).toBe(true);
    expect(isRequestAllowed("http://127.0.0.1:9999/", local)).toBe(false);
  });
  it("마이크 권한은 앱 화면과 웹 서버에만, 모델 서버·다른 권한은 거부", () => {
    expect(isPermissionAllowed("media", "narae-app://app/index.html", cfg)).toBe(true);
    expect(isPermissionAllowed("media", "https://narae.school.kr/read", cfg)).toBe(true);
    expect(isPermissionAllowed("media", "https://models.school.kr/", cfg)).toBe(false);
    expect(isPermissionAllowed("media", "https://evil.example/", cfg)).toBe(false);
    expect(isPermissionAllowed("geolocation", "narae-app://app/index.html", cfg)).toBe(false);
    expect(isPermissionAllowed("notifications", "https://narae.school.kr/", cfg)).toBe(false);
  });
  it("창 이동은 앱 화면과 웹 서버 출처만", () => {
    expect(isNavigationAllowed("narae-app://app/index.html", cfg)).toBe(true);
    expect(isNavigationAllowed("https://narae.school.kr/class", cfg)).toBe(true);
    expect(isNavigationAllowed("https://models.school.kr/asr/", cfg)).toBe(false);
    expect(isNavigationAllowed("https://example.com", cfg)).toBe(false);
  });
});

describe("설정 읽기", () => {
  it("기본값은 모두 비어 있다(해외 주소 없음)", () => {
    const { settings, warnings } = parseSettings(null);
    expect(settings.serverUrl).toBe("");
    expect(settings.modelBaseUrl).toBe("");
    expect(settings.trialMode).toBe(false);
    expect(warnings).toEqual([]);
  });
  it("주소는 https(또는 localhost http)만, 끝에 / 붙임", () => {
    expect(normalizeOrigin("https://a.kr/x?y=1")).toBe("https://a.kr");
    expect(normalizeOrigin("http://a.kr")).toBeNull();
    expect(normalizeOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeBaseUrl("https://a.kr/asr?x#y")).toBe("https://a.kr/asr/");
  });
  it("잘못된 값은 버리고 알려 준다", () => {
    const { settings, warnings } = parseSettings({
      serverUrl: "ftp://x",
      modelBaseUrl: "https://m.kr/asr",
      modelRedirectOrigins: ["https://cdn.kr/path", "http://evil.com"],
      trialMode: "yes",
      trialModelPaths: { "narae-asr-lite": "whisper-base/resolve/main", bad: "../x" },
      cpuThreads: 0,
    });
    expect(settings.serverUrl).toBe("");
    expect(settings.modelBaseUrl).toBe("https://m.kr/asr/");
    expect(settings.modelRedirectOrigins).toEqual(["https://cdn.kr"]);
    expect(settings.trialMode).toBe(false);
    expect(settings.trialModelPaths).toEqual({ "narae-asr-lite": "whisper-base/resolve/main/" });
    expect(settings.cpuThreads).toBeNull();
    expect(warnings.length).toBe(4);
  });
  it("깨진 JSON이나 파일 없음은 기본값", () => {
    expect(parseSettingsText(null).settings.modelBaseUrl).toBe("");
    const bad = parseSettingsText("{ nope");
    expect(bad.settings.modelBaseUrl).toBe("");
    expect(bad.warnings.length).toBe(1);
    expect(parseSettingsText('{"cpuThreads": 4}').settings.cpuThreads).toBe(4);
  });
});

describe("입력 검사", () => {
  it("modelId는 카탈로그에 있는 것만", () => {
    expect(checkModelId("narae-asr-lite").ok).toBe(true);
    expect(checkModelId("../../etc/passwd").ok).toBe(false);
    expect(checkModelId("onnx-community/whisper-base").ok).toBe(false);
    expect(checkModelId(undefined).ok).toBe(false);
    expect(checkModelId(42).ok).toBe(false);
  });
  it("dtype은 모델이 제공하는 것만", () => {
    const lite = getSpeechModel("narae-asr-lite")!;
    expect(checkDtype(lite, undefined)).toEqual({ ok: true, dtype: "q8" });
    expect(checkDtype(lite, "fp16").ok).toBe(true); // 그래픽용 선택
    expect(checkDtype(getSpeechModel("narae-asr-moonshine-ko")!, "fp16").ok).toBe(false);
    expect(checkDtype(lite, "q4").ok).toBe(false);
    expect(checkDtype(getSpeechModel("narae-asr-pro")!, "fp16").ok).toBe(true);
  });
  it("옵션: device는 auto/cpu/dml만", () => {
    const o = checkTranscribeOptions({ modelId: "narae-asr-lite" });
    expect(o.ok && o.device).toBe("auto");
    expect(checkTranscribeOptions({ modelId: "narae-asr-lite", device: "cuda" }).ok).toBe(false);
    expect(checkTranscribeOptions({ modelId: "x" }).ok).toBe(false);
    expect(checkTranscribeOptions(null).ok).toBe(false);
  });
  it("소리: Float32Array, 길이 범위, 유한한 값", () => {
    expect(checkAudio(new Float32Array(16000)).ok).toBe(true);
    expect(checkAudio(new Float32Array(10)).ok).toBe(false); // 너무 짧음
    expect(checkAudio(new Float32Array(16000 * MAX_AUDIO_SECONDS + 1)).ok).toBe(false); // 10분 초과
    expect(checkAudio(new Float32Array(16000 * MAX_AUDIO_SECONDS)).ok).toBe(true);
    expect(checkAudio(new Int16Array(16000)).ok).toBe(false);
    expect(checkAudio([1, 2, 3]).ok).toBe(false);
    expect(checkAudio("소리").ok).toBe(false);
    const nan = new Float32Array(16000);
    nan[5] = NaN;
    expect(checkAudio(nan).ok).toBe(false);
    const loud = new Float32Array(16000);
    loud[5] = 1e6;
    expect(checkAudio(loud).ok).toBe(false);
  });
  it("benchmark 길이 범위", () => {
    expect(checkBenchmarkSeconds(undefined)).toEqual({ ok: true, seconds: 60 });
    expect(checkBenchmarkSeconds(1).ok).toBe(false);
    expect(checkBenchmarkSeconds(9999).ok).toBe(false);
    expect(checkBenchmarkSeconds("60").ok).toBe(false);
  });
  it("합성 소리는 같은 입력이면 같고 검사를 통과", () => {
    const a = synthSpeechLike(5);
    expect(a.length).toBe(80000);
    expect(synthSpeechLike(5)[1234]).toBe(a[1234]);
    expect(checkAudio(a).ok).toBe(true);
  });
});

describe("manifest 검증", () => {
  const lite = getSpeechModel("narae-asr-lite")!;
  const sha = (c: string) => c.repeat(64);
  const manifestFor = (files: string[], extra: Record<string, unknown> = {}) => ({ id: "narae-asr-lite", files: files.map((p, i) => ({ path: p, bytes: 10 + i, sha256: sha("a") })), ...extra });

  it("export_asr.py 모양을 읽고 필요한 파일이 모두 있으면 계획을 만든다", () => {
    const p = parseManifest(manifestFor([...speechModelFiles(lite, "q8"), "MODEL_CARD.md", "LICENSE.txt"]));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const plan = planInstall(lite, "q8", p.manifest);
    expect(plan.ok && plan.plan.files.length).toBe(speechModelFiles(lite, "q8").length);
  });
  it("필요한 파일이 빠졌거나 id가 다르면 실패", () => {
    const files = speechModelFiles(lite, "q8");
    const p = parseManifest(manifestFor(files.slice(1)));
    expect(p.ok && planInstall(lite, "q8", p.manifest).ok).toBe(false);
    const q = parseManifest(manifestFor(files, { id: "narae-asr-standard" }));
    expect(q.ok && planInstall(lite, "q8", q.manifest).ok).toBe(false);
  });
  it("모양이 틀리거나 위험한 경로는 거부", () => {
    expect(parseManifest(null).ok).toBe(false);
    expect(parseManifest({ files: [] }).ok).toBe(false);
    expect(parseManifest({ files: [{ path: "../x", bytes: 1, sha256: sha("a") }] }).ok).toBe(false);
    expect(parseManifest({ files: [{ path: "a.json", bytes: 1, sha256: "zz" }] }).ok).toBe(false);
    expect(parseManifest({ files: [{ path: "a.json", bytes: -1, sha256: sha("a") }] }).ok).toBe(false);
    expect(parseManifest({ files: [{ path: "a", bytes: 1, sha256: sha("a") }, { path: "a", bytes: 1, sha256: sha("a") }] }).ok).toBe(false);
    for (const p of ["/etc/passwd", "C:/x", "a\\b", "a/../b", "./a", "a//b", ""]) expect(isSafeRelPath(p), p).toBe(false);
    expect(isSafeRelPath("onnx/encoder_model_quantized.onnx")).toBe(true);
  });
  it("sha256이나 크기가 다르면 실패, 같으면 통과", () => {
    const entry = { path: "config.json", bytes: 5, sha256: sha("a") };
    expect(verifyDownloaded(entry, { bytes: 5, sha256: sha("a") })).toBeNull();
    expect(verifyDownloaded(entry, { bytes: 5, sha256: sha("A") })).toBeNull(); // 대소문자 무시
    expect(verifyDownloaded(entry, { bytes: 5, sha256: sha("b") })).toContain("sha256");
    expect(verifyDownloaded(entry, { bytes: 6, sha256: sha("a") })).toContain("크기");
  });
  it("시험 모드에서 없어도 되는 파일은 부속 파일뿐", () => {
    expect(isOptionalTrialFile("merges.txt")).toBe(true);
    expect(isOptionalTrialFile("config.json")).toBe(false);
    expect(isOptionalTrialFile("tokenizer.json")).toBe(false);
    expect(isOptionalTrialFile("onnx/encoder_model_quantized.onnx")).toBe(false);
  });
});

describe("장치 순서와 스레드", () => {
  it("auto는 윈도우에서 DirectML 먼저, 안 되면 CPU", () => {
    expect(deviceOrder("auto", "win32")).toEqual(["dml", "cpu"]);
    expect(deviceOrder("auto", "linux")).toEqual(["cpu"]);
    expect(deviceOrder("auto", "darwin")).toEqual(["cpu"]);
  });
  it("cpu·dml을 직접 고르면 그것만", () => {
    expect(deviceOrder("cpu", "win32")).toEqual(["cpu"]);
    expect(deviceOrder("dml", "win32")).toEqual(["dml"]);
    expect(availableDevices("win32")).toEqual(["cpu", "dml"]);
    expect(availableDevices("linux")).toEqual(["cpu"]);
  });
  it("스레드 수: 물리 코어 어림(논리의 절반), 설정이 있으면 그것", () => {
    expect(cpuThreads(12, null)).toBe(6);
    expect(cpuThreads(1, null)).toBe(1);
    expect(cpuThreads(12, 4)).toBe(4);
    expect(cpuThreads(12, 0)).toBe(6);
    expect(cpuThreads(4, 1000)).toBe(64);
  });
  it("1분 낭독 환산", () => {
    expect(perMinuteSeconds(0.25)).toBe(15);
    expect(perMinuteSeconds(0.1234)).toBe(7.4);
  });
});
