"""아동 낭독 음성으로 Whisper(tiny/base/small)를 미세 조정한다. 윈도우 + GTX 1060 6GB(fp32)에서 돌도록 만들었어요.

    python train_whisper.py --model base --speedtest        # 30걸음만 돌려 속도·메모리·예상 시간 보기
    python train_whisper.py --model base                    # 학습(전원 연결, 중간 저장됨)
    python train_whisper.py --model base --resume           # 끊긴 학습 이어서 하기
    python train_whisper.py --model small --lora            # small은 LoRA로(메모리 절약)

  - fp32(1060은 fp16 가속이 없고 bf16이 안 돼요), gradient checkpointing, DataLoader num_workers=0(윈도우 기본).
  - '걸음(step)'은 가중치를 한 번 고치는 단위예요. 한 걸음 = --batch × --accum 개 발화.
  - 언어는 ko, 작업은 transcribe 로 고정해요.
  - 결과: work/runs/<이름>/ 에 final/(바로 evaluate.py 에 쓸 수 있는 모델), ckpt/last.pt(이어 하기용), log.csv, MODEL_CARD.md
메모리가 모자라면(OOM) --batch 를 줄이고 --accum 을 늘려 곱을 같게 해 주세요(예: --batch 2 --accum 16).
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
import time
from pathlib import Path

import numpy as np

from asr_common import add_common_args, die, load_wav_16k, read_jsonl, say

BASE_IDS = {"tiny": "openai/whisper-tiny", "base": "openai/whisper-base", "small": "openai/whisper-small"}
DEFAULT_LR = {"tiny": 3.75e-5, "base": 2.5e-5, "small": 1.25e-5}
LORA_LR = 1e-3
ATTRIBUTION = "본 모델은 한국지능정보사회진흥원(NIA) 「한국어 아동 음성 데이터」 사업 결과를 활용하여 만들었습니다."


class FeatDataset:
    """work/feats/<id>.npy 를 읽고, 없으면 wav 에서 바로 계산한다."""

    def __init__(self, items, work: Path, tok, fe, max_label: int):
        self.work, self.fe = work, fe
        self.items, self.labels = [], []
        dropped = 0
        for it in items:
            ids = tok(it["text"]).input_ids
            if len(ids) > max_label:
                dropped += 1
                continue
            self.items.append(it)
            self.labels.append(ids)
        self.dropped = dropped

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, i: int):
        it = self.items[i]
        p = self.work / "feats" / f"{it['id']}.npy"
        if p.exists():
            feat = np.load(p).astype("float32")
        else:
            feat = self.fe(load_wav_16k(self.work / it["audio"]), sampling_rate=16000, return_tensors="np").input_features[0].astype("float32")
        return feat, self.labels[i]


def make_collate(start_token: int):
    import torch

    def collate(batch):
        feats = torch.from_numpy(np.stack([b[0] for b in batch]))
        longest = max(len(b[1]) for b in batch)
        labels = torch.full((len(batch), longest), -100, dtype=torch.long)
        for i, (_, ids) in enumerate(batch):
            labels[i, : len(ids)] = torch.tensor(ids)
        if (labels[:, 0] == start_token).all():  # 모델이 앞에 시작 토큰을 따로 붙이므로 뗀다
            labels = labels[:, 1:]
        return feats, labels

    return collate


def batch_list(n: int, batch: int, seed: int, start_batch: int, total_batches: int):
    """결정적인 배치 순서(이어 하기 때 같은 자리에서 시작할 수 있어요). 한 바퀴의 마지막 모자란 배치는 버려요."""
    per_epoch = max(1, n // batch)
    perms: dict[int, np.ndarray] = {}
    out = []
    for b in range(start_batch, total_batches):
        e, k = divmod(b, per_epoch)
        if e not in perms:
            perms[e] = np.random.RandomState(seed + e).permutation(n)
        out.append(perms[e][k * batch : (k + 1) * batch].tolist())
    return out


def write_model_card(out: Path, a, info: dict) -> None:
    report = {}
    rp = Path(a.work) / "subset_report.json"
    if rp.exists():
        report = json.loads(rp.read_text(encoding="utf-8"))
    tr, ev = report.get("train", {}), report.get("eval", {})
    lines = [
        f"# 국어나래 낭독 음성 인식 실험 모델 ({a.model}{' + LoRA' if a.lora else ''})",
        "",
        f"**{ATTRIBUTION}**",
        "",
        "## 학습 데이터",
        "- 한국지능정보사회진흥원(NIA) AI Hub 「한국어 아동 음성 데이터」(미디어젠, 아동 낭독 발화)의 일부(초등 학년, 정형 발화)를 썼어요.",
        "- **학습에 쓴 음성과 전사 글은 이 폴더에 포함돼 있지 않아요.** 이용 약관에 따라 데이터는 국외로 내보내거나 제3자에게 제공하지 않아요.",
        f"- 학습 {tr.get('utterances', '?')}개 / {tr.get('hours', '?')}시간 / 화자 {tr.get('speakers', '?')}명, 평가 {ev.get('utterances', '?')}개 / {ev.get('hours', '?')}시간 / 화자 {ev.get('speakers', '?')}명 (학습·평가 화자는 겹치지 않아요)",
        "",
        "## 학습 방법",
        f"- 기본 모델: `{BASE_IDS.get(a.model, a.model)}` (MIT 라이선스), 언어 ko, 작업 transcribe 고정",
        f"- 방식: {'LoRA(r=' + str(a.lora_r) + ', 대상 ' + a.lora_targets + ')' if a.lora else '전체 미세 조정'}, fp32, gradient checkpointing",
        f"- 학습률 {info['lr']}, 배치 {a.batch} × 누적 {a.accum}, 걸음 {info['max_steps']}, 워밍업 {info['warmup']}, 시드 {a.seed}",
        f"- 마지막으로 기록한 걸음: {info.get('last_step', 0)}, 학습 손실 {info.get('last_loss', '?')}, 평가 손실 {info.get('last_eval_loss', '?')}",
        "",
        "## 쓰임과 한계",
        "- 연구·실험용이에요. 낭독 연습의 '참고 지표'를 만드는 데 쓰고, 학생을 진단하거나 평가하는 데 쓰지 않아요.",
        "- 정확도는 `evaluate.py` 결과(CER·WER, 오경보율, 놓침률)를 이 문서에 직접 적어 넣어 주세요.",
        "- 아동 낭독 발화로 조정했으므로 어른 목소리·자유 발화에서는 성능이 다를 수 있어요.",
        "- 모델을 공개하기 전에 AI Hub 이용 약관과 출처 표시 조항을 다시 확인하세요.",
        "",
    ]
    (out / "MODEL_CARD.md").write_text("\n".join(lines), encoding="utf-8")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_common_args(ap)
    ap.add_argument("--model", choices=sorted(BASE_IDS), default="base")
    ap.add_argument("--base-id", default=None, help="기본 모델 HF id 또는 폴더(시험용, 기본은 openai/whisper-<model>)")
    ap.add_argument("--lora", action="store_true", help="LoRA로 학습(small에 권장)")
    ap.add_argument("--lora-r", type=int, default=32)
    ap.add_argument("--lora-targets", default="q_proj,k_proj,v_proj,out_proj", help="LoRA를 붙일 층 이름(쉼표로)")
    ap.add_argument("--name", default=None, help="결과 폴더 이름(기본: <model>[-lora])")
    ap.add_argument("--train", default=None, help="기본: work/train.jsonl")
    ap.add_argument("--eval", default=None, help="기본: work/eval.jsonl")
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--accum", type=int, default=8)
    ap.add_argument("--lr", type=float, default=None)
    ap.add_argument("--epochs", type=float, default=3.0, help="--max-steps 를 안 주면 이 바퀴 수만큼")
    ap.add_argument("--max-steps", type=int, default=0)
    ap.add_argument("--warmup", type=int, default=0, help="워밍업 걸음(기본: 전체의 10%, 최대 200)")
    ap.add_argument("--weight-decay", type=float, default=0.01)
    ap.add_argument("--save-every", type=int, default=100, help="N걸음마다 이어 하기용 저장")
    ap.add_argument("--eval-every", type=int, default=200)
    ap.add_argument("--eval-max", type=int, default=300, help="평가 손실에 쓸 발화 수 상한")
    ap.add_argument("--log-every", type=int, default=10)
    ap.add_argument("--max-label", type=int, default=440, help="이 토큰 수보다 긴 전사는 빼요(Whisper 한계 448)")
    ap.add_argument("--num-workers", type=int, default=0, help="윈도우는 0 권장")
    ap.add_argument("--no-grad-ckpt", action="store_true", help="gradient checkpointing 끄기(메모리 더 씀)")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--device", default=None, help="cuda 또는 cpu(기본: 자동)")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--speedtest", action="store_true", help="30걸음만 돌려 속도·메모리·예상 시간을 알려 줘요(저장 안 함)")
    a = ap.parse_args(argv)

    import torch
    from transformers import WhisperFeatureExtractor, WhisperForConditionalGeneration, WhisperTokenizer

    work = Path(a.work)
    name = a.name or (a.model + ("-lora" if a.lora else ""))
    out = work / "runs" / name
    ckpt_dir = out / "ckpt"
    device = a.device or ("cuda" if torch.cuda.is_available() else "cpu")
    torch.manual_seed(a.seed)
    base_id = a.base_id or BASE_IDS[a.model]
    lr = a.lr if a.lr is not None else (LORA_LR if a.lora else DEFAULT_LR[a.model])

    tok = WhisperTokenizer.from_pretrained(base_id)
    tok.set_prefix_tokens(language="korean", task="transcribe")
    fe = WhisperFeatureExtractor.from_pretrained(base_id)
    train_items = read_jsonl(Path(a.train) if a.train else work / "train.jsonl")
    eval_items = read_jsonl(Path(a.eval) if a.eval else work / "eval.jsonl")
    tr_ds = FeatDataset(train_items, work, tok, fe, a.max_label)
    ev_ds = FeatDataset(eval_items[: a.eval_max], work, tok, fe, a.max_label)
    if len(tr_ds) == 0:
        die("학습 발화가 없어요(train.jsonl 이 비었거나 전사가 너무 길어요).")
    if tr_ds.dropped:
        say(f"전사가 너무 길어서 뺀 학습 발화: {tr_ds.dropped:,}개")
    batch = min(a.batch, len(tr_ds))
    per_epoch = max(1, len(tr_ds) // batch)
    max_steps = a.max_steps or max(1, math.ceil(per_epoch * a.epochs / a.accum))
    warmup = a.warmup or min(200, max(1, max_steps // 10))
    say(f"학습 발화 {len(tr_ds):,}개, 평가 손실용 {len(ev_ds):,}개 | 장치 {device} | 모델 {base_id}{' + LoRA' if a.lora else ''}")
    say(f"한 걸음 = {batch} × {a.accum} = {batch * a.accum}개, 전체 {max_steps:,}걸음, 학습률 {lr}, 워밍업 {warmup}걸음")

    model = WhisperForConditionalGeneration.from_pretrained(base_id, torch_dtype=torch.float32)
    model.generation_config.language = "ko"
    model.generation_config.task = "transcribe"
    model.generation_config.forced_decoder_ids = None
    if hasattr(model.config, "forced_decoder_ids"):
        model.config.forced_decoder_ids = None
    model.config.use_cache = False
    if a.lora:
        from peft import LoraConfig, get_peft_model

        cfg = LoraConfig(r=a.lora_r, lora_alpha=2 * a.lora_r, lora_dropout=0.05, bias="none", target_modules=a.lora_targets.split(","))
        model = get_peft_model(model, cfg)
        model.print_trainable_parameters()
    if not a.no_grad_ckpt:
        model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model.to(device)
    trainable = [(n, p) for n, p in model.named_parameters() if p.requires_grad]
    opt = torch.optim.AdamW([p for _, p in trainable], lr=lr, weight_decay=a.weight_decay)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min((s + 1) / warmup, max(0.0, (max_steps - s) / max(1, max_steps - warmup))))

    step = 0
    if a.resume and (ckpt_dir / "last.pt").exists():
        st = torch.load(ckpt_dir / "last.pt", map_location="cpu", weights_only=False)
        model.load_state_dict(st["model"], strict=False)
        opt.load_state_dict(st["optim"])
        sched.load_state_dict(st["sched"])
        step = st["step"]
        say(f"이어서 시작해요: {step}걸음부터")
    elif a.resume:
        say("[알림] 이어 할 저장본이 없어서 처음부터 시작해요.")

    out.mkdir(parents=True, exist_ok=True)
    info = {"lr": lr, "max_steps": max_steps, "warmup": warmup}
    write_model_card(out, a, info)
    start_tok = model.config.decoder_start_token_id if hasattr(model, "config") else tok.convert_tokens_to_ids("<|startoftranscript|>")
    collate = make_collate(start_tok)

    def save_ckpt() -> None:
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        names = {n for n, _ in trainable}
        sd = {k: v.detach().cpu() for k, v in model.state_dict().items() if k in names}
        tmp = ckpt_dir / "last.pt.tmp"
        torch.save({"step": step, "model": sd, "optim": opt.state_dict(), "sched": sched.state_dict(), "args": vars(a)}, tmp)
        tmp.replace(ckpt_dir / "last.pt")

    @torch.no_grad()
    def eval_loss() -> float:
        if len(ev_ds) == 0:
            return float("nan")
        model.eval()
        tot = cnt = 0.0
        for i in range(0, len(ev_ds), batch):
            feats, labels = collate([ev_ds[j] for j in range(i, min(i + batch, len(ev_ds)))])
            loss = model(input_features=feats.to(device), labels=labels.to(device)).loss
            n = float((labels != -100).sum())
            tot += float(loss) * n
            cnt += n
        model.train()
        return tot / max(cnt, 1)

    total_batches = max_steps * a.accum
    todo = batch_list(len(tr_ds), batch, a.seed, step * a.accum, total_batches)
    if a.speedtest:
        todo = todo[: 30]
    loader = torch.utils.data.DataLoader(tr_ds, batch_sampler=todo, collate_fn=collate, num_workers=a.num_workers)

    log_f = None
    writer = None
    if not a.speedtest:
        new = not (out / "log.csv").exists() or not a.resume
        log_f = open(out / "log.csv", "w" if new else "a", newline="", encoding="utf-8")
        writer = csv.writer(log_f)
        if new:
            writer.writerow(["time", "step", "epoch", "loss", "lr", "grad_norm", "eval_loss", "sec_per_step", "gpu_mem_mb"])

    model.train()
    micro = 0
    run_loss = 0.0
    t_step = time.time()
    micro_times: list[float] = []
    last_loss = last_eval = None
    try:
        for feats, labels in loader:
            t0 = time.time()
            try:
                loss = model(input_features=feats.to(device), labels=labels.to(device)).loss
                (loss / a.accum).backward()
            except RuntimeError as e:
                if "out of memory" in str(e).lower():
                    opt.zero_grad(set_to_none=True)
                    say(f"\n[메모리 부족] GPU 메모리가 모자라요. --batch 를 줄이고(예: --batch 2) --accum 을 늘려 곱을 같게 해 주세요(예: --accum 16).")
                    say("            그래도 안 되면 --model 을 한 단계 작게 하거나 small이면 --lora 를 써 보세요. 저장된 것이 있으면 --resume 으로 이어 갈 수 있어요.")
                    sys.exit(3)
                raise
            run_loss += float(loss) / a.accum
            micro += 1
            if device == "cuda":
                torch.cuda.synchronize()
            micro_times.append(time.time() - t0)
            if micro % a.accum:
                continue
            gn = float(torch.nn.utils.clip_grad_norm_([p for _, p in trainable], 1.0))
            opt.step()
            sched.step()
            opt.zero_grad(set_to_none=True)
            step += 1
            last_loss = run_loss
            mem = torch.cuda.max_memory_allocated() / 2**20 if device == "cuda" else 0.0
            sec = (time.time() - t_step)
            t_step = time.time()
            ev = float("nan")
            if not a.speedtest and a.eval_every and step % a.eval_every == 0:
                ev = last_eval = eval_loss()
            if writer:
                writer.writerow([time.strftime("%Y-%m-%d %H:%M:%S"), step, round(step * a.accum / per_epoch, 4), round(run_loss, 5), sched.get_last_lr()[0], round(gn, 4), "" if math.isnan(ev) else round(ev, 5), round(sec, 2), round(mem)])
                log_f.flush()
            if step % a.log_every == 0 or step == 1 or step == max_steps:
                say(f"걸음 {step}/{max_steps} 손실 {run_loss:.4f} 걸음당 {sec:.1f}초 GPU메모리 최대 {mem:.0f}MB" + ("" if math.isnan(ev) else f" 평가손실 {ev:.4f}"))
            run_loss = 0.0
            if not a.speedtest and a.save_every and step % a.save_every == 0:
                save_ckpt()
    except KeyboardInterrupt:
        say("\n멈춤 요청을 받았어요. 지금까지를 저장하고 끝낼게요.")
        if not a.speedtest:
            save_ckpt()
        sys.exit(130)
    finally:
        if log_f:
            log_f.close()

    if a.speedtest:
        use = micro_times[3:] if len(micro_times) > 6 else micro_times
        per_micro = sum(use) / max(len(use), 1)
        per_step = per_micro * a.accum
        say("\n== 속도 시험 결과 ==")
        say(f"발화 {batch}개짜리 한 묶음당 {per_micro:.2f}초 → 한 걸음({a.accum}묶음) 약 {per_step:.1f}초")
        if device == "cuda":
            say(f"GPU 메모리 최대 사용 {torch.cuda.max_memory_allocated() / 2**30:.2f}GiB / 전체 {torch.cuda.get_device_properties(0).total_memory / 2**30:.1f}GiB")
        else:
            say("(GPU가 아니라서 메모리는 재지 않았어요)")
        say(f"전체 {max_steps:,}걸음이면 학습 시간 약 {per_step * max_steps / 3600:.1f}시간 (평가·저장 시간 제외)")
        return

    save_ckpt()
    info.update(last_step=step, last_loss=None if last_loss is None else round(last_loss, 4), last_eval_loss=None if last_eval is None else round(last_eval, 4))
    final = out / "final"
    if a.lora:
        model.save_pretrained(out / "final_adapter")
        model = model.merge_and_unload()
    model.config.use_cache = True
    model.save_pretrained(final)
    tok.save_pretrained(final)
    fe.save_pretrained(final)
    write_model_card(out, a, info)
    say(f"\n학습 끝: {final}\n모델 설명서: {out / 'MODEL_CARD.md'} (출처 표시 문구 포함)")


if __name__ == "__main__":
    main()
