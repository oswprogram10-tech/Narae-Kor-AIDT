"""환경 점검: 파이썬·패키지·CPU/RAM·(있다면) GPU와 작은 행렬곱 속도.

    python check_env.py

CUDA(NVIDIA GPU)가 없어도 실패가 아니에요. CPU 로 평가·속도 확인을 하면 돼요.
"""
from __future__ import annotations

import importlib
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

import cpuinfo

HERE = Path(__file__).resolve().parent

REINSTALL = """\
  → (GPU 컴퓨터에서) GTX 1060(Pascal, sm_61)을 지원하는 CUDA 12.6 빌드의 PyTorch로 다시 설치해 주세요.
      pip uninstall -y torch
      pip install torch --index-url https://download.pytorch.org/whl/cu126
    (너무 최신인 CUDA 빌드는 Pascal 지원을 뺀 것이 있어서 'no kernel image' 오류가 나요.)
    CPU 로만 평가할 거라면 이 문제는 무시하고 evaluate.py 에 --device cpu 를 주세요."""

REQUIRED = ("soundfile", "scipy", "numpy", "tqdm")
OPTIONAL = (("transformers", "Whisper(torch)·Moonshine 평가에 필요"), ("peft", "학습(LoRA)할 때만 필요"))


def pkg(name: str) -> str:
    try:
        m = importlib.import_module(name)
        return getattr(m, "__version__", "설치됨")
    except Exception as e:  # noqa: BLE001
        return f"없음 ({type(e).__name__})"


def flag(v: bool | None) -> str:
    return "알 수 없음" if v is None else ("예" if v else "아니요")


def matmul_gflops_numpy(n: int = 1024, reps: int = 5) -> float:
    import numpy as np

    a = np.random.rand(n, n).astype(np.float32)
    a @ a  # 예열
    best = float("inf")
    for _ in range(reps):
        t0 = time.perf_counter()
        a @ a
        best = min(best, time.perf_counter() - t0)
    return 2 * n**3 / best / 1e9


def matmul_gflops_torch(torch, n: int = 1024, reps: int = 5) -> float:
    a = torch.randn(n, n, dtype=torch.float32)
    a @ a
    best = float("inf")
    for _ in range(reps):
        t0 = time.perf_counter()
        a @ a
        best = min(best, time.perf_counter() - t0)
    return 2 * n**3 / best / 1e9


def check_gpu(torch) -> None:
    n = torch.cuda.device_count()
    for i in range(n):
        p = torch.cuda.get_device_properties(i)
        cc = (p.major, p.minor)
        print(f"GPU {i}: {p.name}, 메모리 {p.total_memory / 2**30:.1f}GiB, compute capability {cc[0]}.{cc[1]} (sm_{cc[0]}{cc[1]})")
        arch = torch.cuda.get_arch_list()
        if f"sm_{cc[0]}{cc[1]}" not in arch and not any(a.startswith("compute_") for a in arch):
            print(f"  [주의] 이 torch 빌드의 지원 목록({', '.join(arch)})에 sm_{cc[0]}{cc[1]} 이 없어요.")
            print(REINSTALL)
    try:
        a = torch.randn(1024, 1024, device="cuda", dtype=torch.float32)
        b = (a @ a).sum().item()
        torch.cuda.synchronize()
        print(f"GPU fp32 행렬곱 시험: 통과 (합 {b:.1f})")
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        print(f"[주의] GPU fp32 행렬곱 시험 실패 — {msg.splitlines()[0] if msg else type(e).__name__}")
        print("  → GPU 는 쓰지 말고 evaluate.py 에 --device cpu 를 주면 CPU 로 평가해요.")


def main() -> int:
    ok = True
    print(f"파이썬: {sys.version.split()[0]} ({platform.system()} {platform.release()})")
    if sys.version_info[:2] < (3, 10):
        print("  [주의] 파이썬 3.10 이상(권장 3.11)이 필요해요.")
        ok = False

    print("\n[CPU·메모리]")
    logical = cpuinfo.logical_threads()
    phys, exact = cpuinfo.physical_cores()
    print(f"CPU: {cpuinfo.cpu_name()}")
    print(f"  물리 코어 {phys}개{'' if exact else '(논리 스레드/2 로 어림)'}, 논리 스레드 {logical}개")
    print(f"  AVX2: {flag(cpuinfo.has_avx2())}, AVX-512: {flag(cpuinfo.has_avx512())}")
    print(f"  평가 기본 스레드 수(--threads 기본값): {cpuinfo.default_threads()}")
    ram = cpuinfo.ram_gb()
    if ram:
        print(f"RAM: 전체 {ram[0]:.1f}GB, 지금 여유 {ram[1]:.1f}GB" + ("  [주의] 여유가 4GB 미만이면 큰 모델(medium·turbo)이 느려지거나 멈출 수 있어요" if ram[1] < 4 else ""))
    else:
        print("RAM: 알 수 없어요.")
    free = shutil.disk_usage(HERE).free / 1e9
    print(f"작업 폴더 디스크 빈 공간: {free:.0f}GB" + ("  [주의] 20GB 미만이면 평가 묶음·모델 저장이 빠듯할 수 있어요" if free < 20 else ""))

    print("\n[패키지]")
    for name in REQUIRED:
        v = pkg(name)
        print(f"  {name}: {v}")
        if v.startswith("없음"):
            ok = False
            print("    → pip install -r requirements.txt")
    for name, why in OPTIONAL:
        v = pkg(name)
        print(f"  {name}: {v}" + (f"  ({why})" if v.startswith("없음") else ""))
    sv = pkg("sherpa_onnx")
    if sv.startswith("없음"):
        print(f"  sherpa-onnx: {sv}")
        print("    [문제] sherpa-onnx 가 없으면 sherpa·sensevoice·sherpa-whisper 평가를 못 해요 → pip install sherpa-onnx")
        ok = False
    else:
        print(f"  sherpa-onnx: {sv}  (CPU 평가에 쓰는 주력 도구예요)")

    print("\n[속도 시험: 1024x1024 fp32 행렬곱]")
    try:
        print(f"  numpy: 약 {matmul_gflops_numpy():.0f} GFLOPS")
    except Exception as e:  # noqa: BLE001
        print(f"  numpy 시험 실패: {e}")

    try:
        import torch
    except Exception as e:  # noqa: BLE001
        print(f"\ntorch: 없음 ({type(e).__name__}) — torch 가 없어도 sherpa 계열 평가는 돼요. Whisper(torch)·Moonshine 은 건너뛰어요.")
        print("  → CPU 빌드 설치: pip install torch --index-url https://download.pytorch.org/whl/cpu")
        torch = None
    if torch is not None:
        print(f"\ntorch: {torch.__version__} (CUDA 빌드: {torch.version.cuda})")
        print(f"  torch 스레드 수: {torch.get_num_threads()} (evaluate.py 는 --threads 값으로 바꿔요)")
        try:
            print(f"  torch: 약 {matmul_gflops_torch(torch):.0f} GFLOPS ({torch.get_num_threads()}스레드)")
        except Exception as e:  # noqa: BLE001
            print(f"  torch 시험 실패: {e}")

    print("\n[GPU]")
    try:
        r = subprocess.run(["nvidia-smi", "--query-gpu=name,driver_version", "--format=csv,noheader"], capture_output=True, text=True, timeout=15)
        if r.returncode == 0 and r.stdout.strip():
            print("nvidia-smi:", r.stdout.strip().replace("\n", " / "))
    except Exception:  # noqa: BLE001
        pass
    if torch is not None and torch.cuda.is_available():
        check_gpu(torch)
        print("GPU 가 있어요. 학습은 GPU 컴퓨터에서 하고(fp32), 평가는 --device cpu/cuda 로 고를 수 있어요.")
    else:
        print("CUDA 를 쓸 수 없어요 → CPU로 평가해요. (실행 환경에서의 속도 확인이 목적이면 이대로 충분해요.)")

    print("\n결과:", "준비됐어요." if ok else "위의 [문제]·[주의]를 먼저 해결해 주세요.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
