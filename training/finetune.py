"""국어나래 내장 코치 모델 파인튜닝(SFT → DPO), 레드팀 평가, 병합.

Colab·Kaggle(무료 T4 GPU)에서 training/narae_finetune.ipynb 가 이 파일을 부른다.
sft/dpo는 50단계마다 체크포인트를 저장하고, 다시 실행하면 마지막 체크포인트부터 이어 한다. 끝나면 <out>/DONE 을 쓴다. CPU에서도 --max-steps 로 짧게 시험할 수 있다.

단계
  sft    : 좋은 답(질문만, 정해진 JSON)을 따라 하도록 학습. 손실은 답 부분에만 건다.
  dpo    : 같은 상황의 '안전한 답'과 '해로운 답'(대필, 모욕 되풀이, 위험 신호 무시 등)을 비교해 안전한 쪽을 고르도록 학습.
  eval   : 학습에 쓰지 않은 레드팀 문항(training/data/redteam_test.jsonl)에 답하게 하고 score_redteam.py 로 채점.
  merge  : LoRA를 원본에 합쳐 하나의 모델로 저장(ONNX 변환 전 단계).

예
  python finetune.py sft  --base unsloth/gemma-3-1b-it --out runs/sft
  python finetune.py eval --model runs/sft/merged --out runs/sft/redteam_outputs.jsonl
  python finetune.py dpo  --base runs/sft/merged --out runs/dpo
"""
import argparse
import json
import os
import sys

# Kaggle T4 x2처럼 GPU가 여러 개 보이면 Trainer가 nn.DataParallel을 쓰는데, TRL SFTTrainer는 이를 지원하지 않아 멈춘다.
# 1B 모델은 GPU 하나로 충분하므로 torch를 불러오기 전에 첫 GPU만 보이게 한다(이미 정해 두었으면 그대로 둠).
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")

import torch  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")


def load_jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def pick_dtype():
    # is_bf16_supported()는 T4(compute 7.5)에서도 True(흉내 내기)를 돌려줘서, TRL 학습 커널이
    # "bf16은 compute 8.0 이상만" 오류로 멈춘다. 그래서 실제 하드웨어 능력(8.0 이상, A100·L4 등)으로 판단한다.
    if torch.cuda.is_available() and torch.cuda.get_device_capability()[0] >= 8:
        return torch.bfloat16
    # T4 등은 bf16이 없다. Gemma 3는 fp16에서 값이 넘칠 수 있어 fp32로 학습한다(1B라 T4 16GB에 충분).
    return torch.float32


def load_model(name, dtype=None):
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(name)
    model = AutoModelForCausalLM.from_pretrained(
        name,
        dtype=dtype or pick_dtype(),
        attn_implementation="eager",  # Gemma 3 학습 권장 설정
        # GPU가 2개(Kaggle T4 x2)여도 1B 모델은 한 장이면 충분하다. "auto"는 두 장에 쪼개 느려지므로 0번에 고정한다.
        device_map={"": 0} if torch.cuda.is_available() else None,
    )
    return model, tok


def lora_config(r):
    from peft import LoraConfig

    return LoraConfig(
        r=r,
        lora_alpha=r * 2,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        task_type="CAUSAL_LM",
    )


def merge_and_save(trainer_model, tok, out_dir):
    merged = trainer_model.merge_and_unload()
    # 원본 Gemma 가중치가 bf16이라 bf16으로 저장해도 손실이 거의 없고, 크기가 절반(약 2GB)이 된다(무료 Google 드라이브 15GB 고려).
    # 불러올 때는 load_model이 기기에 맞는 형식(T4는 fp32)으로 바꾼다.
    merged = merged.to(torch.bfloat16)
    merged.save_pretrained(out_dir, safe_serialization=True)
    tok.save_pretrained(out_dir)
    print("병합 모델 저장:", out_dir)


def has_checkpoint(out_dir):
    # resume_from_checkpoint=True 는 checkpoint-* 폴더가 없으면 오류가 나므로, 있을 때만 True로 쓴다.
    if not os.path.isdir(out_dir):
        return False
    return any(d.startswith("checkpoint-") and os.path.isdir(os.path.join(out_dir, d)) for d in os.listdir(out_dir))


def train_resumable(trainer, out_dir):
    if has_checkpoint(out_dir):
        print("이어서 학습해요(마지막 체크포인트부터):", out_dir)
        trainer.train(resume_from_checkpoint=True)
    else:
        trainer.train()


def mark_done(out_dir):
    # 병합 저장까지 끝난 뒤에만 쓴다. 노트북이 이 파일을 보고 단계를 건너뛴다.
    with open(os.path.join(out_dir, "DONE"), "w", encoding="utf-8") as f:
        f.write("ok\n")


def cmd_sft(a):
    from datasets import Dataset
    from trl import SFTConfig, SFTTrainer

    def to_pc(rows):
        # prompt-completion 형식: 손실을 답(completion)에만 건다 → 학생 글·지시를 외우지 않고 '답하는 법'만 배운다.
        return Dataset.from_list([{"prompt": r["messages"][:2], "completion": r["messages"][2:]} for r in rows])

    train = to_pc(load_jsonl(os.path.join(DATA, "sft_train.jsonl")))
    val = to_pc(load_jsonl(os.path.join(DATA, "sft_val.jsonl")))
    model, tok = load_model(a.base)
    cfg = SFTConfig(
        output_dir=a.out,
        num_train_epochs=a.epochs,
        max_steps=a.max_steps if a.max_steps > 0 else -1,
        per_device_train_batch_size=a.batch,
        gradient_accumulation_steps=a.accum,
        learning_rate=a.lr,
        lr_scheduler_type="cosine",
        warmup_steps=0.05,  # transformers 5.x: 1보다 작은 값은 전체 단계에 대한 비율
        logging_steps=10 if a.max_steps <= 0 else 1,
        eval_strategy="epoch" if a.max_steps <= 0 else "no",
        save_strategy="steps",  # 세션이 끊겨도 이어 하도록 50단계마다 저장(LoRA라 작음)
        save_steps=50,
        save_total_limit=2,
        max_length=1024,
        gradient_checkpointing=torch.cuda.is_available(),
        bf16=pick_dtype() == torch.bfloat16,
        report_to="none",
        seed=20261103,
    )
    trainer = SFTTrainer(model=model, args=cfg, train_dataset=train, eval_dataset=val, processing_class=tok, peft_config=lora_config(a.lora_r))
    train_resumable(trainer, a.out)
    if a.max_steps <= 0:
        print("검증 손실:", trainer.evaluate())
    merge_and_save(trainer.model, tok, os.path.join(a.out, "merged"))
    mark_done(a.out)


def cmd_dpo(a):
    from datasets import Dataset
    from trl import DPOConfig, DPOTrainer

    rows = load_jsonl(os.path.join(DATA, "dpo_train.jsonl"))
    ds = Dataset.from_list([{"prompt": r["prompt"], "chosen": r["chosen"], "rejected": r["rejected"]} for r in rows])
    model, tok = load_model(a.base)
    cfg = DPOConfig(
        output_dir=a.out,
        num_train_epochs=1,
        max_steps=a.max_steps if a.max_steps > 0 else -1,
        per_device_train_batch_size=max(1, a.batch // 2),
        gradient_accumulation_steps=a.accum * 2,
        learning_rate=a.dpo_lr,
        beta=0.1,
        # sigmoid(선호 비교) + sft(좋은 답 자체의 가능도). sft 항이 없으면 '짧은 flag만 내는 답'으로 무너질 수 있다.
        loss_type=["sigmoid", "sft"],
        loss_weights=[1.0, 1.0],
        lr_scheduler_type="cosine",
        warmup_steps=0.05,  # transformers 5.x: 1보다 작은 값은 전체 단계에 대한 비율
        logging_steps=10 if a.max_steps <= 0 else 1,
        save_strategy="steps",
        save_steps=50,
        save_total_limit=2,
        max_length=1024,
        gradient_checkpointing=torch.cuda.is_available(),
        bf16=pick_dtype() == torch.bfloat16,
        report_to="none",
        seed=20261103,
    )
    # LoRA를 쓰면 기준 모델(ref)은 어댑터를 끈 같은 모델(=SFT 결과)이 된다 → 메모리를 아낀다.
    trainer = DPOTrainer(model=model, args=cfg, train_dataset=ds, processing_class=tok, peft_config=lora_config(a.lora_r))
    train_resumable(trainer, a.out)
    merge_and_save(trainer.model, tok, os.path.join(a.out, "merged"))
    mark_done(a.out)


@torch.no_grad()
def cmd_eval(a):
    rows = load_jsonl(os.path.join(DATA, "redteam_test.jsonl"))
    if a.limit > 0:
        rows = rows[: a.limit]
    model, tok = load_model(a.model)
    model.eval()
    tok.padding_side = "left"
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    out = []
    for start in range(0, len(rows), a.batch):
        batch = rows[start : start + a.batch]
        prompts = [tok.apply_chat_template(r["messages"], tokenize=False, add_generation_prompt=True) for r in batch]
        enc = tok(prompts, return_tensors="pt", padding=True, add_special_tokens=False).to(model.device)
        gen = model.generate(**enc, max_new_tokens=96, do_sample=False, pad_token_id=tok.pad_token_id)
        for j, g in enumerate(gen):
            text = tok.decode(g[enc["input_ids"].shape[1] :], skip_special_tokens=True)
            out.append({"i": start + j, "text": text})
        print(f"  {min(start + a.batch, len(rows))}/{len(rows)}", flush=True)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        for o in out:
            f.write(json.dumps(o, ensure_ascii=False) + "\n")
    red_path = os.path.join(DATA, "redteam_test.jsonl")
    if a.limit > 0:
        # 일부만 평가했으면 채점용 문항 파일도 같은 범위로 자른다.
        red_path = a.out + ".redteam_subset.jsonl"
        with open(red_path, "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
    sys.path.insert(0, HERE)
    from score_redteam import score

    metrics, passed = score(red_path, a.out)
    with open(a.out + ".score.json", "w", encoding="utf-8") as f:
        json.dump({"passed": passed, "metrics": metrics, "limited": a.limit > 0}, f, ensure_ascii=False, indent=2)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("step", choices=["sft", "dpo", "eval"])
    p.add_argument("--base", default="unsloth/gemma-3-1b-it")
    p.add_argument("--model", default="")
    p.add_argument("--out", default="runs/out")
    p.add_argument("--epochs", type=float, default=2)
    p.add_argument("--max-steps", type=int, default=0, help="0이면 전체 학습. CPU 시험용으로 1~2")
    p.add_argument("--batch", type=int, default=4)
    p.add_argument("--accum", type=int, default=4)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--dpo-lr", type=float, default=5e-6)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--limit", type=int, default=0, help="eval: 앞에서부터 N문항만")
    a = p.parse_args()
    {"sft": cmd_sft, "dpo": cmd_dpo, "eval": cmd_eval}[a.step](a)


if __name__ == "__main__":
    main()
