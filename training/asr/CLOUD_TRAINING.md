# 국내 GPU 클라우드에서 학습하기 (복사·붙여넣기 순서표)

엘리스클라우드(A100 80GB)를 기준으로 썼어요. 다른 국내 GPU 서비스도 흐름은 같아요(화면 이름만 달라요). 명령은 `#` 줄 말고 **회색 상자 안의 줄만** 복사해서 붙여 넣으세요.

> **약관 지킬 점 (AI Hub 「한국어 아동 음성 데이터」)**
> - **국내 데이터센터(서버가 한국에 있는 곳)만** 써요. Colab·Kaggle·해외 리전은 쓰지 않아요.
> - 클라우드에는 **학습 묶음(`narae_asr_data.tar`: 16kHz wav와 익명 manifest)만** 올려요. **원본 tar·라벨 JSON·화자 이름이 든 파일은 올리지 않아요.**
> - 학습이 끝나면 **데이터를 지우고 인스턴스(디스크 포함)를 삭제**해요. 다른 사람과 나누지 않아요.
> - 결과 모델에는 NIA 출처 표시가 들어가요(`MODEL_CARD.md`에 자동으로 적혀요. 지우지 마세요).

## 0. 노트북에서 먼저 할 일 (윈도우, 데이터를 만드는 곳)

학습 묶음은 노트북에서만 만들어요(원본 데이터는 노트북 밖으로 나가지 않아요).

```powershell
cd training\asr
# 학습 25시간 만들기(평가 묶음 work\eval.jsonl 이 이미 있으면 그대로 두고 학습만 추가해요)
python build_subset.py --labels data\labels --sources data\source --train-hours 25
# 클라우드에 올릴 묶음 만들기 -> work\cloud_upload\narae_asr_data.tar, MANIFEST.txt
python pack_for_cloud.py
```

- 학습 원천은 **`TS_kor_formatted_01.tar` 하나만 받아도 25시간은 충분해요.** 초등 정형 음성이 약 1,100시간이고 TS 4개에 나뉘어 있어서, 하나에도 수백 시간이 들어 있어요.
- 학습/검증은 **원천 파일 이름(`TS_`/`VS_`)** 으로 갈라요. 검증 원천에 나온 화자는 모두 학습에서 빠지고, 보고서에 "학습·평가 화자 겹침 0명"이 나와요. 그 줄이 보이는지 꼭 확인하세요.
- `MANIFEST.txt` 의 sha256 은 올린 뒤 파일이 온전한지 비교할 때 써요.

## 1. 회원가입과 인스턴스 만들기

1. 엘리스클라우드 가입 후, **GPU 인스턴스**를 만들어요(서버 위치가 국내인지 확인).
2. GPU는 **A100 80GB** 를 골라요. **스팟(저렴하지만 중간에 회수될 수 있는 것)** 도 괜찮아요. 회수되면 4절의 `--resume` 으로 이어요.
3. 운영체제는 우분투 + CUDA 가 들어 있는 것, 디스크는 **150GB 이상**(wav 25시간 + 특징 캐시 + 결과)을 잡아요.
4. 어림 비용: A100 시간당 약 2,250~2,500원. base 흐름 확인은 약 1~1.5시간 → 약 3,000~4,000원 안팎. small·turbo 는 5절의 `--speedtest` 가 알려 주는 예상 시간 × 시간당 요금으로 어림해요. **쓰지 않을 때는 멈추지 말고 삭제**해요(멈춰도 디스크 요금이 나올 수 있어요).

## 2. 접속하고 저장소 받기

웹 터미널(인스턴스 화면의 "터미널"/"Jupyter") 또는 SSH 로 접속해요. 접속한 뒤:

```bash
cd ~
git clone https://github.com/oswprogram10-tech/Narae-Kor-AIDT.git -b feat/module-core
cd Narae-Kor-AIDT/training/asr
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install torch
pip install -r requirements.txt
python check_env.py
```

- 클라우드는 최신 CUDA 용 torch 를 그대로 받아도 돼요(`pip install torch`).
- `check_env.py` 에서 **GPU 이름(A100)과 메모리 80GB 근처**가 보이면 성공이에요. GPU가 안 보이면 인스턴스 종류를 다시 확인하세요.
- 이 저장소에는 데이터가 없어요(코드만).

## 3. 학습 묶음 올리고 풀기

**방법 A. 웹 업로드**: 인스턴스 화면의 파일 업로드로 `narae_asr_data.tar` 를 홈(`~`)에 올려요.

**방법 B. scp (윈도우 PowerShell, 노트북에서)**: `<사용자>`와 `<서버주소>`는 인스턴스 화면에 나온 값으로 바꿔요(포트가 따로 있으면 `-P 포트` 를 `scp` 바로 뒤에 넣어요).

```powershell
scp work\cloud_upload\narae_asr_data.tar <사용자>@<서버주소>:~/
```

그다음 인스턴스에서 확인하고 풀어요.

```bash
cd ~
sha256sum narae_asr_data.tar          # MANIFEST.txt 의 sha256 과 같아야 해요
cd ~/Narae-Kor-AIDT/training/asr
tar -xf ~/narae_asr_data.tar -C .     # work/train.jsonl, work/eval.jsonl, work/audio/... 가 생겨요
ls work
```

## 4. 처음엔 base 로 흐름 확인 (1~1.5시간)

오래 걸리니 접속이 끊겨도 계속 돌게 `tmux` 안에서 해요.

```bash
cd ~/Narae-Kor-AIDT/training/asr
. .venv/bin/activate
tmux new -s train                      # 다시 들어오기: tmux attach -t train
```

```bash
python prepare_features.py --model base
python train_asr.py --family whisper --model openai/whisper-base --speedtest
```

`--speedtest` 는 30걸음만 돌려 걸음당 시간·GPU 메모리·예상 학습 시간을 알려 줘요(저장 안 함). 이상 없으면 본 학습을 해요.

```bash
python train_asr.py --family whisper --model openai/whisper-base
```

- **끊기거나 스팟이 회수됐다면**: 같은 환경에서 같은 명령 끝에 `--resume` 만 붙여 다시 실행해요(100걸음마다 저장돼 있어요). 인스턴스가 새로 만들어졌다면 2~3절을 다시 해요.
- 학습 결과: `work/runs/base/final/`(모델), `work/runs/base/log.csv`, `work/runs/base/MODEL_CARD.md`.

## 5. 평가와 내보내기

평가(GPU 자동 사용. 숫자 표만 저장돼요):

```bash
python evaluate.py --models work/runs/base/final
```

결과: `work/eval_runs_base_final.json`(CER·WER·오경보율 등). 기준선(원본 모델)과 비교해 좋아졌는지 봐요.

내보내기는 **내보내기 전용 환경**에서 해요(학습 환경과 패키지 버전이 달라서요).

```bash
bash ../export_env.sh /tmp/onnxenv
/tmp/onnxenv/bin/python export_asr.py --model work/runs/base/final --out export/narae-asr-lite --id narae-asr-lite
```

결과: `export/narae-asr-lite/`(ONNX 파일, 설정, `MODEL_CARD.md`, `LICENSE.txt`, `manifest.json`). 설정 읽기 오류가 나면 명령 끝에 `--base-id openai/whisper-base` 를 붙여요.

## 6. 결과만 내려받기

필요한 것은 **내보낸 모델 폴더와 평가 숫자 파일, 학습 기록**뿐이에요. 노트북(PowerShell)에서:

```powershell
scp -r <사용자>@<서버주소>:~/Narae-Kor-AIDT/training/asr/export/narae-asr-lite .\export\
scp <사용자>@<서버주소>:~/Narae-Kor-AIDT/training/asr/work/eval_runs_base_final.json work\
scp <사용자>@<서버주소>:~/Narae-Kor-AIDT/training/asr/work/runs/base/log.csv work\runs\base\
```

(`work\runs\base` 폴더가 없으면 먼저 만들어요. 웹 다운로드를 써도 돼요.) 받은 폴더에는 학습에 쓴 음성·전사가 들어 있지 않아요.

## 7. 데이터 지우기와 인스턴스 삭제 (반드시)

내려받은 것이 노트북에 잘 있는지 먼저 확인한 뒤, 인스턴스에서:

```bash
cd ~/Narae-Kor-AIDT/training/asr
rm -rf work export
rm -f ~/narae_asr_data.tar
ls work ~/narae_asr_data.tar 2>&1       # "No such file or directory" 가 나오면 지워진 거예요
```

- `rm -rf work export` 는 **이 폴더(`training/asr`)의 `work`, `export` 만** 지워요. 이 줄을 다른 곳에서 실행하지 마세요.
- 그다음 **인스턴스를 삭제**해요(중지 아님). 디스크·스냅샷·백업이 따로 남아 있으면 그것도 삭제하고, 업로드용 웹 저장소에 올렸다면 그 파일도 지워요.
- 노트북의 `work\cloud_upload\narae_asr_data.tar` 도 필요 없어지면 지워요.

## 8. 두 번째 세션: small, turbo

같은 순서(1~3절)로 인스턴스를 새로 만들고 묶음을 올려요. 학습 명령만 달라요.

```bash
# small (80GB면 전체 학습, LoRA 로 하려면 --lora)
python prepare_features.py --model small
python train_asr.py --family whisper --model openai/whisper-small --speedtest
python train_asr.py --family whisper --model openai/whisper-small

# turbo (80GB면 전체 학습, 24~40GB면 자동 LoRA)
python prepare_features.py --model turbo
python train_asr.py --family whisper --model openai/whisper-large-v3-turbo --speedtest
python train_asr.py --family whisper --model openai/whisper-large-v3-turbo
```

평가와 내보내기는 결과 폴더 이름만 바뀌어요(`work/runs/small/final`, `work/runs/large-v3-turbo/final`).

```bash
python evaluate.py --models work/runs/small/final work/runs/large-v3-turbo/final
/tmp/onnxenv/bin/python export_asr.py --model work/runs/small/final --out export/narae-asr-standard --id narae-asr-standard
/tmp/onnxenv/bin/python export_asr.py --model work/runs/large-v3-turbo/final --out export/narae-asr-pro --id narae-asr-pro --fp16
```

끝나면 6~7절처럼 결과만 내려받고 데이터와 인스턴스를 지워요.
