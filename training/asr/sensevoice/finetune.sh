#!/usr/bin/env bash
# SenseVoiceSmall 아동 낭독 미세 조정(리눅스 국내 GPU 클라우드, A100 80GB 한 장 기준). 자세한 설명은 finetune_notes.md.
#
#   bash finetune.sh                      # 설치 → 모델 내려받기(HF 미러) → 학습 (이어 하기 자동)
#   EPOCHS=5 LR=0.00005 bash finetune.sh  # 값 바꾸기(아래 환경변수)
#
# 공식 FunAudioLLM/SenseVoice finetune.sh 의 호출 방식(torchrun + funasr/bin/train_ds.py + ++키=값)을 따랐고,
# 25시간짜리 작은 데이터에 맞게 값을 바꿨어요(바꾼 곳은 "공식 대비" 주석).
# 이 파일은 데이터를 어디에도 올리지 않아요. 내려받는 건 모델·파이썬 패키지뿐이에요.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

# ---- 바꿀 수 있는 값 -------------------------------------------------------------
DATA_DIR="${DATA_DIR:-$HERE/../work/funasr}"       # prepare_funasr.py 결과(train.jsonl, val.jsonl)
BASE_DIR="${BASE_DIR:-$HERE/models/SenseVoiceSmall}" # 내려받을 곳(내보내기에도 써요)
OUT_DIR="${OUT_DIR:-$HERE/outputs/run1}"           # 체크포인트·log.txt
GPUS="${GPUS:-1}"                                  # 쓸 GPU 수(A100 한 장이면 1)
LR="${LR:-0.0001}"                                 # 공식 예제 0.0002, 원 설정 0.00002. 작은 데이터라 중간값(0.0002 이하 유지)
WARMUP="${WARMUP:-500}"                            # 공식 대비: 원 설정은 25000걸음 → 데이터가 작아 500으로(안 줄이면 학습 내내 lr 이 거의 0)
EPOCHS="${EPOCHS:-8}"                              # 25시간 기준 5~10. 검증 손실이 안 좋아지면 일찍 멈춰요(PATIENCE)
BATCH_TOKENS="${BATCH_TOKENS:-14000}"              # 한 배치의 (가장 긴 프레임 수 × 개수) 상한. 14000 ≈ 140초 분량. 공식 예제 6000, 원 설정 14000
VALIDATE_STEPS="${VALIDATE_STEPS:-500}"            # 이 걸음마다 검증·체크포인트 저장(한 에폭은 대략 600~800걸음 → 에폭 끝 검증도 따로 해요)
PRECISION="${PRECISION:-bf16}"                     # bf16 | fp32  (A100 은 bf16 가능. 학습이 불안정(loss nan)하면 fp32)
PATIENCE="${PATIENCE:-3}"                          # 검증 손실이 이만큼 에폭 연속 안 좋아지면 멈춤(0 이면 끔)
NBEST="${NBEST:-5}"                                # 검증 손실이 좋은 체크포인트 몇 개를 남기고 평균 낼지(model.pt.avgN)
NUM_WORKERS="${NUM_WORKERS:-4}"
HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}" # 모델 내려받기는 국내에서 닿는 미러 우선(데이터 반출이 아니에요)
MODEL_REPO="${MODEL_REPO:-FunAudioLLM/SenseVoiceSmall}"
MODEL_REV="${MODEL_REV:-3847d57b6bdf2dd8875cb1508d2af43d80a16bf7}"  # 모델 가중치 버전 고정(HF 조회 때의 최신 커밋)
FUNASR_VERSION="${FUNASR_VERSION:-1.4.14}"         # SenseVoice 저장소 README 가 안내하는 버전
export HF_ENDPOINT

# ---- 1. 설치 -----------------------------------------------------------------
# PyTorch 는 클라우드 이미지에 CUDA 용으로 이미 있는 걸 써요(없으면 README 참고). 여기서는 다시 깔지 않아요.
python - <<'PY' || { echo "PyTorch(CUDA) 가 필요해요. 클라우드 이미지에 있는 PyTorch 를 쓰거나 pytorch.org 안내대로 먼저 설치해 주세요."; exit 1; }
import torch, sys
sys.exit(0 if torch.cuda.is_available() else 1)
PY
pip install "funasr==${FUNASR_VERSION}" "huggingface_hub>=0.30" soundfile onnx onnxruntime

# ---- 2. 모델 내려받기(이미 있으면 건너뜀) ------------------------------------------
if [ ! -f "$BASE_DIR/model.pt" ]; then
  python - <<PY
from huggingface_hub import snapshot_download
snapshot_download("${MODEL_REPO}", revision="${MODEL_REV}", local_dir="${BASE_DIR}",
                  allow_patterns=["config.yaml", "configuration.json", "am.mvn", "model.pt", "chn_jpn_yue_eng_ko_spectok.bpe.model", "README.md"])
PY
fi
for f in config.yaml configuration.json am.mvn model.pt chn_jpn_yue_eng_ko_spectok.bpe.model; do
  [ -f "$BASE_DIR/$f" ] || { echo "모델 파일이 없어요: $BASE_DIR/$f"; exit 1; }
done

# ---- 3. 데이터 확인 ----------------------------------------------------------------
for f in train.jsonl val.jsonl; do
  [ -s "$DATA_DIR/$f" ] || { echo "$DATA_DIR/$f 가 없어요. 먼저: python prepare_funasr.py --work <work 폴더> --out $DATA_DIR"; exit 1; }
done

# ---- 4. 학습 ------------------------------------------------------------------------
# funasr 학습 진입점(공식 finetune.sh 는 which funasr 로 찾음 → 여기서는 파이썬으로 직접)
TRAIN_TOOL="$(python -c 'import funasr, os; print(os.path.join(os.path.dirname(funasr.__file__), "bin", "train_ds.py"))')"
[ -f "$TRAIN_TOOL" ] || { echo "train_ds.py 를 못 찾았어요: $TRAIN_TOOL"; exit 1; }

BF16=false
[ "$PRECISION" = "bf16" ] && BF16=true

mkdir -p "$OUT_DIR"
LOG="$OUT_DIR/log.txt"
echo "trainer: $TRAIN_TOOL"
echo "log: $LOG   (이어 하기: 같은 명령을 다시 실행하면 $OUT_DIR/model.pt 에서 이어 가요)"

# 공식 대비 바꾼 것: 학습률·warmup·batch·validate/save 간격·epoch·bf16·early stopping·nbest 를 loss 기준으로(avg_keep_nbest_models_type=loss)
# train_conf.resume=true 는 공식 그대로(OUT_DIR/model.pt 가 있으면 이어 하기).
torchrun --nnodes 1 --nproc_per_node "$GPUS" --master_port "${MASTER_PORT:-26669}" \
  "$TRAIN_TOOL" \
  ++model="$BASE_DIR" \
  ++trust_remote_code=true \
  ++train_data_set_list="$DATA_DIR/train.jsonl" \
  ++valid_data_set_list="$DATA_DIR/val.jsonl" \
  ++dataset_conf.data_split_num=1 \
  ++dataset_conf.batch_sampler="BatchSampler" \
  ++dataset_conf.batch_size="$BATCH_TOKENS" \
  ++dataset_conf.sort_size=1024 \
  ++dataset_conf.batch_type="token" \
  ++dataset_conf.num_workers="$NUM_WORKERS" \
  ++train_conf.max_epoch="$EPOCHS" \
  ++train_conf.log_interval=50 \
  ++train_conf.resume=true \
  ++train_conf.validate_interval="$VALIDATE_STEPS" \
  ++train_conf.save_checkpoint_interval="$VALIDATE_STEPS" \
  ++train_conf.keep_nbest_models="$NBEST" \
  ++train_conf.avg_nbest_model="$NBEST" \
  ++train_conf.avg_keep_nbest_models_type=loss \
  ++train_conf.early_stopping_patience="$PATIENCE" \
  ++train_conf.use_bf16="$BF16" \
  ++train_conf.use_deepspeed=false \
  ++optim_conf.lr="$LR" \
  ++scheduler_conf.warmup_steps="$WARMUP" \
  ++output_dir="$OUT_DIR" 2>&1 | tee -a "$LOG"

echo
echo "끝. 체크포인트: $OUT_DIR/model.pt.best (검증 손실 최고), $OUT_DIR/model.pt.avg$NBEST (좋은 ${NBEST}개 평균)"
echo "다음: python export_sherpa.py --base-model-dir $BASE_DIR --checkpoint $OUT_DIR/model.pt.avg$NBEST --out export/narae-sensevoice-ko-child"
