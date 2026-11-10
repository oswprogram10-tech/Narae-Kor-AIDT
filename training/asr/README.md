# 아동 낭독 음성 인식 학습 도구 (`training/asr/`)

AI Hub 「한국어 아동 음성 데이터」(미디어젠, 아동 낭독 발화)로 **여러 음성 인식 모델(Whisper, Moonshine, sherpa-onnx, SenseVoice)이 아이들 낭독을 얼마나 잘 받아 적는지 재는** 도구 묶음이에요. 지금은 **평가 중심**이에요(학습은 맨 뒤 "선택" 절).
국어나래의 낭독 유창성 실험(6단계 3차)을 위한 준비 단계예요. ONNX 내보내기와 브라우저 연결은 다음 단계에서 해요.

**컴퓨터는 두 종류예요.** (A) **GPU 컴퓨터**(NVIDIA GPU, 예: GTX 1060)는 학습과 빠른 평가용이에요. 학습은 여기나 국내 GPU 클라우드에서 해요. (B) **CPU 실행 환경**(예: AMD Ryzen 5 5625U 노트북, RAM 20GB, GPU 없음)은 학습된 모델을 실제로 돌릴 기기예요. 여기서는 **속도 확인**(RTF: 1분 낭독을 몇 초에 처리하는지, 메모리를 얼마나 쓰는지)을 해요. 평가 도구는 둘 다에서 돌아가고, GPU가 없어도 괜찮아요.

**순서 한눈에 보기**: 설치 → 라벨 받기 → 라벨 살펴보기(`inspect`/`scan`) → 평가용 원천(Validation)만 받기 → `build_subset`(평가만) → `evaluate` → 숫자 표를 공유

> **이 도구는 선생님의 윈도우 컴퓨터(국내)에서만 돌려요.** 음성·전사 글을 이 저장소, 클라우드, Kaggle, Hugging Face, 채팅 어디에도 올리지 마세요(아래 약관).

## 1. 약관에서 꼭 지킬 점

| 약관 | 지킬 일 |
| --- | --- |
| 국외 반출 금지, 제3자 제공 금지 | 데이터(음성·전사·가공본: `work/audio`, `work/feats`, `train.jsonl`…)는 이 노트북 안에서만 써요. 외부 서버(Colab, Kaggle, Hugging Face, 해외 클라우드)에 올리지 않아요. 클라우드 백업 폴더(OneDrive 등)에 `work/`·`data/`를 두지 마세요. |
| 1번: 출처 표시 | 이 데이터를 쓴 모든 결과물(모델 설명서, 논문, 발표 자료)에 **"한국지능정보사회진흥원(NIA) 「한국어 아동 음성 데이터」 사업 결과를 활용"** 이라고 적어요. `train_whisper.py` 가 만드는 `MODEL_CARD.md` 에는 이미 들어 있어요. |
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
- `check_env.py` 출력, `train_whisper.py --speedtest` 결과, `log.csv` 의 숫자, `evaluate.py` 의 표(`eval_*.json`).
- 오류가 났을 때 오류 메시지(경로에 이름이 들어 있지 않은지만 훑어봐 주세요).

**보내면 안 되는 것**
- 음성 파일, 전사 글(문장 내용), 화자 이름, 라벨 JSON 원본, `work/` 안의 파일들, `--show-examples` 로 본 예시.
- 학습한 모델 파일도 공개하기 전에 약관(출처 표시 등)을 다시 확인해요.

## 9. 문제 해결

| 증상 | 해결 |
| --- | --- |
| `no kernel image is available` | PyTorch를 cu126 빌드로 다시 설치(2절). |
| GPU가 없어서 CUDA가 안 된다고 나옴 | 실패가 아니에요. CPU 빌드 torch(2절 B)로 `--device cpu`(자동)로 돌려요. 느리면 `--limit 20`, `--max-minutes` 로 일부만. |
| `CUDA out of memory` / "메모리 부족" | `--batch 2 --accum 16`, 그래도 안 되면 `--batch 1 --accum 32`, 또는 더 작은 모델·LoRA. |
| 한글 파일 이름이 깨져 보임 | 도구가 zip의 utf-8 표시를 보고 아니면 cp437→utf-8/cp949 로 되돌려 읽어요. 그래도 안 맞으면 알려 주세요. |
| `못 찾음` 칸이 있음 | `inspect_labels.py` 로 실제 키 이름을 보고 `fields.json` 을 고쳐요. |
| 화자 수가 너무 적게 나옴 | `speaker.regex` 가 맞지 않는 거예요. '파일 이름 모양'을 알려 주세요. |
| 학습이 너무 느림 | `--speedtest` 로 확인. 걸음당 시간이 길면 `tiny`/`base`, 발화 수를 줄이거나 `--max-steps` 를 줄여요. |

## 10. 선택: 나중에 학습하기

**학습은 GPU 컴퓨터나 국내 GPU 클라우드에서 해요**(CPU 실행 환경 노트북에서는 하지 않아요). 단, 국내 클라우드에서도 데이터 약관(국외 반출·제3자 제공 금지)을 지켜야 해요. 지금은 평가가 목적이라 학습은 하지 않아요. 나중에 해 보고 싶을 때만 아래를 쓰세요(`train_whisper.py`, `prepare_features.py`). 학습용 데이터는 `build_subset.py --train-hours 25` 와 학습용 원천(`TS_*`)이 필요해요.

```powershell
python build_subset.py --labels data\labels --sources data\source --train-hours 25
python prepare_features.py --model base
python train_whisper.py --model base --speedtest   # 30걸음만 돌려 걸음당 시간·GPU 메모리·예상 시간 보기
python train_whisper.py --model base               # 학습(100걸음마다 저장), 끊기면 --resume
python train_whisper.py --model small --lora       # small은 LoRA
```
fp32(1060은 fp16 가속이 없어요), 기본 배치 4 × 누적 8, OOM이면 `--batch 2 --accum 16`. 끝나면 `work\runs\<이름>\final\`(평가에 바로 쓸 수 있어요), `log.csv`, `MODEL_CARD.md`(출처 표시 문구 포함, 학습 데이터는 포함하지 않는다고 적혀 있어요)가 생겨요. 학습한 모델은 `python evaluate.py --models work\runs\base\final` 로 비교해요.

노트북으로 오래 돌릴 때: 전원 어댑터 연결, 전원 모드 **최고 성능**, 덮개를 닫아도 잠들지 않게, 쿨러 받침, 윈도우 자동 재시작 미루기, 무거운 프로그램 닫기, 중간 저장(`--resume`)을 믿고 쓰기.
