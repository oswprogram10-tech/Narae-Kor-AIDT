"""여러 모델을 평가 묶음(work/eval.jsonl)으로 비교한다: CER·WER(어절), 학년별·소음별, 실시간 배수(RTF), 낭독 채점 지표.

    python evaluate.py                                              # openai/whisper-base, openai/whisper-small
    python evaluate.py --models openai/whisper-base work/runs/base/final
    python evaluate.py --models work/runs/small-lora/final --elmenwol    # 공개된 아동 음성 모델도 함께 비교
    python evaluate.py --limit 200 --show-examples 3                     # 일부만, 전사 예시를 내 화면에만 보기

결과는 숫자 표만 work/eval_<모델>.json 에 저장해요(전사 글은 저장하지 않아요). 예시는 --show-examples 일 때만 화면에 나와요.
  - CER: 공백을 뺀 글자 기준, WER: 어절 기준(둘 다 편집 거리 ÷ 정답 길이).
  - 낭독 채점 지표(어절 맞춤, fluency.py): 아이가 정확히 읽었다고 가정하고 정답 글을 원문으로 삼았을 때
      오경보율 = 정답인데 오류(대치·삭제)로 표시된 어절 비율, 발화 단위도 함께.
      놓침률 = 원문의 어절 일부를 '한 글자만 다른 어절'로 바꿔 놓았을 때(아이가 그렇게 잘못 읽은 상황) 오류로 못 잡은 비율.
    어절을 '같다'고 볼 글자 오류율 기준(--max-cer, 기본 0과 0.34)에 따라 두 값이 어떻게 달라지는지 같이 보여 줘요.
"""
from __future__ import annotations

import argparse
import random
import re
import time
from collections import defaultdict
from pathlib import Path

from asr_common import add_common_args, load_config, load_wav_16k, read_jsonl, save_json, say, tqdm
from fluency import align_eojeol, levenshtein, split_eojeols
from normalize import normalize_transcript

DEFAULT_MODELS = ["openai/whisper-base", "openai/whisper-small"]
ELMENWOL = "elmenwol/whisper-small_aihub_child"


def slug(model: str) -> str:
    parts = re.split(r"[\\/]+", model.strip("/\\"))
    return re.sub(r"[^0-9A-Za-z._-]+", "_", "_".join(parts[-3:]))


def nospace(s: str) -> str:
    return "".join(s.split())


def cer_wer(pairs: list[tuple[str, str]]) -> dict:
    ce = cn = we = wn = 0
    for ref, hyp in pairs:
        r, h = nospace(ref), nospace(hyp)
        ce += levenshtein(list(r), list(h))
        cn += len(r)
        rw, hw = ref.split(), hyp.split()
        we += levenshtein(rw, hw)
        wn += len(rw)
    return {"n": len(pairs), "cer": round(ce / cn, 4) if cn else None, "wer": round(we / wn, 4) if wn else None}


def group_metrics(items: list[dict], hyps: list[str]) -> dict:
    out = {"all": cer_wer(list(zip((it["text"] for it in items), hyps)))}
    out["all"]["hours"] = round(sum(it["seconds"] for it in items) / 3600, 4)
    for key in ("grade", "noise"):
        groups: dict[str, list[tuple[str, str]]] = defaultdict(list)
        for it, h in zip(items, hyps):
            groups[it[key]].append((it["text"], h))
        out["by_" + key] = {k: cer_wer(v) for k, v in sorted(groups.items())}
    return out


def one_syllable_change(word: str, syllables: list[str], rnd: random.Random) -> str:
    pos = [i for i, c in enumerate(word) if "가" <= c <= "힣"]
    if not pos:
        return word
    i = rnd.choice(pos)
    for _ in range(20):
        s = rnd.choice(syllables)
        if s != word[i]:
            return word[:i] + s + word[i + 1 :]
    return word


def scoring_metrics(items: list[dict], hyps: list[str], max_cers: list[float], seed: int, sim_rate: float) -> list[dict]:
    syllables = sorted({c for it in items for c in it["text"] if "가" <= c <= "힣"}) or ["가"]
    out = []
    for mc in max_cers:
        rnd = random.Random(seed)
        total = wrong = utt_wrong = 0
        sim_total = sim_missed = 0
        for it, hyp in zip(items, hyps):
            ref = it["text"]
            words = split_eojeols(ref)
            if not words:
                continue
            a = align_eojeol(ref, hyp, mc)
            bad = sum(1 for x in a.items if x[2] != "match")
            total += len(a.items)
            wrong += bad
            utt_wrong += 1 if bad else 0
            changed = [i for i in range(len(words)) if rnd.random() < sim_rate]
            if not changed:
                continue
            mod = list(words)
            for i in changed:
                mod[i] = one_syllable_change(words[i], syllables, rnd)
            changed = [i for i in changed if mod[i] != words[i]]
            if not changed:
                continue
            b = align_eojeol(" ".join(mod), hyp, mc)
            for i in changed:
                sim_total += 1
                if b.items[i][2] == "match":
                    sim_missed += 1
        out.append(
            {
                "max_cer": mc,
                "eojeols": total,
                "false_alarm_eojeol_rate": round(wrong / total, 4) if total else None,
                "false_alarm_utterance_rate": round(utt_wrong / len(items), 4) if items else None,
                "simulated_errors": sim_total,
                "miss_rate_one_syllable": round(sim_missed / sim_total, 4) if sim_total else None,
            }
        )
    return out


def transcribe(model_path: str, items: list[dict], work: Path, device: str, batch: int, beams: int, show: bool) -> tuple[list[str], float]:
    import torch
    from transformers import WhisperFeatureExtractor, WhisperForConditionalGeneration, WhisperTokenizer

    try:
        fe = WhisperFeatureExtractor.from_pretrained(model_path)
        tok = WhisperTokenizer.from_pretrained(model_path)
    except Exception:  # noqa: BLE001
        say("  (특징 추출기·토크나이저를 모델 폴더에서 못 읽어 openai/whisper-small 것을 써요)")
        fe = WhisperFeatureExtractor.from_pretrained("openai/whisper-small")
        tok = WhisperTokenizer.from_pretrained("openai/whisper-small")
    model = WhisperForConditionalGeneration.from_pretrained(model_path, torch_dtype=torch.float32).to(device).eval()
    model.generation_config.forced_decoder_ids = None
    hyps: list[str] = []
    audio_sec = 0.0
    spent = 0.0
    for i in tqdm(range(0, len(items), batch), desc="인식 중", unit="묶음", mininterval=2.0):
        chunk = items[i : i + batch]
        wavs = [load_wav_16k(work / it["audio"]) for it in chunk]
        t0 = time.time()
        feats = fe(wavs, sampling_rate=16000, return_tensors="pt").input_features.to(device)
        with torch.no_grad():
            ids = model.generate(input_features=feats, language="ko", task="transcribe", num_beams=beams, max_new_tokens=200)
        if device == "cuda":
            torch.cuda.synchronize()
        spent += time.time() - t0
        audio_sec += sum(len(w) for w in wavs) / 16000
        hyps.extend(tok.batch_decode(ids, skip_special_tokens=True))
    del model
    if device == "cuda":
        torch.cuda.empty_cache()
    return hyps, (spent / audio_sec if audio_sec else 0.0)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_common_args(ap)
    ap.add_argument("--models", nargs="+", default=DEFAULT_MODELS, help="HF id 또는 학습 결과 폴더(여러 개)")
    ap.add_argument("--elmenwol", action="store_true", help=f"{ELMENWOL} 도 함께 평가")
    ap.add_argument("--eval", default=None, help="기본: work/eval.jsonl")
    ap.add_argument("--limit", type=int, default=0, help="앞에서 N개만")
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--beams", type=int, default=1)
    ap.add_argument("--max-cer", default="0,0.34", help="어절을 같다고 볼 글자 오류율 기준 목록(쉼표)")
    ap.add_argument("--sim-error-rate", type=float, default=0.15, help="놓침률 시험에서 어절을 바꿔 놓을 비율")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--device", default=None)
    ap.add_argument("--show-examples", type=int, default=0, help="정답·인식 예시를 이 개수만큼 내 화면에만 보여요(저장 안 함)")
    a = ap.parse_args(argv)

    import torch

    cfg = load_config(a.fields)
    work = Path(a.work)
    device = a.device or ("cuda" if torch.cuda.is_available() else "cpu")
    items = read_jsonl(Path(a.eval) if a.eval else work / "eval.jsonl")
    if a.limit:
        items = items[: a.limit]
    if not items:
        say("평가 발화가 없어요.")
        return
    models = list(a.models) + ([ELMENWOL] if a.elmenwol and ELMENWOL not in a.models else [])
    max_cers = [float(x) for x in a.max_cer.split(",") if x.strip()]
    say(f"평가 발화 {len(items):,}개({sum(i['seconds'] for i in items) / 3600:.2f}시간), 장치 {device}")
    summary = []
    for m in models:
        say(f"\n== {m} ==")
        raw, rtf = transcribe(m, items, work, device, a.batch, a.beams, False)
        hyps = [normalize_transcript(h, cfg["normalize"]) or "" for h in raw]
        res = {"model": m, "device": device, "beams": a.beams, "rtf": round(rtf, 4)}
        res.update(group_metrics(items, hyps))
        res["scoring"] = scoring_metrics(items, hyps, max_cers, a.seed, a.sim_error_rate)
        save_json(work / f"eval_{slug(m)}.json", res)
        summary.append(res)
        al = res["all"]
        say(f"CER {al['cer']}  WER(어절) {al['wer']}  RTF {res['rtf']}  (발화 {al['n']}개)")
        for k, v in res["by_grade"].items():
            say(f"  학년 {k}: CER {v['cer']} WER {v['wer']} (n={v['n']})")
        for k, v in res["by_noise"].items():
            say(f"  소음 {k}: CER {v['cer']} WER {v['wer']} (n={v['n']})")
        for s in res["scoring"]:
            say(f"  [낭독 채점, 어절 같음 기준 글자오류율≤{s['max_cer']}] 오경보율 어절 {s['false_alarm_eojeol_rate']} / 발화 {s['false_alarm_utterance_rate']}, 놓침률(한 글자 바꾼 어절 {s['simulated_errors']}개) {s['miss_rate_one_syllable']}")
        if a.show_examples:
            say("  -- 예시(내 화면에만 나와요) --")
            for it, h in list(zip(items, hyps))[: a.show_examples]:
                say(f"  정답: {it['text']}\n  인식: {h}")
    say("\n== 비교 요약 ==")
    say(f"{'모델':<48}{'CER':>8}{'WER':>8}{'RTF':>8}{'오경보(어절)':>12}")
    for r in summary:
        fa = r["scoring"][0]["false_alarm_eojeol_rate"] if r["scoring"] else None
        say(f"{r['model'][-47:]:<48}{r['all']['cer']!s:>8}{r['all']['wer']!s:>8}{r['rtf']!s:>8}{fa!s:>12}")
    say(f"\n저장: {work}/eval_*.json (숫자만)")


if __name__ == "__main__":
    main()
