"""학습용·평가용 부분집합을 고르고, 필요한 wav만 원천 zip에서 꺼내 16kHz 16bit mono 로 저장한다.

    python build_subset.py --labels data/labels --sources data/source
    python build_subset.py --labels data/labels --sources data/source --eval-hours 4 --noise-ratio 85:15
    python build_subset.py ... --train-hours 25                  # (선택) 학습용도 함께
    python build_subset.py ... --dry-run          # 고르기만 하고 wav는 만들지 않아요

고르는 방법
  - 조건: 정형, 초등(학년 1~6, 학년 칸이 없으면 나이 7~13), 길이 0.5~30초, 전사가 비지 않을 것.
  - 학습/검증은 '원천 파일 이름'으로 가르요: wav를 꺼내는 원천이 VS_(또는 fields.json validation_markers)면 검증,
    TS_면 학습. 라벨이 한 폴더에 섞여 있어도 상관없어요(라벨 경로의 구분보다 우선).
  - 화자 단위로 나눠요: 검증 원천에 나온 모든 화자와, 이미 만든 work/eval.jsonl 의 화자는 학습에서 빼요.
    (검증 원천이 없으면 학습 화자 중 일부를 평가로 떼어 놓아요.)
  - work/eval.jsonl 이 이미 있으면 그대로 두고 학습만 추가해요(--no-keep-eval 이면 평가도 다시 만들어요).
  - 학년이 고르게, 무소음:소음 = 기본 85:15, 화자도 고르게(화자마다 번갈아 한 발화씩) 담아요.
기본은 '평가만'(--eval-hours 4, --train-hours 0)이에요. 그래서 라벨 + Validation 원천 일부만 받으면 돼요.
  학습용도 만들려면 --train-hours 25 (나중에 학습할 때).
결과: work/audio/..., work/train.jsonl, work/eval.jsonl, work/subset_report.json
이어서 하기: 같은 명령을 다시 실행하면 이미 만든 wav는 건너뛰어요(같은 --seed·조건이면 같은 것을 골라요).
이름·전사 글은 화면에 찍지 않아요. 화자는 익명 키로만 적어요.
"""
from __future__ import annotations

import argparse
import hashlib
import heapq
import io
import json
import math
import random
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from asr_common import (
    Row,
    add_common_args,
    anon_key,
    build_wav_index,
    die,
    fmt_hours,
    is_elementary,
    iter_rows,
    load_config,
    save_json,
    say,
    tqdm,
    unmerged_parts,
    wav_stem,
)
from normalize import normalize_transcript

TARGET_SR = 16000


def parse_range(s: str) -> tuple[int, int]:
    m = re.fullmatch(r"(\d+)(?:\s*[-~]\s*(\d+))?", s.strip())
    if not m:
        die(f"범위 모양이 틀렸어요: {s!r} (예: 1-6)")
    lo = int(m.group(1))
    return lo, int(m.group(2) or lo)


def who_of(r: Row) -> str:
    return r.grade if r.grade is not None else (f"{r.age}세" if r.age is not None else "미확인")


def source_split(name: str, cfg: dict) -> str | None:
    """원천 파일 이름으로 학습/검증을 가른다. VS_ 또는 validation_markers 가 들어 있으면 'valid', TS_ 면 'train', 모르면 None."""
    low = name.lower()
    if re.search(r"(?:^|[^a-z])vs_", low) or any(m.lower() in low for m in cfg.get("validation_markers", [])):
        return "valid"
    if re.search(r"(?:^|[^a-z])ts_", low):
        return "train"
    return None


def utt_id(r: Row) -> str:
    return "u" + hashlib.sha1(f"{r.container}|{r.member}".encode("utf-8")).hexdigest()[:12]


def select(pool: list[tuple[Row, str, float]], hours: float, clean_share: float, seed: int) -> list[tuple[Row, str, float]]:
    """pool 항목: (행, 정규화 전사, 초). 학년·소음·화자가 고르게 되도록 그리디로 뽑는다."""
    if not pool or hours <= 0:
        return []
    rnd = random.Random(seed)
    cells: dict[tuple[str, str], dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for item in pool:
        r = item[0]
        cls = "noisy" if r.noise == "noisy" else "clean"
        cells[(who_of(r), cls)][r.speaker].append(item)
    heaps: dict[tuple[str, str], list] = {}
    for key, spk in cells.items():
        h = []
        for s, lst in spk.items():
            lst.sort(key=lambda it: utt_id(it[0]))
            rnd.shuffle(lst)
            h.append((0.0, rnd.random(), s))
        heapq.heapify(h)
        heaps[key] = h
    target = hours * 3600
    share = {"clean": clean_share, "noisy": 1 - clean_share}
    sel_cls = {"clean": 0.0, "noisy": 0.0}
    sel_cell: dict[tuple[str, str], float] = defaultdict(float)
    chosen: list[tuple[Row, str, float]] = []
    total = 0.0
    while total < target:
        classes = [c for c in ("clean", "noisy") if any(k[1] == c and heaps[k] for k in heaps)]
        if not classes:
            break

        def deficit(c: str) -> float:
            t = target * share[c]
            return (t - sel_cls[c]) / t if t > 0 else -1.0

        c = max(classes, key=deficit)
        grades = [k for k in heaps if k[1] == c and heaps[k]]
        key = min(grades, key=lambda k: (sel_cell[k], k[0]))
        used, tie, spk = heapq.heappop(heaps[key])
        lst = cells[key][spk]
        item = lst.pop()
        chosen.append(item)
        total += item[2]
        sel_cls[c] += item[2]
        sel_cell[key] += item[2]
        if lst:
            heapq.heappush(heaps[key], (used + item[2], tie, spk))
    return chosen


def holdout_eval_from_train(pool: list[tuple[Row, str, float]], seed: int, fraction: float = 0.1):
    """Validation이 없을 때: 학년마다 화자의 일부를 평가용으로 떼어 놓는다."""
    by_grade: dict[str, set] = defaultdict(set)
    for r, _, _ in pool:
        by_grade[who_of(r)].add(r.speaker)
    rnd = random.Random(seed)
    held: set[str] = set()
    for g, spks in sorted(by_grade.items()):
        lst = sorted(spks)
        rnd.shuffle(lst)
        if len(lst) >= 2:
            held.update(lst[: max(1, math.ceil(len(lst) * fraction))])
    ev = [it for it in pool if it[0].speaker in held]
    tr = [it for it in pool if it[0].speaker not in held]
    return tr, ev


def summarize(items: list[dict]) -> dict:
    hrs: Counter = Counter()
    n: Counter = Counter()
    spk: dict[str, set] = defaultdict(set)
    for it in items:
        key = f"{it['grade']}|{it['noise']}"
        hrs[key] += it["seconds"]
        n[key] += 1
        spk[key].add(it["speaker"])
    return {
        "utterances": len(items),
        "hours": round(sum(it["seconds"] for it in items) / 3600, 4),
        "speakers": len({it["speaker"] for it in items}),
        "by_grade_noise": {k: {"hours": round(hrs[k] / 3600, 4), "utterances": n[k], "speakers": len(spk[k])} for k in sorted(hrs)},
    }


def extract_audio(chosen: dict[str, list[tuple[Row, str, float]]], zips: list[Path], index: dict, work: Path, a, report: Counter) -> dict[str, list[dict]]:
    import numpy as np
    import soundfile as sf
    from scipy.signal import resample_poly

    out: dict[str, list[dict]] = {"train": [], "valid": []}
    todo: list[tuple[int, int, str, Row, str]] = []
    for split, items in chosen.items():
        for r, text, _ in items:
            zi, ii = index[wav_stem(r.stem)]
            todo.append((zi, ii, split, r, text))
    todo.sort(key=lambda t: (t[0], t[1] if isinstance(t[1], int) else t[1][0]))  # 파일 안 순서대로(tar는 앞에서부터 읽게)
    cur_zi, zf = -1, None
    tar_fh = None  # tar는 풀지 않고 파일을 열어 둔 채 위치로 바로 읽는다
    bar = tqdm(todo, desc="wav 꺼내는 중", unit="개", mininterval=2.0)
    try:
        for zi, ii, split, r, text in bar:
            uid = utt_id(r)
            rel = f"audio/{split}/{uid}.wav"
            dst = work / rel
            seconds: float | None = None
            if dst.exists() and dst.stat().st_size > 44:
                try:
                    seconds = sf.info(str(dst)).duration
                    report["이미 있어서 건너뜀"] += 1
                except Exception:  # noqa: BLE001
                    seconds = None
            if seconds is None:
                if zi != cur_zi:
                    if zf:
                        zf.close()
                        zf = None
                    if tar_fh:
                        tar_fh.close()
                        tar_fh = None
                    if isinstance(ii, int):
                        zf = zipfile.ZipFile(zips[zi])
                    else:
                        tar_fh = open(zips[zi], "rb")  # noqa: SIM115
                    cur_zi = zi
                try:
                    if isinstance(ii, int):
                        raw = zf.read(zf.infolist()[ii])
                    else:
                        tar_fh.seek(ii[0])
                        raw = tar_fh.read(ii[1])
                    data, sr = sf.read(io.BytesIO(raw), dtype="float32", always_2d=True)
                except Exception:  # noqa: BLE001
                    report["wav를 읽지 못함"] += 1
                    continue
                x = data.mean(axis=1) if data.shape[1] > 1 else data[:, 0]
                if sr != TARGET_SR:
                    g = math.gcd(int(sr), TARGET_SR)
                    x = resample_poly(x, TARGET_SR // g, int(sr) // g).astype("float32")
                seconds = len(x) / TARGET_SR
                if seconds < a.min_sec or seconds > a.max_sec:
                    report["실제 길이가 범위 밖이라 뺌"] += 1
                    continue
                pcm = np.clip(np.rint(x * 32767.0), -32768, 32767).astype("int16")
                dst.parent.mkdir(parents=True, exist_ok=True)
                tmp = dst.with_name(dst.name + ".part")
                sf.write(str(tmp), pcm, TARGET_SR, subtype="PCM_16", format="WAV")
                tmp.replace(dst)
                report["새로 만듦"] += 1
            out[split].append({"id": uid, "audio": rel, "text": text, "seconds": round(seconds, 3), "grade": who_of(r), "noise": r.noise, "speaker": r.speaker})
    finally:
        if zf:
            zf.close()
        if tar_fh:
            tar_fh.close()
    return out


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_common_args(ap, labels=True, sources=True)
    ap.add_argument("--grades", default="1-6", help="학년 범위(기본 1-6)")
    ap.add_argument("--ages", default="7-13", help="학년 칸이 없을 때 쓰는 나이 범위(기본 7-13)")
    ap.add_argument("--category", choices=["formal", "informal"], default="formal", help="기본: 정형(formal)")
    ap.add_argument("--noise-ratio", default="85:15", help="무소음:소음 비율(기본 85:15)")
    ap.add_argument("--unknown-noise", choices=["clean", "skip"], default="clean", help="소음 칸 값을 해석 못 한 발화를 무소음으로 칠지(기본) 뺄지")
    ap.add_argument("--train-hours", type=float, default=0.0, help="학습용 시간(기본 0 = 평가만 만들어요. 나중에 학습할 때 25 정도)")
    ap.add_argument("--eval-hours", type=float, default=4.0)
    ap.add_argument("--min-sec", type=float, default=0.5)
    ap.add_argument("--max-sec", type=float, default=30.0)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--keep-eval", action=argparse.BooleanOptionalAction, default=True, help="work/eval.jsonl 이 있으면 그대로 두고 학습만 추가(기본). --no-keep-eval 이면 평가도 다시 만들어요")
    ap.add_argument("--allow-unknown-speaker", action="store_true", help="화자 코드를 못 뽑은 파일을 빼지 않고 파일마다 다른 화자로 취급(학습·평가가 섞일 수 있어 권하지 않아요)")
    ap.add_argument("--dry-run", action="store_true", help="고르기만 하고 wav는 만들지 않아요")
    a = ap.parse_args(argv)

    cfg = load_config(a.fields)
    work = Path(a.work)
    work.mkdir(parents=True, exist_ok=True)
    g_lo, g_hi = parse_range(a.grades)
    a_lo, a_hi = parse_range(a.ages)
    try:
        c, nz = (float(x) for x in a.noise_ratio.split(":"))
        clean_share = c / (c + nz)
    except Exception:  # noqa: BLE001
        die(f"--noise-ratio 모양이 틀렸어요: {a.noise_ratio!r} (예: 85:15)")
    if unmerged_parts(a.labels) or unmerged_parts(a.sources):
        say("[알림] 이어 붙이지 않은 분할 파일이 있어요. merge_parts.py 를 먼저 실행해 주세요.")

    zips, index, dup = build_wav_index(a.sources, cache_dir=work)
    if not zips:
        die("원천(wav) zip·tar를 찾지 못했어요. --sources 경로를 확인해 주세요.")
    say(f"원천 zip {len(zips)}개, wav {len(index):,}개" + (f" (이름이 겹친 wav {dup:,}개는 첫 번째만 써요)" if dup else ""))

    stats: Counter = Counter()
    drop: Counter = Counter()
    hits: Counter = Counter()
    pool: dict[str, list[tuple[Row, str, float]]] = {"train": [], "valid": []}
    unk_i = 0
    valid_src_speakers: set[str] = set()  # 검증 원천에 나온 모든 화자(조건에 안 맞는 발화의 화자도 포함)
    for r in iter_rows(a.labels, cfg, work, want_text=True, stats=stats):
        src = index.get(wav_stem(r.stem))
        if src is not None:
            r.split = source_split(zips[src[0]].name, cfg) or r.split  # 원천 파일 기준이 라벨 경로보다 우선
            if r.split == "valid" and r.speaker:
                valid_src_speakers.add(r.speaker)
        if r.category != a.category:
            drop["구분이 다름(정형/비정형)"] += 1
            continue
        if r.grade is not None:
            if not (re.fullmatch(r"초[1-6]", r.grade) and g_lo <= int(r.grade[1]) <= g_hi):
                drop["학년 범위 밖"] += 1
                continue
        elif r.age is not None:
            if not (a_lo <= r.age <= a_hi):
                drop["나이 범위 밖"] += 1
                continue
        else:
            drop["학년·나이를 알 수 없음"] += 1
            continue
        if r.noise == "unknown" and a.unknown_noise == "skip":
            drop["소음 칸을 해석 못 해서 뺌"] += 1
            continue
        if r.seconds is None:
            drop["길이를 알 수 없음"] += 1
            continue
        if not (a.min_sec <= r.seconds <= a.max_sec):
            drop["길이가 범위 밖"] += 1
            continue
        if wav_stem(r.stem) not in index:
            drop["원천 zip에 wav가 없음(안 내려받은 묶음)"] += 1
            continue
        if r.speaker is None:
            if not a.allow_unknown_speaker:
                drop["화자 코드를 못 뽑아서 뺌"] += 1
                continue
            unk_i += 1
            r.speaker = anon_key(f"unknown-{r.container}-{r.stem}", work)
        text = normalize_transcript(r.text or "", cfg["normalize"], hits)
        if not text:
            drop["전사가 비었거나 제외 표시(*)가 있음"] += 1
            continue
        pool[r.split].append((r, text, r.seconds))

    say("\n== 후보에서 빠진 발화(이유별) ==")
    for k, v in drop.most_common():
        say(f"  {k}: {v:,}")
    if stats["speaker_fail"] and not a.allow_unknown_speaker:
        say(f"[주의] 화자 코드를 못 뽑은 파일 {stats['speaker_fail']:,}개를 뺐어요. inspect_labels.py 를 보고 fields.json 의 speaker.regex 를 고쳐 주세요.")
    say(f"후보: 학습 라벨 {len(pool['train']):,}개, 검증 라벨 {len(pool['valid']):,}개")
    if not pool["train"] and not pool["valid"]:
        die("조건에 맞는 후보가 없어요. scan_labels.py 의 표와 --sources 에 내려받은 원천 zip을 확인해 주세요.")

    # 평가 먼저 → 평가 화자(와 검증 원천의 모든 화자)를 학습에서 뺀다
    train_pool, eval_pool = pool["train"], pool["valid"]
    eval_path = work / "eval.jsonl"
    kept_eval: list[dict] | None = None
    if a.keep_eval and eval_path.exists():
        kept_eval = [json.loads(x) for x in eval_path.read_text(encoding="utf-8").splitlines() if x.strip()]
        say(f"[알림] 이미 있는 평가 묶음(eval.jsonl, {len(kept_eval):,}개)을 그대로 둬요. 다시 만들려면 --no-keep-eval.")
    if kept_eval is not None:
        eval_sel = []
        eval_speakers = {it["speaker"] for it in kept_eval}
    elif not eval_pool:
        if a.train_hours <= 0:
            # 평가만 할 때: 학습/검증 구분이 없는 데이터(예: kor_formatted)면 내려받은 것 전부를 평가 후보로(화자 단위로 고른다)
            say("[알림] 검증(Validation) 구분이 없어서, 내려받은 발화 전체에서 평가용을 화자 단위로 골라요(평가만 하는 경우).")
            train_pool, eval_pool = [], train_pool
        else:
            say("[알림] 검증(Validation) 후보가 없어서 학습 화자 일부를 평가용으로 떼어 놓아요.")
            train_pool, eval_pool = holdout_eval_from_train(train_pool, a.seed)
    if kept_eval is None:
        eval_sel = select(eval_pool, a.eval_hours, clean_share, a.seed + 1)
        eval_speakers = {it[0].speaker for it in eval_sel}
    exclude = eval_speakers | valid_src_speakers
    train_sel = select([it for it in train_pool if it[0].speaker not in exclude], a.train_hours, clean_share, a.seed)
    train_speakers = {it[0].speaker for it in train_sel}
    overlap = train_speakers & exclude
    if overlap:
        die(f"화자가 학습과 평가에 겹쳤어요({len(overlap)}명). 코드 오류예요.")
    eval_n = len(kept_eval) if kept_eval is not None else len(eval_sel)
    eval_sec = sum(it["seconds"] for it in kept_eval) if kept_eval is not None else sum(i[2] for i in eval_sel)
    say(f"\n고른 결과: 학습 {fmt_hours(sum(i[2] for i in train_sel))}시간({len(train_sel):,}개, 화자 {len(train_speakers)}명), "
        f"평가 {fmt_hours(eval_sec)}시간({eval_n:,}개, 화자 {len(eval_speakers)}명) — 화자 겹침 0명")
    say(f"확인: 학습·평가 화자 겹침 0명 (학습에서 뺀 화자: 검증 원천 {len(valid_src_speakers)}명 + 평가 묶음 {len(eval_speakers)}명, 합쳐 {len(exclude)}명)")
    if a.train_hours > 0 and sum(i[2] for i in train_sel) < a.train_hours * 3600 * 0.9:
        say(f"[알림] 학습 시간이 목표({a.train_hours}시간)에 못 미쳐요. 원천 zip을 더 내려받아 주세요.")
    if kept_eval is None and eval_sec < a.eval_hours * 3600 * 0.9:
        say(f"[알림] 평가 시간이 목표({a.eval_hours}시간)에 못 미쳐요. Validation 원천(VS_) zip을 더 내려받아 주세요.")
    if a.dry_run:
        say("--dry-run 이라 여기서 끝내요.")
        return

    report: Counter = Counter()
    result = extract_audio({"train": train_sel, "valid": eval_sel}, zips, index, work, a, report)
    if kept_eval is not None:
        result["valid"] = kept_eval
    for split, name in (("train", "train.jsonl"), ("valid", "eval.jsonl")):
        if split == "train" and a.train_hours <= 0:
            continue  # 평가만 만들 때는 학습 목록을 쓰지 않는다
        if split == "valid" and kept_eval is not None:
            continue  # 있던 평가 묶음은 건드리지 않는다
        items = sorted(result[split], key=lambda it: (it["grade"], it["id"]))
        with open(work / name, "w", encoding="utf-8") as f:
            for it in items:
                f.write(json.dumps(it, ensure_ascii=False) + "\n")
    summary = {"version": 1, "seed": a.seed, "options": {k: v for k, v in vars(a).items() if k in ("grades", "ages", "category", "noise_ratio", "train_hours", "eval_hours", "min_sec", "max_sec", "unknown_noise")}, "train": summarize(result["train"]), "eval": summarize(result["valid"]), "normalize_rule_hits": dict(hits), "audio": dict(report), "dropped": dict(drop)}
    save_json(work / "subset_report.json", summary)
    say("\n== wav 만들기 ==")
    for k, v in report.most_common():
        say(f"  {k}: {v:,}")
    say(f"\n저장: {work / 'train.jsonl'} ({summary['train']['utterances']:,}개, {summary['train']['hours']}시간)")
    say(f"저장: {work / 'eval.jsonl'} ({summary['eval']['utterances']:,}개, {summary['eval']['hours']}시간)")
    say(f"요약: {work / 'subset_report.json'}")


if __name__ == "__main__":
    main()
