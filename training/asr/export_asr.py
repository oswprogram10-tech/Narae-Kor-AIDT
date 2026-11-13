"""학습한 음성 인식 모델(또는 아무 HF id)을 transformers.js 가 바로 읽는 ONNX 8비트 폴더로 내보낸다.

결과 폴더(앱 목록 src/core/speech/catalog.ts 의 files 와 같아요)
  config.json, generation_config.json, preprocessor_config.json, tokenizer 파일들
  onnx/encoder_model_quantized.onnx
  onnx/decoder_model_merged_quantized.onnx      (Whisper·Moonshine 모두 같은 이름: onnx-community 저장소 파일 목록으로 확인함)
  --fp16 를 주면 GPU용 onnx/encoder_model_fp16.onnx, onnx/decoder_model_merged_fp16.onnx 도 함께(3단계 narae-asr-pro). dtype 은 q8 / fp16.
  MODEL_CARD.md, LICENSE.txt, manifest.json     (파일 크기·sha256)

사용(내보내기 전용 가상환경의 파이썬으로 — README 10절, 학습 환경에 optimum 을 깔지 마세요):
  python export_asr.py --model work/runs/base/final --out export/narae-asr-lite
  python export_asr.py --model openai/whisper-base --out export/whisper-base-plain       # 학습 없이(크기·구조 확인용)
  python export_asr.py --model work/runs/small/final --out export/narae-asr-standard --id narae-asr-standard
  python export_asr.py --model work/runs/large-v3-turbo/final --out export/narae-asr-pro --id narae-asr-pro --fp16   # 3단계: q8 + GPU용 fp16

단계: (1) optimum 으로 fp32 ONNX 내보내기(task automatic-speech-recognition-with-past, 디코더는 merged 하나로 합침)
      (2) onnxruntime quantize_dynamic 으로 8비트 (3) 설명서·라이선스 복사, manifest.json 만들기. 중간 fp32 파일은 지워요(--keep-fp32 로 남김).

8비트 방식 고르기(어림이 아니라 이유가 있어요)
  - 가중치 형식: 기본 QUInt8. 활성값은 동적 양자화에서 늘 uint8 이라, 가중치가 uint8 이면 Conv 의 ConvInteger(u8u8)도 CPU에서 지원돼요.
    QInt8 가중치는 Whisper 인코더 앞부분의 Conv 에서 지원하지 않는 조합이 생길 수 있어요. 공개 transformers.js 모델(onnx-community)도 quant_type 1(QUInt8)이에요.
    --weight-type qint8 로 바꿔 비교할 수 있어요.
  - per_channel=True(기본): 출력 채널마다 따로 크기를 정해 가중치 오차가 작아요. 정확도 우선이라 켜요(크기·속도 차이는 거의 없어요).
  - reduce_range=True(기본): 가중치를 7비트 범위로 줄여, 구형 AVX2 CPU(VNNI 없음)에서 u8s8 곱셈이 넘치는(포화) 문제를 막아요. 정확도 손실은 작고 안전해요.
    Ryzen 5 5625U 는 AVX2 이므로 켜 둬요. 정확도 손실이 보이면 --no-reduce-range 로 비교하세요.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent

ENCODER_Q = "onnx/encoder_model_quantized.onnx"
DECODER_Q = "onnx/decoder_model_merged_quantized.onnx"
ENCODER_F16 = "onnx/encoder_model_fp16.onnx"
DECODER_F16 = "onnx/decoder_model_merged_fp16.onnx"

# 폴더에 반드시 있어야 하는 파일, 있으면 같이 두는 파일(토크나이저 구현마다 달라요)
COMMON_REQUIRED = ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json", ENCODER_Q, DECODER_Q]
COMMON_OPTIONAL = ["special_tokens_map.json"]
WHISPER_OPTIONAL = ["added_tokens.json", "vocab.json", "merges.txt", "normalizer.json"]
# --base-id 로 기본 모델에서 가져올 설정·토크나이저 파일(가중치는 건드리지 않아요)
BASE_COPY = ["config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", *WHISPER_OPTIONAL]

NIA = "한국지능정보사회진흥원(NIA) 「한국어 아동 음성 데이터」 사업 결과를 활용"

MIT_TEXT = """MIT License

Copyright (c) 2022 OpenAI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

MOONSHINE_NOTICE = """Moonshine Community License (비상업·연구용)

이 모델은 Useful Sensors(Moonshine AI)의 moonshine-ai/moonshine-base-ko 를 출발점으로 만들었어요.
Moonshine Community License 에 따라 비상업·연구 목적으로만 무료로 쓸 수 있어요.
상업적으로 쓰려면 Moonshine AI 의 별도 허가가 필요해요.
라이선스 전문은 원본 저장소(https://huggingface.co/moonshine-ai/moonshine-base-ko)를 보세요.
이 폴더를 다른 곳에 나눌 때는 이 문구와 원본 라이선스를 함께 두세요.
"""


# ----------------------------------------------------------------- 순수 함수(torch·optimum 없이 시험해요)

def detect_family(model: str, config: dict | None = None) -> str:
    """config.json 의 model_type 이 있으면 그것으로, 없으면 이름으로 whisper|moonshine 을 알아내요. 모르면 빈 문자열."""
    mt = str((config or {}).get("model_type", "")).lower()
    if mt in ("whisper", "moonshine"):
        return mt
    low = model.lower()
    if "moonshine" in low:
        return "moonshine"
    if "whisper" in low:
        return "whisper"
    return ""


def expected_files(family: str, fp16: bool = False) -> tuple[list[str], list[str]]:
    """(꼭 있어야 하는 파일, 있으면 같이 두는 파일) — 폴더 안 상대 경로. fp16=True 면 GPU용 fp16 파일도 꼭 있어야 해요."""
    optional = list(COMMON_OPTIONAL) + (WHISPER_OPTIONAL if family == "whisper" else [])
    required = list(COMMON_REQUIRED) + ([ENCODER_F16, DECODER_F16] if fp16 else [])
    return required, optional


def dtypes_for(fp16: bool) -> list[str]:
    return ["q8", "fp16"] if fp16 else ["q8"]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def build_manifest(folder: Path, meta: dict, skip: tuple[str, ...] = ("manifest.json",)) -> dict:
    """폴더 안 모든 파일의 크기·sha256 목록(경로는 '/' 로). manifest.json 자신은 빼요."""
    files = []
    for p in sorted(x for x in folder.rglob("*") if x.is_file()):
        rel = p.relative_to(folder).as_posix()
        if rel in skip:
            continue
        files.append({"path": rel, "bytes": p.stat().st_size, "sha256": sha256_file(p)})
    total = sum(f["bytes"] for f in files)
    return {**meta, "files": files, "totalBytes": total, "totalMB": round(total / 2**20, 1)}


def missing_files(folder: Path, family: str, fp16: bool = False) -> list[str]:
    required, _ = expected_files(family, fp16)
    return [r for r in required if not (folder / r).is_file()]


def license_text(family: str) -> str:
    return MOONSHINE_NOTICE if family == "moonshine" else MIT_TEXT


def plain_model_card(family: str, model: str, app_id: str | None) -> str:
    """학습 없이 내보낸 경우(출발 모델 그대로)의 설명서."""
    lic = "Moonshine Community License — 비상업·연구용만" if family == "moonshine" else "MIT"
    lines = [
        f"# {app_id or model} (학습 없이 내보낸 출발 모델)",
        "",
        f"- 출발 모델: `{model}`, 라이선스: {lic}",
        "- 이 폴더의 모델은 국어나래 아동 낭독 데이터로 미세 조정하지 않았어요(내보내기 도구 확인용).",
        "- 형식: transformers.js 용 ONNX, 8비트 동적 양자화(`onnx/encoder_model_quantized.onnx`, `onnx/decoder_model_merged_quantized.onnx`).",
        "- 아동 낭독 데이터로 학습한 모델은 `train_asr.py` 가 만든 MODEL_CARD.md 를 쓰고, 그 설명서에는 "
        f"「{NIA}」 출처 표시가 들어 있어요.",
        "",
    ]
    return "\n".join(lines)


def find_model_card(model_dir: Path) -> Path | None:
    """학습 결과 폴더(work/runs/<이름>/final)면 한 단계 위의 MODEL_CARD.md 를, 아니면 폴더 안의 것을."""
    for c in (model_dir / "MODEL_CARD.md", model_dir.parent / "MODEL_CARD.md"):
        if c.is_file():
            return c
    return None


# ----------------------------------------------------------------- 내보내기

def fail(msg: str) -> None:
    print("\n[내보내기 중단] " + msg, file=sys.stderr, flush=True)
    raise SystemExit(1)


def say(msg: str) -> None:
    print(msg, flush=True)


def stage_with_base(model_dir: Path, base_id: str, stage: Path) -> Path:
    """가중치·generation_config 는 학습 결과에서, 설정·토크나이저는 기본 모델에서 모아요.
    학습 환경(transformers 5.x)이 저장한 config 를 내보내기 환경(4.57)이 잘못 읽을 때 쓰는 우회로예요."""
    from huggingface_hub import hf_hub_download

    stage.mkdir(parents=True, exist_ok=True)
    weights = sorted(model_dir.glob("*.safetensors")) or sorted(model_dir.glob("pytorch_model*.bin"))
    if not weights:
        fail(f"가중치 파일(*.safetensors)을 못 찾았어요: {model_dir}")
    for w in weights + sorted(model_dir.glob("*.index.json")):
        shutil.copy2(w, stage / w.name)
    if (model_dir / "generation_config.json").is_file():
        shutil.copy2(model_dir / "generation_config.json", stage / "generation_config.json")
    for name in BASE_COPY:
        try:
            shutil.copy2(hf_hub_download(base_id, name), stage / name)
        except Exception:  # noqa: BLE001  (기본 모델에 없는 파일은 건너뛰어요)
            pass
    return stage


def export_fp32(model: str, work: Path, opset: int | None) -> None:
    try:
        from optimum.exporters.onnx import main_export
    except ImportError:
        fail("optimum 이 없어요. 내보내기 전용 가상환경에서 실행해 주세요(README 10절, training/export_env.sh 방식). 학습 환경에는 깔지 마세요.")
    kw = {"opset": opset} if opset else {}
    # 디코더는 첫 걸음용과 캐시용을 하나(decoder_model_merged.onnx)로 합쳐요(main_export 기본 동작).
    main_export(model_name_or_path=model, output=str(work), task="automatic-speech-recognition-with-past", do_validation=False, **kw)


def quantize(src: Path, dst: Path, weight_type: str, per_channel: bool, reduce_range: bool) -> None:
    from onnxruntime.quantization import QuantType, quantize_dynamic

    qt = QuantType.QUInt8 if weight_type == "quint8" else QuantType.QInt8
    # EnableSubgraph: 합친 디코더는 If 연산 안쪽 그래프에 행렬곱이 있어서 켜야 안쪽까지 양자화돼요.
    quantize_dynamic(
        model_input=str(src),
        model_output=str(dst),
        weight_type=qt,
        per_channel=per_channel,
        reduce_range=reduce_range,
        extra_options={"EnableSubgraph": True},
    )


def to_fp16(src: Path, dst: Path) -> None:
    """GPU(WebGPU 등)용 fp16 파일. 입출력은 fp32로 두어(keep_io_types) transformers.js 가 그대로 쓸 수 있어요.
    2GB를 넘는 fp32 파일은 .onnx_data 를 같은 폴더에서 함께 읽어요(onnx.load 가 처리)."""
    import onnx
    from onnxruntime.transformers.float16 import convert_float_to_float16

    m = onnx.load(str(src))
    m16 = convert_float_to_float16(m, keep_io_types=True)
    onnx.save(m16, str(dst))


def versions() -> dict:
    out = {}
    for mod in ("torch", "transformers", "optimum", "onnx", "onnxruntime"):
        try:
            out[mod] = __import__(mod).__version__
        except Exception:  # noqa: BLE001
            pass
    return out


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", required=True, help="학습 결과 폴더(…/final) 또는 HF id")
    ap.add_argument("--out", required=True, help="결과 폴더(이미 있으면 --force 가 있어야 덮어써요)")
    ap.add_argument("--family", choices=["auto", "whisper", "moonshine"], default="auto")
    ap.add_argument("--id", default=None, help="앱 목록 id(manifest.json 에 적어요. 예: narae-asr-lite)")
    ap.add_argument("--base-id", default=None, help="설정·토크나이저를 가져올 기본 모델 HF id(학습 결과 폴더를 못 읽을 때의 우회로)")
    ap.add_argument("--weight-type", choices=["quint8", "qint8"], default="quint8")
    ap.add_argument("--per-channel", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--reduce-range", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--fp16", action="store_true", help="GPU용 fp16 파일도 만들어요(3단계 narae-asr-pro)")
    ap.add_argument("--opset", type=int, default=None)
    ap.add_argument("--keep-fp32", action="store_true", help="중간 fp32 ONNX 를 <out>/_fp32 에 남겨요(비교용, 배포하면 안 돼요)")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args(argv)

    model_path = Path(a.model)
    is_dir = model_path.is_dir()
    cfg = json.loads((model_path / "config.json").read_text(encoding="utf-8")) if is_dir and (model_path / "config.json").is_file() else None
    family = a.family if a.family != "auto" else detect_family(a.model, cfg)
    if not family:
        fail("whisper 인지 moonshine 인지 알 수 없어요. --family 로 알려 주세요.")

    out = Path(a.out)
    if out.exists() and any(out.iterdir()):
        if not a.force:
            fail(f"결과 폴더가 이미 있어요: {out} (덮어쓰려면 --force)")
        shutil.rmtree(out)
    fp32 = out / "_fp32"
    fp32.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    src = a.model
    if is_dir and a.base_id:
        say(f"[1/4] 학습 결과의 가중치 + 기본 모델({a.base_id})의 설정·토크나이저를 모아요")
        src = str(stage_with_base(model_path, a.base_id, out / "_stage"))
    say(f"[1/4] fp32 ONNX 내보내기: {a.model} ({family})")
    export_fp32(src, fp32, a.opset)

    enc, dec = fp32 / "encoder_model.onnx", fp32 / "decoder_model_merged.onnx"
    if not enc.is_file() or not dec.is_file():
        fail(f"optimum 이 합친 디코더(decoder_model_merged.onnx)나 인코더를 만들지 못했어요. 만들어진 파일: {sorted(p.name for p in fp32.glob('*.onnx'))}")

    (out / "onnx").mkdir(exist_ok=True)
    say(f"[2/4] 8비트 양자화({a.weight_type}, per_channel={a.per_channel}, reduce_range={a.reduce_range})")
    quantize(enc, out / ENCODER_Q, a.weight_type, a.per_channel, a.reduce_range)
    quantize(dec, out / DECODER_Q, a.weight_type, a.per_channel, a.reduce_range)

    if a.fp16:
        say("[2/4] GPU용 fp16 변환")
        to_fp16(enc, out / ENCODER_F16)
        to_fp16(dec, out / DECODER_F16)

    say("[3/4] 설정·토크나이저·설명서·라이선스 복사")
    required, optional = expected_files(family, a.fp16)
    for name in required + optional:
        if name.startswith("onnx/"):
            continue
        for d in (fp32, Path(src) if Path(src).is_dir() else fp32):
            if (d / name).is_file():
                shutil.copy2(d / name, out / name)
                break
    miss = missing_files(out, family, a.fp16)
    if miss:
        fail(f"transformers.js 가 읽는 데 필요한 파일이 빠졌어요: {miss}")
    gen = json.loads((out / "generation_config.json").read_text(encoding="utf-8"))

    card = find_model_card(model_path) if is_dir else None
    if card:
        shutil.copy2(card, out / "MODEL_CARD.md")
    else:
        (out / "MODEL_CARD.md").write_text(plain_model_card(family, a.model, a.id), encoding="utf-8")
    (out / "LICENSE.txt").write_text(license_text(family), encoding="utf-8")

    if not a.keep_fp32:
        shutil.rmtree(fp32, ignore_errors=True)
    shutil.rmtree(out / "_stage", ignore_errors=True)

    say("[4/4] manifest.json")
    meta = {
        "id": a.id,
        "family": family,
        "source": a.model,
        "dtypes": dtypes_for(a.fp16),
        "quantization": {"weightType": a.weight_type, "perChannel": a.per_channel, "reduceRange": a.reduce_range},
        "language": gen.get("language"),
        "attribution": NIA if card else None,
        "exportedWith": versions(),
        "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    manifest = build_manifest(out, meta)
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    say(f"\n끝: {out} (전체 {manifest['totalMB']}MB, {time.time() - t0:.0f}초)")
    for f in manifest["files"]:
        say(f"  {f['bytes'] / 2**20:8.1f}MB  {f['path']}")
    say("다음: node scripts/asr-eval-onnx.mjs --model " + str(out) + " --eval work/eval.jsonl   (배포 형식 그대로 속도·정확도 재기)")


if __name__ == "__main__":
    main()
