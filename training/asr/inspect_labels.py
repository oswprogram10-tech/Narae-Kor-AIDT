"""라벨 zip(또는 폴더)에서 JSON 몇 개를 열어 '구조만' 보여 줘요.

    python inspect_labels.py --labels data/labels

보여 주는 것: 키 경로, 값의 종류, 문자열 길이 범위, 정해 둔 범주형 칸의 빈도표, 파일 이름 '모양'(글자를 가려서),
fields.json 의 칸 이름을 찾았는지.
보여 주지 않는 것: 이름·전사 글·지역·방언을 비롯해 범주형 칸이 아닌 모든 칸의 '값'.
그래서 이 출력을 그대로 채팅에 붙여도 안전해요(그래도 한 번 훑어보고 붙여 주세요).
"""
from __future__ import annotations

import argparse
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from asr_common import (
    SENSITIVE_SEEN,
    add_common_args,
    decode_zip_name,
    die,
    find_field_ex,
    flatten,
    list_files,
    load_config,
    nkey,
    parse_label_json,
    say,
    shape_of,
    speaker_code,
    unmerged_parts,
)

MAX_CAT_VALUE_LEN = 24  # 이보다 긴 범주형 값은 가려요


def kind_of(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, int):
        return "int"
    if isinstance(v, float):
        return "float"
    if isinstance(v, str):
        return "str"
    if isinstance(v, list):
        return "list"
    return "dict"


def sample_files(paths, per_container: int):
    """컨테이너(zip)마다 고르게 퍼진 JSON 몇 개의 (컨테이너, 안 이름, 내용)."""
    for p in list_files(paths, (".zip", ".json")):
        if p.name.lower().endswith(".zip"):
            try:
                zf = zipfile.ZipFile(p)
            except zipfile.BadZipFile:
                say(f"[알림] 열 수 없는 zip: {p.name} (분할 파일이면 merge_parts.py 먼저)")
                continue
            with zf:
                infos = [i for i in zf.infolist() if not i.is_dir() and i.filename.lower().endswith(".json")]
                if not infos:
                    say(f"[알림] {p.name}: JSON이 없어요(안에 든 파일 확장자: {sorted({Path(i.filename).suffix.lower() for i in zf.infolist()[:50]})})")
                    continue
                step = max(1, len(infos) // per_container)
                for info in infos[::step][:per_container]:
                    yield p.name, decode_zip_name(info), zf.read(info), len(infos)
        else:
            yield p.parent.name, p.name, p.read_bytes(), 1


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_common_args(ap, labels=True)
    ap.add_argument("--per-zip", type=int, default=30, help="zip마다 열어 볼 JSON 개수(기본 30)")
    a = ap.parse_args(argv)
    cfg = load_config(a.fields)
    parts = unmerged_parts(a.labels)
    if parts:
        say(f"[알림] 이어 붙이지 않은 분할 파일 {len(parts)}개가 있어요. merge_parts.py 를 먼저 실행해 주세요.")

    cat_keys = {nkey(k) for k in cfg["categorical_keys"]}
    paths_kinds: dict[str, Counter] = defaultdict(Counter)
    str_len: dict[str, list[int]] = defaultdict(lambda: [10**9, 0])
    cat_freq: dict[str, Counter] = defaultdict(Counter)
    field_hits: dict[str, Counter] = defaultdict(Counter)
    name_shapes: Counter = Counter()
    member_shapes: Counter = Counter()
    containers: dict[str, int] = {}
    n = bad = spk_ok = 0

    for container, member, data, total in sample_files(a.labels, a.per_zip):
        containers[container] = total
        try:
            doc = parse_label_json(data, cfg)
        except Exception:  # noqa: BLE001
            bad += 1
            continue
        n += 1
        flat = flatten(doc)
        for path, v in flat[0].items():
            paths_kinds[path][kind_of(v)] += 1
            if isinstance(v, str):
                lo, hi = str_len[path]
                str_len[path] = [min(lo, len(v)), max(hi, len(v))]
            if path.split(".")[-1] in cat_keys:
                s = str(v)
                cat_freq[path][s if len(s) <= MAX_CAT_VALUE_LEN else "(긴 값)"] += 1
        for logical, cand in cfg["paths"].items():
            _, how = find_field_ex(flat, cand)
            field_hits[logical][how or "못 찾음"] += 1
        fn, _ = find_field_ex(flat, cfg["paths"]["file_name"])
        stem = Path(str(fn).replace("\\", "/")).stem if fn else Path(member.replace("\\", "/")).stem
        name_shapes[shape_of(stem)] += 1
        member_shapes["/".join(shape_of(x) for x in member.replace("\\", "/").split("/")[-4:])] += 1
        if speaker_code(stem, member, cfg):
            spk_ok += 1

    if n == 0:
        die("읽을 수 있는 라벨 JSON을 찾지 못했어요. --labels 경로를 확인해 주세요." + (f" (JSON 해석 실패 {bad}개)" if bad else ""))

    say(f"== 라벨 묶음 {len(containers)}개, 열어 본 JSON {n}개 (해석 실패 {bad}개) ==")
    for c, t in sorted(containers.items()):
        say(f"  {c}: JSON {t:,}개")
    say("\n== 키 경로 (소문자·밑줄 제거 형태) / 값 종류 / 문자열 길이 ==")
    for path in sorted(paths_kinds):
        kinds = ",".join(f"{k}:{c}" for k, c in paths_kinds[path].most_common())
        ln = f"  길이 {str_len[path][0]}~{str_len[path][1]}" if path in str_len else ""
        say(f"  {path}  [{kinds}]{ln}")
    if SENSITIVE_SEEN:
        say("\n읽자마자 버린 민감한 칸(이름만 보여요, 값은 보지도 저장하지도 않아요): " + ", ".join(f"{k}×{c}" for k, c in SENSITIVE_SEEN.most_common()))
    say("\n== 범주형 칸 빈도표 ==")
    if not cat_freq:
        say("  (범주형 칸을 못 찾았어요: fields.json 의 categorical_keys 와 실제 키 이름을 비교해 보세요)")
    for path in sorted(cat_freq):
        say(f"  {path}")
        for v, c in cat_freq[path].most_common(30):
            say(f"      {v!r}: {c}")
    say("\n== fields.json 의 칸을 찾았는지 ==")
    for logical, hits in field_hits.items():
        say(f"  {logical}: " + ", ".join(f"{k} ×{c}" for k, c in hits.most_common()))
    say("\n== 파일 이름 모양(한글→가, 대문자→A, 소문자→a, 숫자→#) ==")
    for s, c in name_shapes.most_common(5):
        say(f"  {s}  ×{c}")
    say("== zip 안 경로 모양(마지막 4단계) ==")
    for s, c in member_shapes.most_common(5):
        say(f"  {s}  ×{c}")
    say(f"\n화자 코드 정규식으로 뽑힌 비율: {spk_ok}/{n}" + ("" if spk_ok == n else "  → 못 뽑는 파일이 있어요. 위 '파일 이름 모양'을 보고 fields.json 의 speaker.regex 를 고쳐야 해요."))


if __name__ == "__main__":
    main()
