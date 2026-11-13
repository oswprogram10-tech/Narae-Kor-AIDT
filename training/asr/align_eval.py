"""원문 기반 낭독 채점(CTC 강제 정렬, align_score.py)과 '받아 적고 맞춰 보기'(evaluate.py 방식)를 같은 자료로 견주는 평가.

    python align_eval.py --model-dir models/sensevoice --bpe models/sensevoice-bpe/chn_jpn_yue_eng_ko_spectok.bpe.model \\
        --limit 300 --sample-balanced

재는 것(모두 어절 단위, 숫자만 출력·저장)
  오경보율  원문 = 아이가 실제로 말한 전사. 이때 '오류'로 판정된 어절 비율(맞게 읽은 것이니 낮을수록 좋음)
  놓침률    원문의 어절 일부를 다른 실제 어절로 바꿔 넣은 원문(아이가 잘못 읽은 상황 흉내)으로 정렬했을 때,
            바꾼 어절을 '맞음'으로 넘긴 비율. 바꾼 어절 종류 세 가지를 따로 잰다.
              similar_len  같은 평가 묶음의 다른 어절 중 글자 수가 비슷한(±1) 것
              one_char     같은 평가 묶음의 다른 어절 중 한 글자만 다른 것(없으면 한 글자를 임의로 바꿈, 개수는 fallback 으로 보고)
              josa         어간은 같고 조사만 다른 것(은/는, 이/가, 을/를, 에/에서 …)
  문턱을 바꿔 가며 '오경보율–놓침률' 표를 만들고, 오경보율 5%·2% 때의 놓침률을 따로 본다.
  같은 표를 받아 적고 맞춰 보는 방식(어절 같음 기준 글자오류율 문턱을 바꿈)과 나란히 보여 준다.

주의: 문턱을 정한 자료와 재는 자료가 같으면 낙관적이다 → 발화를 반으로 갈라 한쪽에서 문턱을 정하고 다른 쪽에서 잰 값(holdout)도 함께 낸다.
학생 글은 저장하지 않는다. 글은 --show-examples 때 이 화면에만 나온다.
"""
from __future__ import annotations

import argparse
import json
import random
import re
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

import cpuinfo
from align_score import SCORE_NAMES, SenseVoiceCTC, fa_miss_at, score_text_robust, threshold_for_fa
from asr_common import add_common_args, load_config, load_wav_16k, read_jsonl, save_json, say, tqdm
from fluency import align_eojeol, split_eojeols
from normalize import normalize_transcript

KINDS = ("similar_len", "one_char", "josa")
JOSA = ["은", "는", "이", "가", "을", "를", "에", "에서", "의", "와", "과", "도", "로", "으로", "만", "까지", "부터", "에게", "처럼", "보다"]
JOSA_SORTED = sorted(JOSA, key=len, reverse=True)
HANGUL = re.compile(r"[가-힣]")


# ----------------------------------------------------------------------------------------------
# 바꿔 넣을 어절 고르기(순수 함수)
# ----------------------------------------------------------------------------------------------


def one_syllable_change(word: str, syllables: list[str], rnd: random.Random) -> str:
    """한글 한 글자를 다른 글자로 바꾼다(evaluate.py 의 같은 이름 함수와 같은 방식)."""
    pos = [i for i, c in enumerate(word) if "가" <= c <= "힣"]
    if not pos:
        return word
    i = rnd.choice(pos)
    for _ in range(20):
        s = rnd.choice(syllables)
        if s != word[i]:
            return word[:i] + s + word[i + 1 :]
    return word


class Pool:
    """평가 묶음에 나온 실제 어절 모음. 글자 수·'한 글자만 다른' 색인을 미리 만들어 둔다."""

    def __init__(self, words):
        self.words = sorted({w for w in words if HANGUL.search(w)})
        self.by_len: dict[int, list[str]] = defaultdict(list)
        self.wild: dict[str, list[str]] = defaultdict(list)
        for w in self.words:
            self.by_len[len(w)].append(w)
            for i in range(len(w)):
                self.wild[w[:i] + "*" + w[i + 1 :]].append(w)

    def similar_len(self, word: str, rnd: random.Random) -> str | None:
        cands = [c for d in (-1, 0, 1) for c in self.by_len.get(len(word) + d, ()) if c != word]
        return rnd.choice(cands) if cands else None

    def one_char(self, word: str, rnd: random.Random) -> tuple[str | None, bool]:
        """(바꾼 어절, 묶음에서 찾았는가). 못 찾으면 한 글자를 임의로 바꾼 것으로 대신한다."""
        cands = sorted({c for i in range(len(word)) for c in self.wild.get(word[:i] + "*" + word[i + 1 :], ()) if c != word})
        if cands:
            return rnd.choice(cands), True
        syl = sorted({c for w in self.words for c in w if "가" <= c <= "힣"}) or ["가"]
        new = one_syllable_change(word, syl, rnd)
        return (new if new != word else None), False


def josa_swap(word: str, rnd: random.Random) -> str | None:
    """어간은 그대로 두고 끝의 조사만 다른 조사로 바꾼다. 조사로 끝나지 않으면 None."""
    for j in JOSA_SORTED:
        if word.endswith(j) and len(word) > len(j):
            stem = word[: -len(j)]
            others = [x for x in JOSA if x != j and not (x.endswith(j) or j.endswith(x))]
            return stem + rnd.choice(others)
    return None


def make_replacement(kind: str, word: str, pool: Pool, rnd: random.Random) -> tuple[str | None, bool]:
    """(바꾼 어절 또는 None, fallback 여부)"""
    if kind == "similar_len":
        return pool.similar_len(word, rnd), False
    if kind == "one_char":
        new, found = pool.one_char(word, rnd)
        return new, not found
    if kind == "josa":
        return josa_swap(word, rnd), False
    raise ValueError(kind)


def pick_items(items: list[dict], limit: int, balanced: bool, seed: int) -> list[dict]:
    if not limit or limit >= len(items):
        return list(items)
    if not balanced:
        return items[:limit]
    rnd = random.Random(seed)
    groups: dict[str, list[dict]] = defaultdict(list)
    for it in items:
        groups[str(it.get("grade", "?"))].append(it)
    for g in groups.values():
        rnd.shuffle(g)
    out: list[dict] = []
    keys = sorted(groups)
    while len(out) < limit and any(groups.values()):
        for k in keys:
            if groups[k] and len(out) < limit:
                out.append(groups[k].pop())
    return out


# ----------------------------------------------------------------------------------------------
# 지표(순수 함수)
# ----------------------------------------------------------------------------------------------


def auc(correct, errors) -> float | None:
    """오류 어절이 맞은 어절보다 점수가 낮을 확률(1이면 완벽히 갈림, 0.5면 못 가림). 같은 점수는 반으로 센다."""
    c = np.sort(np.asarray(correct, dtype=float))
    e = np.asarray(errors, dtype=float)
    if c.size == 0 or e.size == 0:
        return None
    lo = np.searchsorted(c, e, side="left")  # e 보다 작은 맞은 점수 개수
    hi = np.searchsorted(c, e, side="right")
    greater = c.size - hi
    ties = hi - lo
    return float((greater + 0.5 * ties).mean() / c.size)


def roc_rows(correct, errors_by_kind: dict[str, list[float]], targets: list[float]) -> list[dict]:
    rows = []
    for tgt in targets:
        th = threshold_for_fa(correct, tgt)
        row = {"target_fa": tgt, "threshold": round(th, 4), "fa": fa_miss_at(correct, [], th)[0]}
        for k, es in errors_by_kind.items():
            row["miss_" + k] = fa_miss_at([], es, th)[1]
        rows.append(row)
    return rows


def holdout_rows(correct, c_part, errors_by_kind, e_part, targets: list[float]) -> list[dict]:
    """c_part/e_part: 각 점수가 속한 발화의 홀짝(0/1). 짝수 발화에서 문턱을 정해 홀수 발화에서 재고, 반대도 해서 합친다."""
    c = np.asarray(correct, dtype=float)
    cp = np.asarray(c_part)
    rows = []
    for tgt in targets:
        fa_n = fa_d = 0
        miss_n = {k: 0 for k in errors_by_kind}
        miss_d = {k: 0 for k in errors_by_kind}
        for train in (0, 1):
            th = threshold_for_fa(c[cp == train], tgt)
            ct = c[cp != train]
            fa_n += int((ct < th).sum())
            fa_d += ct.size
            for k, es in errors_by_kind.items():
                ea = np.asarray(es, dtype=float)[np.asarray(e_part[k]) != train]
                miss_n[k] += int((ea >= th).sum())
                miss_d[k] += ea.size
        row = {"target_fa": tgt, "fa": fa_n / fa_d if fa_d else None}
        for k in errors_by_kind:
            row["miss_" + k] = miss_n[k] / miss_d[k] if miss_d[k] else None
        rows.append(row)
    return rows


def best_miss_at_fa(points: list[dict], kind: str, target: float) -> float | None:
    """받아 적기 방식의 (오경보율, 놓침률) 점 중 오경보율 ≤ target 인 것 가운데 가장 낮은 놓침률. 없으면 None."""
    ok = [p["miss_" + kind] for p in points if p["fa"] is not None and p["fa"] <= target and p.get("miss_" + kind) is not None]
    return min(ok) if ok else None


# ----------------------------------------------------------------------------------------------


def find_hyps(work: Path, explicit: str | None) -> Path | None:
    if explicit:
        return Path(explicit)
    for p in sorted(work.glob("hyps_*.jsonl")):
        if re.search(r"sense", p.name, re.I):
            return p
    return None


def fmt(x, nd=3):
    return "  -  " if x is None else f"{x:.{nd}f}"


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_common_args(ap)
    ap.add_argument("--model-dir", required=True, help="model.int8.onnx 와 tokens.txt 가 있는 SenseVoice 폴더")
    ap.add_argument("--bpe", required=True, help="chn_jpn_yue_eng_ko_spectok.bpe.model 경로")
    ap.add_argument("--eval", default=None, help="기본: work/eval.jsonl")
    ap.add_argument("--hyps", default=None, help="받아 적은 결과 jsonl(id, hyp). 기본: work/hyps_*sense*.jsonl, 없으면 이 도구의 greedy 결과")
    ap.add_argument("--limit", type=int, default=0, help="발화 N개만(0=전부)")
    ap.add_argument("--sample-balanced", action="store_true", help="--limit 일 때 학년을 고르게 뽑기(기본은 앞에서부터)")
    ap.add_argument("--threads", type=int, default=cpuinfo.default_threads())
    ap.add_argument("--sim-error-rate", type=float, default=0.15, help="바꿔 넣을 어절 비율")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--nbest", type=int, default=1, help="어절마다 다른 쪼개기 후보 수(1=끔). 켜면 느려져요")
    ap.add_argument("--max-cer-grid", default="0,0.1,0.2,0.34,0.5,0.67,1.0", help="받아 적기 방식에서 바꿔 볼 어절 같음 기준(글자오류율)")
    ap.add_argument("--fa-targets", default="0.01,0.02,0.03,0.05,0.08,0.1,0.15,0.2,0.3", help="표에 낼 오경보율 목표")
    ap.add_argument("--out", default=None, help="결과 json(기본: work/align_eval.json)")
    ap.add_argument("--show-examples", type=int, default=0, help="앞 N개 발화의 어절별 점수를 이 화면에만 보여요(저장 안 함)")
    a = ap.parse_args(argv)

    work = Path(a.work)
    cfg = load_config(a.fields)
    all_items = read_jsonl(Path(a.eval) if a.eval else work / "eval.jsonl")
    items = pick_items(all_items, a.limit, a.sample_balanced, a.seed)
    if not items:
        say("평가 발화가 없어요.")
        return
    model = SenseVoiceCTC(a.model_dir, a.bpe, a.threads)
    hyp_path = find_hyps(work, a.hyps)
    hyps_saved: dict[str, str] = {}
    if hyp_path and hyp_path.exists():
        hyps_saved = {r["id"]: r["hyp"] for r in read_jsonl(hyp_path)}
    pool = Pool(w for it in items for w in split_eojeols(it["text"]))
    grid = [float(x) for x in a.max_cer_grid.split(",") if x.strip()]
    targets = [float(x) for x in a.fa_targets.split(",") if x.strip()]
    say(f"평가 발화 {len(items):,}개({sum(i['seconds'] for i in items) / 3600:.2f}시간), CPU 스레드 {a.threads}개, 받아 적기 결과: "
        + (f"저장된 {hyp_path.name}" if hyps_saved else "이 도구의 greedy 결과") + f", 다른 쪼개기 후보 {a.nbest}")

    rnd = random.Random(a.seed)
    correct = {n: [] for n in SCORE_NAMES}
    correct_part: list[int] = []
    errs = {n: {k: [] for k in KINDS} for n in SCORE_NAMES}
    errs_part = {k: [] for k in KINDS}
    base_fa = {mc: [0, 0] for mc in grid}  # [오류로 본 어절, 전체]
    base_miss = {mc: {k: [0, 0] for k in KINDS} for mc in grid}  # [놓친, 전체]
    n_unalignable = n_no_token = n_orig_words = 0
    n_repl = {k: 0 for k in KINDS}
    n_fallback = 0
    model_sec = align_sec = audio_sec = 0.0
    n_align = 0
    shown = 0

    for idx, it in enumerate(tqdm(items, desc="정렬 중", unit="개", mininterval=2.0)):
        text = it["text"]
        words = split_eojeols(text)
        if not words:
            continue
        wav = load_wav_16k(work / it["audio"])
        t0 = time.time()
        lp = model.log_probs(wav)
        model_sec += time.time() - t0
        audio_sec += len(wav) / 16000
        t0 = time.time()
        sc, _ = score_text_robust(lp, model.sp, text, a.nbest)
        n_align += 1
        if sc is None:
            n_unalignable += 1
            align_sec += time.time() - t0
            continue
        part = idx % 2
        for s in sc:
            if s is None:
                n_no_token += 1
                continue
            for n in SCORE_NAMES:
                correct[n].append(s.get(n))
            correct_part.append(part)
        n_orig_words += len(words)
        if hyps_saved and it["id"] in hyps_saved:
            hyp = hyps_saved[it["id"]]
        else:
            hyp = normalize_transcript(model.greedy_text(lp), cfg["normalize"]) or ""
        # 받아 적기 방식: 원문 = 정답 전사
        for mc in grid:
            al = align_eojeol(text, hyp, mc)
            base_fa[mc][0] += sum(1 for x in al.items if x[2] != "match")
            base_fa[mc][1] += len(al.items)
        # 바꿔 넣은 원문
        for kind in KINDS:
            mod = list(words)
            changed = []
            for i, w in enumerate(words):
                if rnd.random() >= a.sim_error_rate:
                    continue
                new, fb = make_replacement(kind, w, pool, rnd)
                if new is None or new == w:
                    continue
                mod[i] = new
                changed.append(i)
                n_fallback += int(fb)
            if not changed:
                continue
            mod_text = " ".join(mod)
            sm, _ = score_text_robust(lp, model.sp, mod_text, a.nbest)
            if sm is not None:
                for i in changed:
                    if sm[i] is None:
                        continue
                    n_repl[kind] += 1
                    for n in SCORE_NAMES:
                        errs[n][kind].append(sm[i].get(n))
                    errs_part[kind].append(part)
                    # 같은 어절을 받아 적기 방식으로도(같은 어절 집합에서 비교하려고 정렬 가능한 경우에만)
                    for mc in grid:
                        b = align_eojeol(mod_text, hyp, mc)
                        base_miss[mc][kind][1] += 1
                        base_miss[mc][kind][0] += int(b.items[i][2] == "match")
        align_sec += time.time() - t0
        if shown < a.show_examples:
            shown += 1
            say(f"\n-- 예시 {shown} (이 화면에만 나와요) --\n원문: {text}\n받아 적기: {hyp}")
            for w, s in zip(words, sc):
                say(f"  {w:<10}" + ("  (토큰 없음)" if s is None else "".join(f"{n} {s.get(n):8.3f}  " for n in SCORE_NAMES)))

    n_correct = len(correct["gop"])
    if n_correct == 0:
        say("정렬에 성공한 어절이 없어요.")
        return
    result: dict = {
        "config": {"n_utterances": len(items), "threads": a.threads, "seed": a.seed, "sim_error_rate": a.sim_error_rate, "nbest": a.nbest,
                   "hyps_source": "saved" if hyps_saved else "own_greedy", "sample_balanced": bool(a.sample_balanced)},
        "counts": {"correct_eojeols": n_correct, "replaced": n_repl, "one_char_fallback": n_fallback, "unalignable_utterances": n_unalignable, "eojeols_without_token": n_no_token},
        "speed": {"model_rtf": round(model_sec / audio_sec, 4) if audio_sec else None, "align_ms_per_utterance": round(1000 * align_sec / max(n_align, 1), 2),
                  "audio_hours": round(audio_sec / 3600, 4), "peak_ram_mb": None if (pk := cpuinfo.peak_rss_mb()) is None else round(pk)},
        "align": {},
        "baseline": {},
    }
    for n in SCORE_NAMES:
        result["align"][n] = {
            "auc": {k: auc(correct[n], errs[n][k]) for k in KINDS},
            "roc": roc_rows(correct[n], errs[n], targets),
            "holdout": holdout_rows(correct[n], correct_part, errs[n], errs_part, [0.05, 0.02]),
        }
    pts = []
    for mc in grid:
        p = {"max_cer": mc, "fa": base_fa[mc][0] / base_fa[mc][1] if base_fa[mc][1] else None}
        for k in KINDS:
            m, t = base_miss[mc][k]
            p["miss_" + k] = m / t if t else None
        pts.append(p)
    result["baseline"] = {"points": pts}

    say(f"\n정렬한 발화 {len(items) - n_unalignable:,}개(정렬 불가 {n_unalignable}), 맞게 읽은 어절 {n_correct:,}개, 바꿔 넣은 어절 "
        + ", ".join(f"{k} {n_repl[k]:,}" for k in KINDS) + f"(한 글자는 묶음에 없어 임의로 바꾼 것 {n_fallback})")
    say(f"속도: 모델(전처리+ONNX) RTF {result['speed']['model_rtf']}, 정렬·채점 발화당 {result['speed']['align_ms_per_utterance']}ms(바꾼 원문 정렬 포함), RAM 최대 {result['speed']['peak_ram_mb']}MB")

    say("\n== 구분 능력 AUC(1=완벽, 0.5=못 가림): 맞게 읽은 어절 vs 바꿔 넣은 어절 ==")
    say(f"{'점수':<12}" + "".join(f"{k:>13}" for k in KINDS))
    for n in SCORE_NAMES:
        say(f"{n:<12}" + "".join(f"{fmt(result['align'][n]['auc'][k]):>13}" for k in KINDS))

    for n in SCORE_NAMES:
        say(f"\n== 강제 정렬 [{n}] 오경보율–놓침률 표(문턱보다 낮으면 '다시 읽어 볼 곳') ==")
        say(f"{'목표FA':>7}{'문턱':>10}{'FA':>8}" + "".join(f"{'놓침 ' + k:>20}" for k in KINDS))
        for r in result["align"][n]["roc"]:
            say(f"{r['target_fa']:>7.2f}{r['threshold']:>10.3f}{fmt(r['fa']):>8}" + "".join(f"{fmt(r['miss_' + k]):>20}" for k in KINDS))
        for r in result["align"][n]["holdout"]:
            say(f"  (holdout: 반으로 갈라 문턱을 정해 다른 쪽에서 잼) 목표FA {r['target_fa']:.2f} → FA {fmt(r['fa'])}, " + ", ".join(f"놓침 {k} {fmt(r['miss_' + k])}" for k in KINDS))

    say("\n== 받아 적고 맞춰 보기(evaluate 방식, 어절 같음 기준 글자오류율 문턱을 바꿈) ==")
    say(f"{'max_cer':>8}{'FA':>8}" + "".join(f"{'놓침 ' + k:>20}" for k in KINDS))
    for p in pts:
        say(f"{p['max_cer']:>8.2f}{fmt(p['fa']):>8}" + "".join(f"{fmt(p['miss_' + k]):>20}" for k in KINDS))

    say("\n== 같은 오경보율에서의 놓침률 비교(낮을수록 좋음; '-'는 그 방식으로는 그 오경보율에 못 닿음) ==")
    comp = {}
    for tgt in (0.05, 0.02):
        say(f"[오경보율 ≤ {tgt:.0%}]")
        say(f"{'방식':<22}" + "".join(f"{k:>13}" for k in KINDS))
        row = {k: best_miss_at_fa(pts, k, tgt) for k in KINDS}
        comp[f"baseline@{tgt}"] = row
        say(f"{'받아 적고 맞춰 보기':<22}" + "".join(f"{fmt(row[k]):>13}" for k in KINDS))
        for n in SCORE_NAMES:
            r = next(x for x in result["align"][n]["roc"] if abs(x["target_fa"] - tgt) < 1e-9) if any(abs(x["target_fa"] - tgt) < 1e-9 for x in result["align"][n]["roc"]) else None
            if r is None:
                continue
            comp[f"{n}@{tgt}"] = {k: r["miss_" + k] for k in KINDS}
            say(f"{'강제 정렬 ' + n:<22}" + "".join(f"{fmt(r['miss_' + k]):>13}" for k in KINDS))
    result["comparison"] = comp

    out = Path(a.out) if a.out else work / "align_eval.json"
    save_json(out, result)
    say(f"\n저장: {out} (숫자만)")


if __name__ == "__main__":
    main()
