"""train_asr.py 의 순수 함수 시험(torch 없이 돼요): 인자 처리, 정밀도 판단, 배치 자동값, 라벨 처리, MODEL_CARD 문구."""
import numpy as np
import pytest

import train_asr as t


def test_resolve_model_defaults_and_shorthand():
    assert t.resolve_model("whisper", None) == "openai/whisper-base"
    assert t.resolve_model("moonshine", None) == "moonshine-ai/moonshine-base-ko"
    assert t.resolve_model("whisper", "small") == "openai/whisper-small"
    assert t.resolve_model("whisper", "openai/whisper-small") == "openai/whisper-small"
    assert t.resolve_model("whisper", "C:/runs/x/final") == "C:/runs/x/final"
    assert t.resolve_model("moonshine", "base") == "base"  # 줄임말은 whisper 에서만


def test_family_mismatch_warns_on_swapped_names():
    assert t.family_mismatch("whisper", "moonshine-ai/moonshine-base-ko")
    assert t.family_mismatch("moonshine", "openai/whisper-base")
    assert t.family_mismatch("whisper", "openai/whisper-base") is None
    assert t.family_mismatch("moonshine", "work/runs/x/final") is None


def test_run_name_matches_old_layout():
    assert t.default_run_name("openai/whisper-tiny", False) == "tiny"
    assert t.default_run_name("openai/whisper-small", True) == "small-lora"
    assert t.default_run_name("moonshine-ai/moonshine-base-ko", False) == "moonshine-base-ko"


def test_default_lr():
    assert t.default_lr("whisper", "openai/whisper-base", False) == 2.5e-5
    assert t.default_lr("whisper", "openai/whisper-small", False) == 1.25e-5
    assert t.default_lr("whisper", "openai/whisper-small", True) == t.LORA_LR
    assert t.default_lr("moonshine", "moonshine-ai/moonshine-base-ko", False) == t.LR_MOONSHINE


def test_precision_auto():
    assert t.pick_precision("auto", True, 8)[0] == "bf16"  # A100
    assert t.pick_precision("auto", True, 9)[0] == "bf16"
    assert t.pick_precision("auto", True, 6)[0] == "fp32"  # GTX 1060 (6.1)
    assert t.pick_precision("auto", True, 7)[0] == "fp32"
    assert t.pick_precision("auto", False, None)[0] == "fp32"  # CPU


def test_precision_explicit():
    assert t.pick_precision("fp32", True, 8)[0] == "fp32"
    assert t.pick_precision("fp16", True, 6)[0] == "fp16"
    assert t.pick_precision("bf16", True, 8)[0] == "bf16"
    assert t.pick_precision("bf16", True, 6)[0] == "fp32"  # 지원 안 하면 fp32 로
    assert t.pick_precision("bf16", False, None)[0] == "fp32"
    assert t.pick_precision("fp16", False, None)[0] == "fp32"
    assert all(t.pick_precision("auto", True, 6)[1] for _ in range(1))  # 까닭 문구가 있다


@pytest.mark.parametrize(
    "gb,expected",
    [(None, (4, 8)), (5.9, (4, 8)), (6.0, (4, 8)), (11.9, (8, 4)), (15.7, (8, 4)), (23.5, (16, 2)), (39.5, (16, 2)), (79.3, (32, 1))],
)
def test_auto_batch(gb, expected):
    b, a = t.auto_batch(gb)
    assert (b, a) == expected
    assert b * a == 32


def test_resolve_batch_explicit_wins():
    assert t.resolve_batch(2, 1, 79.0) == (2, 1)
    assert t.resolve_batch(None, None, 5.9) == (4, 8)
    assert t.resolve_batch(2, None, 5.9) == (2, 16)  # 곱을 32로 맞춤
    assert t.resolve_batch(None, 16, 5.9) == (2, 16)
    assert t.resolve_batch(8, None, 79.0) == (8, 4)


def test_grad_ckpt_default():
    assert t.default_grad_ckpt(5.9) is True
    assert t.default_grad_ckpt(None) is True
    assert t.default_grad_ckpt(23.5) is False
    assert t.default_grad_ckpt(79.0) is False


def test_oom_hint_mentions_batch_and_lora():
    text = "\n".join(t.oom_hint(4, 8, "whisper", False))
    assert "--batch 2 --accum 16" in text and "--lora" in text and "--resume" in text
    assert "--lora" not in "\n".join(t.oom_hint(4, 8, "whisper", True))  # 이미 LoRA 면 권하지 않음


def test_batch_list_resume_is_consistent():
    full = t.batch_list(10, 2, 1, 0, 12)
    tail = t.batch_list(10, 2, 1, 5, 12)
    assert full[5:] == tail
    assert all(len(b) == 2 for b in full)


def test_moonshine_label_ids():
    assert t.moonshine_label_ids([1, 50, 60], 1, 2) == [50, 60, 2]  # <s> 떼고 </s> 붙임
    assert t.moonshine_label_ids([1, 50, 60, 2], 1, 2) == [50, 60, 2]  # 이미 eos 가 있으면 중복 없이
    assert t.moonshine_label_ids([], 1, 2) == [2]


def test_whisper_start_token_stripped_only_when_all_have_it():
    lab = t.pad_labels([[7, 1, 2, 3], [7, 4]])
    assert lab.tolist() == [[7, 1, 2, 3], [7, 4, -100, -100]]
    assert t.strip_start_token(lab, 7).tolist() == [[1, 2, 3], [4, -100, -100]]
    assert t.strip_start_token(np.array([[7, 1], [8, 1]]), 7).shape == (2, 2)


def test_pad_audio_batch_mask():
    wav, mask = t.pad_audio_batch([np.ones(3, dtype=np.float32), np.ones(5, dtype=np.float32)])
    assert wav.shape == (2, 5) and wav[0, 3:].sum() == 0
    assert mask.tolist() == [[1, 1, 1, 0, 0], [1, 1, 1, 1, 1]]


NIA = "한국지능정보사회진흥원(NIA) 「한국어 아동 음성 데이터」 사업 결과를 활용"


def _info(family, model, lora=False):
    return {"family": family, "model": model, "lora": lora, "lora_r": 32, "lora_targets": "q_proj", "precision": "bf16", "batch": 32, "accum": 1,
            "seed": 1, "grad_ckpt": False, "lr": 2.5e-5, "max_steps": 100, "warmup": 10, "last_step": 100, "last_loss": 0.5, "last_eval_loss": 0.6}


def test_model_card_whisper():
    card = t.build_model_card(_info("whisper", "openai/whisper-base"), {"train": {"utterances": 5, "hours": 1.0, "speakers": 3}})
    assert NIA in card
    assert "포함돼 있지 않아요" in card
    assert "MIT" in card and "Moonshine" not in card
    assert "narae-asr-lite" in card
    assert "## 평가 결과" in card
    assert "화자 이름" in card


def test_model_card_moonshine_noncommercial():
    card = t.build_model_card(_info("moonshine", "moonshine-ai/moonshine-base-ko"))
    assert NIA in card
    assert "Moonshine Community License" in card and "비상업" in card
    assert "Copyright (c) 2022 OpenAI" not in card


def test_model_card_small_is_standard_and_lora_noted():
    card = t.build_model_card(_info("whisper", "openai/whisper-small", lora=True))
    assert "narae-asr-standard" in card and "LoRA" in card


def test_train_whisper_shim_forwards(monkeypatch):
    import train_whisper

    seen = {}
    monkeypatch.setattr(t, "main", lambda argv=None: seen.setdefault("argv", argv))
    train_whisper.main(["--model", "base", "--speedtest"])
    assert seen["argv"] == ["--family", "whisper", "--model", "base", "--speedtest"]


def test_help_works_without_torch(capsys):
    with pytest.raises(SystemExit) as e:
        t.main(["--help"])
    assert e.value.code == 0
    assert "--family" in capsys.readouterr().out


def test_turbo_shorthand_and_large_detection():
    assert t.resolve_model("whisper", "turbo") == "openai/whisper-large-v3-turbo"
    assert t.is_large("openai/whisper-large-v3-turbo") and not t.is_large("openai/whisper-small")
    assert t.default_run_name("openai/whisper-large-v3-turbo", False) == "large-v3-turbo"
    assert t.default_lr("whisper", "openai/whisper-large-v3-turbo", False) == 5e-6


def test_large_plan_by_gpu_memory():
    ok, msg = t.large_plan(5.9, False, False)  # GTX 1060
    assert msg and "국내 GPU 클라우드" in msg and "24GB" in msg
    assert t.large_plan(None, False, False)[1]  # CPU
    assert t.large_plan(15.9, False, False)[1]
    assert t.large_plan(23.5, False, False) == (True, None)  # 24GB급 → 기본 LoRA
    assert t.large_plan(39.5, False, False) == (True, None)
    assert t.large_plan(39.5, False, True) == (False, None)  # --full
    assert t.large_plan(79.3, False, False) == (False, None)  # 80GB 전체 학습
    assert t.large_plan(79.3, True, False) == (True, None)  # 직접 --lora


def test_large_batch_and_ckpt():
    assert t.auto_batch(23.5, True) == (2, 16)
    assert t.auto_batch(39.5, True) == (4, 8)
    assert t.auto_batch(79.3, True) == (8, 4)
    assert t.resolve_batch(None, None, 79.3, True) == (8, 4)
    assert t.default_grad_ckpt(79.3, True) is True and t.default_grad_ckpt(79.3) is False


def test_model_card_pro():
    card = t.build_model_card(_info("whisper", "openai/whisper-large-v3-turbo", lora=True))
    assert "narae-asr-pro" in card and "교사 기기 전용" in card and NIA in card and "MIT" in card


def test_feats_dir_name():
    from asr_common import feats_dir_name

    assert feats_dir_name(80) == "feats" and feats_dir_name(128) == "feats128"
