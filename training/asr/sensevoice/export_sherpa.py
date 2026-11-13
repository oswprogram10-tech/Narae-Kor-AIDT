"""미세 조정한 SenseVoiceSmall 체크포인트 → sherpa-onnx 용 model.onnx / model.int8.onnx + tokens.txt (+ MODEL_CARD.md, manifest.json).

    python export_sherpa.py --base-model-dir models/SenseVoiceSmall \\
        --checkpoint outputs/model.pt.best --out export/narae-sensevoice-ko-child
    python ../evaluate.py --models sensevoice:export/narae-sensevoice-ko-child     # 같은 평가

내보내는 방식은 sherpa-onnx 저장소의 scripts/sense-voice/export-onnx.py (k2-fsa/sherpa-onnx master)를 직접 읽고 맞췄어요.
  - 입력 4개 x(N,T,560 float32) · x_length(N int32) · language(N int32) · text_norm(N int32), 출력 logits(N,T',vocab)
  - forward: [language, event_emo(1,2), text_norm, x] 를 이어 붙이고(x_length += 4) encoder → ctc_lo
  - opset 13, 동적 축 N·T, 메타데이터(lfr_window_size/shift, normalize_samples=0, neg_mean/inv_stddev(am.mvn), model_type=sense_voice_ctc,
    version=2, vocab_size, lang_*, with_itn/without_itn, url …), int8 = quantize_dynamic(MatMul, QUInt8)  ← QInt8 은 C++ onnxruntime 에서 틀린 결과가 나와서 QUInt8 이래요(공식 주석)
  - tokens.txt = 토크나이저(sentencepiece) 조각을 "조각 번호" 한 줄씩
공식 스크립트와 다른 점(의도적): 파일을 현재 폴더가 아니라 --out 에 쓰고, 공식의 os.system("cat …") 출력은 뺐고, 체크포인트를 받을 수 있게 학습 폴더에서
config.yaml·am.mvn·bpe 모델은 --base-model-dir(내려받은 FunAudioLLM/SenseVoiceSmall) 것을 쓰고 model.pt 만 --checkpoint 로 바꿔 끼워요(어휘·특징 추출은 미세 조정으로 안 바뀌어요).

확인하지 못한 것(이 환경에 torch·funasr·onnx 가 없어서 실제로 돌려 보지 못했어요): funasr==1.4.14 의 `funasr.models.sense_voice.model.SenseVoiceSmall.from_pretrained` 가
로컬 폴더(config.yaml+configuration.json+model.pt)를 읽는 경로, torch>=2.9 에서 torch.onnx.export 의 dynamo 기본값(아래에서 dynamo=False 를 시도하고, 지원 안 하면 인자 없이 호출).
순수 함수(메타데이터·tokens·manifest·모델 카드)는 tests/test_sensevoice_prep.py 가 시험해요.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

ORIG_MODEL = "iic/SenseVoiceSmall"
HF_URL = "https://huggingface.co/FunAudioLLM/SenseVoiceSmall"
NIA = "한국지능정보사회진흥원(NIA) 「한국어 아동 음성 데이터」 사업 결과를 활용"
OPSET = 13
BASE_FILES = ("config.yaml", "configuration.json", "am.mvn", "chn_jpn_yue_eng_ko_spectok.bpe.model")


# --------------------------------------------------------------- 순수 함수(torch 없이 시험)

def load_cmvn_text(text: str) -> tuple[str, str]:
    """am.mvn 글에서 (neg_mean, inv_stddev) 를 쉼표로 이은 문자열로. 공식 load_cmvn 과 같은 규칙:
    '<LearnRateCoef>' 로 시작하는 줄의 split()[3:-1], 첫 줄이 neg_mean 두 번째 줄이 inv_stddev."""
    neg_mean = None
    inv_stddev = None
    for line in text.splitlines():
        if not line.startswith("<LearnRateCoef>"):
            continue
        t = line.split()[3:-1]
        if neg_mean is None:
            neg_mean = ",".join(t)
        else:
            inv_stddev = ",".join(t)
    if neg_mean is None or inv_stddev is None:
        raise ValueError("am.mvn 에서 neg_mean/inv_stddev 두 줄을 못 찾았어요.")
    return neg_mean, inv_stddev


def build_meta_data(lfr_m: int, lfr_n: int, neg_mean: str, inv_stddev: str, vocab_size: int,
                    lid_dict: dict, textnorm_dict: dict) -> dict:
    """sherpa-onnx SenseVoice 모델 메타데이터(공식 export-onnx.py 와 같은 키). 값은 ONNX 에 str 로 저장돼요."""
    return {
        "lfr_window_size": lfr_m,
        "lfr_window_shift": lfr_n,
        "normalize_samples": 0,  # 입력은 [-32768, 32767] 범위(공식 주석)
        "neg_mean": neg_mean,
        "inv_stddev": inv_stddev,
        "model_type": "sense_voice_ctc",
        # version 1: QInt8, version 2: QUInt8 (공식 주석)
        "version": "2",
        "model_author": "iic",
        "maintainer": "k2-fsa",
        "vocab_size": vocab_size,
        "comment": "fine-tuned from iic/SenseVoiceSmall (SenseVoiceSmall by FunASR/FunAudioLLM)",
        "lang_auto": lid_dict["auto"],
        "lang_zh": lid_dict["zh"],
        "lang_en": lid_dict["en"],
        "lang_yue": lid_dict["yue"],  # 광둥어
        "lang_ja": lid_dict["ja"],
        "lang_ko": lid_dict["ko"],
        "lang_nospeech": lid_dict["nospeech"],
        "with_itn": textnorm_dict["withitn"],
        "without_itn": textnorm_dict["woitn"],
        "url": HF_URL,
    }


def tokens_text(pieces: list[str]) -> str:
    """tokens.txt 내용: 공식 generate_tokens 와 같이 '조각 번호' 한 줄씩."""
    return "".join(f"{p} {i}\n" for i, p in enumerate(pieces))


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def build_manifest(folder: Path, extra: dict | None = None) -> dict:
    """폴더 안 모든 파일의 크기·sha256(manifest.json 자신은 뺌)."""
    files = []
    for p in sorted(folder.rglob("*")):
        if p.is_file() and p.name != "manifest.json":
            files.append({"path": p.relative_to(folder).as_posix(), "bytes": p.stat().st_size, "sha256": sha256_file(p)})
    m = {"format": "sherpa-onnx sense-voice", "files": files}
    if extra:
        m.update(extra)
    return m


def build_model_card(name: str, info: dict) -> str:
    """MODEL_CARD.md. 라이선스 문구·원본 모델 이름·NIA 출처를 반드시 넣어요(학습 데이터는 넣지 않아요)."""
    lines = [
        f"# {name}",
        "",
        "아동 낭독(초등) 한국어 음성 인식용으로 **SenseVoiceSmall by FunASR/FunAudioLLM** (`iic/SenseVoiceSmall`)을 미세 조정한 모델이에요. "
        "sherpa-onnx 용 ONNX(`model.onnx`, `model.int8.onnx`)와 `tokens.txt` 로 내보냈어요.",
        "",
        "## 출처 표시",
        f"- {NIA}해서 만들었어요(한국지능정보사회진흥원 AI Hub).",
        f"- 원본 모델: SenseVoiceSmall by FunASR/FunAudioLLM — {HF_URL}",
        "",
        "## 라이선스",
        "- 원본 SenseVoiceSmall 가중치는 FunASR Model Open Source License Agreement v1.1 을 따라요"
        "(https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE). 사용·수정·공유가 자유롭고, "
        "**출처와 모델 이름(SenseVoiceSmall by FunASR/FunAudioLLM)을 표시해야 해요**. 미세 조정한 가중치는 비공개로 둘 수 있어요.",
        "- 상업적 사용은 공식 확정 전이에요. 연구·교육 목적의 비상업 사용 범위에서 써요.",
        "",
        "## 학습 데이터",
        "- 학습 데이터(음성·전사)는 이 폴더에 **들어 있지 않아요**. AI Hub 약관(국외 반출·제3자 제공 금지)에 따라 국내 서버에서만 처리했고, 학습 뒤 삭제했어요.",
        "",
        "## 학습·내보내기 정보",
    ]
    for k, v in info.items():
        lines.append(f"- {k}: {v}")
    lines += [
        "",
        "## 쓰는 법",
        "- sherpa-onnx 의 SenseVoice 오프라인 인식기: `model=model.int8.onnx`, `tokens=tokens.txt`, 언어 `ko`.",
        "- 평가: `python ../evaluate.py --models sensevoice:<이 폴더>`",
        "",
    ]
    return "\n".join(lines)


# --------------------------------------------------------------- torch 가 필요한 부분

def stage_model_dir(base_dir: Path, checkpoint: Path, stage: Path) -> Path:
    """base 폴더의 설정 파일 + 체크포인트(model.pt)로 funasr 가 읽을 수 있는 폴더를 만든다."""
    missing = [f for f in BASE_FILES if not (base_dir / f).exists()]
    if missing:
        raise FileNotFoundError(f"--base-model-dir 에 {missing} 가 없어요(FunAudioLLM/SenseVoiceSmall 을 통째로 내려받은 폴더여야 해요).")
    stage.mkdir(parents=True, exist_ok=True)
    for f in BASE_FILES:
        shutil.copy2(base_dir / f, stage / f)
    shutil.copy2(checkpoint, stage / "model.pt")
    return stage


def _add_meta_data(filename: str, meta_data: dict) -> None:
    import onnx

    model = onnx.load(filename)
    while len(model.metadata_props):
        model.metadata_props.pop()
    for key, value in meta_data.items():
        meta = model.metadata_props.add()
        meta.key = key
        meta.value = str(value)
    onnx.save(model, filename)


def export(stage: Path, out: Path) -> dict:
    import torch
    from funasr.models.sense_voice.model import SenseVoiceSmall  # 공식 스크립트는 SenseVoice 저장소의 model.py 를 씀(같은 클래스)
    from onnxruntime.quantization import QuantType, quantize_dynamic

    def modified_forward(self, x, x_length, language, text_norm):
        # sherpa-onnx scripts/sense-voice/export-onnx.py 의 modified_forward 와 같아요
        language_query = self.embed(language).unsqueeze(1)
        text_norm_query = self.embed(text_norm).unsqueeze(1)
        event_emo_query = self.embed(torch.LongTensor([[1, 2]])).repeat(x.size(0), 1, 1)
        x = torch.cat((language_query, event_emo_query, text_norm_query, x), dim=1)
        x_length += 4
        encoder_out, encoder_out_lens = self.encoder(x, x_length)
        if isinstance(encoder_out, tuple):
            encoder_out = encoder_out[0]
        return self.ctc.ctc_lo(encoder_out)

    out.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(20240717)
    with torch.no_grad():
        model, params = SenseVoiceSmall.from_pretrained(model=str(stage), device="cpu")
        model.eval()
        sp = params["tokenizer"].sp
        vocab_size = sp.vocab_size()
        (out / "tokens.txt").write_text(tokens_text([sp.id_to_piece(i) for i in range(vocab_size)]), encoding="utf-8")

        model.__class__.forward = modified_forward
        x = torch.randn(2, 100, 560, dtype=torch.float32)
        x_length = torch.tensor([80, 100], dtype=torch.int32)
        language = torch.tensor([0, 3], dtype=torch.int32)
        text_norm = torch.tensor([14, 15], dtype=torch.int32)
        fp32 = out / "model.onnx"
        kw = dict(
            opset_version=OPSET,
            input_names=["x", "x_length", "language", "text_norm"],
            output_names=["logits"],
            dynamic_axes={"x": {0: "N", 1: "T"}, "x_length": {0: "N"}, "language": {0: "N"}, "text_norm": {0: "N"}, "logits": {0: "N", 1: "T"}},
        )
        try:
            torch.onnx.export(model, (x, x_length, language, text_norm), str(fp32), dynamo=False, **kw)
        except TypeError:  # 옛 torch 는 dynamo 인자가 없어요(그때는 원래 기존 방식)
            torch.onnx.export(model, (x, x_length, language, text_norm), str(fp32), **kw)

        neg_mean, inv_stddev = load_cmvn_text((stage / "am.mvn").read_text(encoding="utf-8"))
        meta = build_meta_data(params["frontend_conf"]["lfr_m"], params["frontend_conf"]["lfr_n"], neg_mean, inv_stddev,
                               vocab_size, model.lid_dict, model.textnorm_dict)
    _add_meta_data(str(fp32), meta)
    quantize_dynamic(model_input=str(fp32), model_output=str(out / "model.int8.onnx"),
                     op_types_to_quantize=["MatMul"], weight_type=QuantType.QUInt8)  # QUInt8 필수(공식 주석)
    return meta


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--base-model-dir", required=True, help="내려받은 FunAudioLLM/SenseVoiceSmall 폴더(config.yaml, am.mvn, bpe 모델 필요)")
    ap.add_argument("--checkpoint", required=True, help="학습 결과 체크포인트(예: outputs/model.pt.best 또는 outputs/model.pt.avg5)")
    ap.add_argument("--out", required=True, help="내보낼 폴더")
    ap.add_argument("--name", default="narae-sensevoice-ko-child", help="모델 설명서에 쓸 이름")
    ap.add_argument("--note", action="append", default=[], help="설명서에 넣을 학습 정보 한 줄(예: 'lr=1e-4'), 여러 번 가능")
    ap.add_argument("--drop-fp32", action="store_true", help="model.onnx(fp32)를 지워요(앱에는 int8 만 쓰면 돼요)")
    a = ap.parse_args(argv)

    base, ckpt, out = Path(a.base_model_dir), Path(a.checkpoint), Path(a.out)
    if not ckpt.exists():
        sys.exit(f"체크포인트가 없어요: {ckpt}")
    stage = stage_model_dir(base, ckpt, out.parent / (out.name + ".stage"))
    try:
        export(stage, out)
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    if a.drop_fp32 and (out / "model.onnx").exists():
        (out / "model.onnx").unlink()
    info = {"원본": ORIG_MODEL, "체크포인트": ckpt.name, "opset": OPSET, "int8": "quantize_dynamic(MatMul, QUInt8)"}
    for n in a.note:
        k, _, v = n.partition("=")
        info[k.strip()] = v.strip() or "-"
    (out / "MODEL_CARD.md").write_text(build_model_card(a.name, info), encoding="utf-8")
    (out / "manifest.json").write_text(json.dumps(build_manifest(out, {"attribution": NIA}), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"내보냈어요: {out}  (평가: python ../evaluate.py --models sensevoice:{out})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
