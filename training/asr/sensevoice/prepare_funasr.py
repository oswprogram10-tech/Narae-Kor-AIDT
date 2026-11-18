"""build_subset.py 의 train/eval jsonl 을 FunASR SenseVoice 미세 조정용 jsonl 로 바꾼다.

    python prepare_funasr.py --work ../work --out ../work/funasr

입력(work/): train.jsonl, eval.jsonl  (필드 id, audio(work 기준 상대 경로, 16kHz mono wav), text, seconds, grade, noise, speaker)
출력(--out): train.jsonl, val.jsonl   (FunASR 형식), stats.json

형식과 길이 규칙의 출처(공식 소스를 직접 읽고 맞췄어요)
  - 한 줄 모양: FunAudioLLM/SenseVoice  data/train_example.jsonl 과 README "Data prepare"
      {"key","text_language","emo_target","event_target","with_or_wo_itn","target","source","target_len","source_len"}
  - 길이 계산: FunASR(funasr==1.4.14) funasr/datasets/audio_datasets/sensevoice2jsonl.py 의 parse_context_length
      source_len = int(샘플수 / 16000 * 1000 / 10)       (= 10ms 프레임 수, 소수점 버림)
      target_len = len(text.split()) if " " in text else len(text)   (공식 코드 그대로: 띄어쓰기가 있으면 '어절 수', 없으면 글자 수)
      with_or_wo_itn = 구두점이 있으면 "<|withitn|>", 없으면 "<|woitn|>"  (공식의 contains_punctuation 과 같은 문자 집합)
    이 값들은 학습 때 길이로 거르고 배치를 묶는 데만 쓰여요(index_ds.py). target_len 이 어절 수가 되는 건 공식 동작이에요.
  - 학습 때 걸러지는 기준(공식 base config.yaml): 0.6초(60프레임) 미만, 20초(2000프레임) 초과는 학습에서 빠져요. 여기서는 몇 개인지만 알려 줘요.

확인하지 못한 것: 이 환경에는 funasr·torch 가 없어서 실제 학습 데이터로더에 넣어 보지는 못했어요(소스 읽기와 시험으로만 확인).

검증용(val) 분리: eval.jsonl 은 마지막 평가(evaluate.py)에 써야 하므로, 가장 좋은 체크포인트를 고르는 검증 손실에는 쓰지 않는 게 좋아요.
그래서 기본값은 train 의 화자 일부(5%)를 통째로 떼어 val 로 써요(같은 화자가 train·val 에 섞이지 않게, 화자 키 해시로 정해요).
--val-fraction 0 이면 eval.jsonl 을 val 로 써요(그러면 최종 평가가 낙관적이 되니 비추천).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import string
import sys
from pathlib import Path

SAMPLE_RATE = 16000
TEXT_LANGUAGE = "<|ko|>"
EMO_TARGET = "<|NEUTRAL|>"
EVENT_TARGET = "<|Speech|>"
# 공식 sensevoice2jsonl.py 의 contains_punctuation 과 같은 문자 집합
PUNCTUATIONS = string.punctuation + "，。、；：？！（）【】《》〈〉「」『』〔〕［］｛｝～·…—–"
# FunASR 기본 설정(SenseVoiceSmall config.yaml)의 길이 기준(프레임, 10ms 단위)
MIN_SOURCE_FRAMES = 60
MAX_SOURCE_FRAMES = 2000


def source_len_from_samples(n_samples: int, sample_rate: int = SAMPLE_RATE) -> int:
    """공식: int(len(waveform_16k) / 16000 * 1000 / 10). 16kHz 가 아니면 16kHz 로 다시 뽑았을 때의 샘플 수로 환산."""
    if sample_rate != SAMPLE_RATE:
        n_samples = int(round(n_samples * SAMPLE_RATE / sample_rate))
    return int(n_samples / SAMPLE_RATE * 1000 / 10)


def target_len_of(text: str) -> int:
    """공식: len(line.split()) if " " in line else len(line)."""
    return len(text.split()) if " " in text else len(text)


def contains_punctuation(text: str) -> bool:
    return any(ch in PUNCTUATIONS for ch in text)


def with_or_wo_itn(text: str) -> str:
    return "<|withitn|>" if contains_punctuation(text) else "<|woitn|>"


def build_record(key: str, source: str, text: str, n_samples: int, sample_rate: int = SAMPLE_RATE) -> dict:
    """FunASR SenseVoice 미세 조정 jsonl 한 줄(키 순서도 공식 예제와 같게)."""
    return {
        "key": key,
        "text_language": TEXT_LANGUAGE,
        "emo_target": EMO_TARGET,
        "event_target": EVENT_TARGET,
        "with_or_wo_itn": with_or_wo_itn(text),
        "target": text,
        "source": source,
        "target_len": target_len_of(text),
        "source_len": source_len_from_samples(n_samples, sample_rate),
    }


def speaker_in_val(speaker: str, fraction: float) -> bool:
    """화자 키 해시로 정하는 고정 분할(같은 화자는 항상 같은 쪽)."""
    if fraction <= 0:
        return False
    h = int(hashlib.sha1(speaker.encode("utf-8")).hexdigest()[:8], 16) / 0xFFFFFFFF
    return h < fraction


def wav_samples(path: Path) -> tuple[int, int]:
    """(샘플 수, 샘플링 주파수). 헤더만 읽어요."""
    import soundfile as sf

    info = sf.info(str(path))
    return int(info.frames), int(info.samplerate)


def convert_items(items: list[dict], work: Path, *, id_prefix: str = "") -> tuple[list[dict], dict]:
    """manifest 항목 → FunASR 줄 목록과 통계. wav 가 없거나 전사가 비면 건너뛰고 세어 둬요."""
    out: list[dict] = []
    st = {"in": len(items), "out": 0, "missing_wav": 0, "empty_text": 0, "non16k": 0, "short": 0, "long": 0, "hours": 0.0}
    for it in items:
        text = str(it.get("text", "")).strip()
        if not text:
            st["empty_text"] += 1
            continue
        wav = (work / str(it["audio"])).resolve()
        if not wav.exists():
            st["missing_wav"] += 1
            continue
        n, sr = wav_samples(wav)
        if sr != SAMPLE_RATE:
            st["non16k"] += 1
        rec = build_record(f"{id_prefix}{it['id']}", str(wav), text, n, sr)
        if rec["source_len"] < MIN_SOURCE_FRAMES:
            st["short"] += 1
        if rec["source_len"] > MAX_SOURCE_FRAMES:
            st["long"] += 1
        st["hours"] += rec["source_len"] / 100 / 3600
        out.append(rec)
    st["out"] = len(out)
    st["hours"] = round(st["hours"], 3)
    return out, st


def split_train_val(items: list[dict], fraction: float) -> tuple[list[dict], list[dict]]:
    train, val = [], []
    for it in items:
        spk = str(it.get("speaker") or it.get("id"))
        (val if speaker_in_val(spk, fraction) else train).append(it)
    return train, val


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        sys.exit(f"{path} 가 없어요. build_subset.py 를 먼저 실행해 주세요.")
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--work", default=str(Path(__file__).resolve().parent.parent / "work"), help="build_subset 결과 폴더(train.jsonl·eval.jsonl 과 audio/)")
    ap.add_argument("--out", default=None, help="출력 폴더(기본: <work>/funasr)")
    ap.add_argument("--val-fraction", type=float, default=0.05, help="train 화자 중 검증(val)으로 뗄 비율(0 이면 eval.jsonl 을 val 로 씀)")
    a = ap.parse_args(argv)

    work = Path(a.work).resolve()
    out = Path(a.out).resolve() if a.out else work / "funasr"
    train_items = read_jsonl(work / "train.jsonl")
    if a.val_fraction > 0:
        tr, va = split_train_val(train_items, a.val_fraction)
        if not va:
            sys.exit("검증으로 뗀 화자가 하나도 없어요. --val-fraction 을 올려 주세요.")
    else:
        tr, va = train_items, read_jsonl(work / "eval.jsonl")
        print("주의: eval.jsonl 을 검증에 쓰면 최종 평가(evaluate.py)가 낙관적이에요. --val-fraction 0.05 를 권해요.")

    tr_rows, tr_st = convert_items(tr, work)
    va_rows, va_st = convert_items(va, work)
    if not tr_rows or not va_rows:
        sys.exit("변환된 줄이 없어요(wav 경로·전사를 확인해 주세요).")
    write_jsonl(out / "train.jsonl", tr_rows)
    write_jsonl(out / "val.jsonl", va_rows)
    stats = {"train": tr_st, "val": va_st, "val_fraction": a.val_fraction}
    (out / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    for name, st in (("train", tr_st), ("val", va_st)):
        print(f"{name}: {st['out']}줄, {st['hours']}시간 (wav 없음 {st['missing_wav']}, 전사 빔 {st['empty_text']}, "
              f"0.6초 미만 {st['short']}, 20초 초과 {st['long']}, 16kHz 아님 {st['non16k']})")
    print(f"썼어요: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
