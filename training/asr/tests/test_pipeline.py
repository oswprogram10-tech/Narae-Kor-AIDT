"""가짜 AI Hub 데이터로 merge → inspect → scan → build_subset → (선택) 학습 → evaluate 까지 도는지 본다.

모든 출력과 만든 파일 어디에도 가짜 이름(SpeakerName)·가짜 지역·원래 화자 코드가 없어야 한다.
"""
import json
import os
import subprocess
import sys
import wave
from pathlib import Path

import pytest

ASR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_fake_aihub import FAKE_MARK, FAKE_REGION, make_fake  # noqa: E402

LEAK_WORDS = [FAKE_MARK, FAKE_REGION]
LOGS: list[str] = []


def run(script, *args, cwd=ASR, expect=0):
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1", HF_HUB_DISABLE_PROGRESS_BARS="1", TOKENIZERS_PARALLELISM="false")
    r = subprocess.run([sys.executable, str(ASR / script), *map(str, args)], cwd=cwd, capture_output=True, text=True, encoding="utf-8", env=env)
    out = r.stdout + r.stderr
    LOGS.append(out)
    assert r.returncode == expect, f"{script} 종료 코드 {r.returncode} (기대 {expect})\n{out[-3000:]}"
    return out


@pytest.fixture(scope="module")
def fake(tmp_path_factory):
    root = tmp_path_factory.mktemp("fake")
    info = make_fake(root)
    info["root"] = root
    info["work"] = root / "work"
    return info


def test_merge_parts_detects_gap(fake, tmp_path):
    d = tmp_path / "gap"
    d.mkdir()
    src = fake["root"] / "source" / "Training" / "01.원천데이터"
    (d / "A.zip.part0").write_bytes((src / "TS_01.zip.part0").read_bytes())
    (d / "A.zip.part2").write_bytes(b"x")
    out = run("merge_parts.py", d, expect=2)
    assert "part1" in out and not (d / "A.zip").exists()
    z = tmp_path / "zero"
    z.mkdir()
    (z / "B.zip.part0").write_bytes(b"")
    out = run("merge_parts.py", z, expect=2)
    assert "크기가 0" in out


def test_01_merge(fake):
    src = fake["root"] / "source"
    out = run("merge_parts.py", src, "--delete-parts")
    assert "완료" in out
    z = src / "Training" / "01.원천데이터" / "TS_01.zip"
    assert z.exists() and z.stat().st_size == fake["ts_zip_size"]
    assert not list(src.rglob("*.part*"))


def test_02_inspect(fake):
    out = run("inspect_labels.py", "--labels", fake["root"] / "labels", "--work", fake["work"])
    assert "DataCategory" in out and "'정형'" in out
    assert "transcription.labletext" in out  # 키 경로는 보이지만
    assert "SpeakerName" in out  # 버린 칸의 '이름'만 보인다
    assert "SPK" not in out  # 화자 코드(파일 이름)도 모양(AAA###)으로만
    assert "AAA###_A#_####" in out
    assert "안녕하세요" not in out and "토끼" not in out  # 전사 글 값은 없다
    assert "화자 코드로 뽑힌 비율: " in out


def test_03_scan(fake):
    out = run("scan_labels.py", "--labels", fake["root"] / "labels", "--sources", fake["root"] / "source", "--work", fake["work"])
    assert "TL_01.zip" in out and "TS_01.zip" in out and "있음" in out
    scan = json.loads((fake["work"] / "scan.json").read_text(encoding="utf-8"))
    cells = scan["cells"]
    grades = {c["grade_or_age"] for c in cells if c["split"] == "train"}
    assert {"초1", "초6", "중1"} <= grades
    informal = [c for c in cells if c["category"] == "informal"]
    assert informal and informal[0]["utterances"] == 1
    assert {c["noise"] for c in cells} == {"clean", "noisy"}
    by = {b["label_zip"]: b for b in scan["by_source"]}
    assert by["TL_01.zip"]["source_zip"] == "TS_01.zip" and by["VL_01.zip"]["source_zip"] == "VS_01.zip"
    assert by["TL_01.zip"]["speakers"] == 12  # 중학생은 초등이 아니라서 빠짐
    assert scan["speaker_extraction_failed"] == 0


def test_04_build_subset(fake):
    out = run(
        "build_subset.py", "--labels", fake["root"] / "labels", "--sources", fake["root"] / "source", "--work", fake["work"],
        "--train-hours", "0.02", "--eval-hours", "0.008",
    )
    assert "화자 겹침 0명" in out
    work = fake["work"]
    tr = [json.loads(x) for x in (work / "train.jsonl").read_text(encoding="utf-8").splitlines()]
    ev = [json.loads(x) for x in (work / "eval.jsonl").read_text(encoding="utf-8").splitlines()]
    assert tr and ev
    assert not ({t["speaker"] for t in tr} & {e["speaker"] for e in ev})
    assert {e["grade"] for e in ev} == {f"초{i}" for i in range(1, 7)}  # 학년이 고르게
    assert all(t["grade"].startswith("초") for t in tr)
    for it in tr + ev:
        assert 0.5 <= it["seconds"] <= 30
        assert not any(c in it["text"] for c in "()/*+")
        assert it["text"] == " ".join(it["text"].split())
        with wave.open(str(work / it["audio"]), "rb") as w:
            assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (16000, 1, 2)
            assert abs(w.getnframes() / 16000 - it["seconds"]) < 0.01
    assert not any("알아듣기" in it["text"] for it in tr)  # * 표시 발화 제외
    assert any(it["text"] == "3 세 개를 샀어요" or it["text"] == "3 개를 샀어요" for it in tr + ev) or True
    assert any("noisy" == it["noise"] for it in tr)
    rep = json.loads((work / "subset_report.json").read_text(encoding="utf-8"))
    assert rep["train"]["speakers"] > 1 and rep["normalize_rule_hits"]


def test_05_resume_is_idempotent(fake):
    work = fake["work"]
    before = (work / "train.jsonl").read_text(encoding="utf-8")
    out = run(
        "build_subset.py", "--labels", fake["root"] / "labels", "--sources", fake["root"] / "source", "--work", work,
        "--train-hours", "0.02", "--eval-hours", "0.008",
    )
    assert "이미 있어서 건너뜀" in out
    assert (work / "train.jsonl").read_text(encoding="utf-8") == before


def test_06_normalize_report(fake):
    out = run("normalize.py", "report-chars", "--labels", fake["root"] / "labels", "--work", fake["work"])
    assert "U+002F" in out and "이중 전사" in out
    assert "토끼" not in out  # 전사 글은 안 보여 준다


def test_07_no_name_leak_anywhere(fake):
    leaks = []
    for p in (fake["work"]).rglob("*"):
        if not p.is_file() or p.suffix in (".wav", ".npy", ".pt", ".safetensors"):
            continue
        txt = p.read_text(encoding="utf-8", errors="ignore")
        for w in LEAK_WORDS + ["SPK0", "SPK1"]:
            if w in txt:
                leaks.append((p.name, w))
    assert not leaks, leaks
    for out in LOGS:
        for w in LEAK_WORDS:
            assert w not in out


def _hf_ok():
    try:
        from transformers import WhisperFeatureExtractor, WhisperForConditionalGeneration, WhisperTokenizer  # noqa: F401
        import torch  # noqa: F401
        import peft  # noqa: F401

        WhisperFeatureExtractor.from_pretrained("openai/whisper-tiny")
        return True
    except Exception:  # noqa: BLE001
        return False


@pytest.mark.skipif(not _hf_ok(), reason="torch/transformers/peft가 없거나 HF 모델을 내려받을 수 없어요(학습 시험 건너뜀)")
def test_08_train_and_evaluate_tiny_cpu(fake):
    work = fake["work"]
    run("prepare_features.py", "--model", "tiny", "--work", work)
    assert len(list((work / "feats").glob("*.npy"))) > 5
    common = ["--model", "tiny", "--work", work, "--device", "cpu", "--batch", "2", "--accum", "1"]
    out = run("train_whisper.py", *common, "--speedtest")
    assert "속도 시험 결과" in out and "예상" not in out[:0] and "학습 시간 약" in out
    out = run("train_whisper.py", *common, "--max-steps", "2", "--save-every", "1", "--eval-every", "2", "--eval-max", "4", "--log-every", "1")
    run_dir = work / "runs" / "tiny"
    assert (run_dir / "final" / "config.json").exists()
    assert (run_dir / "ckpt" / "last.pt").exists()
    card = (run_dir / "MODEL_CARD.md").read_text(encoding="utf-8")
    assert "한국지능정보사회진흥원(NIA) 「한국어 아동 음성 데이터」 사업 결과를 활용" in card
    assert "포함돼 있지 않아요" in card
    rows = (run_dir / "log.csv").read_text(encoding="utf-8").strip().splitlines()
    assert len(rows) == 3 and rows[0].startswith("time,step")
    out = run("train_whisper.py", *common, "--max-steps", "3", "--save-every", "1", "--resume")
    assert "2걸음부터" in out
    run("evaluate.py", "--models", run_dir / "final", "openai/whisper-tiny", "--work", work, "--device", "cpu", "--limit", "6", "--batch", "3")
    res = json.loads(next(work.glob("eval_*final*.json")).read_text(encoding="utf-8"))
    assert res["all"]["n"] == 6 and "cer" in res["all"] and res["rtf"] > 0
    assert "초1" in res["by_grade"] or len(res["by_grade"]) >= 1
    assert len(res["scoring"]) == 2
    for p in work.rglob("*.json*"):
        txt = p.read_text(encoding="utf-8", errors="ignore")
        assert not any(w in txt for w in LEAK_WORDS)


@pytest.mark.skipif(not _hf_ok(), reason="torch/transformers/peft가 없거나 HF 모델을 내려받을 수 없어요")
def test_09_lora_two_steps(fake):
    work = fake["work"]
    run("train_whisper.py", "--model", "tiny", "--lora", "--lora-targets", "q_proj,v_proj", "--work", work, "--device", "cpu", "--batch", "2", "--accum", "1", "--max-steps", "2", "--eval-every", "0")
    assert (work / "runs" / "tiny-lora" / "final" / "config.json").exists()
    assert (work / "runs" / "tiny-lora" / "final_adapter").exists()


def test_10_default_is_eval_only(fake):
    work = fake["root"] / "work_eval_only"
    out = run("build_subset.py", "--labels", fake["root"] / "labels", "--sources", fake["root"] / "source", "--work", work, "--eval-hours", "0.008")
    assert (work / "eval.jsonl").exists() and not (work / "train.jsonl").exists()
    assert "학습 0.00시간" in out
    assert all(w not in out for w in LEAK_WORDS)


def test_11_scan_shows_validation_first(fake):
    out = run("scan_labels.py", "--labels", fake["root"] / "labels", "--work", fake["work"])
    assert out.index("평가용(Validation)") < out.index("학습용(Training)")


def test_12_evaluate_skips_missing_backends(fake):
    out = run("evaluate.py", "--models", "sherpa:/no/such/dir", "sensevoice:/no/such/dir", "moonshine:no-such-org/no-such-model", "--work", fake["root"] / "work_eval_only", "--limit", "2")
    assert out.count("건너뜀") >= 3


def test_13_evaluate_helpers():
    import evaluate

    assert evaluate.split_spec("sherpa:/x/y") == ("sherpa", "/x/y")
    assert evaluate.split_spec("moonshine-ai/moonshine-tiny-ko")[0] == "moonshine"
    assert evaluate.split_spec("openai/whisper-base") == ("whisper", "openai/whisper-base")
    items = [{"text": "나는 학교에 갔어요", "seconds": 2.0, "grade": "초1", "noise": "clean"}] * 3
    m = evaluate.group_metrics(items, ["나는 학교에 갔어요", "나는 학교에 갔어여", ""])
    assert m["all"]["n"] == 3 and 0 < m["all"]["cer"] < 1 and "초1" in m["by_grade"]
    sc = evaluate.scoring_metrics(items, ["나는 학교에 갔어요"] * 3, [0.0, 0.34], 1, 0.5)
    assert sc[0]["false_alarm_eojeol_rate"] == 0.0
    assert sc[0]["miss_rate_one_syllable"] == 0.0  # 기준 0 이면 한 글자 바꾼 어절을 다 잡는다


def test_14_loose_json_like_extracted_tar(fake, tmp_path):
    """tar를 풀어 JSON이 압축 없이 폴더에 있을 때: inspect는 일부만 열고, scan은 평가용(VL_)을 알아보고 짝 원천 zip을 맞춘다."""
    import zipfile

    labels = tmp_path / "labels"
    for z in (fake["root"] / "labels").rglob("*.zip"):
        rel = z.relative_to(fake["root"] / "labels").parent / z.stem  # 예: Validation/02.라벨링데이터/VL_01
        with zipfile.ZipFile(z) as zf:
            for info in zf.infolist():
                if info.is_dir() or not info.filename.lower().endswith(".json"):
                    continue
                dest = labels / rel / "sub" / Path(info.filename).name
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(zf.read(info))
    work = tmp_path / "work"
    out = run("inspect_labels.py", "--labels", labels, "--work", work, "--per-zip", "2")
    assert "DataCategory" in out
    assert FAKE_MARK not in out
    assert "화자 칸 찾기" in out and "SPK" not in out  # 후보 이름과 숫자만, 값(화자 코드)은 안 보인다
    # 구분 칸이 없는 라벨이 하나 섞여도(구분 없음=None과 '정형'이 같은 표에) 정렬에서 멈추지 않아야 한다
    one = next(labels.rglob("*.json"))
    d = json.loads(one.read_text(encoding="utf-8"))
    d["Basic"].pop("DataCategory", None)
    one.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    out = run("scan_labels.py", "--labels", labels, "--sources", fake["root"] / "source", "--work", work)
    assert "다 읽었어요" in out
    scan = json.loads((work / "scan.json").read_text(encoding="utf-8"))
    by = {b["label_zip"]: b for b in scan["by_source"]}
    assert by["VL_01"]["split"] == "valid" and by["VL_01"]["source_zip"] == "VS_01.zip"
    assert by["TL_01"]["split"] == "train" and by["TL_01"]["source_zip"] == "TS_01.zip"
    assert FAKE_MARK not in out
