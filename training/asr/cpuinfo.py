"""CPU·메모리 정보를 표준 라이브러리만으로 어림해서 알려 주는 도우미(윈도우·리눅스·맥).

check_env.py 와 evaluate.py 가 써요. 알 수 없는 값은 None 을 돌려줘요.
"""
from __future__ import annotations

import os
import platform
import sys


def _read(path: str) -> str:
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def logical_threads() -> int:
    return os.cpu_count() or 1


def default_threads() -> int:
    """물리 코어 수 어림(논리 스레드 ÷ 2, 최소 1). 6코어 12스레드면 6."""
    return max(1, logical_threads() // 2)


def cpu_name() -> str:
    if sys.platform == "win32":
        try:
            import winreg

            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0") as k:
                return str(winreg.QueryValueEx(k, "ProcessorNameString")[0]).strip()
        except Exception:  # noqa: BLE001
            pass
    elif sys.platform.startswith("linux"):
        for line in _read("/proc/cpuinfo").splitlines():
            if line.lower().startswith("model name"):
                return line.split(":", 1)[1].strip()
    return platform.processor() or platform.machine() or "알 수 없음"


def physical_cores() -> tuple[int, bool]:
    """(물리 코어 수, 정확한 값인지). 리눅스는 /proc/cpuinfo 로 세고, 아니면 논리 스레드/2 로 어림해요."""
    if sys.platform.startswith("linux"):
        pairs = set()
        phys = None
        for line in _read("/proc/cpuinfo").splitlines():
            if line.startswith("physical id"):
                phys = line.split(":", 1)[1].strip()
            elif line.startswith("core id"):
                pairs.add((phys, line.split(":", 1)[1].strip()))
        if pairs:
            return len(pairs), True
    return default_threads(), False


def has_avx2() -> bool | None:
    if sys.platform.startswith("linux"):
        for line in _read("/proc/cpuinfo").splitlines():
            if line.startswith("flags"):
                return " avx2" in line
        return None
    if sys.platform == "win32":
        try:
            import ctypes

            return bool(ctypes.windll.kernel32.IsProcessorFeaturePresent(40))  # PF_AVX2_INSTRUCTIONS_AVAILABLE
        except Exception:  # noqa: BLE001
            return None
    return None


def has_avx512() -> bool | None:
    if sys.platform.startswith("linux"):
        for line in _read("/proc/cpuinfo").splitlines():
            if line.startswith("flags"):
                return " avx512f" in line
        return None
    if sys.platform == "win32":
        try:
            import ctypes

            return bool(ctypes.windll.kernel32.IsProcessorFeaturePresent(41))  # PF_AVX512F_INSTRUCTIONS_AVAILABLE
        except Exception:  # noqa: BLE001
            return None
    return None


def ram_gb() -> tuple[float, float] | None:
    """(전체 GB, 여유 GB) 또는 None."""
    if sys.platform == "win32":
        try:
            import ctypes

            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            st = MEMORYSTATUSEX()
            st.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st)):
                return st.ullTotalPhys / 2**30, st.ullAvailPhys / 2**30
        except Exception:  # noqa: BLE001
            pass
        return None
    info: dict[str, float] = {}
    for line in _read("/proc/meminfo").splitlines():
        parts = line.replace(":", " ").split()
        if len(parts) >= 2 and parts[1].isdigit():
            info[parts[0]] = int(parts[1]) * 1024 / 2**30
    if "MemTotal" in info:
        return info["MemTotal"], info.get("MemAvailable", info.get("MemFree", 0.0))
    return None


def peak_rss_mb() -> float | None:
    """이 프로세스가 지금까지 쓴 메모리(상주 집합) 최대치(MB). 알 수 없으면 None."""
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes

            class PMC(ctypes.Structure):
                _fields_ = [
                    ("cb", wintypes.DWORD),
                    ("PageFaultCount", wintypes.DWORD),
                    ("PeakWorkingSetSize", ctypes.c_size_t),
                    ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t),
                    ("PeakPagefileUsage", ctypes.c_size_t),
                ]

            k32 = ctypes.windll.kernel32
            k32.GetCurrentProcess.restype = wintypes.HANDLE
            psapi = ctypes.windll.psapi
            psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(PMC), wintypes.DWORD]
            pmc = PMC()
            pmc.cb = ctypes.sizeof(PMC)
            if psapi.GetProcessMemoryInfo(k32.GetCurrentProcess(), ctypes.byref(pmc), pmc.cb):
                return pmc.PeakWorkingSetSize / 2**20
        except Exception:  # noqa: BLE001
            pass
        return None
    try:
        import resource

        v = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return v / 2**20 if sys.platform == "darwin" else v / 1024
    except Exception:  # noqa: BLE001
        return None
