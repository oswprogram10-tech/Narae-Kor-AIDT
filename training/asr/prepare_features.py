"""[Whisper 전용] Whisper 로그 멜 특징을 미리 계산해 work/feats/<id>.npy 로 저장한다(학습 중 CPU 부담을 줄여요).

    python prepare_features.py                 # train.jsonl, eval.jsonl 모두
    python prepare_features.py --model small
    python prepare_features.py --model turbo   # 3단계(large-v3-turbo)용

Moonshine 은 16kHz 원음을 그대로 입력으로 쓰므로 이 단계가 필요 없어요(train_asr.py --family moonshine 은 work/audio 의 wav 를 바로 읽어요).
tiny·base·small 은 모두 같은 특징(80 멜 × 3000 프레임, work/feats)을 써요. turbo(large-v3)는 128 멜이라 work/feats128 에 따로 만들어요. 이미 만든 파일은 건너뛰어서 이어서 할 수 있어요.
기본 저장 형식은 float16(디스크 절반, 학습 때 float32로 읽어요). 발화 1개에 약 0.5MB(float16)예요.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from asr_common import add_common_args, feats_dir_name, load_wav_16k, read_jsonl, say, tqdm

MODELS = {"tiny": "openai/whisper-tiny", "base": "openai/whisper-base", "small": "openai/whisper-small", "turbo": "openai/whisper-large-v3-turbo"}


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_common_args(ap)
    ap.add_argument("--model", default="base", help="tiny|base|small 또는 HF id/폴더(특징 추출기만 쓰여요)")
    ap.add_argument("--splits", nargs="+", default=["train", "eval"])
    ap.add_argument("--dtype", choices=["float16", "float32"], default="float16")
    ap.add_argument("--limit", type=int, default=0, help="앞에서 N개만(시험용)")
    a = ap.parse_args(argv)
    work = Path(a.work)

    from transformers import WhisperFeatureExtractor

    fe = WhisperFeatureExtractor.from_pretrained(MODELS.get(a.model, a.model))
    out_dir = work / feats_dir_name(fe.feature_size)  # turbo(large-v3 계열)는 128멜이라 feats128 폴더
    out_dir.mkdir(parents=True, exist_ok=True)
    made = skipped = 0
    for split in a.splits:
        items = read_jsonl(work / f"{split}.jsonl")
        if a.limit:
            items = items[: a.limit]
        for it in tqdm(items, desc=f"{split} 특징", unit="개", mininterval=2.0):
            dst = out_dir / f"{it['id']}.npy"
            if dst.exists() and dst.stat().st_size > 0:
                skipped += 1
                continue
            feat = fe(load_wav_16k(work / it["audio"]), sampling_rate=16000, return_tensors="np").input_features[0]
            tmp = dst.with_name(dst.name + ".part")
            with open(tmp, "wb") as f:
                np.save(f, feat.astype(a.dtype))
            tmp.replace(dst)
            made += 1
    say(f"완료: 새로 {made:,}개, 이미 있어 건너뜀 {skipped:,}개 → {out_dir}")


if __name__ == "__main__":
    main()
