"""원문 기반 낭독 채점(align_score.py, align_eval.py) 시험.

앞부분은 모델 없이 도는 순수 함수 시험이고, 뒷부분은 SenseVoice 모델·공개 한국어 음성이 있을 때만 도는 실제 시험이다(없으면 skip).
모델은 환경변수 NARAE_ASR_MODELS(그 아래 sensevoice/, sensevoice-bpe/), 음성은 NARAE_TEST_WAV_DIR(0.wav, 1.wav, trans.txt)로 알려 줄 수 있다.
"""
import os
import random
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

import align_eval as ev
import align_score as al

HERE = Path(__file__).resolve().parent
SCRATCH = Path("/tmp/claude-0/-home-user-narae-kor-aidt/cf0e307d-4326-537e-9446-12ba8976a76f/scratchpad")


# ---------------------------------------------------------------- 강제 정렬

def peaky(T, V, labels, strength=8.0):
    """프레임마다 labels[t] 에 높은 점수를 준 (T, V) 로그확률 행렬."""
    x = np.zeros((T, V))
    for t, lab in enumerate(labels):
        x[t, lab] = strength
    return al.log_softmax(x)


def test_force_align_simple_path():
    # 프레임: 빈칸 1 1 빈칸 2 빈칸 → 토큰 [1,2]
    lp = peaky(6, 4, [0, 1, 1, 0, 2, 0])
    path = al.force_align(lp, [1, 2])
    assert path is not None
    # 확장열 상태: 0=빈칸 1=토큰0 2=빈칸 3=토큰1 4=빈칸
    assert path.tolist() == [0, 1, 1, 2, 3, 4]


def test_force_align_repeated_token_needs_blank():
    assert al.ctc_min_frames([1, 1]) == 3
    assert al.ctc_min_frames([1, 2]) == 2
    assert al.force_align(peaky(2, 3, [1, 1]), [1, 1]) is None  # 사이에 빈칸이 들어갈 프레임이 없다
    lp = peaky(4, 3, [1, 0, 1, 1])
    path = al.force_align(lp, [1, 1])
    assert path is not None
    toks = [int(s // 2) for s in path if s % 2 == 1]
    assert sorted(set(toks)) == [0, 1]  # 두 토큰 모두 쓰였고
    assert any(s == 2 for s in path)  # 사이에 빈칸 상태를 거쳤다
    # 첫 토큰은 첫 프레임, 둘째 토큰은 뒤쪽 프레임에
    assert path[0] == 1 and path[-1] == 3


def test_force_align_too_short_or_empty():
    assert al.force_align(peaky(1, 4, [1]), [1, 2]) is None
    assert al.force_align(peaky(3, 4, [1, 1, 1]), []) is None


def test_force_align_follows_best_even_when_wrong_label_peaks():
    # 소리는 토큰 3 인데 원문은 [1, 2]: 그래도 경로는 만들어지고 확률은 낮다
    lp = peaky(5, 4, [0, 3, 3, 0, 3])
    path = al.force_align(lp, [1, 2])
    assert path is not None and len(path) == 5
    sc = al.score_words(lp, path, [1, 2], [(0, 2)])[0]
    assert sc is not None and sc.gop < -3 and sc.min_post < 0.01


def test_greedy_ids_collapses_and_drops_blank():
    lp = peaky(7, 4, [0, 2, 2, 0, 2, 3, 3])
    assert al.greedy_ids(lp) == [2, 2, 3]


# ---------------------------------------------------------------- 어절 점수

def test_score_words_good_vs_bad_word():
    # 토큰 [1,2 | 3] = 어절 두 개. 앞 어절은 소리와 같고 뒤 어절 토큰(3)은 소리(4)와 다르다
    lp = peaky(8, 6, [1, 0, 2, 0, 0, 4, 0, 0])
    toks = [1, 2, 3]
    path = al.force_align(lp, toks)
    ws = al.score_words(lp, path, toks, [(0, 2), (2, 3)])
    good, bad = ws
    assert good.n_tokens == 2 and bad.n_tokens == 1
    assert good.gop > -0.05 and good.min_post > 0.99 and good.min_lpr > -0.05
    assert bad.gop < -2 and bad.min_post < 0.01 and bad.min_lpr < -5
    assert good.start == 0 and good.end == 2


def test_score_words_empty_range_is_none():
    lp = peaky(4, 4, [1, 0, 2, 0])
    path = al.force_align(lp, [1, 2])
    assert al.score_words(lp, path, [1, 2], [(0, 0), (0, 2)])[0] is None


# ---------------------------------------------------------------- 원문 → 토큰, 어절 구간

class FakeSp:
    """글자마다 조각 하나, 공백은 뒤따르는 글자의 조각에 붙는(▁X) 가짜 SentencePiece. id 는 글자 코드에서."""

    def unk_id(self):
        return 1

    def encode(self, text, return_type=None, out_type=None):
        b = text.encode("utf-8")
        pieces = []
        pos = 0
        for ch in text:
            n = len(ch.encode("utf-8"))
            beg = pos
            pos += n
            if ch == " ":
                continue
            if beg > 0 and text[len(b[:beg].decode()) - 1] == " ":
                beg -= 1  # 공백을 이 조각에 붙인다
            pid = 1 if ch == "?" else 10 + ord(ch) % 1000
            pieces.append(SimpleNamespace(id=pid, begin=beg, end=pos))
        return SimpleNamespace(pieces=pieces)


def test_text_to_tokens_word_ranges_and_punct():
    ids, ranges, words = al.text_to_tokens(FakeSp(), "그는 괜찮은, 척.")
    assert words == ["그는", "괜찮은", "척"]
    assert ranges == [(0, 2), (2, 5), (5, 6)]
    assert len(ids) == 6


def test_text_to_tokens_one_token_per_word():
    ids, ranges, words = al.text_to_tokens(FakeSp(), "가 나")
    assert words == ["가", "나"]
    assert ranges == [(0, 1), (1, 2)]


def test_text_to_tokens_empty():
    assert al.text_to_tokens(FakeSp(), "...") == ([], [], [])


# ---------------------------------------------------------------- 지표

def test_fa_miss_and_threshold():
    correct = [-0.01, -0.02, -0.05, -0.1, -0.2, -0.3, -0.5, -0.7, -0.9, -1.0]
    errors = [-0.4, -0.8, -1.5, -3.0]
    fa, miss = al.fa_miss_at(correct, errors, -0.6)
    assert fa == pytest.approx(0.3)  # -0.7, -0.9, -1.0
    assert miss == pytest.approx(0.25)  # -0.4 만 문턱 이상
    th = al.threshold_for_fa(correct, 0.2)
    assert al.fa_miss_at(correct, [], th)[0] <= 0.2
    # 오경보 0% 목표면 아무것도 오류로 보지 않는다
    th0 = al.threshold_for_fa(correct, 0.0)
    assert al.fa_miss_at(correct, [], th0)[0] == 0.0
    assert al.fa_miss_at([], [], 0.0) == (None, None)


def test_roc_rows_monotone():
    rng = np.random.default_rng(0)
    c = rng.normal(-0.2, 0.2, 500)
    e = rng.normal(-1.5, 0.8, 300)
    rows = ev.roc_rows(c, {"x": list(e)}, [0.02, 0.05, 0.1, 0.2])
    assert [r["fa"] <= r["target_fa"] + 1e-9 for r in rows] == [True] * 4
    misses = [r["miss_x"] for r in rows]
    assert misses == sorted(misses, reverse=True)  # 오경보를 더 허용할수록 놓침은 줄어든다


def test_auc():
    assert ev.auc([0, 0, 0], [-1, -2]) == 1.0
    assert ev.auc([-1, -2], [0, 0]) == 0.0
    assert ev.auc([0, 0], [0, 0]) == 0.5
    assert ev.auc([], [1]) is None


def test_holdout_rows_runs():
    rng = np.random.default_rng(1)
    c = rng.normal(0, 1, 400)
    cp = np.arange(400) % 2
    e = rng.normal(-3, 1, 200)
    ep = np.arange(200) % 2
    rows = ev.holdout_rows(c, cp, {"x": list(e)}, {"x": ep}, [0.05])
    assert rows[0]["fa"] == pytest.approx(0.05, abs=0.04)
    assert rows[0]["miss_x"] < 0.2


def test_best_miss_at_fa():
    pts = [{"fa": 0.3, "miss_a": 0.1}, {"fa": 0.1, "miss_a": 0.4}, {"fa": 0.04, "miss_a": 0.8}]
    assert ev.best_miss_at_fa(pts, "a", 0.05) == 0.8
    assert ev.best_miss_at_fa(pts, "a", 0.5) == 0.1
    assert ev.best_miss_at_fa(pts, "a", 0.01) is None


# ---------------------------------------------------------------- 바꿔 넣을 어절 고르기

def test_josa_swap():
    r = random.Random(1)
    out = ev.josa_swap("학교에서", r)
    assert out is not None and out.startswith("학교") and out != "학교에서"
    assert ev.josa_swap("학교", r) is None  # 조사로 안 끝남
    assert ev.josa_swap("이", r) is None  # 어간이 없음


def test_pool_choices():
    pool = ev.Pool(["가방을", "가방이", "나무를", "나라를", "토끼", "123"])
    r = random.Random(0)
    new, found = pool.one_char("나무를", r)
    assert found and new == "나라를"
    new, found = pool.one_char("하늘", r)  # 묶음에 한 글자 차이가 없음 → 임의 변경
    assert not found and new != "하늘" and len(new) == 2
    s = pool.similar_len("토끼", r)
    assert s is not None and s != "토끼" and abs(len(s) - 2) <= 1


def test_pick_items_balanced():
    items = [{"id": f"{g}{i}", "grade": g} for g in ("초1", "초2", "초3") for i in range(20)]
    got = ev.pick_items(items, 9, True, 1)
    assert len(got) == 9
    assert {g: sum(1 for x in got if x["grade"] == g) for g in ("초1", "초2", "초3")} == {"초1": 3, "초2": 3, "초3": 3}
    assert [x["id"] for x in ev.pick_items(items, 4, False, 1)] == ["초10", "초11", "초12", "초13"]
    assert len(ev.pick_items(items, 0, True, 1)) == 60


# ---------------------------------------------------------------- 실제 모델(있을 때만)

def _first_existing(*cands):
    for c in cands:
        if c and Path(c).exists():
            return Path(c)
    return None


MODELS = _first_existing(os.environ.get("NARAE_ASR_MODELS"), HERE.parents[0] / "models", SCRATCH / "models")
WAVS = _first_existing(os.environ.get("NARAE_TEST_WAV_DIR"), SCRATCH / "kozip")
SV_DIR = MODELS / "sensevoice" if MODELS else None
BPE = MODELS / "sensevoice-bpe" / "chn_jpn_yue_eng_ko_spectok.bpe.model" if MODELS else None
have_model = bool(SV_DIR and (SV_DIR / "model.int8.onnx").exists() and BPE and BPE.exists())
have_wav = bool(WAVS and (WAVS / "0.wav").exists() and (WAVS / "1.wav").exists() and (WAVS / "trans.txt").exists())
real = pytest.mark.skipif(not (have_model and have_wav), reason="SenseVoice 모델 파일 또는 공개 한국어 음성이 없어요")


@pytest.fixture(scope="module")
def sv():
    pytest.importorskip("onnxruntime")
    pytest.importorskip("sentencepiece")
    pytest.importorskip("kaldi_native_fbank")
    return al.SenseVoiceCTC(SV_DIR, BPE, threads=2)


@pytest.fixture(scope="module")
def clips(sv):
    from asr_common import load_wav_16k

    refs = dict(line.rstrip("\n").split(" ", 1) for line in (WAVS / "trans.txt").read_text(encoding="utf-8").splitlines() if line.strip())
    out = {}
    for n in ("0", "1"):
        out[n] = (refs[n + ".wav"], sv.log_probs(load_wav_16k(WAVS / f"{n}.wav")))
    return out


def _cer(a, b):
    from fluency import levenshtein

    a, b = "".join(a.split()), "".join(b.split())
    return levenshtein(list(a), list(b)) / max(len(a), 1)


@real
def test_token_ids_match_tokens_txt(sv):
    assert sv.sp.get_piece_size() == len(sv.tokens)
    bad = [i for i, t in enumerate(sv.tokens) if sv.sp.id_to_piece(i) != t]
    assert bad == []
    ids, ranges, words = sv.tokenize("그는 괜찮은 척하려고 애쓰는 것 같았다.")
    assert [sv.tokens[i] for i in ids][:3] == ["그", "는", "▁괜찮"]
    assert ids == [i for i in sv.sp.encode("그는 괜찮은 척하려고 애쓰는 것 같았다") if i != 0]  # 문장 통째 쪼갠 것과 같다
    assert len(words) == 6 and ranges[-1][1] == len(ids)


@real
def test_greedy_matches_sherpa_onnx(sv, clips):
    """sherpa-onnx 와 '거의' 같다(int8 모델은 ONNX Runtime 설정·버전에 따라 낮은 확률 토큰이 뒤집혀 글자 한두 개·공백이 달라질 수 있다)."""
    sherpa = pytest.importorskip("sherpa_onnx")
    from asr_common import load_wav_16k

    rec = sherpa.OfflineRecognizer.from_sense_voice(model=str(SV_DIR / "model.int8.onnx"), tokens=str(SV_DIR / "tokens.txt"), use_itn=False, language="ko", provider="cpu", num_threads=1)
    for n, (ref, lp) in clips.items():
        st = rec.create_stream()
        st.accept_waveform(16000, load_wav_16k(WAVS / f"{n}.wav"))
        rec.decode_stream(st)
        theirs = st.result.text
        mine = sv.greedy_text(lp)
        assert _cer(theirs, mine) <= 0.1, (theirs, mine)
        assert _cer(ref.rstrip(".?! "), mine) <= 0.2  # 정답 글과도 가깝다


@real
def test_forced_alignment_correct_text_is_mostly_ok(sv, clips):
    for n, (ref, lp) in clips.items():
        sc, words = al.score_text_robust(lp, sv.sp, ref, 1)
        assert sc is not None and all(s is not None for s in sc)
        ok = [s.gop > -1.0 for s in sc]
        assert sum(ok) / len(ok) >= 0.8
        assert all(s.start <= s.end < lp.shape[0] for s in sc)
        assert [s.start for s in sc] == sorted(s.start for s in sc)  # 어절이 시간 순서대로


@real
def test_forced_alignment_flags_replaced_words(sv, clips):
    ref0, lp0 = clips["0"]
    ref1, lp1 = clips["1"]
    cases = [
        (lp0, ref0, "괜찮은", "무서운"),  # 크게 다른 어절
        (lp0, ref0, "것", "걸"),  # 한 글자
        (lp0, ref0, "그는", "그가"),  # 조사만
        (lp1, ref1, "벌리고", "모으고"),
        (lp1, ref1, "다리를", "다리가"),
    ]
    for lp, ref, old, new in cases:
        assert old in ref
        base, words = al.score_text_robust(lp, sv.sp, ref, 1)
        changed, words2 = al.score_text_robust(lp, sv.sp, ref.replace(old, new), 1)
        i = words.index(old)
        assert words2[i] == new
        assert changed[i].gop < base[i].gop - 1.0
        assert changed[i].gop < -1.0  # 문턱 -1.0 으로 '다시 읽어 볼 곳'
        assert changed[i].min_post < 0.05
        # 다른 어절은 거의 그대로
        for j in range(len(words)):
            if j != i:
                assert changed[j].gop > -1.0


@real
def test_nbest_never_lowers_scores(sv, clips):
    ref, lp = clips["1"]
    a, _ = al.score_text_robust(lp, sv.sp, ref, 1)
    b, _ = al.score_text_robust(lp, sv.sp, ref, 4)
    for x, y in zip(a, b):
        assert y.gop >= x.gop - 1e-9 and y.min_post >= x.min_post - 1e-9
