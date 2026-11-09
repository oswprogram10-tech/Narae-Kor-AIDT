"""라벨 zip을 풀지 않고 전부 읽어서 '학년 × 정형/비정형 × 소음' 별 시간·발화 수·화자 수 표를 만든다.
또 어느 원천(wav) zip에 쓸 만한 음성이 들어 있는지 보여 줘서, 필요한 원천 묶음만 내려받게 도와줘요(평가용 Validation 묶음을 먼저 보여 줘요).

    python scan_labels.py --labels data/labels
    python scan_labels.py --labels data/labels --sources data/source     # 내려받은 원천 zip이 있는지도 확인

결과는 work/scan.json 에도 저장돼요(전사 글·이름 없이 숫자만). 화자는 파일 이름에서 뽑은 코드의 익명 키로만 세요.
짝 규칙(TL_→TS_, VL_→VS_ 등)은 fields.json 의 zip_pairs 에서 바꿀 수 있어요.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from pathlib import Path

from asr_common import (
    add_common_args,
    die,
    fmt_hours,
    is_elementary,
    iter_rows,
    list_files,
    load_config,
    save_json,
    say,
    unmerged_parts,
    zip_pair_name,
)

CAT_KO = {"formal": "정형", "informal": "비정형", None: "구분없음"}
NOISE_KO = {"clean": "무소음", "noisy": "소음", "unknown": "소음미확인"}
SPLIT_KO = {"train": "학습(Training)", "valid": "검증(Validation)"}


def grade_sort(g: str) -> tuple:
    return (0, g) if g.startswith("초") else (1, g)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_common_args(ap, labels=True)
    ap.add_argument("--sources", nargs="*", default=None, help="내려받은 원천 zip 또는 폴더(있으면 짝 zip이 있는지 확인)")
    a = ap.parse_args(argv)
    cfg = load_config(a.fields)
    work = Path(a.work)
    parts = unmerged_parts(a.labels)
    if parts:
        say(f"[알림] 이어 붙이지 않은 분할 파일 {len(parts)}개가 있어요. merge_parts.py 를 먼저 실행해 주세요.")

    stats: Counter = Counter()
    # 칸 (split, 학년 또는 나이, 구분, 소음) → [초, 발화 수]
    cells: dict[tuple, list[float]] = defaultdict(lambda: [0.0, 0])
    cell_spk: dict[tuple, set] = defaultdict(set)
    # 원천 묶음별(라벨 zip별) 초등·정형
    src: dict[str, dict] = {}
    spk_by_split: dict[str, set] = defaultdict(set)

    for r in iter_rows(a.labels, cfg, work, stats=stats):
        who = r.grade if r.grade is not None else (f"{r.age}세" if r.age is not None else "학년·나이 미확인")
        key = (r.split, who, r.category, r.noise)
        sec = r.seconds or 0.0
        cells[key][0] += sec
        cells[key][1] += 1
        if r.speaker:
            cell_spk[key].add(r.speaker)
            spk_by_split[r.split].add(r.speaker)
        if is_elementary(r.grade, r.age) and r.category == "formal":
            d = src.setdefault(r.container, {"seconds": 0.0, "utts": 0, "clean": 0.0, "noisy": 0.0, "spk": set(), "split": r.split})
            d["seconds"] += sec
            d["utts"] += 1
            if r.noise == "noisy":
                d["noisy"] += sec
            else:
                d["clean"] += sec
            if r.speaker:
                d["spk"].add(r.speaker)

    if stats["files"] == 0:
        die("읽을 라벨 JSON이 없어요. --labels 경로를 확인해 주세요(zip 또는 폴더).")

    say(f"\n라벨 JSON {stats['files']:,}개 읽음 (JSON 해석 실패 {stats['bad_json']:,}개)")
    problems = []
    for k in cfg["paths"]:
        miss = stats[("missing", k)]
        if miss:
            problems.append(f"  - '{k}' 칸을 못 찾은 파일 {miss:,}개 ({', '.join(cfg['paths'][k])})")
    if problems:
        say("[주의] 일부 칸을 못 찾았어요. inspect_labels.py 로 실제 키 이름을 보고 fields.json 을 고쳐 주세요.")
        for p in problems:
            say(p)
    if stats["no_duration"]:
        say(f"[주의] 길이를 알 수 없는 파일 {stats['no_duration']:,}개(시간에 0으로 셌어요)")
    if stats["speaker_fail"]:
        say(f"[주의] 화자 코드를 못 뽑은 파일 {stats['speaker_fail']:,}개 → 화자 수가 실제보다 적게 보여요. inspect_labels.py 의 '파일 이름 모양'을 보고 fields.json 의 speaker.regex 를 고쳐 주세요.")

    for split in ("train", "valid"):
        rows = sorted((k, v) for k, v in cells.items() if k[0] == split)
        if not rows:
            continue
        say(f"\n== {SPLIT_KO[split]} : 학년 × 구분 × 소음 ==")
        say(f"{'학년':<10}{'구분':<8}{'소음':<10}{'시간(시)':>10}{'발화 수':>12}{'화자 수':>8}")
        for k, (sec, n) in sorted(rows, key=lambda kv: (grade_sort(kv[0][1]), str(kv[0][2]), kv[0][3])):
            say(f"{k[1]:<10}{CAT_KO[k[2]]:<8}{NOISE_KO[k[3]]:<10}{fmt_hours(sec):>10}{n:>12,}{len(cell_spk[k]):>8,}")
    both = len(spk_by_split["train"] & spk_by_split["valid"])
    say(f"\n학습과 검증에 모두 나온 화자 코드: {both:,}명 (평가용 화자는 build_subset.py 가 학습에서 빼요)")

    sources_present: set[str] | None = None
    if a.sources is not None:
        sources_present = {p.name for p in list_files(a.sources, (".zip",))}

    by_source = []
    entries = sorted(src.items(), key=lambda kv: (kv[1]["split"] != "valid", -kv[1]["seconds"]))
    for split, title in (("valid", "평가용(Validation) — 먼저 이것만 받아도 돼요"), ("train", "학습용(Training) — 나중에 학습할 때")):
        group = [(n, d) for n, d in entries if d["split"] == split]
        if not group:
            continue
        say(f"\n== 원천 zip 추천: {title} (초등 정형, 시간이 큰 순) ==")
        say(f"{'라벨 zip':<28}{'짝 원천 zip':<28}{'시간(시)':>9}{'무소음':>8}{'소음':>7}{'발화 수':>10}{'화자':>6}  내려받음")
        total = 0.0
        for name, d in group:
            pair = zip_pair_name(name, cfg)
            have = "-" if sources_present is None else ("있음" if pair in sources_present else "없음")
            total += d["seconds"]
            say(f"{name[:27]:<28}{(pair or '(짝 규칙 없음)')[:27]:<28}{fmt_hours(d['seconds']):>9}{fmt_hours(d['clean']):>8}{fmt_hours(d['noisy']):>7}{d['utts']:>10,}{len(d['spk']):>6,}  {have}   (누적 {fmt_hours(total)}시간)")
            by_source.append(
                {
                    "label_zip": name,
                    "source_zip": pair,
                    "split": d["split"],
                    "elementary_formal_hours": round(d["seconds"] / 3600, 4),
                    "clean_hours": round(d["clean"] / 3600, 4),
                    "noisy_hours": round(d["noisy"] / 3600, 4),
                    "utterances": d["utts"],
                    "speakers": len(d["spk"]),
                    "source_present": None if sources_present is None else pair in sources_present,
                }
            )
    if not src:
        say("  (초등 정형으로 분류된 발화가 없어요. 학년·구분 칸을 못 찾았거나 값이 예상과 다를 수 있어요 → inspect_labels.py)")
    say("\n평가만 할 때는 Validation 표에서 누적 4시간(안전하게 5~6시간)이 채워질 만큼만 원천(VS_) zip을 받으면 돼요.")

    save_json(
        work / "scan.json",
        {
            "version": 1,
            "files": stats["files"],
            "bad_json": stats["bad_json"],
            "speaker_extraction_failed": stats["speaker_fail"],
            "no_duration": stats["no_duration"],
            "speakers_in_both_splits": both,
            "cells": [
                {
                    "split": k[0],
                    "grade_or_age": k[1],
                    "category": k[2],
                    "noise": k[3],
                    "hours": round(v[0] / 3600, 4),
                    "utterances": v[1],
                    "speakers": len(cell_spk[k]),
                }
                for k, v in sorted(cells.items(), key=lambda kv: (kv[0][0], grade_sort(kv[0][1]), str(kv[0][2]), kv[0][3]))
            ],
            "by_source": by_source,
        },
    )
    say(f"\n저장: {work / 'scan.json'}")


if __name__ == "__main__":
    main()
