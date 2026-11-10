"""공개 음성 인식 모델 파일을 models/<이름>/ 으로 내려받는 도우미(필요한 파일만).

    python download_models.py --list                 # 받을 수 있는 모델 목록과 대략 크기
    python download_models.py zipformer-ko-72m whisper-base
    python download_models.py whisper-tiny --dest D:\\models

받은 폴더는 evaluate.py 에 이렇게 줘요:
    python evaluate.py --models sherpa:models/zipformer-ko-72m sensevoice:models/sensevoice sherpa-whisper:models/whisper-base

이 저장소들은 공개 모델(데이터가 아님)이라 받아도 약관 문제가 없어요. AI Hub 음성·전사 데이터는 절대 올리지 않아요.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

HERE = Path(__file__).resolve().parent
DEFAULT_DEST = HERE / "models"

# 이름 -> (HF 저장소, 받을 파일 패턴, 대략 크기 MB, 설명). 저장소 이름·파일은 HF API 로 확인한 것이에요.
MODELS: dict[str, tuple[str, list[str], int, str]] = {
    "zipformer-ko-72m": ("kangkyu/icefall-asr-ko-streaming-zipformer-72m", ["tokens.txt", "*-chunk-64-left-128.int8.onnx"], 70, "한국어 스트리밍 zipformer 72M, chunk-64 int8 → evaluate 의 sherpa: 백엔드"),
    "sensevoice": ("csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17", ["model.int8.onnx", "tokens.txt"], 230, "SenseVoice-Small int8(중·영·일·한·광둥어) → sensevoice: 백엔드"),
    "whisper-tiny": ("csukuangfj/sherpa-onnx-whisper-tiny", ["*.int8.onnx", "*-tokens.txt"], 100, "Whisper tiny int8 → sherpa-whisper: 백엔드"),
    "whisper-base": ("csukuangfj/sherpa-onnx-whisper-base", ["*.int8.onnx", "*-tokens.txt"], 155, "Whisper base int8 → sherpa-whisper: 백엔드"),
    "whisper-small": ("csukuangfj/sherpa-onnx-whisper-small", ["*.int8.onnx", "*-tokens.txt"], 360, "Whisper small int8 → sherpa-whisper: 백엔드"),
    "whisper-medium": ("csukuangfj/sherpa-onnx-whisper-medium", ["*.int8.onnx", "*-tokens.txt"], 900, "Whisper medium int8 → sherpa-whisper: 백엔드(느려요, --max-minutes 권장)"),
    "whisper-turbo": ("csukuangfj/sherpa-onnx-whisper-turbo", ["*.int8.onnx", "*-tokens.txt"], 990, "Whisper large-v3-turbo int8 → sherpa-whisper: 백엔드(느려요, --max-minutes 권장)"),
}

AUTO = [
    ("moonshine-ai/moonshine-tiny-ko, moonshine-ai/moonshine-base-ko", "evaluate.py --moonshine 로 처음 실행할 때 transformers 가 알아서 받아요(별도 내려받기 불필요)"),
    ("elmenwol/whisper-small_aihub_child", "evaluate.py --elmenwol 로 처음 실행할 때 알아서 받아요(torch 필요, 약 1GB)"),
    ("openai/whisper-base, openai/whisper-small (torch)", "evaluate.py 기본 모델이고 처음 실행할 때 알아서 받아요"),
]


def print_list() -> None:
    print(f"{'이름':<18}{'크기(대략)':>10}  설명 / 저장소")
    for name, (repo, _pats, mb, desc) in MODELS.items():
        print(f"{name:<18}{mb:>8}MB  {desc}\n{'':<30}{repo}")
    print("\n자동으로 받는 모델(이 도구로 받을 필요 없음):")
    for ids, note in AUTO:
        print(f"  {ids}\n    {note}")


def download(name: str, dest_root: Path, downloader=None) -> Path:
    repo, patterns, _mb, _desc = MODELS[name]
    target = dest_root / name
    target.mkdir(parents=True, exist_ok=True)
    if downloader is None:
        try:
            from huggingface_hub import snapshot_download as downloader
        except Exception as e:  # noqa: BLE001
            raise SystemExit(f"huggingface_hub 가 필요해요(pip install huggingface_hub 또는 pip install -r requirements.txt): {e}")
    downloader(repo_id=repo, allow_patterns=patterns, local_dir=str(target))
    return target


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("names", nargs="*", help="받을 모델 이름(--list 로 확인)")
    ap.add_argument("--list", action="store_true", help="목록과 대략 크기만 보여요")
    ap.add_argument("--dest", default=str(DEFAULT_DEST), help="저장 폴더(기본 training/asr/models). 모델은 <dest>/<이름>/ 에 놓여요")
    a = ap.parse_args(argv)
    if a.list or not a.names:
        print_list()
        return 0
    bad = [n for n in a.names if n not in MODELS]
    if bad:
        print(f"모르는 이름: {', '.join(bad)}  (--list 로 확인해 주세요)", file=sys.stderr)
        return 2
    for n in a.names:
        print(f"== {n}: {MODELS[n][0]} (약 {MODELS[n][2]}MB) ==", flush=True)
        t = download(n, Path(a.dest))
        files = sorted(p.name for p in t.rglob("*") if p.is_file() and ".cache" not in p.parts)
        print(f"  받았어요: {t}\n    " + ", ".join(files), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
