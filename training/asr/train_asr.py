"""아동 낭독 음성으로 음성 인식 모델(Whisper 또는 Moonshine)을 미세 조정한다.

국어나래의 두 단계 모델을 만드는 학습 도구예요(docs/stage6-listening-speaking.md "음성 인식 모델 두 단계 제공").
  1단계 narae-asr-lite     = openai/whisper-base (MIT)  — 선택지: moonshine-ai/moonshine-base-ko (비상업·연구만)
  2단계 narae-asr-standard = openai/whisper-small (MIT)
  3단계 narae-asr-pro      = openai/whisper-large-v3-turbo (MIT, 8.1억) — GPU 교사 기기 전용, 국내 GPU 클라우드(24GB 이상, 권장 A100 80GB)에서만 학습

    python train_asr.py --family whisper --model openai/whisper-base --speedtest   # 30걸음만 돌려 속도·메모리·예상 시간 보기
    python train_asr.py --family whisper --model openai/whisper-base               # 1단계 학습(전원 연결, 중간 저장됨)
    python train_asr.py --family whisper --model openai/whisper-small              # 2단계 학습
    python train_asr.py --family whisper --model openai/whisper-small --lora       # small을 LoRA로(메모리 절약)
    python train_asr.py --family whisper --model openai/whisper-large-v3-turbo     # 3단계(클라우드 전용: 24~40GB는 LoRA, 80GB는 전체 학습)
    python train_asr.py --family moonshine                                          # 선택: Moonshine base-ko (원음 입력, 특징 캐시 필요 없음)
    python train_asr.py --family whisper --model openai/whisper-base --resume      # 끊긴 학습 이어서 하기

  - GPU가 GTX 1060 6GB면 fp32(fp16 가속이 없고 bf16이 안 돼요), A100 같은 최신 GPU면 bf16(--precision auto).
  - 배치(--batch × --accum)는 GPU 메모리로 자동으로 정해요: 6GB급 4×8, 24GB급 16×2, 80GB급 32×1. 직접 주면 그 값이 먼저예요.
  - gradient checkpointing 은 GPU 메모리가 작을 때만 기본으로 켜요(--grad-ckpt / --no-grad-ckpt 로 바꿔요).
  - '걸음(step)'은 가중치를 한 번 고치는 단위예요. 한 걸음 = --batch × --accum 개 발화.
  - Whisper는 언어 ko, 작업 transcribe 로 고정해요. Whisper는 prepare_features.py 로 만든 특징 캐시(work/feats)를 쓰고(없으면 바로 계산),
    Moonshine은 16kHz 원음을 그대로 넣어요.
  - 결과: work/runs/<이름>/ 에 final/(바로 evaluate.py·export_asr.py 에 쓸 수 있는 모델), ckpt/last.pt(이어 하기용), log.csv, MODEL_CARD.md
메모리가 모자라면(OOM) --batch 를 줄이고 --accum 을 늘려 곱을 같게 해 주세요(예: --batch 2 --accum 16).

이 파일의 앞부분(순수 함수)은 torch 없이도 불러올 수 있어요(tests/test_train_asr.py).
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
import time
from contextlib import nullcontext
from pathlib import Path

import numpy as np

from asr_common import add_common_args, die, feats_dir_name, load_wav_16k, read_jsonl, say

ATTRIBUTION = "본 모델은 한국지능정보사회진흥원(NIA) 「한국어 아동 음성 데이터」 사업 결과를 활용하여 만들었습니다."

# family 별 기본값. LoRA 대상 층 이름은 모델 구현마다 달라요(Whisper: out_proj, Moonshine: o_proj).
FAMILIES: dict[str, dict] = {
    "whisper": {
        "default_model": "openai/whisper-base",
        "shorthand": {"tiny": "openai/whisper-tiny", "base": "openai/whisper-base", "small": "openai/whisper-small", "medium": "openai/whisper-medium",
                      "turbo": "openai/whisper-large-v3-turbo", "large-v3-turbo": "openai/whisper-large-v3-turbo"},
        "lora_targets": "q_proj,k_proj,v_proj,out_proj",
        "max_label": 440,  # Whisper 디코더 한계 448
        "license": "MIT",
    },
    "moonshine": {
        "default_model": "moonshine-ai/moonshine-base-ko",
        "shorthand": {},
        "lora_targets": "q_proj,k_proj,v_proj,o_proj",
        "max_label": 190,  # Moonshine 디코더 위치 한계 194
        "license": "Moonshine Community License",
    },
}

# 학습률 어림(전체 미세 조정). 모르는 모델은 small 값을 써요. Moonshine 값은 어림이라 --lr 로 바꿔 보세요.
LR_BY_SIZE = {"tiny": 3.75e-5, "base": 2.5e-5, "small": 1.25e-5, "medium": 6.25e-6, "large": 5e-6}
LR_MOONSHINE = 3e-5
LORA_LR = 1e-3

# 앱 목록(src/core/speech/catalog.ts)에서 쓰는 가칭 id
APP_IDS = {"openai/whisper-base": "narae-asr-lite", "openai/whisper-small": "narae-asr-standard", "openai/whisper-large-v3-turbo": "narae-asr-pro", "moonshine-ai/moonshine-base-ko": "narae-asr-moonshine-ko"}

# large급(turbo 8.1억 등)은 작은 GPU에서 학습할 수 없어요. 이 값(GiB) 미만이면 안내하고 끝내요.
LARGE_MIN_GB = 16
LARGE_FULL_GB = 60  # 이 이상(A100 80GB)이면 전체 학습 허용, 미만이면 기본 LoRA


# ----------------------------------------------------------------- 순수 함수(torch 없이 시험해요)

def default_model(family: str) -> str:
    return FAMILIES[family]["default_model"]


def resolve_model(family: str, model: str | None) -> str:
    """--model 값을 HF id 또는 폴더로. tiny/base/small 같은 줄임말은 Whisper에서만 풀어 줘요(예전 train_whisper.py 호환)."""
    if not model:
        return default_model(family)
    return FAMILIES[family]["shorthand"].get(model, model)


def family_mismatch(family: str, model: str) -> str | None:
    """이름만 보고 whisper/moonshine 을 바꿔 쓴 실수를 알려 줘요(폴더 이름은 알 수 없으니 이름에 있을 때만)."""
    low = model.lower()
    other = "moonshine" if family == "whisper" else "whisper"
    if other in low and family not in low:
        return f"--family {family} 인데 모델 이름에 '{other}' 가 있어요({model}). --family {other} 가 맞는지 확인해 주세요."
    return None


def default_run_name(model: str, lora: bool) -> str:
    base = Path(model.rstrip("/\\")).name
    if base.startswith("whisper-"):
        base = base[len("whisper-"):]
    return base + ("-lora" if lora else "")


def is_large(model: str) -> bool:
    return "large" in model.lower() or "turbo" in model.lower()


def large_plan(mem_gb: float | None, want_lora: bool, want_full: bool) -> tuple[bool, str | None]:
    """large급 모델의 (LoRA로 할지, 학습할 수 없을 때의 안내 글). 안내 글이 있으면 학습하지 않고 끝내요.
    16GiB 미만(CPU 포함): 불가. 16~60GiB(24~40GB급): 기본 LoRA(--full 로 전체 학습을 시도할 수는 있어요). 60GiB 이상(80GB): 전체 학습 허용."""
    if mem_gb is None or mem_gb < LARGE_MIN_GB:
        got = "GPU가 없어요" if mem_gb is None else f"GPU 메모리가 {mem_gb:.1f}GiB예요"
        return False, f"이 모델은 국내 GPU 클라우드(24GB 이상, 권장 A100 80GB)에서 학습해요. 지금은 {got}. 이 컴퓨터(GTX 1060 등)에서는 base·small 로 학습해 주세요."
    if want_full:
        return False, None
    if mem_gb < LARGE_FULL_GB:
        return True, None
    return want_lora, None


def default_lr(family: str, model: str, lora: bool) -> float:
    if lora:
        return LORA_LR
    if family == "moonshine":
        return LR_MOONSHINE
    low = model.lower()
    if is_large(model):
        return LR_BY_SIZE["large"]
    for size in ("tiny", "base", "small", "medium"):
        if f"-{size}" in low or low == size:
            return LR_BY_SIZE[size]
    return LR_BY_SIZE["small"]


def pick_precision(requested: str, cuda_available: bool, cc_major: int | None) -> tuple[str, str]:
    """(정밀도, 까닭). auto: 계산 능력 8 이상(Ampere 이상, A100 등)이면 bf16, 아니면 fp32(GTX 1060은 6.1이라 fp32).
    CPU에서는 항상 fp32. 직접 고른 fp16/bf16 은 GPU가 있을 때만 따르고, 없으면 fp32로 돌려요."""
    if not cuda_available:
        why = "GPU가 없어서 fp32(CPU)로 해요." if requested in ("auto", "fp32") else f"GPU가 없어서 {requested} 대신 fp32(CPU)로 해요."
        return "fp32", why
    if requested == "auto":
        if cc_major is not None and cc_major >= 8:
            return "bf16", f"GPU 계산 능력 {cc_major}.x → bf16으로 해요."
        return "fp32", f"GPU 계산 능력 {cc_major if cc_major is not None else '?'}.x(bf16 미지원, fp16은 가속이 없고 불안정) → fp32로 해요."
    if requested == "bf16" and cc_major is not None and cc_major < 8:
        return "fp32", f"이 GPU(계산 능력 {cc_major}.x)는 bf16을 지원하지 않아서 fp32로 해요."
    return requested, f"직접 고른 {requested}로 해요."


def auto_batch(mem_gb: float | None, large: bool = False) -> tuple[int, int]:
    """GPU 메모리(GiB)로 (batch, accum) 기본값. 곱은 늘 32. 정보가 없으면(CPU 등) 6GB급과 같게.
    large급(turbo 등)은 한 단계 작게: 16~30GiB 2×16, 30~60GiB 4×8, 60GiB 이상 8×4."""
    if large:
        if mem_gb is None or mem_gb < 30:
            return 2, 16
        if mem_gb < 60:
            return 4, 8
        return 8, 4
    if mem_gb is None or mem_gb < 10:
        return 4, 8
    if mem_gb < 22:
        return 8, 4
    if mem_gb < 60:
        return 16, 2
    return 32, 1


def resolve_batch(batch: int | None, accum: int | None, mem_gb: float | None, large: bool = False) -> tuple[int, int]:
    """직접 준 값이 먼저. 하나만 주면 곱을 자동값의 곱(32)에 맞춰 다른 하나를 정해요."""
    ab, aa = auto_batch(mem_gb, large)
    target = ab * aa
    if batch and accum:
        return batch, accum
    if batch:
        return batch, max(1, math.ceil(target / batch))
    if accum:
        return max(1, target // accum), accum
    return ab, aa


def default_grad_ckpt(mem_gb: float | None, large: bool = False) -> bool:
    """메모리가 작을 때(22GiB 미만, 또는 GPU 없음)만 기본으로 켜요. 느려지지만 메모리를 아껴요. large급은 늘 켜요."""
    return large or mem_gb is None or mem_gb < 22


def oom_hint(batch: int, accum: int, family: str, lora: bool) -> list[str]:
    half_b = max(1, batch // 2)
    lines = [
        "[메모리 부족] GPU 메모리가 모자라요.",
        f"  1) --batch 를 줄이고 --accum 을 늘려 곱을 같게 해 주세요(지금 {batch}×{accum} → 예: --batch {half_b} --accum {accum * (batch // half_b)}).",
        "  2) --grad-ckpt 가 꺼져 있다면 켜 보세요(느려지지만 메모리를 아껴요).",
    ]
    if family == "whisper" and not lora:
        lines.append("  3) 그래도 안 되면 한 단계 작은 모델(base)이나 --lora 를 써 보세요.")
    elif not lora:
        lines.append("  3) 그래도 안 되면 --lora 를 써 보세요.")
    lines.append("  저장된 것이 있으면 --resume 으로 이어 갈 수 있어요.")
    return lines


def batch_list(n: int, batch: int, seed: int, start_batch: int, total_batches: int):
    """결정적인 배치 순서(이어 하기 때 같은 자리에서 시작할 수 있어요). 한 바퀴의 마지막 모자란 배치는 버려요."""
    per_epoch = max(1, n // batch)
    perms: dict[int, np.ndarray] = {}
    out = []
    for b in range(start_batch, total_batches):
        e, k = divmod(b, per_epoch)
        if e not in perms:
            perms[e] = np.random.RandomState(seed + e).permutation(n)
        out.append(perms[e][k * batch : (k + 1) * batch].tolist())
    return out


def moonshine_label_ids(raw_ids: list[int], bos: int, eos: int) -> list[int]:
    """Moonshine 토크나이저는 앞에 <s>(bos)를 붙이고 끝에 </s>는 안 붙여요. 모델이 decoder_start_token_id(=bos)를 따로 앞에 붙이므로
    정답(labels)은 'bos 없는 글자 토큰 + eos' 여야 해요(shift_tokens_right 가 [bos, 글자…]를 디코더 입력으로 만들어요)."""
    ids = list(raw_ids)
    if ids and ids[0] == bos:
        ids = ids[1:]
    if ids and ids[-1] == eos:
        ids = ids[:-1]
    return ids + [eos]


def strip_start_token(labels: np.ndarray, start_token: int) -> np.ndarray:
    """Whisper: 모델이 앞에 시작 토큰을 따로 붙이므로, 모든 줄이 시작 토큰으로 시작하면 뗀다."""
    if labels.shape[1] > 0 and (labels[:, 0] == start_token).all():
        return labels[:, 1:]
    return labels


def pad_labels(seqs: list[list[int]], pad: int = -100) -> np.ndarray:
    longest = max(len(s) for s in seqs)
    out = np.full((len(seqs), longest), pad, dtype=np.int64)
    for i, s in enumerate(seqs):
        out[i, : len(s)] = s
    return out


def pad_audio_batch(arrs: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    """원음 배치를 0으로 채워 (파형 [n, 길이], 주의 마스크 [n, 길이]) 로. 마스크 1 = 진짜 소리."""
    longest = max(len(a) for a in arrs)
    wav = np.zeros((len(arrs), longest), dtype=np.float32)
    mask = np.zeros((len(arrs), longest), dtype=np.int64)
    for i, a in enumerate(arrs):
        wav[i, : len(a)] = a
        mask[i, : len(a)] = 1
    return wav, mask


def license_lines(family: str) -> list[str]:
    if family == "moonshine":
        return [
            "- 라이선스: **Moonshine Community License** — 비상업·연구용으로만 무료예요. **상업적으로 쓰려면 Useful Sensors(Moonshine AI)의 별도 허가가 필요해요.**",
            "  이 모델은 연구·비교 실험용 선택지이고, 상업 배포 후보는 Whisper(MIT) 계열이에요.",
        ]
    return [
        "- 라이선스: Whisper는 **MIT 라이선스**예요(상업 사용 가능, 저작권·라이선스 문구 표시 필요: Copyright (c) 2022 OpenAI).",
        "  학습 데이터의 이용 약관(국외 반출·제3자 제공 금지, 출처 표시)도 함께 지켜야 해요.",
    ]


def build_model_card(a_info: dict, report: dict | None = None) -> str:
    """MODEL_CARD.md 글. a_info: family, model, lora, lora_r, lora_targets, precision, batch, accum, seed, lr, max_steps, warmup, grad_ckpt,
    last_step, last_loss, last_eval_loss."""
    report = report or {}
    tr, ev = report.get("train", {}), report.get("eval", {})
    fam = a_info["family"]
    model = a_info["model"]
    app_id = APP_IDS.get(model)
    lora = a_info.get("lora", False)
    if lora:
        method = f"LoRA(r={a_info.get('lora_r')}, 대상 {a_info.get('lora_targets')}) 학습 뒤 기본 모델에 합침"
    else:
        method = "전체 미세 조정"
    lines = [
        f"# 국어나래 낭독 음성 인식 모델 ({default_run_name(model, lora)})",
        "",
        f"**{ATTRIBUTION}**",
        "한국지능정보사회진흥원(NIA) 「한국어 아동 음성 데이터」 사업 결과를 활용했어요.",
        "",
        "## 출발 모델과 라이선스",
        f"- 출발 모델: `{model}` ({'Whisper' if fam == 'whisper' else 'Moonshine'}), 언어 ko" + (", 작업 transcribe 고정" if fam == "whisper" else ""),
        *license_lines(fam),
    ]
    if app_id:
        lines.append(f"- 앱 목록의 가칭 id: `{app_id}`")
        if app_id == "narae-asr-pro":
            lines.append("- 쓰임: GPU가 있는 교사 기기 전용(학생이 교사 기기 앞에서 읽는 방식, 음성은 그 기기 밖으로 나가지 않아요).")
    lines += [
        "",
        "## 학습 데이터",
        "- 한국지능정보사회진흥원(NIA) AI Hub 「한국어 아동 음성 데이터」(미디어젠, 아동 낭독 발화)의 일부(초등 학년, 정형 발화)를 썼어요.",
        "- **학습에 쓴 음성과 전사 글은 이 폴더에 포함돼 있지 않아요.** 이용 약관에 따라 데이터는 국외로 내보내거나 제3자에게 제공하지 않아요. 화자 이름 칸은 쓰지 않았어요.",
        f"- 학습 {tr.get('utterances', '?')}개 / {tr.get('hours', '?')}시간 / 화자 {tr.get('speakers', '?')}명, 평가 {ev.get('utterances', '?')}개 / {ev.get('hours', '?')}시간 / 화자 {ev.get('speakers', '?')}명 (학습·평가 화자는 겹치지 않아요)",
        "",
        "## 학습 방법",
        f"- 방식: {method}, 정밀도 {a_info.get('precision', 'fp32')}, gradient checkpointing {'켬' if a_info.get('grad_ckpt') else '끔'}",
        f"- 학습률 {a_info['lr']}, 배치 {a_info['batch']} × 누적 {a_info['accum']}, 걸음 {a_info['max_steps']}, 워밍업 {a_info['warmup']}, 시드 {a_info['seed']}",
        f"- 마지막으로 기록한 걸음: {a_info.get('last_step', 0)}, 학습 손실 {a_info.get('last_loss', '?')}, 평가 손실 {a_info.get('last_eval_loss', '?')}",
        "",
        "## 평가 결과(직접 채워 주세요)",
        "`evaluate.py`(torch)와 `scripts/asr-eval-onnx.mjs`(배포 형식 ONNX 8비트)의 숫자를 그대로 적어요. 오경보율(맞게 읽었는데 틀렸다고 하는 비율)을 가장 중요하게 봐요.",
        "",
        "| 평가 | 발화 수 | CER | 어절 WER(띄어쓰기 무시) | 오경보율 | 놓침률 | 1분 낭독 처리 시간(초) | 최대 메모리(MB) |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        "| (채우기) |  |  |  |  |  |  |  |",
        "",
        "## 쓰임과 한계",
        "- 연구·실험용이에요. 낭독 연습의 '참고 지표'를 만드는 데 쓰고, 학생을 진단하거나 평가하는 데 쓰지 않아요.",
        "- 아동 낭독 발화로 조정했으므로 어른 목소리·자유 발화에서는 성능이 다를 수 있어요.",
        "- 모델을 공개하기 전에 AI Hub 이용 약관과 출처 표시 조항을 다시 확인하세요.",
        "",
    ]
    return "\n".join(lines)


# ----------------------------------------------------------------- 데이터

class AsrDataset:
    """Whisper: work/feats/<id>.npy(없으면 wav 에서 바로 계산). Moonshine: 16kHz 원음 그대로."""

    def __init__(self, items, work: Path, family: str, label_fn, fe=None, max_label: int = 440):
        self.work, self.family, self.fe = work, family, fe
        self.items, self.labels = [], []
        dropped = 0
        for it in items:
            ids = label_fn(it["text"])
            if len(ids) > max_label:
                dropped += 1
                continue
            self.items.append(it)
            self.labels.append(ids)
        self.dropped = dropped

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, i: int):
        it = self.items[i]
        if self.family == "moonshine":
            return load_wav_16k(self.work / it["audio"]).astype("float32"), self.labels[i]
        # 멜 개수가 다른 모델(large-v3 계열 128개)은 폴더가 달라요(asr_common.feats_dir_name)
        p = self.work / feats_dir_name(self.fe.feature_size) / f"{it['id']}.npy"
        if p.exists():
            feat = np.load(p).astype("float32")
        else:
            feat = self.fe(load_wav_16k(self.work / it["audio"]), sampling_rate=16000, return_tensors="np").input_features[0].astype("float32")
        return feat, self.labels[i]


def make_collate(family: str, start_token: int):
    """(모델 입력 dict, labels) 를 돌려줘요. labels 의 빈 곳은 -100."""
    import torch

    if family == "moonshine":

        def collate(batch):
            wav, mask = pad_audio_batch([b[0] for b in batch])
            labels = pad_labels([b[1] for b in batch])
            return {"input_values": torch.from_numpy(wav), "attention_mask": torch.from_numpy(mask)}, torch.from_numpy(labels)

        return collate

    def collate_whisper(batch):
        feats = torch.from_numpy(np.stack([b[0] for b in batch]))
        labels = strip_start_token(pad_labels([b[1] for b in batch]), start_token)
        return {"input_features": feats}, torch.from_numpy(np.ascontiguousarray(labels))

    return collate_whisper


# ----------------------------------------------------------------- 학습

def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_common_args(ap)
    ap.add_argument("--family", choices=sorted(FAMILIES), default="whisper", help="whisper 또는 moonshine")
    ap.add_argument("--model", "--base-id", dest="model", default=None, help="HF id 또는 폴더(기본: whisper→openai/whisper-base, moonshine→moonshine-ai/moonshine-base-ko). Whisper는 tiny/base/small 줄임말도 돼요")
    ap.add_argument("--precision", choices=["auto", "fp32", "fp16", "bf16"], default="auto", help="auto: 계산 능력 8 이상이면 bf16, 아니면 fp32")
    ap.add_argument("--lora", action="store_true", help="LoRA로 학습(whisper-small 등에 선택)")
    ap.add_argument("--full", action="store_true", help="large급(turbo)에서 LoRA 대신 전체 학습(기본: 60GiB 미만이면 LoRA)")
    ap.add_argument("--lora-r", type=int, default=32)
    ap.add_argument("--lora-targets", default=None, help="LoRA를 붙일 층 이름(쉼표로, 기본은 family별)")
    ap.add_argument("--name", default=None, help="결과 폴더 이름(기본: 모델 이름[-lora])")
    ap.add_argument("--train", default=None, help="기본: work/train.jsonl")
    ap.add_argument("--eval", default=None, help="기본: work/eval.jsonl")
    ap.add_argument("--batch", type=int, default=None, help="한 묶음 발화 수(기본: GPU 메모리로 자동)")
    ap.add_argument("--accum", type=int, default=None, help="누적 묶음 수(기본: GPU 메모리로 자동)")
    ap.add_argument("--lr", type=float, default=None)
    ap.add_argument("--epochs", type=float, default=3.0, help="--max-steps 를 안 주면 이 바퀴 수만큼")
    ap.add_argument("--max-steps", type=int, default=0)
    ap.add_argument("--warmup", type=int, default=0, help="워밍업 걸음(기본: 전체의 10%%, 최대 200)")
    ap.add_argument("--weight-decay", type=float, default=0.01)
    ap.add_argument("--save-every", type=int, default=100, help="N걸음마다 이어 하기용 저장")
    ap.add_argument("--eval-every", type=int, default=200)
    ap.add_argument("--eval-max", type=int, default=300, help="평가 손실에 쓸 발화 수 상한")
    ap.add_argument("--log-every", type=int, default=10)
    ap.add_argument("--max-label", type=int, default=None, help="이 토큰 수보다 긴 전사는 빼요(기본: Whisper 440, Moonshine 190)")
    ap.add_argument("--num-workers", type=int, default=0, help="윈도우는 0 권장")
    ap.add_argument("--grad-ckpt", action=argparse.BooleanOptionalAction, default=None, help="gradient checkpointing(기본: GPU 메모리가 작을 때만 켬)")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--device", default=None, help="cuda 또는 cpu(기본: 자동)")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--speedtest", action="store_true", help="30걸음만 돌려 속도·메모리·예상 시간을 알려 줘요(저장 안 함)")
    a = ap.parse_args(argv)

    import torch

    family = a.family
    model_id = resolve_model(family, a.model)
    warn = family_mismatch(family, model_id)
    if warn:
        die(warn)
    work = Path(a.work)
    device = a.device or ("cuda" if torch.cuda.is_available() else "cpu")
    on_cuda = device.startswith("cuda")
    torch.manual_seed(a.seed)

    mem_gb = None
    cc_major = None
    if on_cuda:
        props = torch.cuda.get_device_properties(0)
        mem_gb = props.total_memory / 2**30
        cc_major = props.major
        say(f"GPU: {props.name}, 메모리 {mem_gb:.1f}GiB, 계산 능력 {props.major}.{props.minor}")
    precision, why = pick_precision(a.precision, on_cuda, cc_major)
    say(f"정밀도: {precision} ({why})")
    large = family == "whisper" and is_large(model_id)
    if large:
        use_lora, stop = large_plan(mem_gb, a.lora, a.full)
        if stop:
            die(stop)
        if use_lora and not a.lora:
            say(f"large급 모델이고 GPU 메모리가 {mem_gb:.0f}GiB라서 기본으로 LoRA로 학습해요(전체 학습은 --full).")
        a.lora = use_lora
    name = a.name or default_run_name(model_id, a.lora)
    out = work / "runs" / name
    ckpt_dir = out / "ckpt"
    batch_req, accum = resolve_batch(a.batch, a.accum, mem_gb, large)
    grad_ckpt = a.grad_ckpt if a.grad_ckpt is not None else default_grad_ckpt(mem_gb, large)
    lr = a.lr if a.lr is not None else default_lr(family, model_id, a.lora)
    lora_targets = a.lora_targets or FAMILIES[family]["lora_targets"]
    max_label = a.max_label or FAMILIES[family]["max_label"]

    fe = None
    if family == "whisper":
        from transformers import WhisperFeatureExtractor, WhisperForConditionalGeneration, WhisperTokenizer

        tok = WhisperTokenizer.from_pretrained(model_id)
        tok.set_prefix_tokens(language="korean", task="transcribe")
        fe = WhisperFeatureExtractor.from_pretrained(model_id)
        save_extra = [tok, fe]

        def label_fn(text: str) -> list[int]:
            return tok(text).input_ids

    else:
        from transformers import AutoConfig, AutoProcessor, MoonshineForConditionalGeneration

        # 문서 예제와 같은 방식: AutoProcessor(토크나이저·원음 처리), 모델은 MoonshineForConditionalGeneration
        processor = AutoProcessor.from_pretrained(model_id)
        tok = processor.tokenizer
        save_extra = [processor]
        cfg0 = AutoConfig.from_pretrained(model_id)
        mcfg_bos, mcfg_eos = cfg0.decoder_start_token_id, cfg0.eos_token_id

        def label_fn(text: str) -> list[int]:
            return moonshine_label_ids(tok(text).input_ids, mcfg_bos, mcfg_eos)

    train_items = read_jsonl(Path(a.train) if a.train else work / "train.jsonl")
    eval_items = read_jsonl(Path(a.eval) if a.eval else work / "eval.jsonl")
    tr_ds = AsrDataset(train_items, work, family, label_fn, fe, max_label)
    ev_ds = AsrDataset(eval_items[: a.eval_max], work, family, label_fn, fe, max_label)
    if len(tr_ds) == 0:
        die("학습 발화가 없어요(train.jsonl 이 비었거나 전사가 너무 길어요).")
    if tr_ds.dropped:
        say(f"전사가 너무 길어서 뺀 학습 발화: {tr_ds.dropped:,}개")
    batch = min(batch_req, len(tr_ds))
    per_epoch = max(1, len(tr_ds) // batch)
    max_steps = a.max_steps or max(1, math.ceil(per_epoch * a.epochs / accum))
    warmup = a.warmup or min(200, max(1, max_steps // 10))
    say(f"학습 발화 {len(tr_ds):,}개, 평가 손실용 {len(ev_ds):,}개 | 장치 {device} | 모델 {model_id}{' + LoRA' if a.lora else ''}")
    say(f"한 걸음 = {batch} × {accum} = {batch * accum}개, 전체 {max_steps:,}걸음, 학습률 {lr}, 워밍업 {warmup}걸음, gradient checkpointing {'켬' if grad_ckpt else '끔'}")

    if family == "whisper":
        model = WhisperForConditionalGeneration.from_pretrained(model_id, dtype=torch.float32)
        model.generation_config.language = "ko"
        model.generation_config.task = "transcribe"
        model.generation_config.forced_decoder_ids = None
        if hasattr(model.config, "forced_decoder_ids"):
            model.config.forced_decoder_ids = None
        start_tok = model.config.decoder_start_token_id
    else:
        model = MoonshineForConditionalGeneration.from_pretrained(model_id, dtype=torch.float32)
        start_tok = model.config.decoder_start_token_id
    model.config.use_cache = False
    if a.lora:
        from peft import LoraConfig, get_peft_model

        cfg = LoraConfig(r=a.lora_r, lora_alpha=2 * a.lora_r, lora_dropout=0.05, bias="none", target_modules=lora_targets.split(","))
        model = get_peft_model(model, cfg)
        model.print_trainable_parameters()
    if grad_ckpt:
        model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model.to(device)
    trainable = [(n, p) for n, p in model.named_parameters() if p.requires_grad]
    opt = torch.optim.AdamW([p for _, p in trainable], lr=lr, weight_decay=a.weight_decay)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min((s + 1) / warmup, max(0.0, (max_steps - s) / max(1, max_steps - warmup))))
    scaler = torch.amp.GradScaler("cuda") if precision == "fp16" else None

    def amp():
        if precision == "bf16":
            return torch.autocast(device_type="cuda", dtype=torch.bfloat16)
        if precision == "fp16":
            return torch.autocast(device_type="cuda", dtype=torch.float16)
        return nullcontext()

    step = 0
    if a.resume and (ckpt_dir / "last.pt").exists():
        st = torch.load(ckpt_dir / "last.pt", map_location="cpu", weights_only=False)
        model.load_state_dict(st["model"], strict=False)
        opt.load_state_dict(st["optim"])
        sched.load_state_dict(st["sched"])
        if scaler is not None and st.get("scaler"):
            scaler.load_state_dict(st["scaler"])
        step = st["step"]
        say(f"이어서 시작해요: {step}걸음부터")
    elif a.resume:
        say("[알림] 이어 할 저장본이 없어서 처음부터 시작해요.")

    out.mkdir(parents=True, exist_ok=True)
    info = {
        "family": family, "model": model_id, "lora": a.lora, "lora_r": a.lora_r, "lora_targets": lora_targets,
        "precision": precision, "batch": batch, "accum": accum, "seed": a.seed, "grad_ckpt": grad_ckpt,
        "lr": lr, "max_steps": max_steps, "warmup": warmup,
    }

    def write_card() -> None:
        rp = work / "subset_report.json"
        report = json.loads(rp.read_text(encoding="utf-8")) if rp.exists() else {}
        (out / "MODEL_CARD.md").write_text(build_model_card(info, report), encoding="utf-8")

    write_card()
    collate = make_collate(family, start_tok)

    def to_dev(inputs: dict) -> dict:
        return {k: v.to(device) for k, v in inputs.items()}

    def save_ckpt() -> None:
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        names = {n for n, _ in trainable}
        sd = {k: v.detach().cpu() for k, v in model.state_dict().items() if k in names}
        tmp = ckpt_dir / "last.pt.tmp"
        torch.save(
            {"step": step, "model": sd, "optim": opt.state_dict(), "sched": sched.state_dict(), "scaler": scaler.state_dict() if scaler else None, "args": vars(a)},
            tmp,
        )
        tmp.replace(ckpt_dir / "last.pt")

    @torch.no_grad()
    def eval_loss() -> float:
        if len(ev_ds) == 0:
            return float("nan")
        model.eval()
        tot = cnt = 0.0
        for i in range(0, len(ev_ds), batch):
            inputs, labels = collate([ev_ds[j] for j in range(i, min(i + batch, len(ev_ds)))])
            with amp():
                loss = model(**to_dev(inputs), labels=labels.to(device)).loss
            n = float((labels != -100).sum())
            tot += float(loss) * n
            cnt += n
        model.train()
        return tot / max(cnt, 1)

    total_batches = max_steps * accum
    todo = batch_list(len(tr_ds), batch, a.seed, step * accum, total_batches)
    if a.speedtest:
        todo = todo[:30]
    loader = torch.utils.data.DataLoader(tr_ds, batch_sampler=todo, collate_fn=collate, num_workers=a.num_workers)

    log_f = None
    writer = None
    if not a.speedtest:
        new = not (out / "log.csv").exists() or not a.resume
        log_f = open(out / "log.csv", "w" if new else "a", newline="", encoding="utf-8")
        writer = csv.writer(log_f)
        if new:
            writer.writerow(["time", "step", "epoch", "loss", "lr", "grad_norm", "eval_loss", "sec_per_step", "gpu_mem_mb"])

    def stop_oom() -> None:
        opt.zero_grad(set_to_none=True)
        say("")
        for line in oom_hint(batch, accum, family, a.lora):
            say(line)
        sys.exit(3)

    model.train()
    micro = 0
    run_loss = 0.0
    t_step = time.time()
    micro_times: list[float] = []
    last_loss = last_eval = None
    try:
        for inputs, labels in loader:
            t0 = time.time()
            try:
                with amp():
                    loss = model(**to_dev(inputs), labels=labels.to(device)).loss
                scaled = loss / accum
                (scaler.scale(scaled) if scaler else scaled).backward()
            except RuntimeError as e:
                if "out of memory" in str(e).lower():
                    stop_oom()
                raise
            run_loss += float(loss) / accum
            micro += 1
            if on_cuda:
                torch.cuda.synchronize()
            micro_times.append(time.time() - t0)
            if micro % accum:
                continue
            if scaler:
                scaler.unscale_(opt)
            gn = float(torch.nn.utils.clip_grad_norm_([p for _, p in trainable], 1.0))
            if scaler:
                scaler.step(opt)
                scaler.update()
            else:
                opt.step()
            sched.step()
            opt.zero_grad(set_to_none=True)
            step += 1
            last_loss = run_loss
            mem = torch.cuda.max_memory_allocated() / 2**20 if on_cuda else 0.0
            sec = time.time() - t_step
            t_step = time.time()
            ev = float("nan")
            if not a.speedtest and a.eval_every and step % a.eval_every == 0:
                try:
                    ev = last_eval = eval_loss()
                except RuntimeError as e:
                    if "out of memory" in str(e).lower():
                        stop_oom()
                    raise
            if writer:
                writer.writerow([time.strftime("%Y-%m-%d %H:%M:%S"), step, round(step * accum / per_epoch, 4), round(run_loss, 5), sched.get_last_lr()[0], round(gn, 4), "" if math.isnan(ev) else round(ev, 5), round(sec, 2), round(mem)])
                log_f.flush()
            if step % a.log_every == 0 or step == 1 or step == max_steps:
                say(f"걸음 {step}/{max_steps} 손실 {run_loss:.4f} 걸음당 {sec:.1f}초 GPU메모리 최대 {mem:.0f}MB" + ("" if math.isnan(ev) else f" 평가손실 {ev:.4f}"))
            run_loss = 0.0
            if not a.speedtest and a.save_every and step % a.save_every == 0:
                save_ckpt()
    except KeyboardInterrupt:
        say("\n멈춤 요청을 받았어요. 지금까지를 저장하고 끝낼게요.")
        if not a.speedtest:
            save_ckpt()
        sys.exit(130)
    finally:
        if log_f:
            log_f.close()

    if a.speedtest:
        use = micro_times[3:] if len(micro_times) > 6 else micro_times
        per_micro = sum(use) / max(len(use), 1)
        per_step = per_micro * accum
        say("\n== 속도 시험 결과 ==")
        say(f"정밀도 {precision}, 발화 {batch}개짜리 한 묶음당 {per_micro:.2f}초 → 한 걸음({accum}묶음) 약 {per_step:.1f}초")
        if on_cuda:
            say(f"GPU 메모리 최대 사용 {torch.cuda.max_memory_allocated() / 2**30:.2f}GiB / 전체 {torch.cuda.get_device_properties(0).total_memory / 2**30:.1f}GiB")
        else:
            say("(GPU가 아니라서 메모리는 재지 않았어요)")
        say(f"전체 {max_steps:,}걸음이면 학습 시간 약 {per_step * max_steps / 3600:.1f}시간 (평가·저장 시간 제외)")
        return

    save_ckpt()
    info.update(last_step=step, last_loss=None if last_loss is None else round(last_loss, 4), last_eval_loss=None if last_eval is None else round(last_eval, 4))
    final = out / "final"
    if a.lora:
        model.save_pretrained(out / "final_adapter")
        model = model.merge_and_unload()
    model.config.use_cache = True
    model.save_pretrained(final)
    for obj in save_extra:
        obj.save_pretrained(final)
    write_card()
    say(f"\n학습 끝: {final}\n모델 설명서: {out / 'MODEL_CARD.md'} (출처 표시 문구 포함)")


if __name__ == "__main__":
    main()
