"""학습한(병합한) 모델을 앱이 읽는 형식(transformers.js용 ONNX)으로 바꾼다.

결과 폴더 구조(public/models/<id>/ 와 같음)
  config.json, generation_config.json, tokenizer*.json, ...
  onnx/model_int8.onnx   ← CPU(WASM) 기기용. 브라우저 엔진이 지원하는 연산만 씀(실측: q4는 GatherBlockQuantized 미지원)

사용(변환 전용 가상환경의 파이썬으로 실행):
  bash export_env.sh /tmp/onnxenv
  /tmp/onnxenv/bin/python export_onnx.py --model runs/dpo/merged --out export/narae-gemma-1b

왜 따로 준비하나
  - 학습은 transformers 5.x 로 하고, optimum-onnx 0.1.0 은 transformers 4.57 이하만 지원한다 → 환경을 분리한다.
  - 병합 모델은 transformers 5.x 가 저장했다. 4.57 이 새 설정 항목(rope_parameters 등)을 잘못 읽을 수 있어서,
    가중치(*.safetensors)만 가져오고 config·토크나이저는 기본 모델(--base)의 것을 쓴다
    (학습은 구조와 토크나이저를 바꾸지 않았으므로 기본 모델의 것이 맞다).
  - 가중치가 하나라도 안 맞으면(임의 값으로 채워지면) 조용히 넘어가지 않고 멈춘다.
"""
import argparse
import json
import os
import shutil
import sys

# 기본 모델에서 가져올 파일. (이름, 꼭 필요한가)
BASE_FILES = [
    ("config.json", True),
    ("generation_config.json", False),
    ("tokenizer.json", True),
    ("tokenizer_config.json", True),
    ("special_tokens_map.json", False),
    ("tokenizer.model", False),
    ("added_tokens.json", False),
    ("chat_template.jinja", False),
]


def fail(msg):
    print("\n[변환 중단] " + msg, file=sys.stderr)
    sys.exit(1)


def build_staging(model_dir, base, stage_dir):
    """가중치는 병합 모델에서, 설정·토크나이저는 기본 모델에서 모아 임시 폴더를 만든다."""
    from huggingface_hub import hf_hub_download

    if os.path.isdir(stage_dir):
        shutil.rmtree(stage_dir)
    os.makedirs(stage_dir)
    weights = [f for f in os.listdir(model_dir) if f.endswith(".safetensors") or f == "model.safetensors.index.json"]
    if not any(f.endswith(".safetensors") for f in weights):
        fail(f"{model_dir} 안에 *.safetensors 가중치가 없어요.")
    for f in weights:
        src, dst = os.path.join(model_dir, f), os.path.join(stage_dir, f)
        try:
            os.symlink(os.path.abspath(src), dst)  # 복사하지 않고 연결(시간·디스크 절약)
        except OSError:
            shutil.copy(src, dst)
    for name, required in BASE_FILES:
        try:
            path = hf_hub_download(base, name)
        except Exception as e:  # 파일이 없는 경우(선택 파일) 등
            if required:
                fail(f"기본 모델({base})에서 필수 파일 {name} 을 받지 못했어요: {type(e).__name__} {e}")
            continue
        shutil.copy(path, os.path.join(stage_dir, name))
    # 가중치는 bf16 으로 저장돼 있다. 오래된 필드 이름(torch_dtype)으로 맞춰 둔다(변환 자체는 fp32 로 읽는다).
    cfg_path = os.path.join(stage_dir, "config.json")
    cfg = json.load(open(cfg_path, encoding="utf-8"))
    cfg.pop("dtype", None)
    cfg["torch_dtype"] = "bfloat16"
    json.dump(cfg, open(cfg_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)


def check_weights(stage_dir):
    """가중치가 모두 제대로 읽히는지 확인하고, 비교용 정답(torch 다음 토큰)을 만든다. 모델은 바로 비운다."""
    import gc

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    model, info = AutoModelForCausalLM.from_pretrained(stage_dir, torch_dtype=torch.float32, output_loading_info=True)
    missing = list(info.get("missing_keys", []))
    unexpected = list(info.get("unexpected_keys", []))
    mismatched = list(info.get("mismatched_keys", []))
    if getattr(model.config, "tie_word_embeddings", False):
        # 임베딩과 묶인 출력층은 파일에 없어도 정상이다.
        missing = [k for k in missing if k != "lm_head.weight"]
    if missing or unexpected or mismatched:
        fail(
            "병합 모델의 가중치가 기본 구조와 맞지 않아요. 이대로 변환하면 일부 가중치가 임의 값이 돼요.\n"
            f"  빠진 항목({len(missing)}): {missing[:8]}\n  남는 항목({len(unexpected)}): {unexpected[:8]}\n"
            f"  모양이 다른 항목({len(mismatched)}): {mismatched[:8]}\n이 메시지를 Claude에게 알려 주세요."
        )
    print("[확인] 가중치가 모두 맞게 읽혔어요.")

    tok = AutoTokenizer.from_pretrained(stage_dir)
    msgs = [{"role": "user", "content": "받침이 있는 낱말을 넣어 짧은 문장을 지어 보고 싶어요."}]
    try:
        ids = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt", return_dict=True)["input_ids"]
    except Exception:
        ids = tok("받침이 있는 낱말을 넣어 짧은 문장을 지어 보고 싶어요.", return_tensors="pt")["input_ids"]
    with torch.no_grad():
        logits = model(input_ids=ids).logits[0, -1].float()
    top2 = torch.topk(logits, 2)
    ref = {
        "ids": ids.numpy().astype("int64"),
        "token": int(top2.indices[0]),
        "gap": float(top2.values[0] - top2.values[1]),
        "logits": logits.numpy(),
    }
    del model, logits
    gc.collect()
    return ref


def onnx_next_logits(model_path, input_ids):
    """빈 과거(past) 값으로 ONNX를 한 번 돌려 마지막 위치의 로짓을 돌려준다."""
    import numpy as np
    import onnxruntime as ort

    so = ort.SessionOptions()
    so.log_severity_level = 3
    sess = ort.InferenceSession(model_path, so, providers=["CPUExecutionProvider"])
    dtypes = {"tensor(float)": np.float32, "tensor(float16)": np.float16, "tensor(int64)": np.int64, "tensor(int32)": np.int32}
    seq = input_ids.shape[1]
    feed = {}
    for inp in sess.get_inputs():
        n = inp.name
        if n == "input_ids":
            feed[n] = input_ids
        elif n == "attention_mask":
            feed[n] = np.ones((1, seq), dtype=np.int64)
        elif n == "position_ids":
            feed[n] = np.arange(seq, dtype=np.int64)[None, :]
        elif n.startswith("past_key_values"):
            # 모양 예: [batch_size, 헤드 수, past_sequence_length, 헤드 크기] → 배치 1, 과거 길이 0
            shape = [(1 if "batch" in d else 0) if isinstance(d, str) else d for d in inp.shape]
            feed[n] = np.zeros(shape, dtype=dtypes[inp.type])
        else:
            raise RuntimeError(f"알 수 없는 입력: {n} {inp.shape}")
    out = sess.run(["logits"], feed)[0]
    del sess
    return out[0, -1].astype("float32")


def verify_fp32(model_path, ref):
    import numpy as np

    try:
        logits = onnx_next_logits(model_path, ref["ids"])
    except Exception as e:
        # 확인 코드 자체가 그래프 입력 모양을 못 맞춘 경우(예: 예상 못 한 입력 이름). 변환 실패로 보지는 않는다.
        # 가중치 일치는 check_weights 가 이미 확인했다. 브라우저 시험에서 다시 확인한다.
        print("[주의] fp32 ONNX 실행 확인을 하지 못했어요(변환은 계속):", type(e).__name__, e)
        return None
    tok = int(np.argmax(logits))
    diff = float(np.max(np.abs(logits - ref["logits"])))
    print(f"[확인] fp32 ONNX 다음 토큰={tok}, torch 다음 토큰={ref['token']}, 로짓 최대 차이={diff:.4f}, 1·2위 간격={ref['gap']:.3f}")
    if tok != ref["token"] and ref["gap"] > 0.05:
        fail("fp32 ONNX 의 출력이 원래 모델과 달라요(변환이 잘못됐을 수 있어요). 이 메시지를 Claude에게 알려 주세요.")
    return tok


def export(model_dir, out_dir, base):
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from optimum.exporters.onnx import main_export

    os.makedirs(out_dir, exist_ok=True)
    stage_dir = os.path.join(out_dir, "_stage")
    fp32_dir = os.path.join(out_dir, "_fp32")
    shutil.rmtree(fp32_dir, ignore_errors=True)  # 이전에 중단된 흔적 정리
    build_staging(model_dir, base, stage_dir)
    ref = check_weights(stage_dir)

    # fp32 로 내보낸다(용량이 2GB를 넘으면 model.onnx_data 가 함께 생긴다).
    main_export(stage_dir, output=fp32_dir, task="text-generation-with-past", device="cpu", dtype="fp32", do_validation=False)
    verify_fp32(os.path.join(fp32_dir, "model.onnx"), ref)

    onnx_dir = os.path.join(out_dir, "onnx")
    os.makedirs(onnx_dir, exist_ok=True)
    int8_path = os.path.join(onnx_dir, "model_int8.onnx")
    # 8비트 동적 양자화(가중치 int8). 임베딩(Gather)도 함께 줄인다.
    # 입력의 외부 데이터(.onnx_data)는 자동으로 읽고, 결과는 외부 데이터 없이 한 파일로 쓴다(use_external_data_format=False, 2GB 미만).
    quantize_dynamic(
        os.path.join(fp32_dir, "model.onnx"),
        int8_path,
        weight_type=QuantType.QInt8,
        per_channel=False,
        use_external_data_format=False,
        extra_options={"EnableSubgraph": True},
    )
    # Gemma 는 임베딩과 출력층이 묶여 있는데 양자화 결과에는 같은 표가 두 벌(약 302MB씩) 들어 있다. 하나로 줄인다(1305MB -> 약 1003MB).
    # 기대한 모양이 아니면 줄이지 않고 큰 파일 그대로 둔다.
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from dedupe_tied_embedding import dedupe

        slim_path = int8_path + ".slim"
        dedupe(int8_path, slim_path)
        os.replace(slim_path, int8_path)
    except SystemExit:
        print("[주의] 중복 표를 줄이지 못했어요(위 메시지 참고). 큰 파일 그대로 계속해요.")
        if os.path.exists(int8_path + ".slim"):
            os.remove(int8_path + ".slim")
    size = os.path.getsize(int8_path)
    if size >= 2 * 1024**3 or os.path.exists(int8_path + "_data") or os.path.exists(int8_path + ".data"):
        fail("int8 파일이 2GB를 넘거나 외부 데이터가 생겼어요. 앱은 한 파일만 읽어요.")
    # int8 은 fp32 와 조금 다를 수 있어서 같은 토큰인지 알려만 준다(실패로 보지 않는다).
    try:
        import numpy as np

        l8 = onnx_next_logits(int8_path, ref["ids"])
        print(f"[참고] int8 다음 토큰={int(np.argmax(l8))} (torch={ref['token']}; 다를 수 있어요)")
    except Exception as e:
        print("[참고] int8 실행 확인은 건너뛰었어요:", type(e).__name__, e)

    # 설정·토크나이저 복사: 변환기가 쓴 설정(json) 위에 기본 모델의 토크나이저 파일을 덮어쓴다.
    for f in os.listdir(fp32_dir):
        if f.endswith(".json") or f.endswith(".jinja") or f == "tokenizer.model":
            shutil.copy(os.path.join(fp32_dir, f), out_dir)
    for name, _ in BASE_FILES:
        src = os.path.join(stage_dir, name)
        if name != "config.json" and os.path.exists(src):
            shutil.copy(src, out_dir)
    # transformers.js 설정: int8 파일은 별도 데이터 파일(.onnx_data)이 없다.
    cfg_path = os.path.join(out_dir, "config.json")
    cfg = json.load(open(cfg_path, encoding="utf-8"))
    cfg["transformers.js_config"] = {"use_external_data_format": {"model_int8.onnx": False}}
    json.dump(cfg, open(cfg_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    shutil.rmtree(fp32_dir)
    shutil.rmtree(stage_dir)
    print(f"완료: {out_dir}  (onnx/model_int8.onnx {size / 1e6:.0f}MB)")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True, help="병합한 모델 폴더(예: runs/dpo/merged)")
    p.add_argument("--out", required=True)
    p.add_argument("--base", default="unsloth/gemma-3-1b-it", help="설정·토크나이저를 가져올 기본 모델")
    a = p.parse_args()
    export(a.model, a.out, a.base)
