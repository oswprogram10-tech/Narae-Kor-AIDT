# 아동 낭독 음성 인식 학습 도구 (`training/asr/`)

AI Hub 「한국어 아동 음성 데이터」(미디어젠, 아동 낭독 발화)로 **Whisper(tiny/base/small)** 를 아이들 낭독에 맞게 다듬고, 정확도를 재는 도구 묶음이에요.
국어나래의 낭독 유창성 실험(6단계 3차)을 위한 준비 단계예요. ONNX 내보내기와 브라우저 연결은 다음 단계에서 해요.

> **이 도구는 선생님의 윈도우 노트북(국내)에서만 돌려요.** 음성·전사 글을 이 저장소, 클라우드, Kaggle, Hugging Face, 채팅 어디에도 올리지 마세요(아래 약관).

## 1. 약관에서 꼭 지킬 점

| 약관 | 지킬 일 |
| --- | --- |
| 국외 반출 금지, 제3자 제공 금지 | 데이터(음성·전사·가공본: `work/audio`, `work/feats`, `train.jsonl`…)는 이 노트북 안에서만 써요. 외부 서버(Colab, Kaggle, Hugging Face, 해외 클라우드)에 올리지 않아요. 클라우드 백업 폴더(OneDrive 등)에 `work/`·`data/`를 두지 마세요. |
| 1번: 출처 표시 | 이 데이터를 쓴 모든 결과물(모델 설명서, 논문, 발표 자료)에 **"한국지능정보사회진흥원(NIA) 「한국어 아동 음성 데이터」 사업 결과를 활용"** 이라고 적어요. `train_whisper.py` 가 만드는 `MODEL_CARD.md` 에는 이미 들어 있어요. |
| 8·9번: 개인정보 | 라벨 JSON에는 화자 이름(`SpeakerName`)이 있어요. 이 도구는 읽자마자 버리고, 출력·저장하지 않아요. 화자는 파일 이름에서 뽑은 코드의 **익명 키**로만 다뤄요. 데이터에서 개인정보를 발견하면 약관대로 신고·삭제하고, 누구인지 알아내려 하지 않아요. |

그래서 저(개발 도우미)에게 알려 줄 때는 **숫자 통계와 칸(필드) 이름만** 보내 주세요(맨 아래 9절).

## 2. 설치 (윈도우, WSL 필요 없음)

1. **Python 3.11** 을 python.org 에서 받아 설치해요(설치 첫 화면에서 *Add python.exe to PATH* 체크).
2. **NVIDIA 드라이버**를 최신으로 갱신해요(제조사 사이트 또는 GeForce Experience). 갱신 뒤 컴퓨터를 다시 켜요.
3. PowerShell을 열고(저장소의 `training\asr` 폴더에서):

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cu126
pip install -r requirements.txt
python check_env.py
```

- **PyTorch는 반드시 `cu126`(CUDA 12.6) 빌드로 설치해요.** 그냥 `pip install torch` 를 하면 너무 최신인 CUDA 빌드(13.x)가 깔리는데, 이런 빌드는 GTX 1060(Pascal, sm_61)용 계산 코드를 뺀 경우가 있어서 `no kernel image is available` 오류가 나요. `check_env.py` 가 이 문제를 알려 주고 다시 설치하는 방법을 안내해요.
- 실행 정책 오류가 나면 PowerShell에서 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 를 한 번 실행해요.
- GTX 1060은 fp16 가속이 없고 bf16이 안 돼서, 학습은 **fp32** 로만 해요.

## 3. 폴더 배치

```text
training\asr\
  data\labels\   ← 라벨 zip(TL_*.zip, VL_*.zip …)을 여기에
  data\source\   ← 원천 wav zip(TS_*.zip, VS_*.zip …)을 여기에
  work\          ← 도구가 만드는 결과(자동으로 생겨요. 저장소에는 올라가지 않아요)
```

`--labels`, `--sources` 로 다른 폴더를 줄 수도 있어요(여러 개 가능). 하위 폴더는 알아서 찾아요.

## 4. 단계별 명령

### 0단계. 환경 확인
```powershell
python check_env.py
```
GPU 이름, 메모리, 작은 행렬곱 시험까지 해 봐요. "준비됐어요"가 나오면 통과예요.

### 1단계. 분할 압축 이어 붙이기
AI Hub는 큰 파일을 `이름.zip.part0`, `이름.zip.part1`, … 로 나눠 줘요.
```powershell
python merge_parts.py data\labels
python merge_parts.py data\source
```
조각 번호가 빠졌거나 크기가 0인 조각이 있으면 그 묶음은 이어 붙이지 않고 알려 줘요. 디스크가 모자라면 `--delete-parts` 로 이어 붙인 뒤 조각을 지워요.

### 2단계. 라벨 구조 살펴보기 (JSON 모양이 아직 확실하지 않아서)
```powershell
python inspect_labels.py --labels data\labels
```
키 경로, 값의 종류, 문자열 길이, 범주형 칸(`DataCategory`, `SchoolYear`, `Age`, `AgeGroup`, `NoiseEnviron`, `RecordingEnviron`, `Gender`, `SamplingRate`)의 빈도표, 파일 이름의 '모양'만 보여 줘요. 이름·전사 글·지역·방언의 값은 나오지 않아서 **출력을 그대로 채팅에 붙여도 안전해요.**
"fields.json 의 칸을 찾았는지" 줄에 `못 찾음`이 있으면 3절의 설정 파일을 고쳐야 해요(저에게 이 출력을 보여 주세요).

### 3단계. 전체 훑어서 어떤 묶음을 받을지 정하기
```powershell
python scan_labels.py --labels data\labels --sources data\source
```
라벨 zip을 풀지 않고 전부 읽어서 **학년 × 정형/비정형 × 소음** 별 시간·발화 수·화자 수 표를 보여 줘요. 마지막 표는 **원천 zip별 '초등 정형' 시간**이에요. 시간이 큰 묶음부터 학습 25시간 + 평가 4시간이 채워지도록 원천 zip(TS_/VS_)만 내려받으면 돼요. 결과는 `work\scan.json`(숫자만)에 저장돼요.
라벨 zip ↔ 원천 zip 짝은 이름으로 짐작해요(기본 `TL_`→`TS_`, `VL_`→`VS_`; 바꾸려면 `fields.json` 의 `zip_pairs`).

### 4단계. 전사 기호 확인
```powershell
python normalize.py report-chars --labels data\labels
```
전사에 나온 **글자 종류와 빈도만**(한글 음절 제외) 보여 줘요. `b/ n/ o/ l/ u/`, `*`, `+`, 괄호 같은 기호가 실제로 어떻게 쓰이는지 확인해서, 기본 규칙(`fields.json` 의 `normalize`)이 맞는지 봐요. 규칙을 직접 시험해 보려면 `python normalize.py try "(2)/(이) 학년 b/ 입니다"`.

### 5단계. 학습·평가 묶음 만들기
```powershell
python build_subset.py --labels data\labels --sources data\source
```
- 기본 조건: 정형, 초등 1~6학년(학년 칸이 없으면 나이 7~13), 무소음:소음 = 85:15, 학습 25시간, 평가 4시간, 길이 0.5~30초.
- **화자 단위로 나눠요.** 평가는 Validation 라벨에서 고르고, 평가에 들어간 화자는 학습에서 빼요. 학년은 고르게 담아요.
- 필요한 wav만 원천 zip에서 꺼내 16kHz mono 16bit로 `work\audio\`에 저장해요. 같은 명령을 다시 실행하면 이미 만든 것은 건너뛰어요(이어서 하기).
- `--dry-run` 을 붙이면 고르기만 하고 wav는 안 만들어요. 옵션: `--train-hours`, `--eval-hours`, `--grades 1-6`, `--noise-ratio 85:15`.

### 6단계. 특징 미리 계산 (학습 중 CPU 부담을 줄여요)
```powershell
python prepare_features.py --model base
```
`work\feats\*.npy` 에 저장해요(발화당 약 0.5MB, 25시간이면 대략 10~20GB). 이어서 할 수 있어요.

### 7단계. 학습
먼저 **속도 시험**으로 걸음당 시간, GPU 메모리, 예상 총 시간을 봐요.
```powershell
python train_whisper.py --model base --speedtest
```
괜찮으면 본 학습:
```powershell
python train_whisper.py --model base            # 기본: 배치 4 × 누적 8 = 한 걸음에 32개
python train_whisper.py --model base --resume   # 끊겼다면 이어서
python train_whisper.py --model small --lora    # small은 LoRA로(메모리 절약)
```
- 모델: `tiny`, `base`, `small`. 학습률 기본값은 tiny 3.75e-5, base 2.5e-5, small LoRA 1e-3.
- 100걸음마다 `work\runs\<이름>\ckpt\last.pt` 로 저장해요. Ctrl+C 로 멈추면 그 자리를 저장하고 끝나요.
- 메모리 부족(OOM)이 나면 `--batch 2 --accum 16` 처럼 배치를 줄이고 누적을 늘려요(곱은 같게).
- `--max-steps N` 으로 걸음 수를 정할 수 있어요(기본은 3바퀴).
- 끝나면 `work\runs\<이름>\final\`(바로 평가에 쓸 수 있는 모델), `log.csv`(손실 기록), `MODEL_CARD.md`(출처 표시 문구 포함, 학습 데이터는 포함하지 않는다고 적혀 있어요)가 생겨요.

### 8단계. 평가
```powershell
python evaluate.py                                                   # openai/whisper-base, openai/whisper-small
python evaluate.py --models openai/whisper-base work\runs\base\final
python evaluate.py --models work\runs\small-lora\final --elmenwol    # 공개된 아동 음성 모델 elmenwol/whisper-small_aihub_child 도 비교
```
결과는 숫자 표만 `work\eval_*.json` 에 저장돼요. 전사 예시는 `--show-examples 3` 을 줄 때만 **내 화면에** 나와요.
- **CER**(공백 뺀 글자 기준), **WER**(어절 기준), 학년별·소음별, **RTF**(실시간 배수: 1보다 작으면 실시간보다 빨라요).
- **낭독 채점 지표**(아래 7절의 어절 맞춤 사용)
  - 오경보율: 아이가 정확히 읽었는데 오류(대치·삭제)로 표시된 어절 비율(발화 단위도 같이).
  - 놓침률: 원문 어절을 한 글자만 다르게 바꿔 놓았을 때(아이가 그렇게 잘못 읽은 상황) 오류로 못 잡은 비율.
  - 어절을 '같다'고 볼 글자 오류율 기준(`--max-cer`, 기본 `0,0.34`)에 따라 두 값이 어떻게 달라지는지 같이 나와요. 기준을 느슨하게 하면 오경보는 줄지만 놓침이 늘어요.

## 5. 노트북으로 오래 학습할 때

- **전원 어댑터를 꼭 연결**하고, 윈도우 전원 모드를 **최고 성능**으로 해요. 덮개를 닫아도 잠들지 않게 설정해요(설정 → 시스템 → 전원).
- **쿨러 받침**을 쓰거나 통풍이 잘 되는 곳에 두고, 온도가 너무 오르면 속도가 떨어지니 `nvidia-smi` 로 가끔 봐요.
- 윈도우 자동 업데이트 재시작을 미뤄 두세요. 그래도 끊기면 `--resume` 으로 이어 가요.
- 다른 무거운 프로그램(브라우저 동영상, 게임)은 닫아요. GPU 메모리를 같이 써요.
- 디스크 200GB: zip(원천) 몇 십 GB + `work\audio` + `work\feats`(10~20GB)가 들어가요. 다 만든 뒤 원천 zip을 지워도 `work`는 그대로 쓸 수 있어요.

## 6. 설정 파일 `fields.json`

JSON의 칸 이름이 문서와 조금 달라도 고칠 수 있게 모든 경로를 이 파일에 모았어요(`--fields 내파일.json` 으로 일부만 덮어쓰는 것도 돼요).

- `paths`: 전사, 정형 여부, 학년, 나이, 소음, 파일 이름, 길이 같은 칸의 경로(점으로 이어요). 대소문자·밑줄·하이픈은 무시하고, 경로로 못 찾으면 마지막 이름만으로 다시 찾아요(`LableText`/`LabelText` 같은 철자 변형은 둘 다 적어 뒀어요). 그래도 없으면 도구가 "못 찾음"이라고 분명히 알려 줘요.
- `values`: 정형/비정형 값, 소음·무소음으로 볼 낱말, 학년 값 해석(`school_year_map`).
- `speaker.regex`: 화자 코드를 파일 이름에서 뽑는 정규식. 못 뽑으면 도구가 알려 줘요(그 파일은 빼요). `inspect_labels.py` 의 '파일 이름 모양'을 보고 고쳐요.
- `zip_pairs`: 라벨 zip 이름 → 원천 zip 이름 변환 규칙.
- `normalize`: 전사 기호 처리 규칙.
- `sensitive_keys`: 읽자마자 버릴 칸 이름(기본: `SpeakerName`, 지역, 방언 …).

## 7. 어절 맞춤 채점(앱과 공유)

낭독 유창성 채점은 원문 어절과 인식 결과 어절을 레벤시테인으로 맞춰요.

- TS(앱): `src/core/fluency/align.ts` — `normalizeEojeol`, `alignEojeol`, `fluencyScore`.
- 파이썬: `fluency.py` — 같은 알고리즘.
- 공통 시험 자료: `tests/fixtures/fluency-align.json`(저장소 맨 위 `tests/`). TS 시험(`npm test`)과 파이썬 시험(`pytest training/asr/tests`)이 둘 다 통과해야 해요.
- 규칙: 문장부호는 지우고 숫자는 그대로 비교해요. 같은 비용이면 일치 > 대치 > 삭제 > 삽입 순으로 골라요. **대치·삭제만 오류**로 세고, 끼워 넣은 말·되풀이는 오류가 아니라 읽은 시간으로 반영돼요(`wcpm` = 바르게 읽은 어절 ÷ 걸린 분). 띄어쓰기가 달라 어절이 갈라지거나 붙으면 오류로 세요(보수적으로).

## 8. 도구 자체 시험 (가짜 데이터)

실제 데이터 없이 도구가 도는지 확인해요. `tests/make_fake_aihub.py` 가 AI Hub 모양의 **가짜** zip(가짜 이름 포함, 사인파 음성, 분할 파일)을 만들고, merge → inspect → scan → build_subset → (whisper-tiny 2걸음 CPU 학습) → evaluate 를 돌려요. 모든 출력과 만든 파일에 가짜 이름이 새지 않는지도 검사해요.
```powershell
pip install pytest
python -m pytest tests -q
```
Hugging Face에서 모델을 내려받지 못하는 환경이면 학습·평가 시험은 건너뛰어요(건너뜀 표시).

## 9. 저에게 알려 주면 되는 것 / 보내지 말 것

**보내도 되는 것(숫자·이름만)**
- `inspect_labels.py` 출력 전체(구조만 나와요), `scan_labels.py` 의 표, `normalize.py report-chars` 의 글자 빈도.
- `check_env.py` 출력, `train_whisper.py --speedtest` 결과, `log.csv` 의 숫자, `evaluate.py` 의 표(`eval_*.json`).
- 오류가 났을 때 오류 메시지(경로에 이름이 들어 있지 않은지만 훑어봐 주세요).

**보내면 안 되는 것**
- 음성 파일, 전사 글(문장 내용), 화자 이름, 라벨 JSON 원본, `work/` 안의 파일들, `--show-examples` 로 본 예시.
- 학습한 모델 파일도 공개하기 전에 약관(출처 표시 등)을 다시 확인해요.

## 10. 문제 해결

| 증상 | 해결 |
| --- | --- |
| `no kernel image is available` | PyTorch를 cu126 빌드로 다시 설치(2절). |
| `CUDA out of memory` / "메모리 부족" | `--batch 2 --accum 16`, 그래도 안 되면 `--batch 1 --accum 32`, 또는 더 작은 모델·LoRA. |
| 한글 파일 이름이 깨져 보임 | 도구가 zip의 utf-8 표시를 보고 아니면 cp437→utf-8/cp949 로 되돌려 읽어요. 그래도 안 맞으면 알려 주세요. |
| `못 찾음` 칸이 있음 | `inspect_labels.py` 로 실제 키 이름을 보고 `fields.json` 을 고쳐요. |
| 화자 수가 너무 적게 나옴 | `speaker.regex` 가 맞지 않는 거예요. '파일 이름 모양'을 알려 주세요. |
| 학습이 너무 느림 | `--speedtest` 로 확인. 걸음당 시간이 길면 `tiny`/`base`, 발화 수를 줄이거나 `--max-steps` 를 줄여요. |
