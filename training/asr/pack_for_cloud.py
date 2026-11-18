"""국내 GPU 클라우드에 올릴 '학습 묶음' 하나(tar, 압축 없음)를 만든다.

    python pack_for_cloud.py
    python pack_for_cloud.py --work work --out work\\cloud_upload

들어가는 것(이것만): work/train.jsonl, work/eval.jsonl 과 그 안에 적힌 work/audio/... 16kHz wav.
  - jsonl 은 익명 칸(id, audio, text, seconds, grade, noise, speaker)만 다시 써서 넣어요.
  - 라벨 JSON, 화자 이름, 원래 파일 이름, 원천 zip·tar, 소금(salt.txt)은 들어가지 않아요.
결과: <out>/narae_asr_data.tar, <out>/MANIFEST.txt(파일 수·크기·sha256), <out>/README.txt
클라우드에서 풀기: tar -xf narae_asr_data.tar -C training/asr   (그러면 training/asr/work/... 가 생겨요)
이 묶음은 국내 클라우드에만 올리고, 끝나면 지워요.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import tarfile
from pathlib import Path, PurePosixPath

from asr_common import DEFAULT_WORK, die, read_jsonl, say, tqdm

KEEP_KEYS = ("id", "audio", "text", "seconds", "grade", "noise", "speaker")
TAR_NAME = "narae_asr_data.tar"

README_TEXT = """국어나래 아동 낭독 음성 인식 학습 묶음 (클라우드 업로드용)

- 이 묶음은 국내 클라우드에만 올리고 끝나면 지워요.
- 내용: work/train.jsonl, work/eval.jsonl, work/audio/ 아래 16kHz wav. 라벨 JSON·이름·원래 파일 이름은 없어요.
- 출처: 한국지능정보사회진흥원(NIA) AI Hub 「한국어 아동 음성 데이터」. 약관상 국외 반출·제3자 제공 금지.
- 풀기: tar -xf narae_asr_data.tar -C training/asr
- 지우기: rm -rf training/asr/work narae_asr_data.tar (그리고 인스턴스·디스크 삭제)
"""


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def safe_rel(rel: str) -> PurePosixPath:
    p = PurePosixPath(rel.replace("\\", "/"))
    if p.is_absolute() or ".." in p.parts or not p.parts or p.parts[0] != "audio":
        die(f"manifest 의 audio 경로가 이상해요(audio/ 아래여야 해요): {rel!r}")
    return p


def add_bytes(tf: tarfile.TarFile, name: str, data: bytes) -> None:
    ti = tarfile.TarInfo(name)
    ti.size = len(data)
    ti.mtime = 0
    ti.mode = 0o644
    tf.addfile(ti, io.BytesIO(data))


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--work", default=str(DEFAULT_WORK), help="작업 폴더(기본: training/asr/work)")
    ap.add_argument("--out", default=None, help="결과 폴더(기본: <work>/cloud_upload)")
    a = ap.parse_args(argv)
    work = Path(a.work)
    out = Path(a.out) if a.out else work / "cloud_upload"

    sets = {name: read_jsonl(work / name) for name in ("train.jsonl", "eval.jsonl")}
    tr_spk = {it["speaker"] for it in sets["train.jsonl"]}
    ev_spk = {it["speaker"] for it in sets["eval.jsonl"]}
    if tr_spk & ev_spk:
        die(f"학습과 평가에 같은 화자가 {len(tr_spk & ev_spk)}명 있어요. build_subset.py 를 다시 확인해 주세요.")

    rows: dict[str, bytes] = {}
    audio: dict[str, Path] = {}
    missing = 0
    for name, items in sets.items():
        buf = io.StringIO()
        for it in items:
            rel = safe_rel(str(it["audio"]))
            src = work / rel
            if not src.is_file():
                missing += 1
                continue
            audio[rel.as_posix()] = src
            buf.write(json.dumps({k: it[k] for k in KEEP_KEYS if k in it}, ensure_ascii=False) + "\n")
        rows[name] = buf.getvalue().encode("utf-8")
    if missing:
        die(f"wav 가 없는 항목이 {missing:,}개예요. build_subset.py 를 다시 실행해 주세요.")

    out.mkdir(parents=True, exist_ok=True)
    tar_path = out / TAR_NAME
    tmp = tar_path.with_name(tar_path.name + ".part")
    with tarfile.open(tmp, "w", format=tarfile.PAX_FORMAT) as tf:
        add_bytes(tf, "README.txt", README_TEXT.encode("utf-8"))
        for name, data in rows.items():
            add_bytes(tf, f"work/{name}", data)
        for rel in tqdm(sorted(audio), desc="wav 묶는 중", unit="개", mininterval=2.0):
            src = audio[rel]
            ti = tarfile.TarInfo(f"work/{rel}")
            ti.size = src.stat().st_size
            ti.mtime = 0
            ti.mode = 0o644
            with open(src, "rb") as f:
                tf.addfile(ti, f)
    tmp.replace(tar_path)

    size = tar_path.stat().st_size
    digest = sha256_file(tar_path)
    n_tr, n_ev = len(sets["train.jsonl"]), len(sets["eval.jsonl"])
    lines = [
        "국어나래 ASR 학습 묶음 MANIFEST",
        "이 묶음은 국내 클라우드에만 올리고 끝나면 지워요(AI Hub 약관: 국외 반출·제3자 제공 금지).",
        f"파일: {TAR_NAME}",
        f"크기: {size:,} 바이트 ({size / 2**30:.2f} GiB)",
        f"sha256: {digest}",
        f"tar 안 파일 수: {len(audio) + 3:,} (wav {len(audio):,}개 + train.jsonl + eval.jsonl + README.txt)",
        f"학습 발화 {n_tr:,}개(화자 {len(tr_spk)}명), 평가 발화 {n_ev:,}개(화자 {len(ev_spk)}명), 학습·평가 화자 겹침 0명",
        "manifest 칸: " + ", ".join(KEEP_KEYS),
        "확인(클라우드에서): sha256sum narae_asr_data.tar",
    ]
    (out / "MANIFEST.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (out / "README.txt").write_text(README_TEXT, encoding="utf-8")
    say("\n".join(lines))
    say(f"\n저장: {tar_path}\n설명: {out / 'MANIFEST.txt'}")


if __name__ == "__main__":
    main()
