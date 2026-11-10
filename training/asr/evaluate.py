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
    sherpa-whisper:<모델 폴더>       sherpa-onnx 의 Whisper int8 ONNX(*-encoder.int8.onnx, *-decoder.int8.onnx, *-tokens.txt). torch 없이 CPU 로 tiny~turbo (download_models.py whisper-small 등)
  CPU 평가: --threads 는 sherpa-onnx 와 torch 모두에 적용(기본 = 논리 스레드/2). --max-minutes N 은 모델당 시간 상한이고, 넘으면 부분 결과(요약표 발화수 뒤 '*').
  설치되지 않은 백엔드(pip install sherpa-onnx 등)나 없는 모델은 알리고 건너뛰어요. 모델은 하나씩 올리고 내려서 GTX 1060 6GB 에서도 돌아요.
결과는 숫자 표만 work/eval_<모델>.json 에 저장해요(전사 글은 저장하지 않아요). 예시는 --show-examples 일 때만 화면에 나와요.
  - CER: 공백을 뺀 글자 기준, WER: 어절 기준이며 띄어쓰기를 무시해요(인식 결과의 공백을 지우고 글자로 맞춘 뒤 어절별로 셈:
      (대치·삭제 어절 + 끼워 넣은 덩어리) ÷ 원문 어절 수). 공백 어절 그대로 따지는 예전 WER 는 WERsp 열(참고용)로 남겨요.
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

import cpuinfo
from asr_common import add_common_args, load_config, load_wav_16k, read_jsonl, save_json, say, tqdm
from fluency import align_eojeol, levenshtein, split_eojeols
from normalize import normalize_transcript

DEFAULT_MODELS = ["openai/whisper-base", "openai/whisper-small"]
ELMENWOL = "elmenwol/whisper-small_aihub_child"
# 아래 HF id 는 바뀌었거나 없을 수 있어요. 없으면 친절한 오류로 알리고, --moonshine-ids 로 바꿀 수 있어요.
MOONSHINE_IDS = ["moonshine-ai/moonshine-tiny-ko", "moonshine-ai/moonshine-base-ko"]
WEIGHT_SUFFIXES = (".safetensors", ".bin", ".onnx", ".pt")
CLOCK = time.monotonic  # 시험에서 가짜 시계로 바꿀 수 있게 모듈 값으로 둬요


def fmt_duration(sec: float) -> str:
    m = int(round(sec / 60))
    h, m = divmod(m, 60)
    return f"{h}시간 {m}분" if h else f"{m}분"


class Pace:
    """진행 속도를 재서 예상 시간을 알리고, --max-minutes 를 넘으면 멈추라고 알려 준다.

    각 백엔드는 묶음/발화 하나를 처리할 때마다 step(처리한 발화 수, 소리 길이(초), 인식에 쓴 시간(초))을 부르고,
    True 가 돌아오면 그때까지의 결과로 마친다(부분 결과).
    """

    def __init__(self, items, max_minutes: float = 0.0, warm_n: int = 10, warm_sec: float = 30.0):
        self.total_audio = sum(it["seconds"] for it in items)
        self.n_total = len(items)
        self.max_sec = max_minutes * 60 if max_minutes else 0.0
        self.warm_n, self.warm_sec = warm_n, warm_sec
        self.t_start = CLOCK()
        self.announced = False
        self.n = 0
        self.audio = 0.0
        self.spent = 0.0

    def step(self, n: int, audio_sec: float, spent_sec: float) -> bool:
        self.n += n
        self.audio += audio_sec
        self.spent += spent_sec
        if not self.announced and (self.n >= self.warm_n or self.audio >= self.warm_sec) and self.audio > 0:
            self.announced = True
            rtf = self.spent / self.audio
            say(f"  [예상] RTF {rtf:.3f} → 이 모델은 전체 {self.n_total:,}개({self.total_audio / 3600:.2f}시간 분량)를 다 하려면 약 {fmt_duration(rtf * self.total_audio)}")
            if self.max_sec:
                say(f"         (--max-minutes {self.max_sec / 60:g}분 안에 끝나지 않으면 그때까지 한 것으로 부분 결과를 내요)")
        if self.max_sec and CLOCK() - self.t_start >= self.max_sec and self.n < self.n_total:
            say(f"  시간 상한({self.max_sec / 60:g}분)에 닿았어요. {self.n:,}/{self.n_total:,}개까지 한 부분 결과로 마쳐요.")
            return True
        return False


def slug(model: str) -> str:
    parts = re.split(r"[\\/]+", model.strip("/\\"))
    return re.sub(r"[^0-9A-Za-z._-]+", "_", "_".join(parts[-3:]))


def nospace(s: str) -> str:
    return "".join(s.split())


def cer_wer(pairs: list[tuple[str, str]]) -> dict:
    ce = cn = we = wn = se = 0
    for ref, hyp in pairs:
        r, h = nospace(ref), nospace(hyp)
        ce += levenshtein(list(r), list(h))
        cn += len(r)
        # WER(띄어쓰기 무시): 글자 단위 맞춤을 어절별로 모은 결과
        a = align_eojeol(ref, hyp)
        we += sum(1 for x in a.items if x[2] != "match") + len(a.insertions)
        wn += len(a.items)
        # 참고: 공백 어절을 그대로 따지는 예전 WER
        se += levenshtein(ref.split(), hyp.split())
    return {
        "n": len(pairs),
        "cer": round(ce / cn, 4) if cn else None,
        "wer": round(we / wn, 4) if wn else None,
        "wer_spacing": round(se / wn, 4) if wn else None,
    }


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
    torch.set_num_threads(a.threads)
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
    pace = Pace(items, a.max_minutes)
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
        chunk_sec = sum(len(w) for w in wavs) / 16000
        audio_sec += chunk_sec
        hyps.extend(tok.batch_decode(ids, skip_special_tokens=True))
        if pace.step(len(chunk), chunk_sec, time.time() - t0):
            break
    del model
    free_gpu()
    return hyps, spent / audio_sec, size, device


def run_moonshine(spec: str, items, work: Path, a, device: str):
    try:
        import torch
        from transformers import AutoProcessor, MoonshineForConditionalGeneration
    except Exception as e:  # noqa: BLE001
        raise Skip(f"이 transformers 에 Moonshine 이 없거나 torch 가 없어요({e}). transformers 를 올려 보세요.")
    torch.set_num_threads(a.threads)
    hf_check(spec)
    try:
        proc = AutoProcessor.from_pretrained(spec)
        model = MoonshineForConditionalGeneration.from_pretrained(spec, dtype=torch.float32).to(device).eval()
    except Exception as e:  # noqa: BLE001
        raise Skip(f"Moonshine 모델 '{spec}' 을 불러오지 못했어요: {str(e).splitlines()[0] if str(e) else type(e).__name__}")
    size = hf_size_mb(model)
    hyps: list[str] = []
    audio_sec = spent = 0.0
    pace = Pace(items, a.max_minutes)
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
        if pace.step(1, sec, time.time() - t0):
            break
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
    if isinstance(r, str):
        return r
    try:
        return r.text
    except AttributeError:
        return str(r)  # str(r) 를 미리 계산하지 않아요(깨진 바이트가 있으면 오류가 나요)


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
    pace = Pace(items, a.max_minutes)
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
        dt = time.time() - t0
        spent += dt
        audio_sec += len(w) / 16000
        if pace.step(1, len(w) / 16000, dt):
            break
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
    pace = Pace(items, a.max_minutes)
    for it in tqdm(items, desc="인식 중", unit="개", mininterval=2.0):
        w = load_wav_16k(work / it["audio"])
        t0 = time.time()
        st = rec.create_stream()
        st.accept_waveform(16000, w)
        rec.decode_stream(st)
        hyps.append(_decode_text(st.result))
        dt = time.time() - t0
        spent += dt
        audio_sec += len(w) / 16000
        if pace.step(1, len(w) / 16000, dt):
            break
    return hyps, spent / audio_sec, size, "cpu"


def find_whisper_files(folder: Path) -> tuple[Path, Path, Path]:
    """sherpa-onnx Whisper 내보내기 폴더에서 (encoder, decoder, tokens) 파일을 glob 으로 찾는다. int8 우선."""
    if not folder.is_dir():
        raise Skip(f"모델 폴더가 없어요: {folder}")
    enc = _first(folder, ["*-encoder.int8.onnx", "encoder.int8.onnx", "*encoder*.int8.onnx", "*-encoder.onnx", "encoder.onnx"])
    dec = _first(folder, ["*-decoder.int8.onnx", "decoder.int8.onnx", "*decoder*.int8.onnx", "*-decoder.onnx", "decoder.onnx"])
    tokens = _first(folder, ["*-tokens.txt", "tokens.txt"])
    return enc, dec, tokens


def run_sherpa_whisper(spec: str, items, work: Path, a, device: str):
    try:
        import sherpa_onnx
    except Exception:  # noqa: BLE001
        raise Skip("sherpa-onnx 가 설치돼 있지 않아요(pip install sherpa-onnx).")
    enc, dec, tokens = find_whisper_files(Path(spec))
    try:
        rec = sherpa_onnx.OfflineRecognizer.from_whisper(
            encoder=str(enc), decoder=str(dec), tokens=str(tokens), language="ko", task="transcribe", num_threads=a.threads, provider="cpu",
        )
    except Exception as e:  # noqa: BLE001
        raise Skip(f"sherpa-onnx Whisper 인식기를 만들지 못했어요: {str(e).splitlines()[0] if str(e) else type(e).__name__}")
    size = dir_size_mb(Path(spec), [enc, dec, tokens])
    hyps: list[str] = []
    audio_sec = spent = 0.0
    pace = Pace(items, a.max_minutes)
    for it in tqdm(items, desc="인식 중", unit="개", mininterval=2.0):
        w = load_wav_16k(work / it["audio"])
        t0 = time.time()
        st = rec.create_stream()
        st.accept_waveform(16000, w)
        rec.decode_stream(st)
        hyps.append(_decode_text(st.result))
        dt = time.time() - t0
        spent += dt
        audio_sec += len(w) / 16000
        if pace.step(1, len(w) / 16000, dt):
            break
    return hyps, spent / audio_sec, size, "cpu"


BACKENDS = {"whisper": run_whisper, "moonshine": run_moonshine, "sherpa": run_sherpa, "sensevoice": run_sensevoice, "sherpa-whisper": run_sherpa_whisper}


def split_spec(model: str) -> tuple[str, str]:
    m = re.match(r"^(whisper|moonshine|sherpa-whisper|sherpa|sensevoice):(.+)$", model)
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
    ap.add_argument("--threads", type=int, default=cpuinfo.default_threads(), help="CPU 스레드 수(sherpa-onnx와 torch 모두에 적용). 기본: 논리 스레드/2 = 물리 코어 수 어림")
    ap.add_argument("--max-minutes", type=float, default=0.0, help="모델마다 쓸 시간 상한(분). 넘으면 그때까지 한 발화로 '부분 결과'를 내요(0=제한 없음)")
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
    say(f"평가 발화 {len(items):,}개({sum(i['seconds'] for i in items) / 3600:.2f}시간), CPU 스레드 {a.threads}개" + (f", 모델당 상한 {a.max_minutes:g}분" if a.max_minutes else ""))
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
        done = items[: len(raw)]
        if not done:
            say("  건너뜀: 시간 상한 안에 한 발화도 처리하지 못했어요(--max-minutes 를 늘려 주세요).")
            skipped.append((m, "처리한 발화 없음"))
            continue
        partial = len(done) < len(items)
        hyps = [normalize_transcript(h, cfg["normalize"]) or "" for h in raw]
        res = {"model": spec, "backend": backend, "device": dev, "size_mb": size, "beams": a.beams, "rtf": round(rtf, 4),
               "sec_per_min_audio": round(rtf * 60, 2), "threads": a.threads, "n_evaluated": len(done), "n_total": len(items),
               "partial": partial, "peak_ram_mb": None if (pk := cpuinfo.peak_rss_mb()) is None else round(pk)}
        res.update(group_metrics(done, hyps))
        res["scoring"] = scoring_metrics(done, hyps, max_cers, a.seed, a.sim_error_rate)
        save_json(work / f"eval_{slug(spec)}.json", res)
        summary.append(res)
        al = res["all"]
        say(f"CER {al['cer']}  WER(띄어쓰기 무시) {al['wer']}  WERsp(띄어쓰기 따짐, 참고) {al['wer_spacing']}  RTF {res['rtf']}({dev}, {a.threads}스레드) → 1분 낭독을 약 {res['sec_per_min_audio']}초에 처리  파일 크기 {size}MB  (발화 {al['n']}/{len(items)}개{' — 부분 결과' if partial else ''})")
        for k, v in res["by_grade"].items():
            say(f"  학년 {k}: CER {v['cer']} WER {v['wer']} (n={v['n']})")
        for k, v in res["by_noise"].items():
            say(f"  소음 {k}: CER {v['cer']} WER {v['wer']} (n={v['n']})")
        for s in res["scoring"]:
            say(f"  [낭독 채점, 어절 같음 기준 글자오류율≤{s['max_cer']}] 오경보율 어절 {s['false_alarm_eojeol_rate']} / 발화 {s['false_alarm_utterance_rate']}, 놓침률(한 글자 바꾼 어절 {s['simulated_errors']}개) {s['miss_rate_one_syllable']}")
        if a.show_examples:
            say("  -- 예시(내 화면에만 나와요) --")
            for it, h in list(zip(done, hyps))[: a.show_examples]:
                say(f"  정답: {it['text']}\n  인식: {h}")
    say("\n== 비교 요약(숫자만 — 이 표는 채팅에 붙여도 돼요) ==")
    say("(WER = 띄어쓰기 무시 어절 오류율, WERsp = 띄어쓰기까지 따진 예전 WER(참고), 오경보·놓침도 띄어쓰기 무시)")
    say(f"{'모델':<40}{'백엔드':<15}{'장치':<6}{'발화수':>9}{'크기MB':>8}{'CER':>8}{'WER':>8}{'WERsp':>8}{'RTF':>8}{'60초분량(초)':>12}{'RAM최대MB':>10}{'오경보':>8}{'놓침':>8}")
    for r in summary:
        sc = r["scoring"][0] if r["scoring"] else {}
        cnt = f"{r['n_evaluated']}" + ("*" if r["partial"] else "")
        ram = "-" if r["peak_ram_mb"] is None else r["peak_ram_mb"]
        say(f"{r['model'][-39:]:<40}{r['backend']:<15}{r['device']:<6}{cnt:>9}{r['size_mb']!s:>8}{r['all']['cer']!s:>8}{r['all']['wer']!s:>8}{r['all']['wer_spacing']!s:>8}{r['rtf']!s:>8}{r['sec_per_min_audio']!s:>12}{ram!s:>10}{sc.get('false_alarm_eojeol_rate')!s:>8}{sc.get('miss_rate_one_syllable')!s:>8}")
    if any(r["partial"] for r in summary):
        say("(* = 부분 결과: --max-minutes 시간 상한 때문에 앞의 일부 발화만 평가했어요. 정확도 숫자는 참고용이에요)")
    say("(60초분량(초) = RTF×60 = 1분 길이 낭독을 처리하는 데 걸린 시간. RAM최대MB = 이 실행 프로세스의 지금까지 최대치라 뒤 모델 값은 앞 모델 것을 포함해요 → 모델별로 정확히 재려면 모델 하나씩 실행해요)")
    for m, why in skipped:
        say(f"(건너뜀) {m}: {why}")
    say(f"\n저장: {work}/eval_*.json (숫자만)")


if __name__ == "__main__":
    main()
