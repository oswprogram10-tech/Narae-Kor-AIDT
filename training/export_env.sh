#!/usr/bin/env bash
# ONNX 변환 전용 가상환경을 만든다(학습에 쓰는 기본 환경은 건드리지 않는다).
#
# 왜 따로 만드나: optimum-onnx 0.1.0 은 transformers<4.58 을 요구해서, 학습 환경(transformers 5.x)에
# 그대로 설치하면 transformers·huggingface_hub 가 내려가 다른 패키지(diffusers 등)와 충돌한다.
# 그래서 시스템 패키지를 쓰지 않는 깨끗한 가상환경(venv)에 필요한 것만 따로 설치한다.
#
# 사용: bash export_env.sh [가상환경 경로]      (기본 /tmp/onnxenv)
#   - 저장되는 폴더(Kaggle의 /kaggle/working 등)가 아닌 임시 경로에 만들어 결과물에 섞이지 않게 한다.
#   - 이미 만들어져 있고 import 확인이 통과하면 다시 설치하지 않는다.
set -euo pipefail

VENV="${1:-/tmp/onnxenv}"
PY="$VENV/bin/python"

check() {
  "$PY" -I -c "import torch, transformers, optimum.exporters.onnx, onnxruntime, onnx, onnx_ir; assert transformers.__version__.startswith('4.57'), transformers.__version__" >/dev/null 2>&1
}

if [ -x "$PY" ] && check; then
  echo "[변환 환경] 이미 준비돼 있어요: $VENV"
  exit 0
fi

rm -rf "$VENV"
echo "[변환 환경] 만드는 중: $VENV"
# --system-site-packages 를 쓰지 않는다 → 미리 깔린 diffusers·새 huggingface_hub 와 섞이지 않는다.
if ! python3 -m venv "$VENV" 2>/dev/null; then
  rm -rf "$VENV"
  python3 -m pip install -q virtualenv
  python3 -m virtualenv -q "$VENV"
fi
"$PY" -m pip install -q -U pip

# 1) torch(CPU 전용). 변환은 CPU에서 하므로 용량이 작은 CPU 빌드를 쓴다. 의존 패키지는 일반 PyPI에서도 받는다.
#    CPU 인덱스에 접근할 수 없는 환경(일부 사내망·샌드박스)에서는 일반 PyPI의 torch(CUDA 포함, 약 4GB)로 대신한다.
if ! "$PY" -m pip install -q "torch>=2.4,<2.10" \
  --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple; then
  echo "[변환 환경] CPU 전용 torch를 받지 못해 PyPI의 torch로 대신해요(용량이 커요)."
  "$PY" -m pip install -q "torch>=2.4"
fi

# 2) 변환 도구. 버전을 고정한다(optimum-onnx 0.1.0 ↔ optimum 2.1 ↔ transformers 4.57).
#    diffusers 는 일부러 설치하지 않는다. 나머지 의존 패키지(huggingface_hub<1.0 등)는 pip이 맞춰 준다.
"$PY" -m pip install -q \
  "transformers==4.57.*" "optimum==2.1.*" "optimum-onnx==0.1.0" \
  onnx onnxruntime onnx-ir ml_dtypes safetensors sentencepiece tokenizers "huggingface_hub<1.0" numpy

check || { echo "[변환 환경] 설치 후 확인에 실패했어요"; "$PY" -m pip list 2>/dev/null | grep -i -E "torch|transformers|optimum|onnx|huggingface" || true; exit 1; }
"$PY" -m pip list 2>/dev/null | grep -i -E "^(torch|transformers|optimum|optimum-onnx|onnx|onnxruntime|huggingface-hub) " || true
echo "[변환 환경] 준비 끝"
