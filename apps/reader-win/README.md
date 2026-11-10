# 국어나래 낭독 도우미 (윈도우 앱, 시험판)

설계: [`docs/reader-app.md`](../../docs/reader-app.md) — 이 폴더는 **1단계 시험판**이에요.
이 시험판의 목적은 하나예요. 교사 윈도우 노트북(예: Ryzen 5 5625U, CPU와 내장 그래픽만 있는 기기)에서 **앱 방식이 브라우저 방식보다 얼마나 빠른지** 재는 것이에요.
학생 낭독 화면과 서버 저장은 아직 없어요(다음 단계).

- 목소리는 이 컴퓨터 안에서만 쓰고 **디스크에 저장하지 않아요**. 인식된 글도 화면에만 보여요.
- 앱의 네트워크는 설정 파일에 적은 웹 서버와 모델 서버만 열려요. 나머지는 모두 막아요. 설정을 비워 두면 인터넷을 전혀 쓰지 않아요.
- 결과는 진단이 아니라 연습 참고용이에요.

## 교사용: 따라 하기

### 1. 설치하기

1. GitHub 저장소의 **Actions → reader-win → 가장 위 실행 → Artifacts → `narae-reader-setup`** 을 내려받아 압축을 풀어요. 안에 `narae-reader-setup-0.1.0.exe` 가 있어요.
2. 파일을 두 번 눌러 설치해요(관리자 권한이 필요 없어요).
3. **"Windows의 PC 보호" (SmartScreen) 경고가 떠요.** 시험판은 코드 서명(개발사 인증서)을 하지 않았기 때문이에요. 알 수 없는 프로그램이라는 뜻일 뿐, 이 파일을 내려받은 곳이 우리 저장소라면 괜찮아요.
   **"추가 정보" → "실행"** 을 누르면 설치가 계속돼요. 학교 보안 정책으로 막히면 정보 담당 선생님께 허락을 받아야 해요.

### 2. 설정 파일 만들기 (모델 받을 곳)

앱은 처음에 모델이 없어요. 모델을 받을 곳을 설정 파일에 적어 줘요. 위치는 앱 화면 1번 칸의 안내에 나와요. 보통 이래요.

```
C:\Users\<내 이름>\AppData\Roaming\국어나래 낭독 도우미\settings.json
```

기본은 모두 비어 있어요(해외 주소를 미리 넣어 두지 않아요).

| 항목 | 뜻 |
| --- | --- |
| `serverUrl` | 국어나래 웹 서버 주소(다음 단계에서 써요) |
| `modelBaseUrl` | 모델 파일이 있는 서버 주소(학교·국내 서버). 끝은 `/` |
| `modelRedirectOrigins` | 모델 서버가 파일을 다른 주소로 넘길 때 함께 열어 줄 주소 목록 |
| `trialMode` | `true` 이면 시험 모드(아래) |
| `trialModelPaths` | 시험 모드에서 모델마다 `modelBaseUrl` 아래 폴더 |
| `cpuThreads` | 인식에 쓸 CPU 스레드 수(비우면 물리 코어 어림 = 논리 스레드의 절반) |

주소는 `https://` 만 쓸 수 있어요(같은 컴퓨터의 `http://localhost` 는 가능). 설정을 고쳤으면 앱을 닫았다가 다시 열어요.

**국어나래 모델을 받을 때(정식 방식)**: `modelBaseUrl` 만 적어요. 앱이 `<modelBaseUrl>/<모델 id>/manifest.json` 을 먼저 받고, 목록의 파일을 받은 뒤 **sha256 이 모두 맞을 때만** 설치를 마쳐요. 하나라도 다르면 지우고 오류를 알려 줘요. 모델 폴더는 `training/asr/export_asr.py` 가 만든 그대로예요.

```json
{ "modelBaseUrl": "https://models.우리학교.kr/asr/" }
```

### 3. 시험용 모델 받기 (⚠ 시험용이에요)

국어나래 모델이 아직 서버에 없을 때, 속도만 재 보려고 공개 모델(`onnx-community/whisper-base`, `whisper-small`)을 받는 방법이에요.
**해외 사이트(Hugging Face)에서 받으므로 시험용으로만 쓰고, 학생 데이터와는 상관없어요(모델 파일만 받아요).** 이 방식은 sha256 을 확인하지 **않아요**. 앱 화면에 "시험 모드(확인 안 함)" 경고가 떠요.

```json
{
  "modelBaseUrl": "https://huggingface.co/",
  "modelRedirectOrigins": ["https://cas-bridge.xethub.hf.co", "https://cdn-lfs.hf.co", "https://cdn-lfs-us-1.hf.co"],
  "trialMode": true,
  "trialModelPaths": {
    "narae-asr-lite": "onnx-community/whisper-base/resolve/main/",
    "narae-asr-standard": "onnx-community/whisper-small/resolve/main/"
  }
}
```

- 큰 파일은 Hugging Face 가 다른 주소(CDN)로 넘겨요. 받기가 "허용하지 않은 주소"로 막히면 `modelRedirectOrigins` 에 그 주소를 더해 주세요.
- 이 목록에 있는 해외 주소는 **시험이 끝나면 지우세요.** 지우면 앱은 다시 해외로 아무것도 보내지 않아요.
- 그 뒤 앱 2번 칸에서 "q8 받기"를 눌러요(whisper-base 약 80MB, whisper-small 약 250MB).

### 4. 속도 시험 순서

1. 1번 칸에서 프로세서·메모리·그래픽을 확인해요.
2. 2번 칸에서 모델을 받아요(먼저 1단계 `가벼운 음성 인식`, 그다음 2단계).
3. 3번 칸에서 소리를 골라요.
   - **마이크 녹음**: 조용한 곳에서 30~60초 동안 짧은 글을 읽어요(저장하지 않아요).
   - **wav 파일**: 이미 녹음한 파일(너무 긴 파일은 10분까지).
4. 4번 칸에서 모델을 고르고 **차례로 재기**를 눌러요. 같은 소리로 `앱 CPU` → `앱 DirectML` → `브라우저 엔진(WASM)` 순서로 돌려요.
   - "시작 전에 5초 몸풀기"를 켜 두면 첫 실행의 준비 시간이 처리 시간에 섞이지 않아요(불러오기 시간에 더해 표시해요).
   - 재는 동안 다른 프로그램은 닫아 주세요. 노트북은 전원을 꽂고 **최고 성능** 모드로 해요.
   - DirectML 은 `fp16` 모델이 있을 때 더 잘 돌아요. 8비트(q8) 모델은 그래픽에서 느리거나 안 될 수 있어요. 안 되면 표의 비고에 이유가 나와요.
5. 표를 확인해요: 불러오기(초), 처리(초), RTF(처리 시간 ÷ 소리 길이, 작을수록 빨라요), **1분 낭독 환산(초)**(RTF × 60).
6. 읽은 글의 원문을 5번 칸에 붙여 넣으면 어절 결과(맞게 읽은 어절, 1분 어절 수, 다시 읽어 볼 곳)를 볼 수 있어요.

### 5. 결과 보내기 (숫자만)

표 아래 **숫자만 복사**를 누르고 메일·메신저에 붙여 넣어 보내요. 복사되는 내용은 기기 이름, 모델 이름, 소리 길이, 표의 숫자뿐이에요. **인식된 글과 소리는 들어 있지 않아요.** 목소리 파일은 보내지 마세요.

## 개발자용

필요한 것: Node 22, 윈도우 설치 파일을 만들려면 윈도우(또는 CI).

```bash
cd apps/reader-win
npm ci
npm run build        # out/ 에 main, preload, engine, renderer 번들
npm start            # 빌드 후 Electron 으로 실행
npm run typecheck    # 앱 쪽 tsc
npm run dist:win     # NSIS 설치 파일(x64) → dist/narae-reader-setup-<버전>.exe
```

- 자동 빌드: `.github/workflows/reader-win.yml` (수동 실행, 또는 `apps/reader-win/**`·`src/core/speech/**`·`src/core/fluency/**` 변경 시). `windows-latest` 에서 설치 파일을 만들어 artifact 로 올려요. 비밀값·서명 없음.
- 루트의 `src/core/speech`, `src/core/fluency` 는 복사하지 않고 상대 경로로 가져와 번들해요. 루트 `npm test` 의 `tests/reader-app.test.ts` 가 `src/lib/` 의 순수 로직(허용 목록, 입력 검사, manifest 검증, 설정 읽기, 장치 순서)을 시험해요.
- 구조: `src/main`(창·보안·IPC·모델 설치) · `src/preload`(`window.naraeSpeech`) · `src/engine`(`utilityProcess` 안 transformers.js + onnxruntime-node) · `src/renderer`(속도 시험 화면, 브라우저 엔진은 앱에 묶은 로컬 파일로 실행) · `src/lib`(순수 로직).
- 엔진만 Node 로 시험: `npm run build` 후 `node scripts/engine-smoke.mjs --models-dir <폴더> --hf-dir <whisper-base 폴더> --eval <eval.jsonl>` (인터넷이 막힌 환경에서는 미리 받은 모델 폴더를 써요).
- 앱 전체 시험: `scripts/electron-smoke.mjs` (Playwright `_electron` 과 `xvfb-run` 필요; 파일 위쪽 주석 참고).
- 장치: `auto` 는 윈도우에서 `dml`(DirectML)을 먼저 시험하고 안 되면 `cpu` 로 넘어가요(실제 쓴 장치는 결과의 `device`). DirectML 은 윈도우용 onnxruntime-node 에 들어 있어서 리눅스에서는 시험할 수 없어요.
- 보안: `contextIsolation`, `sandbox`, `nodeIntegration:false`, 엄격한 CSP, 새 창·다른 출처 이동 차단, 마이크 권한은 앱 화면과 웹 서버 출처만, 네트워크 허용 목록은 `src/lib/allowlist.ts` + `src/main/main.ts`. 엔진 프로세스는 `allowRemoteModels=false` 라 네트워크를 쓰지 않아요.
- 아직 없는 것: 학생 낭독 화면, 서버 저장, 학급 켜기·동의 화면, 코드 서명, 자동 업데이트, 앱 아이콘.
