# 아동 낭독 음성 인식 학습 도구 (`training/asr/`)

AI Hub 「한국어 아동 음성 데이터」(미디어젠, 아동 낭독 발화)로 **여러 음성 인식 모델(Whisper, Moonshine, sherpa-onnx, SenseVoice)이 아이들 낭독을 얼마나 잘 받아 적는지 재는** 도구 묶음이에요. 지금은 **평가 중심**이에요(학습은 맨 뒤 "선택" 절).
국어나래의 낭독 유창성 실험(6단계 3차)을 위한 준비 단계예요. 학습·ONNX 내보내기는 10절, 배포 형식 그대로의 속도 재기는 7절 끝에 있어요.

**컴퓨터는 두 종류예요.** (A) **GPU 컴퓨터**(NVIDIA GPU, 예: GTX 1060)는 학습과 빠른 평가용이에요. 학습은 여기나 국내 GPU 클라우드에서 해요. (B) **CPU 실행 환경**(예: AMD Ryzen 5 5625U 노트북, RAM 20GB, GPU 없음)은 학습된 모델을 실제로 돌릴 기기예요. 여기서는 **속도 확인**(RTF: 1분 낭독을 몇 초에 처리하는지, 메모리를 얼마나 쓰는지)을 해요. 평가 도구는 둘 다에서 돌아가고, GPU가 없어도 괜찮아요.

**순서 한눈에 보기**: 설치 → 라벨 받기 → 라벨 살펴보기(`inspect`/`scan`) → 평가용 원천(Validation)만 받기 → `build_subset`(평가만) → `evaluate` → 숫자 표를 공유

> **이 도구는 선생님의 윈도우 컴퓨터(국내)에서만 돌려요.** 음성·전사 글을 이 저장소, 클라우드, Kaggle, Hugging Face, 채팅 어디에도 올리지 마세요(아래 약관).

## 1. 약관에서 꼭 지킬 점

| 약관 | 지킬 일 |
| --- | --- |
| 국외 반출 금지, 제3자 제공 금지 | 데이터(음성·전사·가공본: `work/audio`, `work/feats`, `train.jsonl`…)는 이 노트북 안에서만 써요. 외부 서버(Colab, Kaggle, Hugging Face, 해외 클라우드)에 올리지 않아요. 클라우드 백업 폴더(OneDrive 등)에 `work/`·`data/`를 두지 마세요. |
| 1번: 출처 표시 | 이 데이터를 쓴 모든 결과물(모델 설명서, 논문, 발표 자료)에 **"한국지능정보사회진흥원(NIA) 「한국어 아동 음성 데이터」 사업 결과를 활용"** 이라고 적어요. `train_asr.py` 가 만드는 `MODEL_CARD.md` 에는 이미 들어 있어요. |
| 8·9번: 개인정보 | 라벨 JSON에는 화자 이름(`SpeakerName`)이 있어요. 이 도구는 읽자마자 버리고, 출력·저장하지 않아요. 화자는 파일 이름에서 뽑은 코드의 **익명 키**로만 다뤄요. 데이터에서 개인정보를 발견하면 약관대로 신고·삭제하고, 누구인지 알아내려 하지 않아요. |

그래서 저(개발 도우미)에게 알려 줄 때는 **숫자 통계와 칸(필드) 이름만** 보내 주세요(8절).

## 2. 설치 (윈도우, WSL 필요 없음)

1. **Python 3.11** 을 python.org 에서 받아 설치해요(설치 첫 화면에서 *Add python.exe to PATH* 체크).
2. PowerShell을 열고(저장소의 `training\asr` 폴더에서) 가상환경을 만들어요. 그다음 **컴퓨터 종류에 맞는 한 갈래**로 PyTorch를 설치해요.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

**A. GPU 컴퓨터 (학습·빠른 평가)** — NVIDIA 드라이버를 최신으로 갱신하고(갱신 뒤 재부팅) CUDA 12.6 빌드를 깔아요.
```powershell
pip install torch --index-url https://download.pytorch.org/whl/cu126
pip install -r requirements.txt
python check_env.py
```
- **반드시 `cu126`(CUDA 12.6) 빌드로 설치해요.** 그냥 `pip install torch` 를 하면 너무 최신인 CUDA 빌드(13.x)가 깔리는데, 이런 빌드는 GTX 1060(Pascal, sm_61)용 계산 코드를 뺀 경우가 있어서 `no kernel image is available` 오류가 나요. `check_env.py` 가 이 문제를 알려 주고 다시 설치하는 방법을 안내해요.
- GTX 1060은 fp16 가속이 없고 bf16이 안 돼서, 학습은 **fp32** 로만 해요.

**B. CPU 실행 환경 (5625U 노트북 등, 속도 확인용)** — GPU가 없으니 CPU 빌드를 깔아요(용량도 작아요).
```powershell
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt      # sherpa-onnx 포함
python check_env.py
```
`check_env.py` 는 CUDA가 없어도 실패가 아니라 **"CPU로 평가해요"** 라고 안내해요. CPU 이름, 물리 코어·논리 스레드 수, AVX2 여부, 전체/여유 RAM, torch 스레드 수, sherpa-onnx 버전, 작은 행렬곱 속도(GFLOPS 어림)를 보여 줘요. 이 기기 평가는 **sherpa-onnx(int8 ONNX)** 가 주력이고, torch는 Whisper(torch)·Moonshine·elmenwol을 돌릴 때만 필요해요.

- 실행 정책 오류가 나면 PowerShell에서 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 를 한 번 실행해요.

## 3. 폴더 배치

```text
training\asr\
  data\labels\   ← 라벨 zip(TL_*.zip, VL_*.zip …)을 여기에
  data\source\   ← 원천 wav zip(평가용은 VS_*.zip)을 여기에
  work\          ← 도구가 만드는 결과(자동으로 생겨요. 저장소에는 올라가지 않아요)
```

`--labels`, `--sources` 로 다른 폴더를 줄 수도 있어요(여러 개 가능). 하위 폴더는 알아서 찾아요.

## 4. 단계별 명령 (평가 중심)

### 0단계. 환경 확인
```powershell
python check_env.py
```
CPU·RAM·패키지·행렬곱 속도(그리고 GPU가 있으면 GPU)를 확인해요. "준비됐어요"가 나오면 통과예요. GPU가 없으면 "CPU로 평가해요"라고 나와요.

### 1단계. 라벨 받기
AI Hub에서 **라벨링 데이터**(`TL_*`, `VL_*`)를 받아 `data\labels\` 에 둬요. 라벨은 용량이 작아요. 분할 압축(`이름.zip.part0`, `.part1`, …)이면 이어 붙여요(WSL 필요 없음).
```powershell
python merge_parts.py data\labels
```
조각 번호가 빠졌거나 크기가 0인 조각이 있으면 그 묶음은 이어 붙이지 않고 알려 줘요. 디스크가 모자라면 `--delete-parts` 로 이어 붙인 뒤 조각을 지워요.

### 2단계. 라벨 구조 살펴보기 (JSON 모양이 아직 확실하지 않아서)
```powershell
python inspect_labels.py --labels data\labels
```
키 경로, 값의 종류, 문자열 길이, 범주형 칸(`DataCategory`, `SchoolYear`, `Age`, `AgeGroup`, `NoiseEnviron`, `RecordingEnviron`, `Gender`, `SamplingRate`)의 빈도표, 파일 이름의 '모양'만 보여 줘요. 이름·전사 글·지역·방언의 값은 나오지 않아서 **출력을 그대로 채팅에 붙여도 안전해요.**
"fields.json 의 칸을 찾았는지" 줄에 `못 찾음`이 있으면 5절의 설정 파일을 고쳐야 해요(저에게 이 출력을 보여 주세요).

### 3단계. 훑어서 어떤 평가용 원천을 받을지 정하기
```powershell
python scan_labels.py --labels data\labels
```
라벨 zip을 풀지 않고 전부 읽어서 **학년 × 정형/비정형 × 소음** 별 시간·발화 수·화자 수 표를 보여 줘요. 마지막의 **"원천 zip 추천: 평가용(Validation)"** 표가 핵심이에요 — 시간이 큰 묶음부터 누적 4시간(넉넉히 5~6시간)이 채워질 만큼만 `VS_` 원천 zip을 받으면 돼요. 결과는 `work\scan.json`(숫자만)에 저장돼요.
라벨 zip ↔ 원천 zip 짝은 이름으로 짐작해요(기본 `TL_`→`TS_`, `VL_`→`VS_`; 바꾸려면 `fields.json` 의 `zip_pairs`).

### 4단계. 평가용 원천(Validation)만 받기
위 표에서 고른 `VS_*.zip` 만 받아 `data\source\` 에 둬요(분할이면 `python merge_parts.py data\source`). 학습용(`TS_*`)은 지금 받지 않아도 돼요. 받은 뒤 `python scan_labels.py --labels data\labels --sources data\source` 를 다시 하면 "내려받음" 칸으로 확인돼요.

### 5단계. (선택) 전사 기호 확인
```powershell
python normalize.py report-chars --labels data\labels
```
전사에 나온 **글자 종류와 빈도만**(한글 음절 제외) 보여 줘요. `b/ n/ o/ l/ u/`, `*`, `+`, 괄호 같은 기호가 실제로 어떻게 쓰이는지 확인해서, 기본 규칙(`fields.json` 의 `normalize`)이 맞는지 봐요. 규칙 시험: `python normalize.py try "(2)/(이) 학년 b/ 입니다"`.

### 6단계. 평가 묶음 만들기 (평가만)
```powershell
python build_subset.py --labels data\labels --sources data\source
```
- 기본이 **평가만**이에요(`--eval-hours 4`, `--train-hours 0`). 정형, 초등 1~6학년(학년 칸이 없으면 나이 7~13), 무소음:소음 = 85:15, 길이 0.5~30초, 학년이 고르게, 화자도 고르게.
- Validation 라벨에서 고르고, 필요한 wav만 원천 zip에서 꺼내 16kHz mono 16bit로 `work\audio\` 에 저장해요. 결과: `work\eval.jsonl`, `work\subset_report.json`. 같은 명령을 다시 하면 이미 만든 wav는 건너뛰어요(이어서 하기).
- `--dry-run` 은 고르기만 해요. 옵션: `--eval-hours`, `--grades 1-6`, `--noise-ratio 85:15`.
- **CPU 기기에서 속도를 잴 때**는 4시간을 다 돌릴 필요가 없어요. 7단계의 `--limit 20`(앞 20개)이나 `--max-minutes`(모델당 시간 상한)로 일부만 돌려 속도를 재요.
- (학습을 하게 되면 `--train-hours 25` 를 더해요. 평가 화자는 학습에서 빠져요.)

### 7단계. 평가

목적은 두 가지예요. (1) 정확도(CER·WER·낭독 채점 지표), (2) **실행 환경에서의 속도**: RTF와 **"1분 낭독 처리 시간(초) = RTF×60"**, 메모리 최대 사용량. CPU 기기에서는 속도가 핵심이라 아래 순서로 해요.

**먼저 모델을 받아요**(공개 모델이라 약관 문제가 없어요. 받은 파일은 `models\<이름>\` 에 놓여요).
```powershell
python download_models.py --list                  # 목록과 대략 크기
python download_models.py zipformer-ko-72m sensevoice whisper-base whisper-small
```

**처음엔 `--limit 20` 으로 속도부터** 재요(몇 분이면 끝나요). 빠른 것부터:
```powershell
python evaluate.py --limit 20 --models sherpa:models\zipformer-ko-72m sensevoice:models\sensevoice
python evaluate.py --limit 20 --moonshine                                   # Moonshine tiny/base-ko (처음 실행 때 자동으로 받아요)
python evaluate.py --limit 20 --models sherpa-whisper:models\whisper-base sherpa-whisper:models\whisper-small
python evaluate.py --limit 20 --models openai/whisper-small --elmenwol      # torch 필요(CPU 빌드도 돼요)
python evaluate.py --models sherpa-whisper:models\whisper-medium sherpa-whisper:models\whisper-turbo --max-minutes 15   # 큰 모델은 일부만
```
추천 순서(빠른 것부터): zipformer-ko → SenseVoice → Moonshine tiny/base-ko → Whisper base/small(sherpa int8) → elmenwol(torch) → Whisper medium/turbo(`--max-minutes` 로 일부만).

- `--threads N`: sherpa-onnx와 torch 둘 다에 적용돼요. 기본값은 물리 코어 수 어림(논리 스레드÷2, 최소 1)이라 5625U(6코어 12스레드)면 6이에요.
- **진행 중 예상 시간**: 첫 10개(또는 30초 분량)를 처리한 뒤 RTF로 "이 모델은 전체를 다 하려면 약 ○시간 ○분"이라고 알려 줘요.
- `--max-minutes N`: 모델마다 N분이 넘으면 그때까지 처리한 발화로 결과를 내고 **부분 결과**로 표시해요(요약표 발화수 옆 `*`). 느린 큰 모델을 일부만 평가할 때 써요. 부분 결과의 정확도는 참고용이고, 속도(RTF)는 그대로 믿을 수 있어요.
- 4시간 전체 평가가 필요하면 위 명령에서 `--limit` 을 빼요.

`--models` 에는 `[백엔드:]모델` 을 여러 개 줄 수 있어요(접두사가 없으면 whisper, 이름에 moonshine 이 있으면 moonshine).

| 백엔드 | 모델 | 필요한 것 |
| --- | --- | --- |
| `sherpa:` | 한국어 zipformer 스트리밍 모델 **폴더**(`download_models.py zipformer-ko-72m`: int8 encoder/decoder/joiner + tokens.txt) | sherpa-onnx. `--sherpa-chunk 64` 이 파일 이름의 chunk 크기를 골라요 |
| `sensevoice:` | sherpa-onnx용 SenseVoice 폴더(`model.int8.onnx` + `tokens.txt`, `download_models.py sensevoice`) | sherpa-onnx |
| `sherpa-whisper:` | sherpa-onnx용 Whisper int8 폴더(`*-encoder.int8.onnx`, `*-decoder.int8.onnx`, `*-tokens.txt`; `download_models.py whisper-tiny/base/small/medium/turbo`). torch 없이 CPU로 한국어(`language="ko"`) 인식 | sherpa-onnx |
| `moonshine:` | `moonshine-ai/moonshine-tiny-ko`, `moonshine-ai/moonshine-base-ko` | torch, transformers(Moonshine 지원 버전). 이름이 다르면 `--moonshine-ids` 로 바꿔요. HF에 있는지 확인하고 없으면 알려 줘요 |
| `whisper:` | `openai/whisper-small`, `openai/whisper-base`, `elmenwol/whisper-small_aihub_child` 또는 학습 결과 폴더 | torch, transformers |

설치되지 않은 백엔드나 없는 모델은 "건너뜀"이라고 알리고 다음 모델로 가요. GPU 컴퓨터에서는 `--device cuda`(자동)로 빨리 돌 수 있고(`--batch` 로 줄일 수 있어요), CPU 기기에서는 자동으로 CPU를 써요.

**5625U 기준 속도 어림표 (실측이 아니라 어림이에요!)** — 이 클라우드 CPU(4스레드)에서 zipformer-ko 72M int8의 RTF를 약 0.06으로 재 본 것을 바탕으로, 나머지는 범위로 어림했어요. **꼭 `--limit 20` 으로 직접 재 보세요.** 4시간 평가 예상 = 4시간 × RTF.

| 모델 | 크기(대략) | 예상 RTF | 1분 낭독 처리(초) | 4시간 평가 예상 |
| --- | --- | --- | --- | --- |
| zipformer-ko 72M int8 (sherpa) | 70MB | 약 0.06 | 약 4 | 약 15분 |
| Moonshine tiny-ko | 약 0.1GB | 0.02~0.05 | 1~3 | 5~12분 |
| SenseVoice int8 (sherpa) | 230MB | 0.03~0.1 | 2~6 | 7~24분 |
| Whisper base int8 (sherpa-whisper) | 155MB | 0.1~0.3 | 6~18 | 24~72분 |
| Whisper small int8 (sherpa-whisper) | 360MB | 0.3~0.8 | 18~48 | 1.2~3.2시간 |
| Whisper small fp32 (torch, elmenwol 포함) | 약 1GB | 0.6~1.5 | 36~90 | 2.4~6시간 |
| Whisper turbo int8 (sherpa-whisper) | 990MB | 0.6~1.5 | 36~90 | 2.4~6시간 → `--max-minutes` |
| Whisper medium int8 (sherpa-whisper) | 900MB | 1~2.5 | 60~150 | 4~10시간 → `--max-minutes` |

RTF가 1보다 크면 실시간보다 느려요(1분 낭독에 60초 넘게 걸려요). 앱이 실시간 안내를 하려면 RTF가 충분히 작아야 해요.

모델마다 같은 표로 나와요: **CER**(공백 뺀 글자 기준), **어절 WER**, 학년별·소음별, **RTF**(1보다 작으면 실시간보다 빨라요, 장치·스레드 수 표시), **1분 낭독 처리 시간(초)**, **평가한 발화 수**(부분 결과면 `*`), **RAM 최대 사용량**(MB, 이 프로세스의 최대치예요. 앞 모델 것을 포함하니 모델마다 정확히 재려면 하나씩 따로 실행해요. 윈도우에서도 추가 설치 없이 나와요), **모델 파일 크기(MB)**, 그리고 **낭독 채점 지표**(아래 6절의 어절 맞춤):
- 오경보율: 아이가 정확히 읽었는데 오류(대치·삭제)로 표시된 어절 비율(발화 단위도 같이).
- 놓침률: 원문 어절을 한 글자만 다르게 바꿔 놓았을 때(아이가 그렇게 잘못 읽은 상황) 오류로 못 잡은 비율.
- 어절을 '같다'고 볼 글자 오류율 기준(`--max-cer`, 기본 `0,0.34`)에 따라 두 값이 어떻게 달라지는지 같이 나와요. 기준을 느슨하게 하면 오경보는 줄지만 놓침이 늘어요.

결과는 숫자 표만 `work\eval_*.json` 에 저장돼요. 전사 예시는 `--show-examples 3` 을 줄 때만 **내 화면에** 나와요(저장·공유하지 마세요).

**배포 형식 그대로 속도 재기 (`scripts/asr-eval-onnx.mjs`)**: 위 평가는 sherpa-onnx·torch 로 돌려요. 앱이 실제로 쓰는 것과 같은 **transformers.js(Node, onnxruntime-node CPU) + ONNX 8비트**로 재려면 저장소 루트에서 실행해요(Node 22, `npm install` 뒤).
```powershell
npx tsx scripts/asr-eval-onnx.mjs --model training/asr/export/narae-asr-lite --eval training/asr/work/eval.jsonl --threads 6 --limit 20
npx tsx scripts/asr-eval-onnx.mjs --model onnx-community/whisper-base --eval training/asr/work/eval.jsonl --cache D:\asr-cache   # 공개 모델과 비교(HF에서 받아 --cache 폴더에 둬요)
```
`src/core/fluency` 와 같은 규칙으로 CER·어절 WER(띄어쓰기 무시)·오경보율을 내고, RTF, **1분 낭독 처리 시간**(RTF×60 환산 + 소리를 이어 붙인 60초를 실제로 돌린 실측), 최대 메모리를 한 줄 표로 보여 줘요. 전사 글은 기본으로 출력하지 않아요(`--show-examples N` 은 내 화면에만). 모델 하나당 한 번씩 따로 실행하세요(최대 메모리가 프로세스 전체 값이라서요). 회사·학교망에서 Node 가 프록시를 못 쓰면 `NODE_USE_ENV_PROXY=1`(Node 22.21 이상)을 설정하고, 막혀 있으면 `--remote-host` 로 미러를 줘요. 이 값은 앱의 단계 고르기 문턱값(`src/core/speech/catalog.ts` 의 `SPEECH_BENCH_FAST_MS`)을 정할 때 써요.

### 8단계. 결과 숫자 표를 채팅에 공유
`evaluate.py` 맨 끝의 **"비교 요약" 표**(모델·발화수·크기·CER·WER·RTF·1분 낭독 처리 시간·RAM·오경보·놓침)와 `work\eval_*.json` 의 숫자를 그대로 붙여 주세요. 글·음성·이름 없이 숫자만이라 안전해요(8절).

## 5. 설정 파일 `fields.json`

JSON의 칸 이름이 문서와 조금 달라도 고칠 수 있게 모든 경로를 이 파일에 모았어요(`--fields 내파일.json` 으로 일부만 덮어쓰는 것도 돼요).

- `paths`: 전사, 정형 여부, 학년, 나이, 소음, 파일 이름, 길이 같은 칸의 경로(점으로 이어요). 대소문자·밑줄·하이픈은 무시하고, 경로로 못 찾으면 마지막 이름만으로 다시 찾아요(`LableText`/`LabelText` 같은 철자 변형은 둘 다 적어 뒀어요). 그래도 없으면 도구가 "못 찾음"이라고 분명히 알려 줘요.
- `values`: 정형/비정형 값, 소음·무소음으로 볼 낱말, 학년 값 해석(`school_year_map`).
- `speaker.regex`: 화자 코드를 파일 이름에서 뽑는 정규식. 못 뽑으면 도구가 알려 줘요(그 파일은 빼요). `inspect_labels.py` 의 '파일 이름 모양'을 보고 고쳐요.
- `zip_pairs`: 라벨 zip 이름 → 원천 zip 이름 변환 규칙.
- `normalize`: 전사 기호 처리 규칙.
- `sensitive_keys`: 읽자마자 버릴 칸 이름(기본: `SpeakerName`, 지역, 방언 …).

## 6. 어절 맞춤 채점(앱과 공유)

낭독 유창성 채점은 원문 어절과 인식 결과 어절을 레벤시테인으로 맞춰요.

- TS(앱): `src/core/fluency/align.ts` — `normalizeEojeol`, `alignEojeol`, `fluencyScore`.
- 파이썬: `fluency.py` — 같은 알고리즘.
- 공통 시험 자료: `tests/fixtures/fluency-align.json`(저장소 맨 위 `tests/`). TS 시험(`npm test`)과 파이썬 시험(`pytest training/asr/tests`)이 둘 다 통과해야 해요.
- 규칙: 문장부호는 지우고 숫자는 그대로 비교해요. 같은 비용이면 일치 > 대치 > 삭제 > 삽입 순으로 골라요. **대치·삭제만 오류**로 세고, 끼워 넣은 말·되풀이는 오류가 아니라 읽은 시간으로 반영돼요(`wcpm` = 바르게 읽은 어절 ÷ 걸린 분). 인식 모델이 띄어쓰기를 안 하거나 틀려도 흔들리지 않도록, 인식 결과의 공백을 모두 지우고 **글자 단위로 맞춘 뒤** 원문 어절마다 결과를 모아요(어절 안쪽에 끼어든 글자는 그 어절의 오류, 어절 사이에 끼어든 글자는 끼워 넣기). 예전 공백 어절 단위 맞춤은 `spacing: "strict"`(파이썬 `spacing="strict"`)로 남아 있어요. 요약표의 WER 는 띄어쓰기 무시이고 WERsp 가 예전 방식(참고)이에요.

## 7. 도구 자체 시험 (가짜 데이터)

실제 데이터 없이 도구가 도는지 확인해요. `tests/make_fake_aihub.py` 가 AI Hub 모양의 **가짜** zip(가짜 이름 포함, 사인파 음성, 분할 파일)을 만들고, merge → inspect → scan → build_subset → (whisper-tiny 2걸음 CPU 학습) → evaluate 를 돌려요. 모든 출력과 만든 파일에 가짜 이름이 새지 않는지도 검사해요.
```powershell
pip install pytest
python -m pytest tests -q
```
Hugging Face에서 모델을 내려받지 못하는 환경이면 학습·평가 시험은 건너뛰어요(건너뜀 표시).

## 8. 저에게 알려 주면 되는 것 / 보내지 말 것

**보내도 되는 것(숫자·이름만)**
- `inspect_labels.py` 출력 전체(구조만 나와요), `scan_labels.py` 의 표, `normalize.py report-chars` 의 글자 빈도.
- `check_env.py` 출력, `train_asr.py --speedtest` 결과, `log.csv` 의 숫자, `evaluate.py` 의 표(`eval_*.json`).
- 오류가 났을 때 오류 메시지(경로에 이름이 들어 있지 않은지만 훑어봐 주세요).

**보내면 안 되는 것**
- 음성 파일, 전사 글(문장 내용), 화자 이름, 라벨 JSON 원본, `work/` 안의 파일들, `--show-examples` 로 본 예시.
- 학습한 모델 파일도 공개하기 전에 약관(출처 표시 등)을 다시 확인해요.

## 9. 문제 해결

| 증상 | 해결 |
| --- | --- |
| `no kernel image is available` | PyTorch를 cu126 빌드로 다시 설치(2절). |
| GPU가 없어서 CUDA가 안 된다고 나옴 | 실패가 아니에요. CPU 빌드 torch(2절 B)로 `--device cpu`(자동)로 돌려요. 느리면 `--limit 20`, `--max-minutes` 로 일부만. |
| `download_models.py` 가 0% 에서 멈춤 | 회사·학교 네트워크가 Hugging Face 의 큰 파일 서버(xethub)를 막은 경우예요. `$env:HF_HUB_DISABLE_XET="1"` 을 설정하고 다시 실행해 보세요. |
| `CUDA out of memory` / "메모리 부족" | `--batch 2 --accum 16`, 그래도 안 되면 `--batch 1 --accum 32`, 또는 더 작은 모델·LoRA. |
| 한글 파일 이름이 깨져 보임 | 도구가 zip의 utf-8 표시를 보고 아니면 cp437→utf-8/cp949 로 되돌려 읽어요. 그래도 안 맞으면 알려 주세요. |
| `못 찾음` 칸이 있음 | `inspect_labels.py` 로 실제 키 이름을 보고 `fields.json` 을 고쳐요. |
| 화자 수가 너무 적게 나옴 | `speaker.regex` 가 맞지 않는 거예요. '파일 이름 모양'을 알려 주세요. |
| 학습이 너무 느림 | `--speedtest` 로 확인. 걸음당 시간이 길면 `tiny`/`base`, 발화 수를 줄이거나 `--max-steps` 를 줄여요. |

## 10. 학습과 내보내기 (두 단계 모델 + 3단계)

국어나래는 음성 인식 모델을 크기별로 나눠 제공해요(`docs/stage6-listening-speaking.md` "음성 인식 모델 두 단계 제공"). **학습은 GPU 컴퓨터나 국내 GPU 클라우드에서만** 해요(CPU 실행 노트북에서는 하지 않아요). 어느 쪽이든 데이터 약관(국외 반출·제3자 제공 금지, NIA 출처 표시, 화자 이름 칸 미사용)을 그대로 지켜요.

| 단계 | 앱 id(가칭) | 출발 모델 | 학습 명령 | 학습 장소 | 라이선스 |
| --- | --- | --- | --- | --- | --- |
| 1 가벼움 | `narae-asr-lite` | `openai/whisper-base` | `train_asr.py --family whisper --model openai/whisper-base` | 1060 노트북 또는 클라우드 | MIT |
| 1 선택지 | `narae-asr-moonshine-ko` | `moonshine-ai/moonshine-base-ko` | `train_asr.py --family moonshine` | 1060 노트북 또는 클라우드 | **Moonshine Community License(비상업·연구만)** |
| 2 표준 | `narae-asr-standard` | `openai/whisper-small` | `train_asr.py --family whisper --model openai/whisper-small` (선택 `--lora`) | 1060 노트북(LoRA 권장) 또는 클라우드 | MIT |
| 3 프로 | `narae-asr-pro` | `openai/whisper-large-v3-turbo`(8.1억) | `train_asr.py --family whisper --model openai/whisper-large-v3-turbo` | **국내 GPU 클라우드만**(24GB 이상, 권장 A100 80GB) | MIT |

- 3단계는 GPU가 있는 **교사 기기 전용**이에요(학생이 교사 기기 앞에서 읽는 방식, 음성은 그 기기 밖으로 나가지 않아요). 앱이 자동으로 고르지 않고 교사가 직접 켜요. GPU 메모리가 16GiB 미만이면 `train_asr.py` 가 안내만 하고 끝나요. 24~40GB급은 기본 **LoRA**, 80GB급(60GiB 이상)은 전체 학습이에요(`--full` 로 전체 학습을 시도할 수도 있어요).
- 실행 기준 기기는 Ryzen 5 5625U(CPU만)이고, 배포 형식은 **transformers.js 가 바로 읽는 ONNX 8비트** 하나로 통일해요(3단계만 GPU용 fp16 파일을 더 둘 수 있어요). 나중에 다른 큰 모델을 넣을 수 있게 목록(`src/core/speech/catalog.ts`)은 배열 구조예요.

### 10-1. `train_asr.py` 옵션 요약

| 옵션 | 설명 |
| --- | --- |
| `--family whisper\|moonshine` | 모델 계열(기본 whisper). `--model` 기본값: whisper→`openai/whisper-base`, moonshine→`moonshine-ai/moonshine-base-ko`. Whisper는 `tiny/base/small/turbo` 줄임말도 돼요 |
| `--precision auto\|fp32\|fp16\|bf16` | auto: GPU 계산 능력 8 이상(A100 등)이면 **bf16**, 아니면 **fp32**(GTX 1060은 6.1이라 fp32). CPU는 늘 fp32 |
| `--batch`, `--accum` | 기본은 GPU 메모리로 자동: 6GB급 4×8, 10~22GB 8×4, 24GB급 16×2, 80GB급 32×1(곱은 늘 32). large급(turbo)은 2×16 / 4×8 / 8×4. 직접 주면 그 값이 먼저예요(하나만 주면 곱을 맞춰 다른 하나를 정해요) |
| `--grad-ckpt` / `--no-grad-ckpt` | gradient checkpointing. 기본은 GPU 메모리가 작을 때(22GiB 미만)와 large급일 때만 켜요 |
| `--save-every N` / `--resume` | N걸음마다 이어 하기 저장(기본 100) / 끊긴 학습 이어서 하기 |
| `--speedtest` | 30걸음만 돌려 걸음당 시간·GPU 메모리·예상 학습 시간 보기(저장 안 함) |
| `--lora`, `--full` | LoRA 학습(whisper-small·turbo 등에 선택) / large급에서 전체 학습 강제 |

- 메모리가 모자라면(`out of memory`) 도구가 "`--batch` 를 줄이고 `--accum` 을 늘려 곱을 같게" 하라고 안내하고 끝나요. 저장된 것이 있으면 `--resume`.
- Whisper는 `prepare_features.py`(Whisper 전용 멜 특징 캐시, turbo는 128멜이라 `work\feats128`)를 먼저 돌리면 빨라져요. **Moonshine은 16kHz 원음을 그대로 넣으므로 특징 캐시가 필요 없어요.**
- 결과: `work\runs\<이름>\final\`(평가·내보내기에 바로 써요), `log.csv`, `MODEL_CARD.md`(출발 모델·라이선스 문구, NIA 출처 표시 "한국지능정보사회진흥원(NIA) 「한국어 아동 음성 데이터」 사업 결과를 활용", 학습 데이터 미포함, 평가 결과 칸). 평가 결과 칸은 `evaluate.py`·`asr-eval-onnx.mjs` 숫자로 직접 채워요.
- 옛 이름 `train_whisper.py` 는 `train_asr.py --family whisper` 를 부르는 껍데기로 남아 있어요(`--model base` 같은 줄임말도 그대로 돼요).

### 10-2. 국내 GPU 클라우드에서 하는 순서 (A100 80GB 등, bf16)

> **복사·붙여넣기로 따라 하는 순서표는 [`CLOUD_TRAINING.md`](CLOUD_TRAINING.md)** 예요(엘리스클라우드 기준, 비용 어림, 스팟 회수 대비, 데이터 삭제까지). 아래는 요약이에요.

노트북에서 학습 묶음과 업로드 묶음 만들기(`TS_kor_formatted_01.tar` 하나만 받아도 25시간은 충분해요. 초등 정형 약 1,100시간이 TS 4개에 나뉘어 있어요):
```powershell
python build_subset.py --labels data\labels --sources data\source --train-hours 25
python pack_for_cloud.py        # work\cloud_upload\narae_asr_data.tar + MANIFEST.txt (wav·익명 manifest만, 국내 클라우드에만 올리고 끝나면 지워요)
```
학습/검증은 원천 파일 이름(`TS_`/`VS_`)으로 갈라요(라벨이 한 폴더에 섞여 있어도 돼요). 검증 원천에 나온 화자와 기존 `work/eval.jsonl` 의 화자는 모두 학습에서 빠지고, 이미 만든 `eval.jsonl` 은 그대로 둬요(다시 만들려면 `--no-keep-eval`).

1. **인스턴스 만들기**: 국내 리전(서버가 한국 안에 있는 곳)의 GPU 인스턴스. 1단계·2단계는 24GB 이상이면 충분하고, 3단계(turbo)는 24GB 이상(권장 A100 80GB). 저장 공간은 학습용 16k 오디오 + 특징 캐시를 합쳐 넉넉히(25시간이면 약 100GB 미만으로 어림). **해외 리전·해외 서비스(Colab, Kaggle 등)는 쓰지 않아요.**
2. **코드·평가 도구 올리기**: 저장소 코드(`training/asr/` 폴더)만 올려요(`git clone` 또는 복사). 데이터는 포함돼 있지 않아요. 파이썬 환경은 2절 A와 같고(리눅스면 `python3 -m venv .venv && . .venv/bin/activate`, CUDA 빌드 torch), `python check_env.py` 로 GPU를 확인해요.
3. **학습에 필요한 16k 오디오와 manifest만 올리기**: 교사 노트북에서 `build_subset.py --train-hours 25` 와 `pack_for_cloud.py` 로 만든 묶음(아래는 같은 내용을 낱개로 올릴 때) **`work/audio/`(16kHz wav)와 `work/train.jsonl`, `work/eval.jsonl`, `work/subset_report.json`** 만 인스턴스의 `work/` 로 올려요. 원본 zip(`data/source`, `data/labels`)과 라벨 JSON은 올리지 않아요(화자 이름이 있어요).
4. **학습**: 아래 10-4의 명령. 먼저 `--speedtest` 로 시간·메모리를 확인해요. 사용 시간이 곧 비용이니 `tmux`/`nohup` 으로 끊김에 대비하고 `--resume` 을 믿어요.
5. **내보내기**: 같은 인스턴스에서 10-5의 **내보내기 전용 환경**으로 `export_asr.py` 를 돌려요(CPU로 충분해요).
6. **데이터 즉시 삭제, 결과 모델만 내려받기**: 내보낸 폴더(`export/<id>`: ONNX 파일, 설정, `MODEL_CARD.md`, `LICENSE.txt`, `manifest.json`)와 `log.csv`만 내려받고, 곧바로 `work/audio`, `work/feats*`, `work/*.jsonl` 과 인스턴스(디스크 포함)를 삭제해요. 학습에 쓴 음성·전사는 모델 폴더에 들어 있지 않아요. 삭제 뒤 스냅샷·백업이 남지 않았는지도 확인해요.

### 10-3. GTX 1060 노트북에서 하는 순서 (fp32)

1. 2절 A(CUDA 12.6 `cu126` 빌드)로 설치하고 `python check_env.py`. 학습 데이터(`TS_*` 원천)를 받고 `build_subset.py` 를 돌려요(이 노트북 안에서만 처리해요).
2. 1단계는 `--model openai/whisper-base`(fp32, 4×8 자동), 2단계는 `--model openai/whisper-small --lora` 를 권해요(6GB). 3단계 turbo는 **이 컴퓨터에서 학습할 수 없어요**(안내 후 종료).
3. 오래 돌릴 때: 전원 어댑터 연결, 전원 모드 **최고 성능**, 덮개를 닫아도 잠들지 않게, 쿨러 받침, 윈도우 자동 재시작 미루기, 무거운 프로그램 닫기, `--resume`.
4. 내보내기는 10-5의 윈도우 명령으로 만든 별도 환경에서 해요.

### 10-4. 단계별 명령

```powershell
# (1) 학습 묶음 만들기(교사 노트북, 평가 화자는 학습에서 빠져요)
python build_subset.py --labels data\labels --sources data\source --train-hours 25
python prepare_features.py --model base          # Whisper 전용(small은 --model small, turbo는 --model turbo). Moonshine은 필요 없어요

# (2) 1단계 whisper-base
python train_asr.py --family whisper --model openai/whisper-base --speedtest
python train_asr.py --family whisper --model openai/whisper-base          # 끊기면 --resume

# (3) 2단계 whisper-small (6GB는 --lora)
python train_asr.py --family whisper --model openai/whisper-small

# (3b) 3단계 whisper-large-v3-turbo (국내 GPU 클라우드 전용, 24~40GB는 자동 LoRA, 80GB는 전체)
python prepare_features.py --model turbo
python train_asr.py --family whisper --model openai/whisper-large-v3-turbo

# (4) 선택: Moonshine base-ko (비상업·연구용)
python train_asr.py --family moonshine

# (5) 내보내기(내보내기 전용 환경, 10-5)
python export_asr.py --model work\runs\base\final  --out export\narae-asr-lite     --id narae-asr-lite
python export_asr.py --model work\runs\small\final --out export\narae-asr-standard --id narae-asr-standard
python export_asr.py --model work\runs\large-v3-turbo\final --out export\narae-asr-pro --id narae-asr-pro --fp16

# (6) 배포 형식 그대로 평가(저장소 루트에서, 7절 끝의 "배포 형식 그대로 속도 재기")
npx tsx scripts/asr-eval-onnx.mjs --model training/asr/export/narae-asr-lite --eval training/asr/work/eval.jsonl --threads 6
```

### 10-5. 내보내기 전용 환경 (학습 환경과 따로)

optimum 설치가 다른 패키지(transformers, huggingface_hub 등)의 버전을 바꿔 학습 환경을 깨뜨려요(optimum-onnx 0.1.0 은 transformers 4.57 이하만 지원). 그래서 **내보내기만을 위한 별도 가상환경**을 만들어요(`training/export_env.sh` 와 같은 방식).

리눅스·맥(클라우드 인스턴스 등):
```bash
bash ../export_env.sh /tmp/onnxenv          # 저장소의 training/export_env.sh. 한 번만 만들면 돼요
/tmp/onnxenv/bin/python export_asr.py --model work/runs/base/final --out export/narae-asr-lite --id narae-asr-lite
```

윈도우(PowerShell, `training\asr` 폴더에서):
```powershell
py -3.11 -m venv .venv-export
.\.venv-export\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install "transformers==4.57.*" "optimum==2.1.*" "optimum-onnx==0.1.0" onnx onnxruntime onnx-ir ml_dtypes safetensors sentencepiece tokenizers "huggingface_hub<1.0" numpy
python export_asr.py --model work\runs\base\final --out export\narae-asr-lite --id narae-asr-lite
deactivate
```
- `export_asr.py` 는 optimum 의 `main_export`(task `automatic-speech-recognition-with-past`, 디코더는 `decoder_model_merged.onnx` 하나로 합침)로 fp32 ONNX 를 만들고, onnxruntime `quantize_dynamic`(**QUInt8, per_channel, reduce_range**)으로 8비트로 줄여요. 선택 이유는 파일 머리말에 적어 뒀어요(공개 transformers.js 모델과 같은 방식, 구형 AVX2 CPU에서 안전, 가중치 오차가 작은 쪽). `--weight-type qint8`, `--no-reduce-range`, `--no-per-channel` 로 바꿔 비교할 수 있어요.
- 결과 폴더: `config.json`, `generation_config.json`, `preprocessor_config.json`, 토크나이저 파일들, `onnx/encoder_model_quantized.onnx`, `onnx/decoder_model_merged_quantized.onnx`(Whisper·Moonshine 같은 이름이에요. `--fp16` 이면 `*_fp16.onnx` 도), `MODEL_CARD.md`, `LICENSE.txt`(Whisper는 MIT 전문, Moonshine은 비상업 안내), `manifest.json`(파일 크기·sha256).
- 학습 환경(transformers 5.x)이 저장한 `config.json` 을 내보내기 환경(4.57)이 잘못 읽으면 `--base-id openai/whisper-base` 를 줘요(가중치는 학습 결과에서, 설정·토크나이저는 기본 모델에서 가져와요).
- 학습 없이 `--model openai/whisper-base` 처럼 HF id 를 주면 출발 모델 그대로 내보내요(도구 확인용). Moonshine 내보내기는 optimum 이 Moonshine 구조를 지원하는 버전이어야 해요(onnx-community 의 `moonshine-base-ko-ONNX` 가 같은 파일 이름을 써요).
- 내보낸 폴더는 학교(국내) 서버에 두고 앱의 모델 base URL 이 그 폴더를 가리키게 해요. 모델 파일을 이 저장소에 넣지 마세요(`.gitignore` 에 `training/asr/**` 데이터는 제외돼 있고, `export/` 도 올리지 않아요).

