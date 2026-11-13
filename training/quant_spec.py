"""가중치 줄이기 설정(층마다 어떤 방식·몇 비트)과 ORT MatMulNBits 저장 모양. numpy 만 쓴다(torch·onnx 필요 없음).
gptq_weight_only.py(GPTQ 계산)와 quantize_weight_only.py(ONNX 만들기)가 같은 설정을 쓰도록 여기서 한 번만 정한다.

층마다 고를 수 있는 방식(비트 값)
  0  동적 int8: 가중치는 출력 채널마다 배율을 둔 int8, 입력(활성값)은 실행 때 8비트로 바꿔 정수 곱(MatMulInteger).
     브라우저 WASM 에서 가장 빠르다. 다만 활성값에 유난히 큰 값이 있는 층(Gemma 의 MLP down_proj 입력)에 쓰면 출력이 무너진다
     (실측: 전부 동적 int8 이면 위험 신호 10/140, down_proj 만 빼면 정상 범위).
  4  GPTQ 4비트 MatMulNBits(블록 32). 활성값은 fp32 그대로라 안전하지만 브라우저 WASM 에서 느리다(가중치를 매번 fp32 로 풂).
  8  GPTQ 8비트(블록 128). 아래 설명처럼 4비트 MatMulNBits 두 개라서 4비트보다 약 2배 느리다. 원본과 거의 같은 출력.

설정 방법(두 스크립트에 같은 옵션). 기본값(약 951MB, 브라우저 WASM 평균 응답 약 37초):
  어텐션·MLP gate/up·출력층(임베딩 공유)은 동적 int8, MLP down_proj 는 GPTQ 4비트이고 처음·마지막 3층만 GPTQ 8비트
  --attn-bits 0|4|8  어텐션 q/k/v/o 의 방식(기본 0)
  --mlp-bits 0|4|8   MLP gate/up 의 방식(기본 0)
  --down-bits 0|4|8  MLP down_proj 의 방식(기본 4)
  --down-edge-layers N --down-edge-bits 8   down_proj 만 처음 N층과 마지막 N층을 down-edge-bits 로(기본 3, 8)
  --edge-layers N --edge-bits 4|8   처음·마지막 N층은 모든 선형층을 edge-bits 로(기본 0 = 쓰지 않음)
  --lm-head-bits 0|4|8  출력층(기본 0). 임베딩은 이 표를 같이 읽는다
  --block 32        4비트 블록 크기,  --block8 128  8비트 블록 크기
  --override model.layers.5.mlp.down_proj=8   층 하나만 따로(여러 번 가능)

8비트를 이렇게 만드는 이유
  ORT 의 MatMulNBits 는 bits=8 을 만들 수는 있지만 fp32 활성값으로는 실행하지 못한다(onnxruntime-node 1.30, onnxruntime-web 1.31 모두
  "Only 2b and 4b quantization is supported" 로 실패). 그래서 8비트 값 q(0~255) 를 윗 4비트·아랫 4비트 두 장으로 나눠 4비트 MatMulNBits 두 개를
  더한다: q = 16*qh + ql,  영점 z = 16*zh + zl 이면  s*(q-z) = (16s)*(qh-zh) + s*(ql-zl)  이라 값이 정확히 같다. 브라우저 WASM 에서도 그대로 돈다.
  (MatMulNBits 의 accuracy_level=4 는 WASM 에서 속도가 거의 그대로였다: 전부 4비트 115초 -> 106초. 그래서 쓰지 않는다.)
"""
import numpy as np

ATTN = ["self_attn.q_proj", "self_attn.k_proj", "self_attn.v_proj", "self_attn.o_proj"]
MLP = ["mlp.gate_proj", "mlp.up_proj", "mlp.down_proj"]
LINEARS = ATTN + MLP


def add_plan_args(p):
    p.add_argument("--attn-bits", type=int, default=0, choices=[0, 4, 8])
    p.add_argument("--mlp-bits", type=int, default=0, choices=[0, 4, 8], help="MLP gate/up")
    p.add_argument("--down-bits", type=int, default=4, choices=[0, 4, 8], help="MLP down_proj")
    p.add_argument("--down-edge-layers", type=int, default=3, help="down_proj 만: 처음·마지막 N층은 down-edge-bits 로")
    p.add_argument("--down-edge-bits", type=int, default=8, choices=[4, 8])
    p.add_argument("--edge-layers", type=int, default=0, help="처음·마지막 N층은 모든 선형층을 edge-bits 로")
    p.add_argument("--edge-bits", type=int, default=8, choices=[4, 8])
    p.add_argument("--lm-head-bits", type=int, default=0, choices=[0, 4, 8], help="출력층(임베딩과 같은 표를 공유)")
    p.add_argument("--block", type=int, default=32, help="4비트 블록 크기")
    p.add_argument("--block8", type=int, default=128, help="8비트 블록 크기(8비트는 배율이 두 벌이라 크게 잡는다)")
    p.add_argument("--override", action="append", default=[], metavar="이름=비트", help="예: model.layers.5.mlp.down_proj=8")


def _group(bits, a):
    return {0: 0, 4: a.block, 8: a.block8}[bits]


def make_plan(a, n_layers):
    """{층 이름: (비트, 블록 크기)}  이름은 model.layers.<i>.self_attn.q_proj ... 와 lm_head. 비트 0 = 동적 int8(블록 없음)"""
    plan = {}
    for i in range(n_layers):
        edge = i < a.edge_layers or i >= n_layers - a.edge_layers
        down_edge = i < a.down_edge_layers or i >= n_layers - a.down_edge_layers
        for lin in LINEARS:
            if edge:
                bits = a.edge_bits
            elif lin == "mlp.down_proj":
                bits = a.down_edge_bits if down_edge else a.down_bits
            else:
                bits = a.attn_bits if lin in ATTN else a.mlp_bits
            plan[f"model.layers.{i}.{lin}"] = (bits, _group(bits, a))
    for item in a.override:
        name, _, b = item.partition("=")
        if name not in plan or b not in ("0", "4", "8"):
            raise SystemExit(f"--override 형식이 틀렸어요: {item}")
        plan[name] = (int(b), _group(int(b), a))
    plan["lm_head"] = (a.lm_head_bits, _group(a.lm_head_bits, a))
    return plan


def tag(bits, group):
    return f"b{bits}g{group}"


def pack_nibbles(q, zp):
    """q: uint8 [출력, 블록 수, 블록] (0~15), zp: uint8 [출력, 블록 수] (0~15) → ORT 4비트 저장 모양(낮은 4비트가 먼저).
    반환: packed [출력, 블록 수, 블록/2], zp [출력, ceil(블록 수/2)]"""
    packed = (q[..., 0::2] | (q[..., 1::2] << 4)).astype(np.uint8)
    z = zp.astype(np.uint8)
    if z.shape[1] % 2:
        z = np.concatenate([z, np.zeros((z.shape[0], 1), np.uint8)], axis=1)
    return packed, (z[:, 0::2] | (z[:, 1::2] << 4)).astype(np.uint8)


def split_8bit(q, scales, zp):
    """8비트 값을 윗·아랫 4비트 두 장으로 나눈다(위 docstring 참고). q [출력, 블록 수, 블록] 0~255, zp [출력, 블록 수] 0~255.
    반환: (hi, lo), 각각 (packed, scales, zp)"""
    hi = pack_nibbles(q >> 4, zp >> 4)
    lo = pack_nibbles(q & 15, zp & 15)
    return (hi[0], (scales * 16.0).astype(np.float32), hi[1]), (lo[0], scales.astype(np.float32), lo[1])
