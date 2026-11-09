"""여러 모델을 평가 묶음(work/eval.jsonl)으로 비교한다: CER·WER(어절), 학년별·소음별, 실시간 배수(RTF), 낭독 채점 지표.

    python evaluate.py                                              # openai/whisper-base, openai/whisper-small
    python evaluate.py --models openai/whisper-base work/runs/base/final
    python evaluate.py --models work/runs/small-lora/final --elmenwol    # 공개된 아동 음성 모델도 함께 비교
    python evaluate.py --limit 200 --show-examples 3                     # 일부만, 전사 예시를 내 화면에만 보기

모델 백엔드(--models 에 접두사로 고르고, 접두사가 없으면 whisper 로 봐요. 이름에 moonshine 이 들어 있으면 moonshine):
    whisper:<HF id 또는 폴더>        transformers Whisper(openai/whisper-small, openai/whisper-base, elmenwol/whisper-small_aihub_child, 학습한 폴더)
    moonshine:<HF id 또는 폴더>      transformers Moonshine(--moonshine 으로 moonshine-tiny-ko, moonshine-base-ko 추가)
    sherpa:<모델 폴더>               sherpa-onnx 스트리밍 zipformer transducer(encoder·decoder·joiner·tokens.txt, int8 우선, --sherpa-chunk 64)
    sensevoice:<모델 폴더>           sherpa-onnx 의 SenseVoice 오프라인 인식기(model.int8.onnx + tokens.txt)
  설치되지 않은 백엔드(pip install sherpa-onnx 등)나 없는 모델은 알리고 건너뛰어요. 모델은 하나씩 올리고 내려서 GTX 1060 6GB 에서도 돌아요.
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
# 아래 HF id 는 바뀌었거나 없을 수 있어요. 없으면 친절한 오류로 알리고, --moonshine-ids 로 바꿀 수 있어요.
MOONSHINE_IDS = ["moonshine-ai/moonshine-tiny-ko", "moonshine-ai/moonshine-base-ko"]
WEIGHT_SUFFIXES = (".safetensors", ".bin", ".onnx", ".pt")


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


class Skip(Exception):
    """이 모델은 건너뛴다(설치 안 된 백엔드, 없는 모델 등). 메시지는 사용자에게 보여 준다."""


def dir_size_mb(path: Path, only: list[Path] | None = None) -> float:
    files = only if only is not None else [p for p in path.rglob("*") if p.is_file() and p.name.endswith(WEIGHT_SUFFIXES)] if path.is_dir() else [path]
    return round(sum(p.stat().st_size for p in files) / 2**20, 1)


def hf_check(model_id: str) -> None:
    """HF id 가 실제로 있는지 확인한다(폴더 경로면 통과)."""
    if Path(model_id).exists():
        return
    try:
        from huggingface_hub import HfApi

        HfApi().model_info(model_id)
    except Exception as e:  # noqa: BLE001
        name = type(e).__name__
        if "NotFound" in name or "404" in str(e):
            raise Skip(f"Hugging Face 에 '{model_id}' 모델이 없어요(이름이 바뀌었을 수 있어요). --moonshine-ids 나 --models 로 정확한 이름을 주세요.")
        # 네트워크 문제 등은 내려받기를 시도하게 둔다


def hf_size_mb(model) -> float:
    return round(sum(p.numel() * p.element_size() for p in model.parameters()) / 2**20, 1)


def pick_device(device: str | None) -> str:
    if device:
        return device
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:  # noqa: BLE001
        return "cpu"


def free_gpu() -> None:
    import gc

    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:  # noqa: BLE001
        pass


def run_whisper(spec: str, items, work: Path, a, device: str):
    try:
        import torch
        from transformers import WhisperFeatureExtractor, WhisperForConditionalGeneration, WhisperTokenizer
    except Exception as e:  # noqa: BLE001
        raise Skip(f"torch/transformers 를 불러오지 못했어요({e})")
    hf_check(spec)
    try:
        fe = WhisperFeatureExtractor.from_pretrained(spec)
        tok = WhisperTokenizer.from_pretrained(spec)
    except Exception:  # noqa: BLE001
        say("  (특징 추출기·토크나이저를 모델 폴더에서 못 읽어 openai/whisper-small 것을 써요)")
        fe = WhisperFeatureExtractor.from_pretrained("openai/whisper-small")
        tok = WhisperTokenizer.from_pretrained("openai/whisper-small")
    model = WhisperForConditionalGeneration.from_pretrained(spec, dtype=torch.float32).to(device).eval()
    model.generation_config.forced_decoder_ids = None
    size = hf_size_mb(model)
    hyps: list[str] = []
    audio_sec = spent = 0.0
    for i in tqdm(range(0, len(items), a.batch), desc="인식 중", unit="묶음", mininterval=2.0):
        chunk = items[i : i + a.batch]
        wavs = [load_wav_16k(work / it["audio"]) for it in chunk]
        t0 = time.time()
        feats = fe(wavs, sampling_rate=16000, return_tensors="pt").input_features.to(device)
        with torch.no_grad():
            ids = model.generate(input_features=feats, language="ko", task="transcribe", num_beams=a.beams, max_new_tokens=200)
        if device == "cuda":
            torch.cuda.synchronize()
        spent += time.time() - t0
        audio_sec += sum(len(w) for w in wavs) / 16000
        hyps.extend(tok.batch_decode(ids, skip_special_tokens=True))
    del model
    free_gpu()
    return hyps, spent / audio_sec, size, device


def run_moonshine(spec: str, items, work: Path, a, device: str):
    try:
        import torch
        from transformers import AutoProcessor, MoonshineForConditionalGeneration
    except Exception as e:  # noqa: BLE001
        raise Skip(f"이 transformers 에 Moonshine 이 없거나 torch 가 없어요({e}). transformers 를 올려 보세요.")
    hf_check(spec)
    try:
        proc = AutoProcessor.from_pretrained(spec)
        model = MoonshineForConditionalGeneration.from_pretrained(spec, dtype=torch.float32).to(device).eval()
    except Exception as e:  # noqa: BLE001
        raise Skip(f"Moonshine 모델 '{spec}' 을 불러오지 못했어요: {str(e).splitlines()[0] if str(e) else type(e).__name__}")
    size = hf_size_mb(model)
    hyps: list[str] = []
    audio_sec = spent = 0.0
    for it in tqdm(items, desc="인식 중", unit="개", mininterval=2.0):
        w = load_wav_16k(work / it["audio"])
        sec = len(w) / 16000
        t0 = time.time()
        inputs = proc(w, sampling_rate=16000, return_tensors="pt").to(device)
        with torch.no_grad():
            ids = model.generate(**inputs, max_new_tokens=int(min(max(sec * 10, 20), 400)))
        if device == "cuda":
            torch.cuda.synchronize()
        spent += time.time() - t0
        audio_sec += sec
        hyps.append(proc.batch_decode(ids, skip_special_tokens=True)[0])
    del model
    free_gpu()
    return hyps, spent / audio_sec, size, device


def _first(folder: Path, patterns: list[str]) -> Path:
    for pat in patterns:
        found = sorted(folder.rglob(pat))
        if found:
            return found[0]
    raise Skip(f"'{folder}' 에서 {' / '.join(patterns)} 파일을 찾지 못했어요.")


def _decode_text(r) -> str:
    return r if isinstance(r, str) else getattr(r, "text", str(r))


def run_sherpa(spec: str, items, work: Path, a, device: str):
    try:
        import numpy as np
        import sherpa_onnx
    except Exception:  # noqa: BLE001
        raise Skip("sherpa-onnx 가 설치돼 있지 않아요(pip install sherpa-onnx).")
    folder = Path(spec)
    if not folder.is_dir():
        raise Skip(f"모델 폴더가 없어요: {folder}")
    chunk = f"chunk-{a.sherpa_chunk}"

    def pick(kind: str) -> Path:
        cands = sorted(folder.rglob(f"{kind}*.onnx"))
        if not cands:
            raise Skip(f"'{folder}' 에 {kind}*.onnx 가 없어요.")
        for pred in (lambda p: chunk in p.name and "int8" in p.name, lambda p: chunk in p.name, lambda p: "int8" in p.name, lambda p: True):
            m = [p for p in cands if pred(p)]
            if m:
                return m[0]
        return cands[0]

    enc, dec, joi = pick("encoder"), pick("decoder"), pick("joiner")
    tokens = _first(folder, ["tokens.txt"])
    try:
        rec = sherpa_onnx.OnlineRecognizer.from_transducer(
            tokens=str(tokens), encoder=str(enc), decoder=str(dec), joiner=str(joi),
            num_threads=a.threads, sample_rate=16000, feature_dim=80, decoding_method="greedy_search", provider="cpu",
        )
    except Exception as e:  # noqa: BLE001
        raise Skip(f"sherpa-onnx 인식기를 만들지 못했어요: {str(e).splitlines()[0] if str(e) else type(e).__name__}")
    size = dir_size_mb(folder, [enc, dec, joi, tokens])
    hyps: list[str] = []
    audio_sec = spent = 0.0
    tail = np.zeros(int(0.66 * 16000), dtype=np.float32)
    for it in tqdm(items, desc="인식 중", unit="개", mininterval=2.0):
        w = load_wav_16k(work / it["audio"])
        t0 = time.time()
        st = rec.create_stream()
        st.accept_waveform(16000, w)
        st.accept_waveform(16000, tail)
        st.input_finished()
        while rec.is_ready(st):
            rec.decode_stream(st)
        hyps.append(_decode_text(rec.get_result(st)))
        spent += time.time() - t0
        audio_sec += len(w) / 16000
    return hyps, spent / audio_sec, size, "cpu"


def run_sensevoice(spec: str, items, work: Path, a, device: str):
    try:
        import sherpa_onnx
    except Exception:  # noqa: BLE001
        raise Skip("sherpa-onnx 가 설치돼 있지 않아요(pip install sherpa-onnx).")
    folder = Path(spec)
    if not folder.is_dir():
        raise Skip(f"모델 폴더가 없어요: {folder}")
    model = _first(folder, ["model.int8.onnx", "model*.int8.onnx", "model.onnx", "*.onnx"])
    tokens = _first(folder, ["tokens.txt"])
    try:
        rec = sherpa_onnx.OfflineRecognizer.from_sense_voice(model=str(model), tokens=str(tokens), num_threads=a.threads, use_itn=False, language="ko", provider="cpu")
    except Exception as e:  # noqa: BLE001
        raise Skip(f"SenseVoice 인식기를 만들지 못했어요: {str(e).splitlines()[0] if str(e) else type(e).__name__}")
    size = dir_size_mb(folder, [model, tokens])
    hyps: list[str] = []
    audio_sec = spent = 0.0
    for it in tqdm(items, desc="인식 중", unit="개", mininterval=2.0):
        w = load_wav_16k(work / it["audio"])
        t0 = time.time()
        st = rec.create_stream()
        st.accept_waveform(16000, w)
        rec.decode_stream(st)
        hyps.append(_decode_text(st.result))
        spent += time.time() - t0
        audio_sec += len(w) / 16000
    return hyps, spent / audio_sec, size, "cpu"


BACKENDS = {"whisper": run_whisper, "moonshine": run_moonshine, "sherpa": run_sherpa, "sensevoice": run_sensevoice}


def split_spec(model: str) -> tuple[str, str]:
    m = re.match(r"^(whisper|moonshine|sherpa|sensevoice):(.+)$", model)
    if m:
        return m.group(1), m.group(2)
    return ("moonshine" if "moonshine" in model.lower() else "whisper"), model


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_common_args(ap)
    ap.add_argument("--models", nargs="+", default=DEFAULT_MODELS, help="[백엔드:]HF id 또는 폴더(여러 개)")
    ap.add_argument("--elmenwol", action="store_true", help=f"{ELMENWOL} 도 함께 평가")
    ap.add_argument("--moonshine", action="store_true", help="Moonshine 한국어 모델(--moonshine-ids)도 함께 평가")
    ap.add_argument("--moonshine-ids", nargs="+", default=MOONSHINE_IDS, help="Moonshine HF id(이름이 다르면 여기서 바꿔요)")
    ap.add_argument("--sherpa-chunk", default="64", help="sherpa 스트리밍 모델 파일 이름에서 고를 chunk 크기(기본 64)")
    ap.add_argument("--threads", type=int, default=4, help="sherpa-onnx CPU 스레드 수")
    ap.add_argument("--eval", default=None, help="기본: work/eval.jsonl")
    ap.add_argument("--limit", type=int, default=0, help="앞에서 N개만")
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--beams", type=int, default=1)
    ap.add_argument("--max-cer", default="0,0.34", help="어절을 같다고 볼 글자 오류율 기준 목록(쉼표)")
    ap.add_argument("--sim-error-rate", type=float, default=0.15, help="놓침률 시험에서 어절을 바꿔 놓을 비율")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--device", default=None, help="whisper·moonshine 의 장치(cuda/cpu, 기본 자동). sherpa 계열은 CPU")
    ap.add_argument("--show-examples", type=int, default=0, help="정답·인식 예시를 이 개수만큼 내 화면에만 보여요(저장 안 함)")
    a = ap.parse_args(argv)

    cfg = load_config(a.fields)
    work = Path(a.work)
    device = pick_device(a.device)
    items = read_jsonl(Path(a.eval) if a.eval else work / "eval.jsonl")
    if a.limit:
        items = items[: a.limit]
    if not items:
        say("평가 발화가 없어요.")
        return
    models = list(a.models)
    if a.elmenwol and ELMENWOL not in models:
        models.append(ELMENWOL)
    if a.moonshine:
        models += [m for m in a.moonshine_ids if m not in models]
    max_cers = [float(x) for x in a.max_cer.split(",") if x.strip()]
    say(f"평가 발화 {len(items):,}개({sum(i['seconds'] for i in items) / 3600:.2f}시간)")
    summary = []
    skipped = []
    for m in models:
        backend, spec = split_spec(m)
        say(f"\n== [{backend}] {spec} ==")
        try:
            raw, rtf, size, dev = BACKENDS[backend](spec, items, work, a, device)
        except Skip as e:
            say(f"  건너뜀: {e}")
            skipped.append((m, str(e)))
            continue
        except Exception as e:  # noqa: BLE001
            msg = str(e).splitlines()[0] if str(e) else type(e).__name__
            if "out of memory" in str(e).lower():
                msg = "GPU 메모리가 모자라요(--batch 를 줄이거나 --device cpu)"
            say(f"  오류로 건너뜀: {msg}")
            skipped.append((m, msg))
            free_gpu()
            continue
        hyps = [normalize_transcript(h, cfg["normalize"]) or "" for h in raw]
        res = {"model": spec, "backend": backend, "device": dev, "size_mb": size, "beams": a.beams, "rtf": round(rtf, 4)}
        res.update(group_metrics(items, hyps))
        res["scoring"] = scoring_metrics(items, hyps, max_cers, a.seed, a.sim_error_rate)
        save_json(work / f"eval_{slug(spec)}.json", res)
        summary.append(res)
        al = res["all"]
        say(f"CER {al['cer']}  WER(어절) {al['wer']}  RTF {res['rtf']}({dev})  파일 크기 {size}MB  (발화 {al['n']}개)")
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
    say("\n== 비교 요약(숫자만 — 이 표는 채팅에 붙여도 돼요) ==")
    say(f"{'모델':<40}{'백엔드':<11}{'장치':<6}{'크기MB':>8}{'CER':>8}{'WER':>8}{'RTF':>8}{'오경보':>8}{'놓침':>8}")
    for r in summary:
        sc = r["scoring"][0] if r["scoring"] else {}
        say(f"{r['model'][-39:]:<40}{r['backend']:<11}{r['device']:<6}{r['size_mb']!s:>8}{r['all']['cer']!s:>8}{r['all']['wer']!s:>8}{r['rtf']!s:>8}{sc.get('false_alarm_eojeol_rate')!s:>8}{sc.get('miss_rate_one_syllable')!s:>8}")
    for m, why in skipped:
        say(f"(건너뜀) {m}: {why}")
    say(f"\n저장: {work}/eval_*.json (숫자만)")


if __name__ == "__main__":
    main()
