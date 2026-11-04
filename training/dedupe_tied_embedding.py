"""int8 ONNX 에서 중복된 어휘 표(임베딩 = 출력층)를 하나로 줄인다. 재학습·torch 필요 없음(onnx, numpy 만 씀).

왜 필요한가
  Gemma 3 1B 는 입력 임베딩과 출력층(lm_head)이 같은 가중치를 쓴다(tie_word_embeddings).
  그런데 ONNX 내보내기 + quantize_dynamic 을 거치면 같은 표가 두 벌(각 약 302MB) 저장된다.
    - model.embed_tokens.weight_quantized : UINT8 [어휘, 1152]  (Gather 로 낱말 벡터를 꺼냄)
    - onnx::MatMul_NNNNN_quantized        : INT8  [1152, 어휘]  (lm_head MatMulInteger 의 B)
  이 스크립트는 임베딩 조회가 lm_head 의 INT8 표를 읽도록 바꾸고 UINT8 표를 지운다.
    Gather(표 [1152, 어휘], input_ids, axis=1) -> Transpose([1,2,0]) -> DequantizeLinear(lm_head 의 scale, zero_point)
  새 출력 이름은 원래 /model/embed_tokens/Gather_output_0 와 같아서 뒤쪽 그래프는 그대로다.
  임베딩 값은 uint8(비대칭) 대신 int8(대칭)로 약간 달라지지만 같은 가중치를 양자화한 것이라 차이가 작다.

사용
  python dedupe_tied_embedding.py in.onnx out.onnx

기대한 모양이 아니면(노드 이름·연산·크기가 다르면) 아무것도 쓰지 않고 멈춘다.
"""
import os
import sys

import onnx
from onnx import TensorProto, helper, numpy_helper


def fail(msg):
    print("[중복 표 제거 중단] " + msg, file=sys.stderr)
    sys.exit(1)


def find_node(graph, name, op_type):
    found = [n for n in graph.node if n.name == name]
    if len(found) != 1 or found[0].op_type != op_type:
        fail(f"노드 {name}({op_type})를 찾지 못했어요. 기대한 int8 내보내기 구조가 아니에요.")
    return found[0]


def dedupe(src, dst):
    model = onnx.load(src)  # 외부 데이터가 없는 한 파일 모델을 가정(2GB 미만)
    g = model.graph
    init = {t.name: t for t in g.initializer}

    # 1) 임베딩 경로: Gather(UINT8 표) -> DequantizeLinear
    gather = find_node(g, "/model/embed_tokens/Gather", "Gather")
    deq = find_node(g, "/model/embed_tokens/Gather_output_0_DequantizeLinear", "DequantizeLinear")
    emb_name = gather.input[0]
    ids_name = gather.input[1]
    if deq.input[0] != gather.output[0] or len(deq.input) != 3:
        fail("임베딩 Gather 와 DequantizeLinear 가 이어져 있지 않아요.")
    emb = init.get(emb_name)
    if emb is None or emb.data_type != TensorProto.UINT8 or len(emb.dims) != 2:
        fail("임베딩 표가 UINT8 2차원 초기값이 아니에요.")
    vocab, hidden = emb.dims
    old_out = deq.output[0]
    old_extra = [deq.input[1], deq.input[2]]

    # 2) 출력층: MatMulInteger 의 B 가 INT8 [hidden, vocab] 이고 대칭(영점 0)이어야 한다.
    lm = find_node(g, "/lm_head/MatMul_quant", "MatMulInteger")
    if len(lm.input) != 4:
        fail("lm_head MatMulInteger 입력이 4개가 아니에요.")
    b_name, b_zp_name = lm.input[1], lm.input[3]
    b = init.get(b_name)
    if b is None or b.data_type != TensorProto.INT8 or list(b.dims) != [hidden, vocab]:
        fail(f"lm_head 표가 INT8 [{hidden}, {vocab}] 이 아니에요(실제 {None if b is None else list(b.dims)}).")
    b_zp = init.get(b_zp_name)
    if b_zp is None or b_zp.data_type != TensorProto.INT8 or list(b_zp.dims) not in ([], [1]):
        fail("lm_head 표의 영점이 int8 스칼라 초기값이 아니에요.")
    if numpy_helper.to_array(b_zp).ravel()[0] != 0:
        fail("lm_head 표의 영점이 0 이 아니에요(대칭 양자화가 아님).")

    # 3) lm_head 표의 scale: '/lm_head/MatMul_quant_scales_mul' = (입력 scale) x (표 scale) 의 두 번째 입력
    scales_mul = find_node(g, "/lm_head/MatMul_quant_scales_mul", "Mul")
    b_scale_candidates = [i for i in scales_mul.input if i in init]
    if len(b_scale_candidates) != 1:
        fail("lm_head 표의 scale 초기값을 하나로 특정하지 못했어요.")
    b_scale_name = b_scale_candidates[0]
    b_scale = init[b_scale_name]
    if b_scale.data_type != TensorProto.FLOAT or len(b_scale.dims) != 0:
        fail("lm_head 표의 scale 이 float 스칼라(per-tensor)가 아니에요.")

    # 4) 그래프 고치기: 새 노드를 같은 자리에 넣고 옛 노드는 지운다.
    base = "/model/embed_tokens/tied"
    gathered, transposed = base + "_gather", base + "_transposed"
    new_nodes = [
        helper.make_node("Gather", [b_name, ids_name], [gathered], name=base + "/Gather", axis=1),  # [hidden, B, S]
        helper.make_node("Transpose", [gathered], [transposed], name=base + "/Transpose", perm=[1, 2, 0]),  # [B, S, hidden]
        helper.make_node("DequantizeLinear", [transposed, b_scale_name, b_zp_name], [old_out], name=base + "/DequantizeLinear"),
    ]
    idx = list(g.node).index(gather)
    kept = [n for n in g.node if n is not gather and n is not deq]
    del g.node[:]
    g.node.extend(kept[:idx] + new_nodes + kept[idx:])

    # 5) 안 쓰는 초기값 지우기(UINT8 표, 옛 scale/영점). 다른 노드가 아직 쓰는 것은 남긴다.
    used = {i for n in g.node for i in n.input}
    for sub in (a.g for n in g.node for a in n.attribute if a.type == onnx.AttributeProto.GRAPH):
        used |= {i for n in sub.node for i in n.input}
    drop = [n for n in [emb_name] + old_extra if n not in used]
    if emb_name not in drop:
        fail("임베딩 UINT8 표를 다른 노드도 쓰고 있어요. 지우면 안 돼요.")
    keep_init = [t for t in g.initializer if t.name not in drop]
    del g.initializer[:]
    g.initializer.extend(keep_init)

    onnx.save(model, dst)  # 외부 데이터 없이 한 파일
    before, after = os.path.getsize(src), os.path.getsize(dst)
    print(f"[완료] 임베딩 표 {vocab}x{hidden} 를 lm_head 표와 공유: {before / 1e6:.0f}MB -> {after / 1e6:.0f}MB")
    print(f"       lm_head scale={numpy_helper.to_array(b_scale)}, 지운 초기값={drop}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    if os.path.abspath(sys.argv[1]) == os.path.abspath(sys.argv[2]):
        fail("입력과 출력 경로가 같아요. 다른 경로를 쓰세요.")
    dedupe(sys.argv[1], sys.argv[2])
