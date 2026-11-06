"""fp32 ONNX 를 한 파일로 줄인다. onnx, numpy 만 쓴다(torch 필요 없음). 층마다 방식은 quant_spec.py 의 옵션으로 고른다.
GPTQ 를 쓰는 층은 gptq_weight_only.py 가 만든 값(--packed-dir)을 읽는다.

왜 이렇게 하나
  onnxruntime 의 quantize_dynamic(층 전체에 배율 하나 + 모든 층의 입력을 실행 때 8비트화)으로 만든 int8 파일은
  안전 동작이 무너졌다(위험 신호 알아차림 136/140 -> 21/140). 원인은 가중치가 아니라 'MLP down_proj 입력(활성값)의 8비트화'다
  (실측: 채널별 배율로 바꿔도 그대로 10/140. down_proj 만 빼면 정상 범위). 그래서
  - down_proj 는 가중치만 GPTQ 로 줄이고(MatMulNBits, 활성값 fp32) 계산은 fp32,
  - 나머지는 채널별 배율의 동적 int8(MatMulInteger)로 둔다. 이쪽은 브라우저 WASM 에서 빠르다(MatMulNBits 는 가중치를 매번 fp32 로 풀어 느림).

만드는 방법(모두 브라우저 엔진(onnxruntime-web WASM)이 지원하는 연산만 사용)
  - 동적 int8: DynamicQuantizeLinear -> MatMulInteger(채널별 대칭 int8 가중치) -> Cast -> 배율 곱
  - GPTQ 4비트: MatMulNBits(블록 32, 비대칭). 활성값 양자화가 끼어들지 않게 accuracy_level 을 지정하지 않는다.
  - GPTQ 8비트: 4비트 MatMulNBits 두 개(윗·아랫 4비트)를 더한다(quant_spec.py 설명. bits=8 은 fp32 로 실행되지 않는다).
  - 입력 임베딩(Gather): 출력층(lm_head)의 표를 같이 읽는다(Gemma 는 둘이 같은 가중치. 표 한 벌만 둔다).
    lm_head 가 GPTQ 4/8비트면 --embed tied(낱말 줄을 꺼내 풂), 동적 int8 이면 int8 열을 꺼내 배율을 곱한다.
    --embed int8 은 GPTQ lm_head 와 따로 낱말마다 배율 하나인 int8 표를 둔다(약 300MB 더 큼).
    · GatherBlockQuantized 는 브라우저 WASM 엔진이 지원하지 않아서 쓰지 않는다.
  - 결과는 외부 데이터 없이 한 파일(2GB 미만이어야 함)

사용
  python quantize_weight_only.py --src export/_fp32/model.onnx --dst export/onnx/model_int8.onnx --packed-dir export/_gptq [옵션]
  (파일 이름은 앱 카탈로그의 dtype "int8" 규칙 때문에 model_int8.onnx 로 둔다.)
"""
import argparse
import os
import sys

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

from quant_spec import add_plan_args, make_plan, split_8bit, tag

EMBED_GATHER = "/model/embed_tokens/Gather"
LM_HEAD = "/lm_head/MatMul"
MS = "com.microsoft"


def fail(msg):
    print("[양자화 중단] " + msg, file=sys.stderr)
    sys.exit(1)


def quantize_embedding_int8(model):
    """임베딩 표(fp32 [어휘, 은닉])를 낱말마다 배율이 하나인 int8 표로 바꾼다. 뒤쪽 그래프는 그대로 둔다."""
    g = model.graph
    init = {t.name: t for t in g.initializer}
    matches = [n for n in g.node if n.name == EMBED_GATHER and n.op_type == "Gather"]
    if len(matches) != 1:
        fail(f"임베딩 노드 {EMBED_GATHER} 를 찾지 못했어요. 기대한 내보내기 구조가 아니에요.")
    gather = matches[0]
    emb = init.get(gather.input[0])
    if emb is None or emb.data_type != TensorProto.FLOAT or len(emb.dims) != 2:
        fail("임베딩 표가 fp32 2차원 초기값이 아니에요.")
    if any(gather.input[0] in n.input for n in g.node if n is not gather):
        fail("임베딩 표를 다른 노드도 쓰고 있어요(묶인 가중치). 이 스크립트는 따로 저장된 표만 다뤄요.")
    w = numpy_helper.to_array(emb)  # [V, H]
    scale = np.maximum(np.abs(w).max(axis=1), 1e-8) / 127.0  # [V]
    q = np.clip(np.rint(w / scale[:, None]), -127, 127).astype(np.int8)
    q_name, s_name = gather.input[0] + "_int8", gather.input[0] + "_rowscale"
    ids = gather.input[1]
    old_out = gather.output[0]
    base = "/model/embed_tokens/q"
    new_nodes = [
        helper.make_node("Gather", [q_name, ids], [base + "_rows"], name=base + "/Gather", axis=0),  # int8 [B,S,H]
        helper.make_node("Cast", [base + "_rows"], [base + "_rows_f"], name=base + "/Cast", to=TensorProto.FLOAT),
        helper.make_node("Gather", [s_name, ids], [base + "_s"], name=base + "/GatherScale", axis=0),  # [B,S]
        helper.make_node("Unsqueeze", [base + "_s", base + "_axes"], [base + "_s1"], name=base + "/Unsqueeze"),  # [B,S,1]
        helper.make_node("Mul", [base + "_rows_f", base + "_s1"], [old_out], name=base + "/Mul"),
    ]
    idx = list(g.node).index(gather)
    kept = [n for n in g.node if n is not gather]
    del g.node[:]
    g.node.extend(kept[:idx] + new_nodes + kept[idx:])
    keep_init = [t for t in g.initializer if t.name != emb.name]
    del g.initializer[:]
    g.initializer.extend(keep_init)
    g.initializer.extend(
        [
            numpy_helper.from_array(q, q_name),
            numpy_helper.from_array(scale.astype(np.float32), s_name),
            numpy_helper.from_array(np.array([-1], dtype=np.int64), base + "_axes"),
        ]
    )
    err = np.abs(q.astype(np.float32) * scale[:, None] - w).max()
    print(f"[임베딩] {w.shape} fp32 -> int8 + 행 배율, 최대 오차 {err:.5f}")


def tie_embedding_to_lm_head(model, bits, block_size):
    """입력 임베딩이 출력층(lm_head)의 MatMulNBits 표를 그대로 읽게 한다(Gemma 는 둘이 같은 가중치).
    MatMulNBits 의 B 는 [어휘, 블록 수, 블록 바이트] 로 낱말마다 한 줄씩 저장돼 있어서, 낱말 번호로 줄을 꺼내
    (값 - 영점) x 배율 로 풀면 임베딩이 된다. 표를 두 벌 두지 않으므로 파일이 약 300MB 줄어든다.
    4비트는 한 바이트에 두 값이 들어 있어(낮은 4비트가 먼저) BitwiseAnd/BitShift 로 푼다. 모두 일반 ONNX 연산이다.
    8비트 출력층은 윗·아랫 4비트 두 표라서 두 표에서 각각 풀어 더한다."""
    g = model.graph
    names = [f"{LM_HEAD}_Q4"] if bits == 4 else [f"{LM_HEAD}_Q8hi", f"{LM_HEAD}_Q8lo"]
    lms = [n for n in g.node if n.op_type == "MatMulNBits" and n.name in names]
    gather = [n for n in g.node if n.name == EMBED_GATHER and n.op_type == "Gather"]
    if len(lms) != len(names) or len(gather) != 1:
        fail("lm_head MatMulNBits 나 임베딩 Gather 를 찾지 못했어요. 기대한 구조가 아니에요.")
    gather = gather[0]
    ids, old_out = gather.input[1], gather.output[0]
    nodes, consts = [], []
    outs = []
    for k, lm in enumerate(sorted(lms, key=lambda n: names.index(n.name))):
        out = old_out if len(lms) == 1 else f"/model/embed_tokens/tied{k}_out"
        n_vocab, hidden = _tied_rows(model, lm, ids, out, f"/model/embed_tokens/tied{k}", block_size, nodes, consts)
        outs.append(out)
    if len(outs) == 2:
        nodes.append(helper.make_node("Add", outs, [old_out], name="/model/embed_tokens/tied/Add"))
    idx = list(g.node).index(gather)
    kept = [n for n in g.node if n is not gather]
    del g.node[:]
    g.node.extend(kept[:idx] + nodes + kept[idx:])
    seen, uniq = set(), []  # 중복 const 이름 제거
    for t in consts:
        if t.name not in seen:
            seen.add(t.name)
            uniq.append(t)
    g.initializer.extend(uniq)
    print(f"[임베딩] 출력층 {bits}비트 표를 공유 ({n_vocab} x {hidden}, 블록 {block_size})")


def _tied_rows(model, lm, ids, out, base, block_size, nodes, consts):
    """MatMulNBits 4비트 표 하나에서 낱말 번호(ids)에 해당하는 줄을 풀어 out([B,S,은닉]) 으로 만든다."""
    init = {t.name: t for t in model.graph.initializer}
    if len(lm.input) != 4 or lm.input[3] not in init:
        fail("lm_head 에 영점(zero_points)이 없어요. 비대칭 양자화에서만 묶을 수 있어요.")
    b_name, s_name, z_name = lm.input[1], lm.input[2], lm.input[3]
    n_vocab, kb, blob = init[b_name].dims
    hidden = kb * block_size

    def const(name, arr):
        consts.append(numpy_helper.from_array(np.asarray(arr), base + name))
        return base + name

    def unpack(src, tag):
        """uint8 [..., 바이트] -> float [..., 바이트 x 2] (바이트 하나를 두 값으로 푼다)"""
        lo, hi = base + tag + "_lo", base + tag + "_hi"
        nodes.append(helper.make_node("BitwiseAnd", [src, const(tag + "_mask", np.array(15, dtype=np.uint8))], [lo], name=base + tag + "/And"))
        nodes.append(helper.make_node("BitShift", [src, const(tag + "_sh", np.array(4, dtype=np.uint8))], [hi], name=base + tag + "/Shift", direction="RIGHT"))
        for t in (lo, hi):
            nodes.append(helper.make_node("Unsqueeze", [t, const("_m1", np.array([-1], dtype=np.int64))], [t + "_u"], name=t + "/Unsqueeze"))
        nodes.append(helper.make_node("Concat", [lo + "_u", hi + "_u"], [base + tag + "_pair"], name=base + tag + "/Concat", axis=-1))
        nodes.append(helper.make_node("Cast", [base + tag + "_pair"], [base + tag + "_pf"], name=base + tag + "/Cast", to=TensorProto.FLOAT))
        return base + tag + "_pf"

    # 값: Gather(B, ids) -> [B,S,kb,blob] -> 풀기 -> [B,S,kb,block]
    nodes.append(helper.make_node("Gather", [b_name, ids], [base + "_rows"], name=base + "/GatherB", axis=0))
    q = unpack(base + "_rows", "_q")
    nodes.append(helper.make_node("Reshape", [q, const("_shq", np.array([0, 0, kb, block_size], dtype=np.int64))], [base + "_qr"], name=base + "/ReshapeQ"))
    # 영점: Gather(zp, ids) -> [B,S,zpbytes] -> 풀기 -> [B,S,kb]
    nodes.append(helper.make_node("Gather", [z_name, ids], [base + "_zrows"], name=base + "/GatherZ", axis=0))
    z = unpack(base + "_zrows", "_z")
    nodes.append(helper.make_node("Reshape", [z, const("_shz0", np.array([0, 0, -1], dtype=np.int64))], [base + "_zr"], name=base + "/ReshapeZ0"))
    nodes.append(helper.make_node("Slice", [base + "_zr", const("_z0", np.array([0], dtype=np.int64)), const("_zk", np.array([kb], dtype=np.int64)), const("_zax", np.array([2], dtype=np.int64))], [base + "_zs"], name=base + "/SliceZ"))
    nodes.append(helper.make_node("Gather", [s_name, ids], [base + "_sc"], name=base + "/GatherS", axis=0))  # [B,S,kb]
    m1 = const("_m1", np.array([-1], dtype=np.int64))
    nodes.append(helper.make_node("Unsqueeze", [base + "_zs", m1], [base + "_z1"], name=base + "/UnsqZ"))
    nodes.append(helper.make_node("Unsqueeze", [base + "_sc", m1], [base + "_s1"], name=base + "/UnsqS"))
    nodes.append(helper.make_node("Sub", [base + "_qr", base + "_z1"], [base + "_d"], name=base + "/Sub"))
    nodes.append(helper.make_node("Mul", [base + "_d", base + "_s1"], [base + "_v"], name=base + "/Mul"))
    nodes.append(helper.make_node("Reshape", [base + "_v", const("_shout", np.array([0, 0, hidden], dtype=np.int64))], [out], name=base + "/ReshapeOut"))
    return n_vocab, hidden


def dynamic_int8_nodes(node, init):
    """fp32 MatMul 하나를 동적 int8 로 바꾼다: 가중치는 출력 채널마다 배율을 둔 대칭 int8,
    입력은 DynamicQuantizeLinear 로 실행 때 uint8 로 바꾸고 MatMulInteger -> float -> 두 배율 곱."""
    w_init = init.get(node.input[1])
    if w_init is None or len(w_init.dims) != 2:
        fail(f"{node.name} 의 가중치가 2차원 초기값이 아니에요.")
    w = numpy_helper.to_array(w_init)  # [K, N]
    scale = np.maximum(np.abs(w).max(axis=0), 1e-8) / 127.0
    q = np.clip(np.rint(w / scale[None, :]), -127, 127).astype(np.int8)
    b = node.name
    nodes = [
        helper.make_node("DynamicQuantizeLinear", [node.input[0]], [b + "_xq", b + "_xs", b + "_xz"], name=b + "_dql"),
        helper.make_node("MatMulInteger", [b + "_xq", b + "_wq", b + "_xz"], [b + "_i32"], name=b + "_mmi"),
        helper.make_node("Cast", [b + "_i32"], [b + "_f"], name=b + "_cast", to=TensorProto.FLOAT),
        helper.make_node("Mul", [b + "_f", b + "_xs"], [b + "_f2"], name=b + "_mul_x"),
        helper.make_node("Mul", [b + "_f2", b + "_ws"], [node.output[0]], name=b + "_mul_w"),
    ]
    return nodes, [numpy_helper.from_array(q, b + "_wq"), numpy_helper.from_array(scale.astype(np.float32), b + "_ws")]


def tie_embedding_to_int8_head(model):
    """lm_head 가 동적 int8 일 때 임베딩이 그 int8 표 [은닉, 어휘] 를 읽게 한다(낱말 번호로 열을 꺼내 열마다의 배율을 곱함)."""
    g = model.graph
    gather = [n for n in g.node if n.name == EMBED_GATHER and n.op_type == "Gather"]
    if len(gather) != 1 or not any(t.name == LM_HEAD + "_wq" for t in g.initializer):
        fail("임베딩 Gather 나 lm_head 의 int8 표를 찾지 못했어요. 기대한 구조가 아니에요.")
    gather = gather[0]
    ids, out, b = gather.input[1], gather.output[0], "/model/embed_tokens/tied"
    nodes = [
        helper.make_node("Gather", [LM_HEAD + "_wq", ids], [b + "_r"], name=b + "/Gather", axis=1),  # [은닉, B, S]
        helper.make_node("Transpose", [b + "_r"], [b + "_t"], name=b + "/Transpose", perm=[1, 2, 0]),
        helper.make_node("Cast", [b + "_t"], [b + "_f"], name=b + "/Cast", to=TensorProto.FLOAT),
        helper.make_node("Gather", [LM_HEAD + "_ws", ids], [b + "_s"], name=b + "/GatherScale", axis=0),  # [B, S]
        helper.make_node("Unsqueeze", [b + "_s", b + "_ax"], [b + "_s1"], name=b + "/Unsqueeze"),
        helper.make_node("Mul", [b + "_f", b + "_s1"], [out], name=b + "/Mul"),
    ]
    g.initializer.append(numpy_helper.from_array(np.array([-1], dtype=np.int64), b + "_ax"))
    idx = list(g.node).index(gather)
    kept = [n for n in g.node if n is not gather]
    del g.node[:]
    g.node.extend(kept[:idx] + nodes + kept[idx:])
    print("[임베딩] 출력층 int8 표를 공유")


def nbits_nodes(name, inp, out, parts, k, n, group, node_name):
    """4비트 MatMulNBits 하나. parts = (packed, scales, zp) -> (노드, 초기값들)"""
    names = [f"{name}_{part}" for part in ("w4", "scales", "zero_points")]
    inits = [numpy_helper.from_array(arr, nm) for arr, nm in zip(parts, names)]
    node = helper.make_node("MatMulNBits", [inp] + names, [out], name=node_name, domain=MS, K=k, N=n, bits=4, block_size=group)
    return node, inits


def replace_linears(model, packed_dir, plan):
    """fp32 MatMul(선형층)을 GPTQ 가중치의 MatMulNBits 로 바꾼다. 모양이 다르면 멈춘다."""
    g = model.graph
    init = {t.name: t for t in g.initializer}
    out_nodes, new_inits, done = [], [], 0
    for node in g.node:
        key = None
        if node.op_type == "MatMul" and node.name.endswith("/MatMul"):
            cand = node.name[1 : -len("/MatMul")].replace("/", ".")
            if cand in plan:
                key = cand
        if key is None:
            out_nodes.append(node)
            continue
        bits, group = plan[key]
        if bits == 0:
            nds, ts = dynamic_int8_nodes(node, init)
            out_nodes += nds
            new_inits += ts
            done += 1
            continue
        base = os.path.join(packed_dir, f"{key}.{tag(bits, group)}")
        if not os.path.exists(base + ".zp.npy"):
            fail(f"{key} 의 GPTQ 결과({os.path.basename(base)}.*.npy)가 {packed_dir} 에 없어요. gptq_weight_only.py 를 같은 비트 옵션으로 먼저 돌리세요.")
        packed, scales, zp = (np.load(f"{base}.{x}.npy") for x in ("packed", "scales", "zp"))
        w = init.get(node.input[1])
        if w is None or len(w.dims) != 2:
            fail(f"{key} 의 가중치가 2차원 초기값이 아니에요.")
        k, n = w.dims
        if (packed.shape[0], packed.shape[1] * group) != (n, k):
            fail(f"{key} 모양이 달라요: ONNX [K={k}, N={n}] / GPTQ 출력 {packed.shape[0]} x 입력 {packed.shape[1] * group}")
        inp, out, nm = node.input[0], node.output[0], node.name
        if bits == 4:
            nd, ts = nbits_nodes(nm, inp, out, (packed, scales, zp), k, n, group, nm + "_Q4")
            out_nodes.append(nd)
            new_inits += ts
        else:
            hi, lo = split_8bit(packed, scales, zp)
            for tagname, parts in (("hi", hi), ("lo", lo)):
                nd, ts = nbits_nodes(f"{nm}_{tagname}", inp, f"{out}_{tagname}", parts, k, n, group, f"{nm}_Q8{tagname}")
                out_nodes.append(nd)
                new_inits += ts
            out_nodes.append(helper.make_node("Add", [f"{out}_hi", f"{out}_lo"], [out], name=nm + "_Q8add"))
        done += 1
    if done != len(plan):
        fail(f"선형층 {done}개만 바꿨어요(기대 {len(plan)}). 기대한 내보내기 구조가 아니에요.")
    del g.node[:]
    g.node.extend(out_nodes)
    g.initializer.extend(new_inits)
    if not any(o.domain == MS for o in model.opset_import):
        model.opset_import.append(helper.make_opsetid(MS, 1))
    count = {b: sum(1 for x, _ in plan.values() if x == b) for b in (0, 4, 8)}
    print(f"[선형층] {done}개 교체 (동적 int8 {count[0]}개, GPTQ 4비트 {count[4]}개, GPTQ 8비트 {count[8]}개)")


def count_layers(model):
    ids = set()
    for n in model.graph.node:
        parts = n.name.split("/")
        if len(parts) > 3 and parts[1] == "model" and parts[2].startswith("layers.") and parts[2][7:].isdigit():
            ids.add(int(parts[2][7:]))
    return len(ids)


def run(src, dst, packed_dir, plan_args, embed="tied"):
    print(f"[읽기] {src}")
    model = onnx.load(src)  # 외부 데이터(.onnx_data)는 자동으로 읽는다
    plan = make_plan(plan_args, count_layers(model))
    if count_layers(model) == 0:
        fail("트랜스포머 층(/model/layers.N/...)을 찾지 못했어요. 기대한 내보내기 구조가 아니에요.")
    if embed == "int8":
        if plan["lm_head"][0] == 0:
            fail("--embed int8 은 lm_head 가 GPTQ(4/8비트)일 때만 의미가 있어요(동적 int8 이면 기본 tied 가 같은 표를 써요).")
        quantize_embedding_int8(model)
    replace_linears(model, packed_dir, plan)
    if embed == "tied":
        if plan["lm_head"][0] == 0:
            tie_embedding_to_int8_head(model)
        else:
            tie_embedding_to_lm_head(model, plan["lm_head"][0], plan["lm_head"][1])
    ops = {}
    for n in model.graph.node:
        ops[n.op_type] = ops.get(n.op_type, 0) + 1
    if ops.get("GatherBlockQuantized"):
        fail("GatherBlockQuantized 가 들어 있어요(브라우저 WASM 엔진이 지원하지 않음).")
    # 안 쓰는 fp32 초기값이 남아 있으면 크기가 커진다
    used = {i for n in model.graph.node for i in n.input}
    keep = [t for t in model.graph.initializer if t.name in used]
    del model.graph.initializer[:]
    model.graph.initializer.extend(keep)
    total = sum(t.ByteSize() for t in model.graph.initializer)
    if total >= 2 * 1024**3:
        big = sorted(model.graph.initializer, key=lambda t: -t.ByteSize())[:5]
        fail(f"가중치가 {total / 1e9:.1f}GB 라 한 파일(2GB 미만)로 못 써요. 큰 것: " + ", ".join(f"{t.name} {list(t.dims)}" for t in big))
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    onnx.save(model, dst)  # 외부 데이터 없이 한 파일
    size = os.path.getsize(dst)
    print(f"[완료] {dst}  {size / 1e6:.0f}MB  MatMulNBits={ops.get('MatMulNBits', 0)} MatMulInteger={ops.get('MatMulInteger', 0)}")
    if size >= 2 * 1024**3:
        fail("결과가 2GB 를 넘어요. 앱은 한 파일만 읽어요.")
    return size


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--src", required=True, help="fp32 ONNX (예: export/_fp32/model.onnx)")
    p.add_argument("--dst", required=True, help="결과 파일 (예: export/onnx/model_int8.onnx)")
    p.add_argument("--packed-dir", required=True, help="gptq_weight_only.py 결과 폴더")
    p.add_argument("--embed", default="tied", choices=["tied", "int8"], help="tied: 임베딩이 출력층 표를 공유")
    add_plan_args(p)
    a = p.parse_args()
    if os.path.abspath(a.src) == os.path.abspath(a.dst):
        fail("입력과 출력 경로가 같아요.")
    run(a.src, a.dst, a.packed_dir, a, a.embed)
