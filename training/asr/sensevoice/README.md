# SenseVoice-Small 아동 낭독 재학습 (`training/asr/sensevoice/`)

원본 SenseVoice-Small(sherpa-onnx int8)이 기준선 평가에서 Whisper small 보다 정확하고 훨씬 빨랐지만(CER 10%, 오경보 20%), 오류 대부분이 1~2글자 차이라서
**AI Hub 「한국어 아동 음성 데이터」로 다시 학습**하는 도구예요. 학습은 국내 GPU 클라우드(A100 80GB)에서, 결과 모델만 내려받아요.

> **데이터 약관**: 국외 반출·제3자 제공 금지. 국내 클라우드에서만 쓰고, 끝나면 데이터를 지워요. 모델·패키지 내려받기는 반출이 아니에요. 음성·전사를 저장소·채팅·해외 서비스에 올리지 마세요.

## 파일

| 파일 | 하는 일 |
| --- | --- |
| `prepare_funasr.py` | `work/train.jsonl`·`eval.jsonl` → FunASR 형식 `train.jsonl`·`val.jsonl` (공식 길이 규칙) |
| `finetune.sh` / `finetune_notes.md` | 설치·모델 내려받기(HF 미러)·학습(이어 하기, 검증 손실 기준 최고 체크포인트). 값의 이유와 못 확인한 것은 notes |
| `export_sherpa.py` | 체크포인트 → `model.int8.onnx` + `tokens.txt` (+ `MODEL_CARD.md`, `manifest.json`) |

## 클라우드에서의 순서

작업 폴더는 `training/asr/sensevoice/` (`work/` 는 한 단계 위 `training/asr/work/`).

1. **준비**: 국내 클라우드(A100 80GB, 리눅스, CUDA PyTorch 설치됨)에 저장소와 `work/`(wav 와 `train.jsonl`·`eval.jsonl`)를 옮겨요. 국내 서버끼리만 옮겨요.
2. **데이터 변환**
   ```bash
   python prepare_funasr.py --work ../work --out ../work/funasr
   ```
   `train.jsonl`·`val.jsonl`(검증은 train 화자 5%), 시간 수·걸러질 발화 수가 나와요.
3. **학습** (처음에는 `EPOCHS=1` 로 한 바퀴 돌려 에러·메모리를 확인해요 — notes 의 "확인하지 못한 것")
   ```bash
   bash finetune.sh
   ```
   끊기면 같은 명령을 다시 실행하면 이어 해요. 결과: `outputs/run1/model.pt.avg5`, `model.pt.best`.
4. **내보내기**
   ```bash
   python export_sherpa.py --base-model-dir models/SenseVoiceSmall \
     --checkpoint outputs/run1/model.pt.avg5 --out export/narae-sensevoice-ko-child --drop-fp32 \
     --note "lr=0.0001" --note "epochs=8"
   ```
   `model.int8.onnx`, `tokens.txt`, `MODEL_CARD.md`(FunASR 라이선스·모델 이름·NIA 출처, 학습 데이터 미포함), `manifest.json`(크기·sha256)이 생겨요. `--checkpoint` 를 `model.pt.best` 로 바꿔 한 번 더 내보내 비교해도 좋아요.
5. **같은 평가** (기준선과 같은 도구·같은 `eval.jsonl`)
   ```bash
   cd .. && python evaluate.py --models sensevoice:sensevoice/export/narae-sensevoice-ko-child
   ```
6. **결과만 내려받기**: `export/narae-sensevoice-ko-child/`(모델·설명서·manifest)와 평가 숫자 표만 가져와요.
7. **데이터 삭제**: 클라우드의 `work/`(wav·jsonl·`funasr/`), 체크포인트를 지우고 인스턴스를 반납해요.

## 앱에 쓰려면 (나중 일)

내보낸 형식은 **sherpa-onnx 의 SenseVoice** 라서 앱에서는 sherpa-onnx 엔진(브라우저 WASM, Electron 은 sherpa-onnx-node)을 따로 더해야 해요. 지금 앱의 음성 인식 카탈로그(`src/core/speech/catalog.ts`)는 transformers.js 의 Whisper 계열만 알아요. 이 도구는 모델을 만들고 `evaluate.py` 로 재는 데까지예요.

## 라이선스·출처

SenseVoiceSmall by FunASR/FunAudioLLM — FunASR Model Open Source License Agreement v1.1(사용·수정·공유 자유, 출처·모델 이름 표시 필수, 미세 조정 가중치 비공개 가능, 상업 사용은 공식 확정 전). 데이터 출처 표시: 한국지능정보사회진흥원(NIA) 「한국어 아동 음성 데이터」 사업 결과를 활용. 결과 모델의 `MODEL_CARD.md` 에 둘 다 들어가요.
