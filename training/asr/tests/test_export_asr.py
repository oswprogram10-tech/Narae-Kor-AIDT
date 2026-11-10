"""export_asr.py 의 순수 함수 시험(optimum·onnxruntime 없이 돼요)."""
import hashlib
import json

import export_asr as e


def test_detect_family():
    assert e.detect_family("openai/whisper-base") == "whisper"
    assert e.detect_family("moonshine-ai/moonshine-base-ko") == "moonshine"
    assert e.detect_family("work/runs/x/final", {"model_type": "moonshine"}) == "moonshine"
    assert e.detect_family("work/runs/x/final", {"model_type": "whisper"}) == "whisper"
    assert e.detect_family("work/runs/x/final") == ""


def test_expected_files_use_same_onnx_names_for_both_families():
    for fam in ("whisper", "moonshine"):
        req, _ = e.expected_files(fam)
        assert "onnx/encoder_model_quantized.onnx" in req
        assert "onnx/decoder_model_merged_quantized.onnx" in req
        assert "config.json" in req and "generation_config.json" in req and "preprocessor_config.json" in req
    assert "vocab.json" in e.expected_files("whisper")[1]
    assert "vocab.json" not in e.expected_files("moonshine")[1]


def test_manifest_has_size_and_sha256_and_skips_itself(tmp_path):
    (tmp_path / "onnx").mkdir()
    (tmp_path / "onnx" / "a.onnx").write_bytes(b"abc")
    (tmp_path / "config.json").write_text("{}", encoding="utf-8")
    (tmp_path / "manifest.json").write_text("old", encoding="utf-8")
    m = e.build_manifest(tmp_path, {"id": "x"})
    paths = [f["path"] for f in m["files"]]
    assert paths == ["config.json", "onnx/a.onnx"]
    f = next(f for f in m["files"] if f["path"] == "onnx/a.onnx")
    assert f["bytes"] == 3 and f["sha256"] == hashlib.sha256(b"abc").hexdigest()
    assert m["totalBytes"] == 5 and m["id"] == "x"
    json.dumps(m)


def test_missing_files(tmp_path):
    assert "onnx/encoder_model_quantized.onnx" in e.missing_files(tmp_path, "whisper")
    for r in e.expected_files("whisper")[0]:
        (tmp_path / r).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / r).write_text("x")
    assert e.missing_files(tmp_path, "whisper") == []


def test_license_and_cards():
    assert "MIT License" in e.license_text("whisper") and "OpenAI" in e.license_text("whisper")
    assert "비상업" in e.license_text("moonshine")
    card = e.plain_model_card("moonshine", "moonshine-ai/moonshine-base-ko", None)
    assert "비상업" in card and "미세 조정하지 않았어요" in card
    assert "MIT" in e.plain_model_card("whisper", "openai/whisper-base", "narae-asr-lite")


def test_find_model_card_prefers_run_folder(tmp_path):
    run = tmp_path / "base"
    (run / "final").mkdir(parents=True)
    assert e.find_model_card(run / "final") is None
    (run / "MODEL_CARD.md").write_text("card", encoding="utf-8")
    assert e.find_model_card(run / "final") == run / "MODEL_CARD.md"


def test_fp16_files_are_extra_required_files():
    assert "onnx/encoder_model_fp16.onnx" not in e.expected_files("whisper")[0]
    req = e.expected_files("whisper", fp16=True)[0]
    assert "onnx/encoder_model_fp16.onnx" in req and "onnx/decoder_model_merged_fp16.onnx" in req
    assert e.dtypes_for(False) == ["q8"] and e.dtypes_for(True) == ["q8", "fp16"]
