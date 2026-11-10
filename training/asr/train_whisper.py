"""예전 이름 호환 껍데기: `train_asr.py --family whisper` 를 그대로 불러요.

    python train_whisper.py --model base --speedtest      # = python train_asr.py --family whisper --model base --speedtest

새 옵션(--precision, --grad-ckpt, --family moonshine …)은 train_asr.py 에서 설명해요. --model 은 tiny/base/small 줄임말도 돼요.
"""
from __future__ import annotations

import sys


def main(argv=None) -> None:
    import train_asr

    args = list(sys.argv[1:] if argv is None else argv)
    train_asr.main(["--family", "whisper", *args])


if __name__ == "__main__":
    main()
