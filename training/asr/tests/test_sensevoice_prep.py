"""sensevoice/prepare_funasr.py 와 export_sherpa.py 의 순수 함수 시험(torch·funasr·onnx 없이 돼요)."""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sensevoice"))

import export_sherpa as ex  # noqa: E402
import prepare_funasr as pf  # noqa: E402

OFFICIAL_KEYS = ["key", "text_language", "emo_target", "event_target", "with_or_wo_itn", "target", "source", "target_len", "source_len"]


def make_wav(path: Path, seconds: float, sr: int = 16000) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    t = np.arange(int(sr * seconds)) / sr
    sf.write(str(path), (0.1 * np.sin(2 * np.pi * 220 * t)).astype("float32"), sr, subtype="PCM_16")


def test_source_len_matches_official_formula():
    assert pf.source_len_from_samples(16000) == 100          # 1초 = 100프레임
    assert pf.source_len_from_samples(16000 * 14) == 1400
    assert pf.source_len_from_samples(160) == 1
    assert pf.source_len_from_samples(159) == 0              # 소수점 버림
    assert pf.source_len_from_samples(24000, 24000) == 100   # 16kHz 환산


def test_target_len_official_quirk():
    assert pf.target_len_of("나는학교에갔어요") == 8         # 띄어쓰기 없으면 글자 수
    assert pf.target_len_of("나는 학교에 갔어요") == 3       # 있으면 어절 수(공식 동작)


def test_itn_tag():
    assert pf.with_or_wo_itn("나는 학교에 갔어요") == "<|woitn|>"
    assert pf.with_or_wo_itn("나는 학교에 갔어요.") == "<|withitn|>"
    assert pf.with_or_wo_itn("정말？") == "<|withitn|>"


def test_build_record_fields_and_order():
    r = pf.build_record("k1", "/abs/a.wav", "비가 와요", 32000)
    assert list(r) == OFFICIAL_KEYS
    assert r["text_language"] == "<|ko|>" and r["emo_target"] == "<|NEUTRAL|>" and r["event_target"] == "<|Speech|>"
    assert r["target"] == "비가 와요" and r["target_len"] == 2 and r["source_len"] == 200 and r["source"] == "/abs/a.wav"


def test_convert_items_paths_lengths_and_skips(tmp_path):
    make_wav(tmp_path / "audio/a.wav", 2.0)
    make_wav(tmp_path / "audio/short.wav", 0.3)
    items = [
        {"id": "a", "audio": "audio/a.wav", "text": "나는 오늘 학교에 갔어요", "speaker": "S1", "grade": "1"},
        {"id": "s", "audio": "audio/short.wav", "text": "네", "speaker": "S2"},
        {"id": "m", "audio": "audio/none.wav", "text": "없는 파일", "speaker": "S3"},
        {"id": "e", "audio": "audio/a.wav", "text": "  ", "speaker": "S4"},
    ]
    rows, st = pf.convert_items(items, tmp_path)
    assert [r["key"] for r in rows] == ["a", "s"]
    assert Path(rows[0]["source"]).is_absolute() and rows[0]["source"] == str((tmp_path / "audio/a.wav").resolve())
    assert rows[0]["source_len"] == 200 and rows[0]["target_len"] == 4
    assert st["missing_wav"] == 1 and st["empty_text"] == 1 and st["short"] == 1 and st["out"] == 2
    # 화자·학년 같은 개인 관련 칸은 출력에 없어야 해요
    assert not ({"speaker", "grade", "noise"} & set(rows[0]))


def test_speaker_split_is_stable_and_by_speaker():
    items = [{"id": f"{s}-{i}", "speaker": s} for s in (f"S{n}" for n in range(200)) for i in range(3)]
    tr, va = pf.split_train_val(items, 0.1)
    assert len(tr) + len(va) == len(items) and va
    assert 0.03 < len(va) / len(items) < 0.2
    assert {x["speaker"] for x in tr}.isdisjoint({x["speaker"] for x in va})
    tr2, va2 = pf.split_train_val(items, 0.1)
    assert [x["id"] for x in va] == [x["id"] for x in va2]
    assert pf.split_train_val(items, 0)[1] == []


def test_main_writes_files(tmp_path):
    work = tmp_path / "work"
    rows = []
    for n in range(40):
        make_wav(work / f"audio/{n}.wav", 1.0)
        rows.append({"id": f"u{n}", "audio": f"audio/{n}.wav", "text": "토끼가 숲에서 놀았어요", "speaker": f"S{n}"})
    (work / "train.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")
    assert pf.main(["--work", str(work), "--out", str(tmp_path / "o"), "--val-fraction", "0.3"]) == 0
    tr = [json.loads(x) for x in (tmp_path / "o/train.jsonl").read_text(encoding="utf-8").splitlines()]
    va = [json.loads(x) for x in (tmp_path / "o/val.jsonl").read_text(encoding="utf-8").splitlines()]
    assert len(tr) + len(va) == 40 and tr and va
    assert list(tr[0]) == OFFICIAL_KEYS
    assert (tmp_path / "o/stats.json").exists()


# ------------------------------------------------------------------ export 순수 부분

AM_MVN = """<Nnet>
<Splice> 560 560
[ 0 1 ]
<AddShift> 560 560
<LearnRateCoef> 0 [ -1.5 -2.5 -3.5 ]
<Rescale> 560 560
<LearnRateCoef> 0 [ 0.5 0.25 0.125 ]
</Nnet>
"""


def test_load_cmvn_text_matches_official_rule():
    neg, inv = ex.load_cmvn_text(AM_MVN)
    assert neg == "-1.5,-2.5,-3.5" and inv == "0.5,0.25,0.125"


def test_load_cmvn_text_rejects_incomplete():
    try:
        ex.load_cmvn_text("<LearnRateCoef> 0 [ 1 2 ]\n")
    except ValueError:
        return
    raise AssertionError("두 줄이 아니면 오류여야 해요")


def test_build_meta_data_keys_and_values():
    lid = {"auto": 0, "zh": 3, "en": 4, "yue": 7, "ja": 11, "ko": 12, "nospeech": 13}
    tn = {"withitn": 14, "woitn": 15}
    m = ex.build_meta_data(7, 6, "a,b", "c,d", 25055, lid, tn)
    assert m["lfr_window_size"] == 7 and m["lfr_window_shift"] == 6
    assert m["normalize_samples"] == 0 and m["model_type"] == "sense_voice_ctc" and m["version"] == "2"
    assert m["neg_mean"] == "a,b" and m["inv_stddev"] == "c,d" and m["vocab_size"] == 25055
    assert m["lang_ko"] == 12 and m["lang_auto"] == 0 and m["lang_nospeech"] == 13
    assert m["with_itn"] == 14 and m["without_itn"] == 15
    official = {"lfr_window_size", "lfr_window_shift", "normalize_samples", "neg_mean", "inv_stddev", "model_type", "version",
                "model_author", "maintainer", "vocab_size", "comment", "lang_auto", "lang_zh", "lang_en", "lang_yue", "lang_ja",
                "lang_ko", "lang_nospeech", "with_itn", "without_itn", "url"}
    assert set(m) == official


def test_tokens_text():
    assert ex.tokens_text(["<unk>", "▁가", "나"]) == "<unk> 0\n▁가 1\n나 2\n"


def test_model_card_has_license_name_and_attribution():
    card = ex.build_model_card("narae-test", {"lr": "0.0001"})
    assert "SenseVoiceSmall by FunASR/FunAudioLLM" in card
    assert "FunASR Model Open Source License Agreement v1.1" in card
    assert "한국지능정보사회진흥원(NIA)" in card and "한국어 아동 음성 데이터" in card
    assert "들어 있지 않아요" in card and "- lr: 0.0001" in card


def test_manifest_sizes_and_sha(tmp_path):
    (tmp_path / "model.int8.onnx").write_bytes(b"abc")
    (tmp_path / "manifest.json").write_text("old", encoding="utf-8")
    m = ex.build_manifest(tmp_path, {"attribution": "x"})
    assert [f["path"] for f in m["files"]] == ["model.int8.onnx"]
    f = m["files"][0]
    assert f["bytes"] == 3 and f["sha256"] == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    assert m["attribution"] == "x"


def test_stage_model_dir(tmp_path):
    base = tmp_path / "base"
    base.mkdir()
    for f in ex.BASE_FILES:
        (base / f).write_text(f, encoding="utf-8")
    (base / "model.pt").write_text("old", encoding="utf-8")
    ck = tmp_path / "ck.pt"
    ck.write_text("new", encoding="utf-8")
    st = ex.stage_model_dir(base, ck, tmp_path / "stage")
    assert (st / "model.pt").read_text(encoding="utf-8") == "new" and (st / "am.mvn").exists()
    (base / "am.mvn").unlink()
    try:
        ex.stage_model_dir(base, ck, tmp_path / "stage2")
    except FileNotFoundError:
        return
    raise AssertionError("설정 파일이 없으면 오류여야 해요")
