"""AI Hub 분할 압축(`이름.zip.part0`, `.part1`, …)을 이어 붙여 `이름.zip` 으로 만든다. WSL이 필요 없어요.

    python merge_parts.py data/source
    python merge_parts.py data/labels --delete-parts      # 이어 붙인 뒤 조각 파일 지우기(디스크 아끼기)

조각 번호가 비었거나 크기가 0인 파일이 있으면 그 묶음은 이어 붙이지 않고 알려 줘요.
"""
from __future__ import annotations

import argparse
import re
import shutil
import zipfile
from collections import defaultdict
from pathlib import Path

from asr_common import die, say, tqdm

PART_RE = re.compile(r"^(?P<base>.+\.zip)\.part(?P<n>\d+)$", re.IGNORECASE)
CHUNK = 16 * 1024 * 1024


def find_groups(folder: Path) -> dict[Path, list[tuple[int, Path]]]:
    groups: dict[Path, list[tuple[int, Path]]] = defaultdict(list)
    for p in sorted(folder.rglob("*")):
        m = PART_RE.match(p.name) if p.is_file() else None
        if m:
            groups[p.with_name(m.group("base"))].append((int(m.group("n")), p))
    for v in groups.values():
        v.sort()
    return dict(groups)


def check_group(parts: list[tuple[int, Path]]) -> list[str]:
    """문제 목록(비어 있으면 괜찮음)."""
    problems: list[str] = []
    nums = [n for n, _ in parts]
    if len(set(nums)) != len(nums):
        problems.append("같은 번호의 조각이 두 개 이상 있어요")
    first = nums[0]
    if first not in (0, 1):
        problems.append(f"첫 조각이 part{first} 예요(part0 또는 part1부터 있어야 해요)")
    missing = [n for n in range(first, nums[-1] + 1) if n not in set(nums)]
    if missing:
        problems.append("빠진 조각 번호: " + ", ".join(f"part{n}" for n in missing[:20]))
    for n, p in parts:
        if p.stat().st_size == 0:
            problems.append(f"{p.name} 의 크기가 0이에요(내려받기가 끊겼을 수 있어요)")
    return problems


def merge_group(out: Path, parts: list[tuple[int, Path]], verify: bool = True) -> None:
    total = sum(p.stat().st_size for _, p in parts)
    free = shutil.disk_usage(out.parent).free
    if free < total * 1.02:
        die(f"디스크 빈 공간이 모자라요: 필요 {total / 1e9:.1f}GB, 남음 {free / 1e9:.1f}GB ({out.name}). --delete-parts 로 조각을 지우며 이어 가거나 공간을 비워 주세요.")
    tmp = out.with_name(out.name + ".merging")
    with open(tmp, "wb") as dst, tqdm(total=total, unit="B", unit_scale=True, desc=out.name) as bar:
        for _, p in parts:
            with open(p, "rb") as src:
                while True:
                    buf = src.read(CHUNK)
                    if not buf:
                        break
                    dst.write(buf)
                    if bar is not None and hasattr(bar, "update"):
                        bar.update(len(buf))
    if tmp.stat().st_size != total:
        tmp.unlink()
        die(f"이어 붙인 크기가 조각 합과 달라요: {out.name}")
    if verify:
        try:
            with zipfile.ZipFile(tmp) as zf:
                n = len(zf.infolist())
        except zipfile.BadZipFile:
            tmp.unlink()
            die(f"이어 붙였지만 zip으로 열리지 않아요: {out.name}. 조각 순서나 내려받기 상태를 확인해 주세요.")
        say(f"  zip 목록을 읽어 봤어요: 파일 {n:,}개")
    tmp.replace(out)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", nargs="?", default="data", help="분할 파일이 든 폴더(하위 폴더 포함)")
    ap.add_argument("--delete-parts", action="store_true", help="이어 붙이기에 성공하면 조각을 지워요")
    ap.add_argument("--force", action="store_true", help="이미 있는 zip도 다시 만들어요")
    ap.add_argument("--no-verify", action="store_true", help="이어 붙인 뒤 zip 목록 읽어 보기를 건너뛰어요")
    a = ap.parse_args(argv)
    folder = Path(a.folder)
    if not folder.is_dir():
        die(f"폴더가 없어요: {folder}")
    groups = find_groups(folder)
    if not groups:
        say("이어 붙일 분할 파일(*.zip.part0 …)이 없어요.")
        return
    bad = 0
    for out, parts in groups.items():
        say(f"{out.name}: 조각 {len(parts)}개")
        problems = check_group(parts)
        if problems:
            bad += 1
            for pr in problems:
                say(f"  [문제] {pr}")
            say("  → 이 묶음은 이어 붙이지 않았어요. 빠진 조각을 다시 내려받아 주세요.")
            continue
        if out.exists() and not a.force:
            say("  이미 있어요(건너뜀). 다시 만들려면 --force")
            continue
        merge_group(out, parts, verify=not a.no_verify)
        say(f"  완료: {out}")
        if a.delete_parts:
            for _, p in parts:
                p.unlink()
            say("  조각 파일을 지웠어요.")
    if bad:
        die(f"문제가 있는 묶음이 {bad}개 있어요.", 2)


if __name__ == "__main__":
    main()
