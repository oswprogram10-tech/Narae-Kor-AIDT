"""전사 정규화와 글자 통계.

AI Hub 전사에는 (철자)/(발음) 이중 전사, b/ n/ o/ l/ u/ 같은 잡음 표시, *, + 같은 기호가 섞여 있어요.
규칙은 fields.json 의 "normalize" 에서 바꿀 수 있어요.

    python normalize.py report-chars --labels data/labels     # 글자 종류와 빈도만 보여 줘요(전사 글은 안 보여 줘요)
    python normalize.py try "(2)/(이) 학년 b/ 입니다"          # 규칙 시험(직접 친 글만)
"""
from __future__ import annotations

import argparse
import re
import unicodedata
from collections import Counter

from asr_common import add_common_args, iter_rows, load_config, say
from pathlib import Path

_DUAL = re.compile(r"\(([^()]*)\)\s*/\s*\(([^()]*)\)")


def is_hangul_syllable(ch: str) -> bool:
    return "가" <= ch <= "힣"


def normalize_transcript(text: str, rules: dict, hits: Counter | None = None) -> str | None:
    """정규화한 전사. 버려야 하는 발화(알아들을 수 없음 표시 등)이면 None."""
    h = hits if hits is not None else Counter()
    t = unicodedata.normalize("NFC", text)

    keep = 1 if rules.get("dual_keep", "first") == "first" else 2

    def dual(m: re.Match) -> str:
        h["이중 전사 (철자)/(발음)"] += 1
        return m.group(keep)

    t = _DUAL.sub(dual, t)

    marks = rules.get("unclear_marks", [])
    if any(m in t for m in marks):
        h["알아들을 수 없음 표시"] += 1
        if rules.get("unclear_policy", "drop") == "drop":
            return None
        for m in marks:
            t = t.replace(m, " ")

    for rx in rules.get("drop_if_regex", []):
        if re.search(rx, t):
            h["제외 규칙에 걸림"] += 1
            return None

    tag = rules.get("noise_tag_regex")
    if tag:
        t, n = re.subn(tag, " ", t)
        if n:
            h["잡음 표시 (b/ n/ …)"] += n

    for ch in rules.get("remove_chars", ""):
        if ch in t:
            h[f"'{ch}' 제거"] += 1
            t = t.replace(ch, " ")
    for ch in rules.get("unwrap_brackets", ""):
        t = t.replace(ch, "")
    if rules.get("strip_punctuation", True):
        t = t.replace("/", " ")  # 남은 빗금은 낱말 사이 구분으로 본다
        t = "".join(c for c in t if c.isspace() or unicodedata.category(c)[0] in ("L", "N", "M"))
    t = " ".join(t.split())
    return t or None


def report_chars(texts, rules: dict | None = None) -> tuple[Counter, Counter, int]:
    """(한글 음절이 아닌 글자 빈도, 규칙에 걸린 횟수, 전사 개수). 전사 글은 저장하지 않는다."""
    chars: Counter = Counter()
    hits: Counter = Counter()
    n = 0
    for text in texts:
        n += 1
        for ch in unicodedata.normalize("NFC", text):
            if not is_hangul_syllable(ch) and not ch.isspace():
                chars[ch] += 1
        if rules is not None:
            normalize_transcript(text, rules, hits)
    return chars, hits, n


def format_char_report(chars: Counter, hits: Counter, n: int, top: int = 200) -> str:
    lines = [f"전사 {n:,}개에서 한글 음절을 뺀 글자 종류 {len(chars)}가지 (많은 순, 최대 {top}개)"]
    for ch, c in chars.most_common(top):
        try:
            nm = unicodedata.name(ch)
        except ValueError:
            nm = "?"
        lines.append(f"  U+{ord(ch):04X}  {ch!r:<8} {c:>10,}   {nm}")
    if hits:
        lines.append("정규화 규칙이 걸린 횟수")
        for k, v in hits.most_common():
            lines.append(f"  {k}: {v:,}")
    return "\n".join(lines)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("report-chars", help="전사에 나온 글자 종류와 빈도만 보여 줘요")
    add_common_args(r, labels=True)
    r.add_argument("--top", type=int, default=200)
    t = sub.add_parser("try", help="규칙 시험")
    t.add_argument("text")
    t.add_argument("--fields", default=None)
    a = ap.parse_args(argv)
    cfg = load_config(a.fields)
    if a.cmd == "try":
        say(repr(normalize_transcript(a.text, cfg["normalize"])))
        return
    work = Path(a.work)
    work.mkdir(parents=True, exist_ok=True)
    texts = (r.text for r in iter_rows(a.labels, cfg, work, want_text=True) if r.text is not None)
    chars, hits, n = report_chars(texts, cfg["normalize"])
    say(format_char_report(chars, hits, n, a.top))


if __name__ == "__main__":
    main()
