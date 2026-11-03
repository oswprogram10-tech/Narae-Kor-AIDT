"""학습한(병합한) 모델을 앱이 읽는 형식(transformers.js용 ONNX)으로 바꾼다.

결과 폴더 구조(public/models/<id>/ 와 같음)
  config.json, generation_config.json, tokenizer*.json, ...
  onnx/model_int8.onnx   ← CPU(WASM) 기기용. 브라우저 엔진이 지원하는 연산만 씀(실측: q4는 GatherBlockQuantized 미지원)

사용: python export_onnx.py --model runs/dpo/merged --out export/narae-gemma-1b
"""
import argparse
import json
import os
import shutil

from onnxruntime.quantization import QuantType, quantize_dynamic


def export(model_dir, out_dir):
    from optimum.exporters.onnx import main_export

    fp32_dir = os.path.join(out_dir, "_fp32")
    main_export(model_dir, output=fp32_dir, task="text-generation-with-past", device="cpu", do_validation=False)
    onnx_dir = os.path.join(out_dir, "onnx")
    os.makedirs(onnx_dir, exist_ok=True)
    # 8비트 동적 양자화(가중치 int8). 임베딩(Gather)도 함께 줄인다.
    quantize_dynamic(
        os.path.join(fp32_dir, "model.onnx"),
        os.path.join(onnx_dir, "model_int8.onnx"),
        weight_type=QuantType.QInt8,
        per_channel=False,
        extra_options={"EnableSubgraph": True},
    )
    # 토크나이저·설정 파일 복사
    for f in os.listdir(fp32_dir):
        if f.endswith(".json") or f.endswith(".jinja") or f == "tokenizer.model":
            shutil.copy(os.path.join(fp32_dir, f), out_dir)
    for f in ["chat_template.jinja", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "generation_config.json"]:
        src = os.path.join(model_dir, f)
        if os.path.exists(src) and not os.path.exists(os.path.join(out_dir, f)):
            shutil.copy(src, out_dir)
    # transformers.js 설정: int8 파일은 별도 데이터 파일(.onnx_data)이 없다.
    cfg_path = os.path.join(out_dir, "config.json")
    cfg = json.load(open(cfg_path, encoding="utf-8"))
    cfg["transformers.js_config"] = {"use_external_data_format": {"model_int8.onnx": False}}
    json.dump(cfg, open(cfg_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    shutil.rmtree(fp32_dir)
    size = os.path.getsize(os.path.join(onnx_dir, "model_int8.onnx")) / 1e6
    print(f"완료: {out_dir}  (onnx/model_int8.onnx {size:.0f}MB)")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    export(a.model, a.out)
