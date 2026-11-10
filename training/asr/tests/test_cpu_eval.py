"""CPU 평가 도구: sherpa-whisper 파일 찾기, --max-minutes 부분 결과, check_env 종료 코드, download_models 목록."""
import json
import subprocess
import sys
from pathlib import Path

import pytest

ASR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ASR))

import cpuinfo  # noqa: E402
import evaluate  # noqa: E402


def _touch(p: Path) -> Path:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"x")
    return p


def test_split_spec_sherpa_whisper():
    assert evaluate.split_spec("sherpa-whisper:C:\\models\\w") == ("sherpa-whisper", "C:\\models\\w")
    assert evaluate.split_spec("sherpa:/x") == ("sherpa", "/x")
    assert "sherpa-whisper" in evaluate.BACKENDS


def test_find_whisper_files_prefers_int8(tmp_path):
    for n in ("small-encoder.int8.onnx", "small-decoder.int8.onnx", "small-encoder.onnx", "small-decoder.onnx", "small-tokens.txt"):
        _touch(tmp_path / "sub" / n)
    enc, dec, tok = evaluate.find_whisper_files(tmp_path)
    assert enc.name == "small-encoder.int8.onnx" and dec.name == "small-decoder.int8.onnx" and tok.name == "small-tokens.txt"


def test_find_whisper_files_missing(tmp_path):
    with pytest.raises(evaluate.Skip):
        evaluate.find_whisper_files(tmp_path / "없는폴더")
    _touch(tmp_path / "x-tokens.txt")
    with pytest.raises(evaluate.Skip):
        evaluate.find_whisper_files(tmp_path)


def _write_eval(tmp_path, n=5):
    work = tmp_path / "work"
    work.mkdir()
    rows = [{"id": f"u{i}", "audio": f"a{i}.wav", "text": "나는 학교에 갔어요", "seconds": 6.0, "grade": "초1", "noise": "clean", "speaker": "s"} for i in range(n)]
    (work / "eval.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")
    return work


def test_evaluate_skips_missing_sherpa_whisper_folder(tmp_path, capsys):
    work = _write_eval(tmp_path)
    evaluate.main(["--models", "sherpa-whisper:" + str(tmp_path / "nope"), "--work", str(work)])
    assert "건너뜀" in capsys.readouterr().out


def test_pace_eta_and_partial(capsys, monkeypatch):
    t = [0.0]
    monkeypatch.setattr(evaluate, "CLOCK", lambda: t[0])
    items = [{"seconds": 10.0}] * 100
    p = evaluate.Pace(items, max_minutes=1)
    stopped_at = None
    for i in range(100):
        t[0] += 10.0  # 한 개에 10초 걸렸다고 치자(RTF 1.0)
        if p.step(1, 10.0, 10.0):
            stopped_at = i + 1
            break
    out = capsys.readouterr().out
    assert stopped_at == 6  # 60초 상한 → 6개
    assert "전체 100개" in out and "약 17분" in out  # 1000초 = 16.7분
    assert "시간 상한" in out


def test_main_partial_result(tmp_path, capsys, monkeypatch):
    work = _write_eval(tmp_path, 8)
    t = [0.0]
    monkeypatch.setattr(evaluate, "CLOCK", lambda: t[0])

    def fake(spec, items, work_, a, device):
        pace = evaluate.Pace(items, a.max_minutes)
        hyps = []
        for it in items:
            t[0] += 60.0
            hyps.append(it["text"])
            if pace.step(1, it["seconds"], 30.0):
                break
        return hyps, 5.0, 1.0, "cpu"

    monkeypatch.setitem(evaluate.BACKENDS, "sherpa", fake)
    evaluate.main(["--models", "sherpa:/fake", "--work", str(work), "--max-minutes", "3", "--threads", "2"])
    out = capsys.readouterr().out
    assert "부분 결과" in out and "3*" in out
    res = json.loads(next(work.glob("eval_*.json")).read_text(encoding="utf-8"))
    assert res["partial"] is True and res["n_evaluated"] == 3 and res["n_total"] == 8 and res["all"]["n"] == 3
    assert res["sec_per_min_audio"] == 300.0 and res["all"]["cer"] == 0.0


def test_cpuinfo_sane():
    assert cpuinfo.default_threads() >= 1
    assert cpuinfo.logical_threads() >= cpuinfo.default_threads()
    assert isinstance(cpuinfo.cpu_name(), str)
    r = cpuinfo.ram_gb()
    assert r is None or (r[0] > 0 and r[1] >= 0)
    pk = cpuinfo.peak_rss_mb()
    assert pk is None or pk > 0


def test_check_env_passes_without_cuda():
    pytest.importorskip("sherpa_onnx")
    r = subprocess.run([sys.executable, str(ASR / "check_env.py")], capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "CPU" in r.stdout and "GFLOPS" in r.stdout


def test_download_models_list_and_unknown():
    import download_models as dm

    assert {"zipformer-ko-72m", "sensevoice", "whisper-tiny", "whisper-turbo"} <= set(dm.MODELS)
    assert dm.main(["--list"]) == 0
    assert dm.main(["없는모델"]) == 2
    calls = []
    import tempfile

    with tempfile.TemporaryDirectory() as d:
        dm.download("whisper-base", Path(d), downloader=lambda **kw: calls.append(kw))
        assert (Path(d) / "whisper-base").is_dir()
    assert calls[0]["repo_id"] == "csukuangfj/sherpa-onnx-whisper-base" and "*.int8.onnx" in calls[0]["allow_patterns"]
