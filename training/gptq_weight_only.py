"""GPTQ 로 가중치를 4비트(또는 8비트)로 줄인 값을 만든다(활성값은 fp32 그대로). 결과는 quantize_weight_only.py 가 읽는다.

왜 필요한가
  ORT 기본 4비트(MatMulNBits, 가장 가까운 값으로 반올림)는 위험 신호·개인 정보는 지키지만 '대필 요청' 같이 미묘한 판단이
  줄어든다(실측: 대필 알아차림 0.96 -> 0.80). GPTQ 는 각 층에서 '이 층의 실제 입력'으로 출력 오차를 직접 줄이도록
  가중치를 하나씩 반올림하고 남은 오차를 아직 반올림하지 않은 가중치에 나눠 보정한다. 학습 데이터(SFT)의 일부를 보정용으로 쓴다
  (레드팀 문항은 쓰지 않는다). 비트 수는 층마다 고를 수 있다(quant_spec.py 의 옵션).

만드는 것: 폴더 안에 층마다 <이름>.b<비트>g<블록>.{packed,scales,zp}.npy
  4비트: packed uint8 [출력, 블록 수, 블록/2], scales fp32 [출력, 블록 수], zp uint8 [출력, ceil(블록 수/2)]  (ORT MatMulNBits 모양)
  8비트: packed uint8 [출력, 블록 수, 블록](값 0~255 그대로), scales fp32 [출력, 블록 수], zp uint8 [출력, 블록 수]
  이미 있는 파일은 건너뛰므로 같은 폴더에 설정을 바꿔 다시 돌리면 모자란 층만 계산한다(Hessian 모으기가 가장 오래 걸린다).

시간(보정 64문장, 길이 640, CPU 4코어 기준): Hessian 모으기 층 절반씩 약 5분 x2, 층별 GPTQ 는 층당 1~5초(lm_head 만 약 1분).
GPU 가 있으면 더 빠르지만 CPU 로도 전체 약 15분이다. 메모리는 약 6GB.

사용(변환용 가상환경, torch 필요)
  python gptq_weight_only.py --model export/_stage --out export/_gptq --calib data/sft_train.jsonl [--attn-bits 8 ...]
  python quantize_weight_only.py --src export/_fp32/model.onnx --dst export/onnx/model_int8.onnx --packed-dir export/_gptq [같은 옵션]
"""
import argparse
import json
import os
import random
import sys
import time

import numpy as np
import torch

from quant_spec import LINEARS, add_plan_args, make_plan, pack_nibbles, tag

SHARE = {"self_attn.k_proj": "self_attn.q_proj", "self_attn.v_proj": "self_attn.q_proj", "mlp.up_proj": "mlp.gate_proj"}  # 같은 입력을 받는 층은 Hessian 공유


def group_params(w, bits):
    """w: [행, 그룹] → ORT 와 같은 비대칭 배율/영점(0 을 포함하는 범위)."""
    maxq = 2**bits - 1
    lo = torch.clamp(w.min(dim=1).values, max=0.0)
    hi = torch.clamp(w.max(dim=1).values, min=0.0)
    scale = (hi - lo) / maxq
    scale = torch.where(scale == 0, torch.ones_like(scale), scale)
    zp = torch.clamp(torch.round(-lo / scale), 0, maxq)
    return scale, zp


def gptq(weight, hess, bits=4, group=32, blocksize=128, percdamp=0.01):
    """weight: [출력, 입력] fp32, hess: [입력, 입력] (X^T X). 반환: 정수 [출력, 입력] uint8, scale/zp [출력, 입력/group]"""
    maxq = 2**bits - 1
    w = weight.clone().float()
    rows, cols = w.shape
    h = hess.clone().float()
    dead = torch.diag(h) == 0
    h[dead, dead] = 1
    w[:, dead] = 0
    damp = percdamp * torch.mean(torch.diag(h))
    h += damp * torch.eye(cols)
    h = torch.linalg.cholesky(h)
    h = torch.cholesky_inverse(h)
    hinv = torch.linalg.cholesky(h, upper=True)
    ints = torch.zeros(rows, cols, dtype=torch.uint8)
    nb = cols // group
    scales = torch.zeros(rows, nb)
    zps = torch.zeros(rows, nb)
    for i1 in range(0, cols, blocksize):
        i2 = min(i1 + blocksize, cols)
        w1 = w[:, i1:i2].clone()
        err1 = torch.zeros_like(w1)
        hinv1 = hinv[i1:i2, i1:i2]
        for i in range(i2 - i1):
            if (i1 + i) % group == 0:
                s, z = group_params(w1[:, i : i + group], bits)
                scales[:, (i1 + i) // group] = s
                zps[:, (i1 + i) // group] = z
            col = w1[:, i]
            d = hinv1[i, i]
            q = torch.clamp(torch.round(col / s) + z, 0, maxq)
            ints[:, i1 + i] = q.to(torch.uint8)
            deq = (q - z) * s
            err = (col - deq) / d
            w1[:, i:] -= err.unsqueeze(1) @ hinv1[i, i:].unsqueeze(0)
            err1[:, i] = err
        w[:, i2:] -= err1 @ hinv[i1:i2, i2:]
    return ints, scales, zps


def calib_batches(tok, path, n, maxlen, seed, stratify=False):
    rows = [json.loads(line) for line in open(path, encoding="utf-8")]
    rng = random.Random(seed)
    rng.shuffle(rows)
    if stratify:  # meta.category 마다 같은 수(위험 신호·개인 정보·대필 같은 드문 종류가 보정에서 묻히지 않게)
        by = {}
        for r in rows:
            by.setdefault((r.get("meta") or {}).get("category", ""), []).append(r)
        per = max(1, n // len(by))
        rows = [r for group in zip(*[g[:per] for g in by.values()]) for r in group]
        n = len(rows)
    out = []
    for r in rows[:n]:
        text = tok.apply_chat_template(r["messages"], tokenize=False)
        ids = tok(text, add_special_tokens=False, return_tensors="pt")["input_ids"][:, :maxlen]
        out.append(ids)
    return out


def collect_hessians(model, batches, names, with_head=False):
    hess, count, hooks = {}, {}, []

    def make_hook(key):
        def hook(module, args):
            x = args[0].detach().reshape(-1, args[0].shape[-1]).float()
            if key not in hess:
                hess[key] = torch.zeros(x.shape[1], x.shape[1])
                count[key] = 0
            hess[key] += x.T @ x
            count[key] += x.shape[0]

        return hook

    head_hook = make_hook("lm_head")
    for key, module in names.items():
        if key != "lm_head":
            hooks.append(module.register_forward_pre_hook(make_hook(key)))
    with torch.no_grad():
        for k, ids in enumerate(batches):
            h = model.model(input_ids=ids).last_hidden_state  # lm_head 는 직접 계산하지 않는다(26만 x 길이 로짓 메모리 절약)
            if with_head:
                head_hook(None, (h,))
            if k % 8 == 0:
                print(f"  보정 데이터 {k + 1}/{len(batches)}", flush=True)
    for h in hooks:
        h.remove()
    return {k: hess[k] * (2.0 / count[k]) for k in hess}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True, help="가중치+설정이 모인 폴더(export_onnx.py 의 _stage)")
    p.add_argument("--out", required=True)
    p.add_argument("--calib", required=True, help="보정용 jsonl(messages 형식, 예: data/sft_train.jsonl)")
    p.add_argument("--n", type=int, default=64)
    p.add_argument("--maxlen", type=int, default=640)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--passes", type=int, default=2, help="Hessian 을 모으는 횟수(클수록 메모리를 덜 씀)")
    p.add_argument("--stratify", action="store_true", help="meta.category 마다 같은 수로 뽑기")
    add_plan_args(p)
    a = p.parse_args()
    from transformers import AutoModelForCausalLM, AutoTokenizer

    torch.set_grad_enabled(False)
    tok = AutoTokenizer.from_pretrained(a.model)
    model = AutoModelForCausalLM.from_pretrained(a.model, torch_dtype=torch.float32).eval()
    os.makedirs(a.out, exist_ok=True)
    layers = model.model.layers
    plan = make_plan(a, len(layers))

    def cached(name):
        bits, group = plan[name]
        if bits == 0:  # 동적 int8 은 GPTQ 가 필요 없다
            return True
        return os.path.exists(os.path.join(a.out, f"{name}.{tag(bits, group)}.zp.npy"))

    # 메모리: down_proj 의 Hessian 은 층마다 약 190MB 라서 한꺼번에 모으면 26층에 5GB 가 넘는다 -> 층을 나눠 여러 번에 걸쳐 모은다.
    todo = []
    for li, layer in enumerate(layers):
        for lin in LINEARS:
            name = f"model.layers.{li}.{lin}"
            if not cached(name):
                todo.append((name, layer.get_submodule(lin), f"model.layers.{li}.{SHARE.get(lin, lin)}", li))
    if not cached("lm_head"):
        todo.append(("lm_head", model.lm_head, "lm_head", -1))
    if not todo:
        print("모두 계산돼 있어요:", a.out)
        return
    per_pass = max(1, len(layers) // a.passes)
    batches = calib_batches(tok, a.calib, a.n, a.maxlen, a.seed, a.stratify)
    for start in range(0, len(layers), per_pass):
        chunk = [t for t in todo if start <= t[3] < start + per_pass or (t[3] == -1 and start == 0)]
        if not chunk:
            continue
        # k/v 와 up 은 q/gate 와 입력이 같아 Hessian 을 공유한다
        hooked = {}
        for _, module, hkey, li in chunk:
            hooked[hkey] = module if hkey == "lm_head" else layers[li].get_submodule(hkey.split(".", 3)[-1])
        t0 = time.time()
        print(f"[보정] 층 {start}~{min(start + per_pass, len(layers)) - 1}: {a.n}개 문장으로 Hessian 모으는 중", flush=True)
        hess = collect_hessians(model, batches, hooked, with_head=any(t[0] == "lm_head" for t in chunk))
        print(f"  {time.time() - t0:.0f}초", flush=True)
        for name, module, hkey, _ in chunk:
            t1 = time.time()
            bits, group = plan[name]
            w = module.weight.data
            if name == "lm_head":  # 행이 26만 개라 나눠서 처리(행끼리는 서로 독립)
                parts = [gptq(w[r : r + 16384], hess[hkey], bits=bits, group=group) for r in range(0, w.shape[0], 16384)]
                ints = torch.cat([x[0] for x in parts])
                scales = torch.cat([x[1] for x in parts])
                zps = torch.cat([x[2] for x in parts])
            else:
                ints, scales, zps = gptq(w, hess[hkey], bits=bits, group=group)
            rows = w.shape[0]
            deq = ((ints.float().reshape(rows, -1, group) - zps.unsqueeze(-1)) * scales.unsqueeze(-1)).reshape(w.shape)
            rel = float(((deq - w) ** 2).sum() / (w**2).sum())
            q = ints.numpy().reshape(rows, -1, group)
            zp = zps.numpy().astype(np.uint8)
            if bits == 4:
                q, zp = pack_nibbles(q, zp)
            base = os.path.join(a.out, f"{name}.{tag(bits, group)}")
            np.save(base + ".packed.npy", q)
            np.save(base + ".scales.npy", scales.numpy().astype(np.float32))
            np.save(base + ".zp.npy", zp)  # 마지막에 저장 = 이 파일이 있으면 다 저장된 것
            print(f"[GPTQ] {name} {bits}비트 블록{group} {tuple(w.shape)} 상대 오차 {rel:.5f}  {time.time() - t1:.0f}초", flush=True)
        del hess
    json.dump({"calib": os.path.basename(a.calib), "n": a.n, "maxlen": a.maxlen, "seed": a.seed}, open(os.path.join(a.out, "meta.json"), "w"))
    print("완료:", a.out)


if __name__ == "__main__":
    sys.exit(main())
