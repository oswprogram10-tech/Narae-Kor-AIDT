"""training/asr 의 도구들이 함께 쓰는 도우미.

지키는 약속
  - 라벨 JSON을 읽자마자 이름·지역·방언 같은 칸(sensitive_keys)은 버려요(json object_hook). 저장도 출력도 하지 않아요.
  - 화자는 파일 이름에서 뽑은 코드를 소금(work/salt.txt)과 함께 해시한 익명 키로만 다뤄요.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import secrets
import sys
import unicodedata
import zipfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator

for _s in (sys.stdout, sys.stderr):  # 윈도우 콘솔·파일 리다이렉트에서도 한글이 깨지지 않게
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

HERE = Path(__file__).resolve().parent
DEFAULT_WORK = HERE / "work"
DEFAULT_FIELDS = HERE / "fields.json"

try:  # 진행 표시줄(없어도 동작)
    from tqdm import tqdm
except Exception:  # noqa: BLE001

    def tqdm(it=None, **_kw):  # type: ignore[no-redef]
        return it


def say(*parts: object) -> None:
    print(*parts, flush=True)


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr, flush=True)
    raise SystemExit(code)


def nkey(s: str) -> str:
    """키 이름 비교용: 공백·밑줄·하이픈을 없애고 소문자로."""
    return re.sub(r"[\s_\-]+", "", str(s)).lower()


# ----------------------------------------------------------------- 설정

def _merge(base: dict, extra: dict) -> dict:
    out = dict(base)
    for k, v in extra.items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def load_config(path: str | os.PathLike | None = None) -> dict:
    cfg = json.loads(DEFAULT_FIELDS.read_text(encoding="utf-8"))
    if path and Path(path).resolve() != DEFAULT_FIELDS:
        cfg = _merge(cfg, json.loads(Path(path).read_text(encoding="utf-8")))
    return cfg


def add_common_args(ap, labels: bool = False, sources: bool = False) -> None:
    ap.add_argument("--work", default=str(DEFAULT_WORK), help="작업 폴더(기본: training/asr/work)")
    ap.add_argument("--fields", default=None, help="칸 이름 설정 파일(기본: fields.json)")
    if labels:
        ap.add_argument("--labels", nargs="+", default=[str(HERE / "data" / "labels")], help="라벨 zip 또는 폴더(여러 개 가능)")
    if sources:
        ap.add_argument("--sources", nargs="+", default=[str(HERE / "data" / "source")], help="원천(wav) zip 또는 폴더(여러 개 가능)")


# ----------------------------------------------------------------- zip

def decode_zip_name(info: zipfile.ZipInfo) -> str:
    """zip 안 파일 이름을 올바른 한글로. 플래그 0x800(utf-8)이 있으면 그대로, 없으면 cp437로 풀린 것을 되돌려 utf-8, cp949 순으로 읽는다."""
    name = info.filename
    if info.flag_bits & 0x800:
        return unicodedata.normalize("NFC", name)
    try:
        raw = name.encode("cp437")
    except UnicodeEncodeError:
        return unicodedata.normalize("NFC", name)
    if all(b < 0x80 for b in raw):
        return name
    for enc in ("utf-8", "cp949"):
        try:
            return unicodedata.normalize("NFC", raw.decode(enc))
        except UnicodeDecodeError:
            continue
    return name


def list_files(paths: Iterable[str | os.PathLike], suffixes: tuple[str, ...]) -> list[Path]:
    """파일이면 그 파일, 폴더면 안의 해당 확장자 파일을 모두(하위 폴더 포함) 이름순으로."""
    out: list[Path] = []
    for p in paths:
        p = Path(p)
        if p.is_dir():
            out.extend(sorted(x for x in p.rglob("*") if x.is_file() and x.name.lower().endswith(suffixes)))
        elif p.is_file():
            out.append(p)
        else:
            say(f"[알림] 없는 경로예요: {p}")
    return out


def unmerged_parts(paths: Iterable[str | os.PathLike]) -> list[Path]:
    found: list[Path] = []
    for p in paths:
        p = Path(p)
        if p.is_dir():
            found.extend(sorted(p.rglob("*.zip.part*")))
    return found


def zip_pair_name(label_zip_name: str, cfg: dict) -> str | None:
    """라벨 zip 이름 → 짝이 되는 원천 zip 이름(TL_→TS_, VL_→VS_ 등). 규칙에 안 맞으면 None."""
    for rule in cfg.get("zip_pairs", []):
        if re.search(rule["label"], label_zip_name):
            return re.sub(rule["label"], rule["source"], label_zip_name, count=1)
    return None


def split_of(container: str, cfg: dict) -> str:
    low = container.lower()
    return "valid" if any(m.lower() in low for m in cfg.get("validation_markers", [])) else "train"


# ----------------------------------------------------------------- JSON·칸 찾기

SENSITIVE_SEEN: Counter = Counter()  # 버린 칸의 '이름'만 센다(값은 보지도 않는다)


def _sensitive_hook(sens: set[str]):
    def hook(d: dict) -> dict:
        for k in [k for k in d if nkey(k) in sens]:
            SENSITIVE_SEEN[str(k)] += 1
            del d[k]
        return d

    return hook


def parse_label_json(data: bytes, cfg: dict) -> Any:
    """바이트를 JSON으로 읽는다. 읽는 즉시 민감한 칸은 버린다."""
    for enc in ("utf-8-sig", "cp949"):
        try:
            text = data.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError("글자 인코딩을 알 수 없어요")
    sens = {nkey(k) for k in cfg.get("sensitive_keys", [])}
    return json.loads(text, object_hook=_sensitive_hook(sens))


def flatten(obj: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    """(경로→값, 마지막 이름→값). 같은 키는 먼저 나온 값. 목록 안은 번호 없이 합친다."""
    by_path: dict[str, Any] = {}
    by_leaf: dict[str, Any] = {}

    def walk(o: Any, path: tuple[str, ...]) -> None:
        if isinstance(o, dict):
            for k, v in o.items():
                walk(v, path + (nkey(k),))
        elif isinstance(o, list):
            for v in o:
                walk(v, path)
        elif path:
            by_path.setdefault(".".join(path), o)
            by_leaf.setdefault(path[-1], o)

    walk(obj, ())
    return by_path, by_leaf


def find_field_ex(flat: tuple[dict[str, Any], dict[str, Any]], paths: list[str]) -> tuple[Any, str | None]:
    """(값, 찾은 방법). 방법은 '경로 그대로'면 그 경로, 마지막 이름으로만 찾았으면 '이름만:<이름>', 못 찾으면 None."""
    by_path, by_leaf = flat
    for p in paths:
        key = ".".join(nkey(s) for s in p.split("."))
        if key in by_path:
            return by_path[key], p
    for p in paths:
        leaf = nkey(p.split(".")[-1])
        if leaf in by_leaf:
            return by_leaf[leaf], "이름만:" + leaf
    return None, None


def find_field(flat: tuple[dict[str, Any], dict[str, Any]], paths: list[str]) -> Any:
    return find_field_ex(flat, paths)[0]


def shape_of(s: str) -> str:
    """파일 이름 모양만 보여 주기 위한 가림: 한글→가, 영대문자→A, 영소문자→a, 숫자→#."""
    out = []
    for ch in s:
        if "가" <= ch <= "힣":
            out.append("가")
        elif ch.isdigit():
            out.append("#")
        elif ch.isalpha() and ch.isascii():
            out.append("A" if ch.isupper() else "a")
        else:
            out.append(ch)
    return "".join(out)


# ----------------------------------------------------------------- 값 해석

def parse_grade(value: Any, cfg: dict) -> str | None:
    if value is None or value == "":
        return None
    s = str(value).strip()
    m = cfg.get("values", {}).get("school_year_map", {})
    if s in m:
        return m[s]
    if re.search(r"유치|미취학|어린이집|영유아", s):
        return "미취학"
    d = re.search(r"(\d+)", s)
    if re.search(r"중", s) and d:
        return f"중{d.group(1)}"
    if re.search(r"고(?!학)", s) and d:
        return f"고{d.group(1)}"
    if d and (("초" in s) or s.isdigit() or re.fullmatch(r"\d+\s*학년", s)):
        return f"초{int(d.group(1))}"
    return s


def parse_age(value: Any) -> int | None:
    if value is None:
        return None
    m = re.search(r"\d+", str(value))
    return int(m.group(0)) if m else None


def classify_category(value: Any, cfg: dict) -> str | None:
    if value is None:
        return None
    s = str(value)
    v = cfg["values"]
    if any(x in s for x in v["informal"]):  # '비정형'이 '정형'을 품고 있으니 먼저 본다
        return "informal"
    if any(x in s for x in v["formal"]):
        return "formal"
    return None


def classify_noise(value: Any, cfg: dict) -> str:
    if value is None:
        return "unknown"
    s = nkey(str(value))
    v = cfg["values"]
    if any(nkey(x) in s for x in v["noise_clean"]):
        return "clean"
    if any(nkey(x) in s for x in v["noise_noisy"]):
        return "noisy"
    return "unknown"


def to_float(value: Any) -> float | None:
    try:
        f = float(str(value).strip())
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def is_elementary(grade: str | None, age: int | None) -> bool:
    if grade is not None:
        return bool(re.fullmatch(r"초[1-6]", grade))
    return age is not None and 7 <= age <= 13


# ----------------------------------------------------------------- 익명 화자 키

_salt: dict[str, bytes] = {}


def get_salt(work: Path) -> bytes:
    key = str(work.resolve())
    if key not in _salt:
        f = work / "salt.txt"
        if not f.exists():
            work.mkdir(parents=True, exist_ok=True)
            f.write_text(secrets.token_hex(16), encoding="utf-8")
        _salt[key] = f.read_text(encoding="utf-8").strip().encode()
    return _salt[key]


def anon_key(raw: str, work: Path) -> str:
    return "s" + hashlib.sha256(get_salt(work) + raw.encode("utf-8")).hexdigest()[:10]


def speaker_code(stem: str, member: str, cfg: dict) -> str | None:
    sp = cfg["speaker"]
    target = member if sp.get("source") == "path" else stem
    m = re.search(sp["regex"], target)
    if not m:
        return None
    return m.group(1) if m.groups() else m.group(0)


# ----------------------------------------------------------------- 라벨 읽기

@dataclass
class Row:
    container: str
    member: str
    split: str
    stem: str
    grade: str | None
    age: int | None
    category: str | None
    noise: str
    seconds: float | None
    speaker: str | None
    sampling_rate: Any = None
    text: str | None = None


def iter_label_files(paths: Iterable[str | os.PathLike]) -> Iterator[tuple[str, str, bytes]]:
    """(컨테이너 이름, 안 파일 이름, 내용). 라벨 zip은 풀지 않고 zipfile로 바로 읽는다."""
    for p in list_files(paths, (".zip", ".json")):
        if p.name.lower().endswith(".zip"):
            try:
                zf = zipfile.ZipFile(p)
            except zipfile.BadZipFile:
                say(f"[알림] zip이 아니거나 깨졌어요: {p.name} (분할 파일이면 merge_parts.py 로 먼저 이어 붙여 주세요)")
                continue
            with zf:
                for info in zf.infolist():
                    if info.is_dir() or not info.filename.lower().endswith(".json"):
                        continue
                    yield p.name, decode_zip_name(info), zf.read(info)
        else:
            yield p.parent.name, p.name, p.read_bytes()


def count_label_files(paths: Iterable[str | os.PathLike]) -> int:
    n = 0
    for p in list_files(paths, (".zip", ".json")):
        if p.name.lower().endswith(".zip"):
            try:
                with zipfile.ZipFile(p) as zf:
                    n += sum(1 for i in zf.infolist() if not i.is_dir() and i.filename.lower().endswith(".json"))
            except zipfile.BadZipFile:
                pass
        else:
            n += 1
    return n


def iter_rows(
    paths: Iterable[str | os.PathLike],
    cfg: dict,
    work: Path,
    want_text: bool = False,
    stats: Counter | None = None,
    show_progress: bool = True,
) -> Iterator[Row]:
    stats = stats if stats is not None else Counter()
    P = cfg["paths"]
    total = count_label_files(paths) if show_progress else None
    bar = tqdm(total=total, desc="라벨 읽는 중", unit="개", mininterval=2.0, disable=not show_progress) if show_progress else None
    try:
        for container, member, data in iter_label_files(paths):
            if bar is not None and hasattr(bar, "update"):
                bar.update(1)
            stats["files"] += 1
            try:
                doc = parse_label_json(data, cfg)
            except Exception:  # noqa: BLE001
                stats["bad_json"] += 1
                continue
            flat = flatten(doc)
            vals = {k: find_field(flat, v) for k, v in P.items()}
            for k, v in vals.items():
                stats[("found" if v is not None else "missing", k)] += 1
            name = vals.get("file_name")
            stem = Path(str(name).replace("\\", "/")).stem if name else Path(member.replace("\\", "/")).stem
            grade = parse_grade(vals.get("school_year"), cfg)
            age = parse_age(vals.get("age"))
            seconds = to_float(vals.get("file_length"))
            if seconds is None:
                a, b = to_float(vals.get("speech_start")), to_float(vals.get("speech_end"))
                if a is not None and b is not None and b > a:
                    seconds = b - a
            if seconds is None:
                stats["no_duration"] += 1
            code = speaker_code(stem, member, cfg)
            if code is None:
                stats["speaker_fail"] += 1
            text = vals.get("transcript") if want_text else None
            yield Row(
                container=container,
                member=member,
                split=split_of(container, cfg),
                stem=stem,
                grade=grade,
                age=age,
                category=classify_category(vals.get("data_category"), cfg),
                noise=classify_noise(vals.get("noise"), cfg),
                seconds=seconds,
                speaker=anon_key(code, work) if code else None,
                sampling_rate=vals.get("sampling_rate"),
                text=str(text) if text is not None else None,
            )
    finally:
        if bar is not None and hasattr(bar, "close"):
            bar.close()


# ----------------------------------------------------------------- 원천 wav 찾기

def wav_stem(name: str) -> str:
    return unicodedata.normalize("NFC", Path(name.replace("\\", "/")).stem).lower()


def build_wav_index(source_paths: Iterable[str | os.PathLike]) -> tuple[list[Path], dict[str, tuple[int, int]], int]:
    """원천 zip들의 wav 목록 → (zip 목록, 이름(확장자 뺀 것)→(zip 번호, 안 번호), 이름이 겹친 개수)."""
    zips = [p for p in list_files(source_paths, (".zip",))]
    index: dict[str, tuple[int, int]] = {}
    dup = 0
    for zi, p in enumerate(zips):
        try:
            with zipfile.ZipFile(p) as zf:
                for ii, info in enumerate(zf.infolist()):
                    if info.is_dir() or not info.filename.lower().endswith(".wav"):
                        continue
                    s = wav_stem(decode_zip_name(info))
                    if s in index:
                        dup += 1
                    else:
                        index[s] = (zi, ii)
        except zipfile.BadZipFile:
            say(f"[알림] 원천 zip이 깨졌어요(분할 파일이면 merge_parts.py 로 이어 붙여 주세요): {p.name}")
    return zips, index, dup


def fmt_hours(sec: float) -> str:
    return f"{sec / 3600:.2f}"


def save_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


# ----------------------------------------------------------------- jsonl·오디오

def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        die(f"{path} 가 없어요. build_subset.py 를 먼저 실행해 주세요.")
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def load_wav_16k(path: Path):
    """16kHz mono float32 배열. build_subset 이 만든 wav 를 읽는다."""
    import soundfile as sf

    x, sr = sf.read(str(path), dtype="float32", always_2d=True)
    x = x.mean(axis=1)
    if sr != 16000:
        from scipy.signal import resample_poly

        g = math.gcd(int(sr), 16000)
        x = resample_poly(x, 16000 // g, int(sr) // g).astype("float32")
    return x
