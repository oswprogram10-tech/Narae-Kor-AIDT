"""학습 준비 점검: 파이썬·torch·CUDA·GPU와 작은 행렬곱 시험.

    python check_env.py
"""
from __future__ import annotations

import importlib
import platform
import shutil
import subprocess
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

HERE = Path(__file__).resolve().parent

REINSTALL = """\
  → GTX 1060(Pascal, sm_61)을 지원하는 CUDA 12.6 빌드의 PyTorch로 다시 설치해 주세요.
      pip uninstall -y torch
      pip install torch --index-url https://download.pytorch.org/whl/cu126
    (너무 최신인 CUDA 빌드는 Pascal 지원을 뺀 것이 있어서 'no kernel image' 오류가 나요.)
    그래도 안 되면 NVIDIA 드라이버를 최신으로 갱신해 주세요."""


def pkg(name: str) -> str:
    try:
        m = importlib.import_module(name)
        return getattr(m, "__version__", "설치됨")
    except Exception as e:  # noqa: BLE001
        return f"없음 ({type(e).__name__})"


def main() -> int:
    ok = True
    print(f"파이썬: {sys.version.split()[0]} ({platform.system()} {platform.release()})")
    if sys.version_info[:2] < (3, 10):
        print("  [주의] 파이썬 3.10 이상(권장 3.11)이 필요해요.")
        ok = False
    for name in ("transformers", "peft", "soundfile", "scipy", "numpy", "tqdm"):
        v = pkg(name)
        print(f"  {name}: {v}")
        if v.startswith("없음"):
            ok = False
            print(f"    → pip install -r requirements.txt")

    free = shutil.disk_usage(HERE).free / 1e9
    print(f"작업 폴더 디스크 빈 공간: {free:.0f}GB" + ("  [주의] 100GB 미만이면 특징 파일 저장이 빠듯할 수 있어요" if free < 100 else ""))

    try:
        r = subprocess.run(["nvidia-smi", "--query-gpu=name,driver_version", "--format=csv,noheader"], capture_output=True, text=True, timeout=15)
        if r.returncode == 0 and r.stdout.strip():
            print("nvidia-smi:", r.stdout.strip().replace("\n", " / "))
    except Exception:  # noqa: BLE001
        print("nvidia-smi를 찾지 못했어요(NVIDIA 드라이버가 없거나 PATH에 없어요).")

    try:
        import torch
    except Exception as e:  # noqa: BLE001
        print(f"torch를 불러오지 못했어요: {e}")
        print("  → README의 PyTorch 설치 단계를 먼저 해 주세요.")
        return 1
    print(f"torch: {torch.__version__} (CUDA 빌드: {torch.version.cuda})")
    if not torch.cuda.is_available():
        print("[주의] CUDA를 쓸 수 없어요. CPU로는 학습이 너무 느려요.")
        print("  → 'CPU 전용' torch가 깔렸다면 위 CUDA 12.6 빌드로 다시 설치해 주세요. NVIDIA 드라이버도 확인해 주세요.")
        return 1
    n = torch.cuda.device_count()
    for i in range(n):
        p = torch.cuda.get_device_properties(i)
        cc = (p.major, p.minor)
        print(f"GPU {i}: {p.name}, 메모리 {p.total_memory / 2**30:.1f}GiB, compute capability {cc[0]}.{cc[1]} (sm_{cc[0]}{cc[1]})")
        arch = torch.cuda.get_arch_list()
        if f"sm_{cc[0]}{cc[1]}" not in arch and not any(a.startswith("compute_") for a in arch):
            print(f"  [문제] 이 torch 빌드의 지원 목록({', '.join(arch)})에 sm_{cc[0]}{cc[1]} 이 없어요.")
            print(REINSTALL)
            ok = False
    try:
        a = torch.randn(1024, 1024, device="cuda", dtype=torch.float32)
        b = (a @ a).sum().item()
        torch.cuda.synchronize()
        print(f"fp32 행렬곱 시험: 통과 (합 {b:.1f})")
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        print(f"fp32 행렬곱 시험: 실패 — {msg.splitlines()[0] if msg else type(e).__name__}")
        if "no kernel image" in msg or "sm_" in msg or "not compatible" in msg:
            print(REINSTALL)
        else:
            print("  → NVIDIA 드라이버를 갱신하고 컴퓨터를 다시 켠 뒤 다시 해 보세요.")
        ok = False
    print("fp16/bf16: GTX 1060은 가속이 없어서 이 도구는 fp32로만 학습해요.")
    print("\n결과:", "준비됐어요." if ok else "위의 [문제]·[주의]를 먼저 해결해 주세요.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
