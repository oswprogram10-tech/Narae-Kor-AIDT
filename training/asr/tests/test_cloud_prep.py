"""클라우드 학습 준비: 원천 파일(TS_/VS_) 기준 학습/검증 가르기, 화자 겹침 0명, 업로드 묶음 만들기. 가짜 데이터만 쓴다."""
import io
import json
import os
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

import pytest

ASR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_fake_aihub import FAKE_MARK, FAKE_REGION, make_fake  # noqa: E402


def run(script, *args, expect=0):
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    r = subprocess.run([sys.executable, str(ASR / script), *map(str, args)], cwd=ASR, capture_output=True, text=True, encoding="utf-8", env=env)
    out = r.stdout + r.stderr
    assert r.returncode == expect, f"{script} 종료 코드 {r.returncode}\n{out[-3000:]}"
    return out


def read(p):
    return [json.loads(x) for x in Path(p).read_text(encoding="utf-8").splitlines() if x.strip()]


def add_wavs(tar_path: Path, zips: list[Path]) -> None:
    tar_path.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tar_path, "w") as tf:
        for z in zips:
            with zipfile.ZipFile(z) as zf:
                for info in zf.infolist():
                    if info.filename.lower().endswith(".wav"):
                        data = zf.read(info)
                        ti = tarfile.TarInfo(name=f"kor_formatted/2021-12-14/{Path(info.filename).name}")
                        ti.size = len(data)
                        tf.addfile(ti, io.BytesIO(data))


@pytest.fixture(scope="module")
def mixed(tmp_path_factory):
    """라벨은 한 폴더에 섞고(VL_/Validation 표시 없음), 원천은 TS_/VS_ tar 두 개."""
    root = tmp_path_factory.mktemp("mixed")
    fake_root = root / "fake"
    info = make_fake(fake_root)
    labels = root / "labels" / "kor_formatted" / "2021-12-14"
    for z in (fake_root / "labels").rglob("*.zip"):
        with zipfile.ZipFile(z) as zf:
            for i in zf.infolist():
                if i.is_dir() or not i.filename.lower().endswith(".json"):
                    continue
                spk = Path(i.filename).parent.name
                d = labels / "child"
                d.mkdir(parents=True, exist_ok=True)
                (d / f"{spk}_{Path(i.filename).name}").write_bytes(zf.read(i))
    src = fake_root / "source"
    ts_dir = src / "Training" / "01.원천데이터"
    ts_zip = ts_dir / "TS_01.zip"
    ts_zip.write_bytes((ts_dir / "TS_01.zip.part0").read_bytes() + (ts_dir / "TS_01.zip.part1").read_bytes())
    tars = root / "tars"
    add_wavs(tars / "TS_kor_formatted_01.tar", [ts_zip])
    add_wavs(tars / "VS_kor_formatted_01.tar", [src / "Validation" / "01.원천데이터" / "VS_01.zip"])
    return {"root": root, "labels": root / "labels", "sources": tars, "info": info}


def test_split_by_source_file_not_label_path(mixed, tmp_path):
    work = tmp_path / "work"
    out = run("build_subset.py", "--labels", mixed["labels"], "--sources", mixed["sources"], "--work", work, "--train-hours", "0.02", "--eval-hours", "0.008")
    assert "학습·평가 화자 겹침 0명" in out
    tr, ev = read(work / "train.jsonl"), read(work / "eval.jsonl")
    assert tr and ev
    assert not ({t["speaker"] for t in tr} & {e["speaker"] for e in ev})
    assert {e["grade"] for e in ev} == {f"초{i}" for i in range(1, 7)}
    # 검증 화자 6명 전부가 학습에서 빠졌는지: 학습 화자는 학습 원천의 초등 화자(12명) 안에서만
    assert len({t["speaker"] for t in tr}) <= 12
    assert FAKE_MARK not in out and FAKE_REGION not in out


def test_keep_eval_and_exclude_all_validation_speakers(mixed, tmp_path):
    work = tmp_path / "work"
    run("build_subset.py", "--labels", mixed["labels"], "--sources", mixed["sources"], "--work", work, "--eval-hours", "0.003", "--grades", "1-2")
    ev_before = (work / "eval.jsonl").read_text(encoding="utf-8")
    few = {e["speaker"] for e in read(work / "eval.jsonl")}
    assert len(few) == 2  # 초1~2만 뽑았으니 검증 화자 6명 중 2명만
    out = run("build_subset.py", "--labels", mixed["labels"], "--sources", mixed["sources"], "--work", work, "--train-hours", "0.02", "--eval-hours", "0.003")
    assert "그대로 둬요" in out
    assert (work / "eval.jsonl").read_text(encoding="utf-8") == ev_before  # 평가는 그대로
    tr = read(work / "train.jsonl")
    assert tr and not ({t["speaker"] for t in tr} & few)
    assert "검증 원천 6명" in out  # 뽑히지 않은 검증 화자까지 모두 뺐다


def test_pack_for_cloud(mixed, tmp_path):
    work = tmp_path / "work"
    run("build_subset.py", "--labels", mixed["labels"], "--sources", mixed["sources"], "--work", work, "--train-hours", "0.02", "--eval-hours", "0.008")
    # 라벨 JSON·이름처럼 넣으면 안 되는 것을 work 에 일부러 둔다
    (work / "secret_label.json").write_text('{"SpeakerName":"%s"}' % FAKE_MARK, encoding="utf-8")
    out = run("pack_for_cloud.py", "--work", work)
    up = work / "cloud_upload"
    tar_path = up / "narae_asr_data.tar"
    assert tar_path.exists() and "sha256" in (up / "MANIFEST.txt").read_text(encoding="utf-8")
    assert "국내 클라우드에만 올리고 끝나면 지워요" in (up / "README.txt").read_text(encoding="utf-8")
    items = read(work / "train.jsonl") + read(work / "eval.jsonl")
    with tarfile.open(tar_path) as tf:
        names = tf.getnames()
        assert sorted(n for n in names if n.endswith(".wav")) == sorted(f"work/{it['audio']}" for it in items)
        assert {"work/train.jsonl", "work/eval.jsonl"} <= set(names)
        assert all(n in ("README.txt", "work/train.jsonl", "work/eval.jsonl") or n.startswith("work/audio/") for n in names)
        for n in ("work/train.jsonl", "work/eval.jsonl"):
            for line in tf.extractfile(n).read().decode("utf-8").splitlines():
                assert set(json.loads(line)) <= {"id", "audio", "text", "seconds", "grade", "noise", "speaker"}
        blob = b"".join(tf.extractfile(n).read() for n in names if n.endswith((".jsonl", ".txt")))
    assert FAKE_MARK.encode() not in blob and b"SPK" not in blob
    assert "겹침 0명" in out and FAKE_MARK not in out
