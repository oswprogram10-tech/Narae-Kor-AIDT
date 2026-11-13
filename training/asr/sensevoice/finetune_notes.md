# SenseVoiceSmall 미세 조정 메모 (`finetune.sh`)

이 메모는 `finetune.sh` 가 **무엇을 왜 그렇게 하는지**와 **아직 확인하지 못한 것**을 적어 둔 거예요.
공식 자료는 FunAudioLLM/SenseVoice 저장소의 `finetune.sh`·`data/train_example.jsonl`·README(Finetune 절), FunASR `funasr==1.4.14` 소스(`bin/train_ds.py`, `train_utils/trainer_ds.py`, `datasets/audio_datasets/*`), 모델 `FunAudioLLM/SenseVoiceSmall` 의 `config.yaml` 을 읽고 맞췄어요.

## 쓰는 도구

- 학습기: `funasr/bin/train_ds.py` 를 `torchrun` 으로 실행(공식 방식). 값은 `++키=값` 으로 넘겨요.
- 모델: HF `FunAudioLLM/SenseVoiceSmall` 를 **HF 미러(`HF_ENDPOINT=https://hf-mirror.com`)** 로 `models/SenseVoiceSmall` 에 내려받고(커밋 고정), 그 로컬 폴더를 `++model=` 에 줘요(공식 finetune.sh 의 "option 2: 로컬 경로"). 모델 내려받기는 데이터 반출이 아니에요.
- 설치: `pip install funasr==1.4.14 huggingface_hub soundfile onnx onnxruntime`. PyTorch(CUDA)는 클라우드 이미지에 있는 걸 써요.

## 기본값과 이유 (25시간 안팎, A100 80GB 한 장)

| 값 | 기본 | 이유 |
| --- | --- | --- |
| `LR` | 0.0001 | 공식 예제 0.0002(큰 데이터), 모델 원 설정 0.00002. 작은 데이터에서 아이 음성으로 크게 옮겨 가야 해서 중간값, 0.0002 이하. 검증 손실이 널뛰면 0.00005 로 |
| `WARMUP` | 500걸음 | `warmuplr` 스케줄러는 `lr × 걸음/warmup` 으로 올라가요. 원 설정은 25000걸음인데 25시간 데이터는 한 에폭이 약 600~800걸음이라 그대로 두면 학습 내내 lr 이 거의 0이에요. **가장 중요한 바꿈** |
| `EPOCHS` | 8 | 5~10. 검증 손실이 `PATIENCE`(3) 에폭 연속 안 좋아지면 일찍 멈춰요 |
| `BATCH_TOKENS` | 14000 | 한 배치 = (가장 긴 발화 프레임 수 × 발화 수) ≤ 14000, 프레임은 10ms 라서 약 140초 분량(발화 15~20개). 공식 예제 6000, 모델 원 설정 14000. 80GB 라 메모리는 넉넉할 걸로 보지만 **실측은 못 했어요** — 부족하면 줄이고, 남으면 늘려요 |
| `VALIDATE_STEPS` | 500 | 이 걸음마다 검증하고 체크포인트를 저장해요(에폭 끝에도 따로 검증). 최고 체크포인트는 **검증 손실** 기준(`avg_keep_nbest_models_type=loss`; 공식 기본은 정확도 `acc`) |
| `PRECISION` | bf16 | A100 은 bf16 가능(`train_conf.use_bf16=true`, 학습기에 있는 옵션). loss 가 nan 이 되면 `PRECISION=fp32` |
| `NBEST` | 5 | 검증 손실이 좋은 5개 체크포인트를 남기고 평균(`model.pt.avg5`). 공식 기본은 10 |
| `GPUS` | 1 | 여러 장이면 `GPUS=2` 처럼(DDP) |

데이터 길이 기준(FunASR 기본, 학습기가 알아서 거름): 0.6초 미만·20초 초과 발화는 학습에서 빠져요(`prepare_funasr.py` 가 몇 개인지 알려 줘요).

## 이어 하기

`train_conf.resume=true`(공식 그대로). 끊기면 **같은 명령을 다시** 실행하면 `OUT_DIR/model.pt`(가장 최근 체크포인트)에서 이어 가요. 모델·데이터 내려받기는 이미 있으면 건너뛰어요.

## 결과 파일(`OUT_DIR`)

`config.yaml`, `log.txt`, `model.pt`(최근), `model.pt.epN` / `model.pt.epN.걸음`(걸음마다 저장분), `model.pt.best`(검증 손실 최고), `model.pt.avg5`(좋은 5개 평균).
**내보낼 때는 `model.pt.avg5` 를 먼저, 안 좋으면 `model.pt.best` 를 써요.** 둘 다 `evaluate.py` 로 비교하는 게 가장 정확해요(`export_sherpa.py --checkpoint …` 를 두 번).

## 평가 데이터를 검증에 쓰지 않아요

`prepare_funasr.py` 는 기본으로 train 화자의 5%를 통째로 떼어 `val.jsonl`(검증 손실용)로 써요. `eval.jsonl` 은 최종 평가(`evaluate.py`)에만 써야 숫자가 낙관적이지 않아요.

## 확인하지 못한 것 (이 환경에 torch·funasr 가 없어서 돌려 보지 못했어요 — 클라우드에서 처음 돌릴 때 확인)

1. 실제 학습 실행: 위 `++` 키 이름은 공식 `finetune.sh`·`train_ds.py`·`trainer_ds.py` 소스에서 찾은 것이지만 **실행해 보지는 않았어요**. 처음에는 `EPOCHS=1` 에 작은 데이터(수백 문장)로 한 바퀴 돌려 보고(걸음 수·메모리·로그의 `loss`·`acc`), 에러가 없으면 본 학습을 해요.
2. `train_conf.use_bf16`·`train_conf.early_stopping_patience`·`train_conf.avg_keep_nbest_models_type` 가 SenseVoice 학습 경로에서 실제로 먹는지(소스에는 읽는 코드가 있어요).
3. 로컬 폴더 `++model=` 로 `config.yaml`의 `bpemodel: null`·`cmvn_file: null` 이 `configuration.json` 의 `file_path_metas` 로 채워지는지(공식 option 2 와 같은 방식).
4. `model.pt.best` 가 파일로 생기는지(소스에는 저장 코드가 있어요), 없으면 `model.pt.avg5` 를 써요.
5. 학습 속도·시간: 어림도 못 해요. 첫 실행 로그의 `time_escaped_epoch` 를 보고 정해요.

## 라이선스

SenseVoiceSmall 가중치는 FunASR Model Open Source License Agreement v1.1. 사용·수정·공유 자유, **출처와 모델 이름(SenseVoiceSmall by FunASR/FunAudioLLM) 표시 필수**, 미세 조정 가중치는 비공개 가능, 상업 사용은 공식 확정 전(SenseVoice 저장소 README 의 라이선스 안내 기준). `export_sherpa.py` 가 만드는 `MODEL_CARD.md` 에 이 문구와 NIA 출처가 들어가요.
