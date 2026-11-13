"""원문 기반 낭독 채점 연구 도구: SenseVoice CTC 강제 정렬 + 어절별 점수(GOP 류).

낭독은 읽을 글(원문)을 미리 안다. '받아 적은 글'을 원문과 맞춰 보는 대신,
원문의 토큰열을 소리(프레임별 CTC 로그확률)에 강제로 맞추고 어절마다 '원문대로 읽은 소리인가'를 점수로 잰다.

    python align_score.py --model-dir models/sensevoice --bpe models/sensevoice-bpe/chn_jpn_yue_eng_ko_spectok.bpe.model \\
        --wav a.wav --text "그는 괜찮은 척하려고 애쓰는 것 같았다."

점수는 모두 '클수록(0이나 1에 가까울수록) 원문대로 읽음'이다. 문턱보다 낮으면 '다시 읽어 볼 곳'.
  gop        어절 구간에서 (강제 정렬 경로 평균 로그확률 − 자유 디코딩 최선 경로 평균 로그확률), 0 이하
  min_post   어절 토큰 중 가장 낮은 사후확률(토큰이 차지한 프레임 중 최고값), 0~1
  mean_post  어절 토큰 사후확률 평균, 0~1
  min_lpr    토큰마다 (원문 토큰 로그확률 − 그 프레임에서 빈칸 아닌 최선 토큰 로그확률)의 최솟값, 0 이하

순수 numpy 로 돌아간다(torch·torchaudio 불필요). 모델 입력은 sherpa-onnx 의 SenseVoice 와 같은 전처리를 쓴다.
평가는 align_eval.py. 학생 음성·글은 이 도구가 저장하지 않는다.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from fluency import split_eojeols

BLANK = 0  # SenseVoice 의 CTC 빈칸은 <unk>(id 0)
NEG_INF = -1e30
SCORE_NAMES = ("gop", "min_post", "mean_post", "min_lpr")
TOKENS_TO_SKIP_PREFIX = "<|"  # <|ko|> 같은 특수 토큰


# ----------------------------------------------------------------------------------------------
# 순수 함수: CTC 강제 정렬, 어절 점수
# ----------------------------------------------------------------------------------------------


def log_softmax(x: np.ndarray) -> np.ndarray:
    m = x.max(axis=-1, keepdims=True)
    y = x - m
    return y - np.log(np.exp(y).sum(axis=-1, keepdims=True))


def ctc_min_frames(tokens: list[int]) -> int:
    """이 토큰열을 CTC 로 낼 수 있는 최소 프레임 수(같은 토큰이 이어지면 사이에 빈칸이 하나 필요)."""
    return len(tokens) + sum(1 for a, b in zip(tokens, tokens[1:]) if a == b)


def force_align(logp: np.ndarray, tokens: list[int], blank: int = BLANK) -> np.ndarray | None:
    """CTC 강제 정렬(viterbi). logp: (T, V) 로그확률. 반환: 프레임마다 확장열 상태 번호 (T,)
    (짝수=빈칸, 홀수 2k+1 = k번째 토큰). 프레임이 모자라 정렬할 수 없으면 None."""
    T = logp.shape[0]
    L = len(tokens)
    if L == 0 or T < ctc_min_frames(tokens):
        return None
    S = 2 * L + 1
    ext = np.full(S, blank, dtype=np.int64)
    ext[1::2] = tokens
    em = logp[:, ext]  # (T, S)
    # s-2 로 건너뛰기: 빈칸이 아니고 두 칸 앞 토큰과 다를 때만
    skip_ok = np.zeros(S, dtype=bool)
    skip_ok[2:] = (ext[2:] != blank) & (ext[2:] != ext[:-2])
    dp = np.full(S, NEG_INF)
    dp[0] = em[0, 0]
    if S > 1:
        dp[1] = em[0, 1]
    back = np.zeros((T, S), dtype=np.int8)  # 0: 그대로, 1: s-1 에서, 2: s-2 에서
    for t in range(1, T):
        c0 = dp
        c1 = np.concatenate(([NEG_INF], dp[:-1]))
        c2 = np.concatenate(([NEG_INF, NEG_INF], dp[:-2]))
        c2 = np.where(skip_ok, c2, NEG_INF)
        stack = np.stack((c0, c1, c2))
        arg = stack.argmax(axis=0)
        back[t] = arg
        dp = stack[arg, np.arange(S)] + em[t]
    # 끝은 마지막 토큰 또는 그 뒤 빈칸
    s = S - 1 if S == 1 or dp[S - 1] >= dp[S - 2] else S - 2
    if dp[s] <= NEG_INF / 2:
        return None
    path = np.zeros(T, dtype=np.int64)
    for t in range(T - 1, -1, -1):
        path[t] = s
        s -= int(back[t, s])
    return path


@dataclass
class WordScore:
    n_tokens: int
    start: int  # 어절 구간의 첫 프레임(첫 토큰이 처음 나온 프레임)
    end: int  # 마지막 프레임(포함)
    gop: float
    min_post: float
    mean_post: float
    min_lpr: float

    def get(self, name: str) -> float:
        return getattr(self, name)


def score_words(logp: np.ndarray, path: np.ndarray, tokens: list[int], word_tok_ranges: list[tuple[int, int]],
                blank: int = BLANK) -> list[WordScore | None]:
    """어절마다 점수. word_tok_ranges[i] = (토큰열에서 시작, 끝(미포함)). 토큰이 없는 어절은 None."""
    T = logp.shape[0]
    labels = np.where(path % 2 == 1, np.array(tokens, dtype=np.int64)[np.minimum(path // 2, len(tokens) - 1)], blank)
    forced = logp[np.arange(T), labels]
    best = logp.max(axis=1)
    nb = logp.copy()
    nb[:, blank] = NEG_INF
    best_nb = nb.max(axis=1)
    tok_of_frame = np.where(path % 2 == 1, path // 2, -1)
    out: list[WordScore | None] = []
    for a, b in word_tok_ranges:
        if b <= a:
            out.append(None)
            continue
        frames_per_tok = [np.nonzero(tok_of_frame == k)[0] for k in range(a, b)]
        start = int(frames_per_tok[0][0])
        end = int(frames_per_tok[-1][-1])
        span = slice(start, end + 1)
        gop = float(forced[span].mean() - best[span].mean())
        posts, lprs = [], []
        for k, fr in zip(range(a, b), frames_per_tok):
            lp = logp[fr, tokens[k]]
            posts.append(float(np.exp(lp.max())))
            lprs.append(float((lp - best_nb[fr]).max()))
        out.append(WordScore(b - a, start, end, gop, min(posts), float(np.mean(posts)), min(lprs)))
    return out


def greedy_ids(logp: np.ndarray, blank: int = BLANK) -> list[int]:
    ids = logp.argmax(axis=1)
    out: list[int] = []
    prev = -1
    for i in ids.tolist():
        if i != prev and i != blank:
            out.append(i)
        prev = i
    return out


# ----------------------------------------------------------------------------------------------
# 지표 계산(문턱별 오경보율·놓침률) — 순수 함수
# ----------------------------------------------------------------------------------------------


def fa_miss_at(correct_scores, error_scores, threshold: float) -> tuple[float | None, float | None]:
    """점수 < 문턱이면 '다시 읽어 볼 곳'. 오경보율 = 맞게 읽은 어절 중 오류로 판정된 비율,
    놓침률 = 잘못 읽은 어절 중 맞음으로 넘긴 비율."""
    c = np.asarray(correct_scores, dtype=float)
    e = np.asarray(error_scores, dtype=float)
    fa = float((c < threshold).mean()) if c.size else None
    miss = float((e >= threshold).mean()) if e.size else None
    return fa, miss


def threshold_for_fa(correct_scores, target: float) -> float:
    """오경보율이 target 이하가 되는 가장 큰(=가장 엄격하지 않은) 문턱. 점수 < 문턱 이 오류.
    맞게 읽은 점수의 target 분위수 값을 문턱으로 쓴다."""
    c = np.sort(np.asarray(correct_scores, dtype=float))
    if c.size == 0:
        return float("-inf")
    k = int(np.floor(target * c.size))  # 이 개수까지는 오류로 판정해도 FA <= target
    if k <= 0:
        return float(c[0])  # 아무것도 오류로 안 봄(점수 < c[0] 은 없음)
    # c[k-1] < 문턱 <= c[k]: FA = k/N. 문턱은 c[k] 로 잡는다
    return float(c[min(k, c.size - 1)])


def roc_table(correct_scores, error_scores_by_type: dict[str, list[float]], fa_targets: list[float]) -> list[dict]:
    rows = []
    for tgt in fa_targets:
        th = threshold_for_fa(correct_scores, tgt)
        fa, _ = fa_miss_at(correct_scores, [], th)
        row = {"target_fa": tgt, "threshold": th, "fa": fa}
        for typ, es in error_scores_by_type.items():
            row["miss_" + typ] = fa_miss_at([], es, th)[1]
        rows.append(row)
    return rows


# ----------------------------------------------------------------------------------------------
# 원문 → 토큰
# ----------------------------------------------------------------------------------------------


def load_tokens_txt(path: Path) -> list[str]:
    toks: dict[int, str] = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        tok, _, idx = line.rpartition(" ")
        toks[int(idx)] = tok
    return [toks[i] for i in range(len(toks))]


def text_to_tokens(sp, text: str) -> tuple[list[int], list[tuple[int, int]], list[str]]:
    """원문 → (토큰 id 열, 어절별 (시작, 끝) 토큰 구간, 어절 목록). 문장부호는 지운다(받아 적기 쪽 전처리와 같은 split_eojeols).
    어절마다 따로 SentencePiece 로 쪼갠다(공백 단위로 ▁ 가 붙으므로 문장 통째로 쪼갠 것과 같다). 사전에 없는 글자(unk)는 건너뛴다."""
    words = split_eojeols(text)
    ids: list[int] = []
    ranges: list[tuple[int, int]] = []
    unk = sp.unk_id()
    for w in words:
        a = len(ids)
        ids.extend(i for i in sp.encode(w) if i != unk and i != BLANK)
        ranges.append((a, len(ids)))
    return ids, ranges, words


# ----------------------------------------------------------------------------------------------
# SenseVoice ONNX
# ----------------------------------------------------------------------------------------------


class SenseVoiceCTC:
    """SenseVoice-Small ONNX(sherpa-onnx 배포본)를 onnxruntime 으로 직접 돌려 프레임별 로그확률을 얻는다."""

    N_QUERY = 4  # 앞쪽 프레임 4개는 언어·감정·이벤트·itn 쿼리 자리

    def __init__(self, model_dir: str | Path, bpe_model: str | Path, threads: int = 2, model_file: str | None = None):
        import onnxruntime as ort
        import sentencepiece as spm

        d = Path(model_dir)
        mf = Path(model_file) if model_file else next((p for p in (d / "model.int8.onnx", d / "model.onnx") if p.exists()), None)
        if mf is None or not mf.exists():
            raise FileNotFoundError(f"모델 파일이 없어요: {d}")
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads
        so.inter_op_num_threads = 1
        self.sess = ort.InferenceSession(str(mf), so, providers=["CPUExecutionProvider"])
        self.input_names = [i.name for i in self.sess.get_inputs()]
        meta = self.sess.get_modelmeta().custom_metadata_map
        self.lfr_window = int(meta["lfr_window_size"])
        self.lfr_shift = int(meta["lfr_window_shift"])
        self.neg_mean = np.array([float(x) for x in meta["neg_mean"].split(",")], dtype=np.float32)
        self.inv_std = np.array([float(x) for x in meta["inv_stddev"].split(",")], dtype=np.float32)
        self.normalize_samples = int(meta.get("normalize_samples", "0"))
        self.lang_id = int(meta["lang_ko"])
        self.textnorm_id = int(meta["without_itn"])
        self.tokens = load_tokens_txt(d / "tokens.txt")
        self.sp = spm.SentencePieceProcessor(model_file=str(bpe_model))

    # --- 전처리(sherpa-onnx 와 같다) ---
    def features(self, wav: np.ndarray) -> np.ndarray:
        import kaldi_native_fbank as knf

        opts = knf.FbankOptions()
        opts.frame_opts.dither = 0.0
        opts.frame_opts.snip_edges = False
        opts.frame_opts.samp_freq = 16000
        opts.frame_opts.window_type = "hamming"
        opts.mel_opts.num_bins = 80
        fb = knf.OnlineFbank(opts)
        x = np.asarray(wav, dtype=np.float32)
        if not self.normalize_samples:
            x = x * 32768.0  # 정수 표본 크기로 계산한다
        fb.accept_waveform(16000, x.tolist())
        fb.input_finished()
        n = fb.num_frames_ready
        if n == 0:
            return np.zeros((0, 560), dtype=np.float32)
        f = np.stack([fb.get_frame(i) for i in range(n)]).astype(np.float32)
        # LFR: window 7 프레임을 이어 붙이고 6 프레임씩 건너뜀(앞쪽 채움 없음, sherpa-onnx 와 같음)
        w, s = self.lfr_window, self.lfr_shift
        if n < w:
            f = np.concatenate([f, np.repeat(f[-1:], w - n, axis=0)])
            n = w
        m = (n - w) // s + 1
        lfr = np.stack([f[i * s : i * s + w].reshape(-1) for i in range(m)])
        return ((lfr + self.neg_mean) * self.inv_std).astype(np.float32)

    def log_probs(self, wav: np.ndarray) -> np.ndarray:
        """(T', V) 프레임별 로그확률(쿼리 자리 4프레임은 뺀다). 프레임 하나는 60ms."""
        x = self.features(wav)
        if x.shape[0] == 0:
            return np.zeros((0, len(self.tokens)), dtype=np.float32)
        feed = {
            "x": x[None],
            "x_length": np.array([x.shape[0]], dtype=np.int32),
            "language": np.array([self.lang_id], dtype=np.int32),
            "text_norm": np.array([self.textnorm_id], dtype=np.int32),
        }
        feed = {k: v for k, v in feed.items() if k in self.input_names}
        logits = self.sess.run(None, feed)[0][0]
        return log_softmax(logits[self.N_QUERY :].astype(np.float64))

    def ids_to_text(self, ids: list[int]) -> str:
        pieces = [self.tokens[i] for i in ids if not self.tokens[i].startswith(TOKENS_TO_SKIP_PREFIX)]
        return "".join(pieces).replace("▁", " ").strip()

    def greedy_text(self, logp: np.ndarray) -> str:
        return self.ids_to_text(greedy_ids(logp))

    def tokenize(self, text: str):
        return text_to_tokens(self.sp, text)


def score_text(logp: np.ndarray, tokens: list[int], ranges: list[tuple[int, int]]) -> list[WordScore | None] | None:
    """원문 토큰열을 정렬해 어절 점수를 낸다. 정렬 불가(프레임 부족·토큰 없음)면 None."""
    path = force_align(logp, tokens)
    if path is None:
        return None
    return score_words(logp, path, tokens, ranges)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model-dir", required=True, help="model.int8.onnx 와 tokens.txt 가 있는 폴더")
    ap.add_argument("--bpe", required=True, help="chn_jpn_yue_eng_ko_spectok.bpe.model 경로")
    ap.add_argument("--wav", required=True)
    ap.add_argument("--text", required=True, help="읽을 글(원문)")
    ap.add_argument("--threads", type=int, default=2)
    a = ap.parse_args(argv)
    from asr_common import load_wav_16k

    m = SenseVoiceCTC(a.model_dir, a.bpe, a.threads)
    lp = m.log_probs(load_wav_16k(Path(a.wav)))
    print("받아 적기:", m.greedy_text(lp))
    toks, ranges, words = m.tokenize(a.text)
    sc = score_text(lp, toks, ranges)
    if sc is None:
        print("정렬할 수 없어요(소리가 너무 짧거나 원문에 토큰이 없어요).")
        return 1
    print(f"{'어절':<12}" + "".join(f"{n:>11}" for n in SCORE_NAMES))
    for w, s in zip(words, sc):
        print(f"{w:<12}" + ("".join(f"{s.get(n):>11.3f}" for n in SCORE_NAMES) if s else "  (토큰 없음)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
