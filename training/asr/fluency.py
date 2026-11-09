"""낭독 어절 맞춤 채점(파이썬판).

앱에 들어가는 TS 구현(src/core/fluency/align.ts)과 같은 알고리즘이다.
두 구현은 tests/fixtures/fluency-align.json 을 함께 통과해야 하므로, 한쪽을 고치면 다른 쪽도 고친다.
"""
from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field

KEEP_CATEGORIES = ("L", "N", "M")


def split_eojeols(text: str) -> list[str]:
    """문장부호를 지운 어절 목록(문장부호만 있던 덩어리는 빠진다). 숫자는 그대로."""
    out: list[str] = []
    for tok in unicodedata.normalize("NFC", text).split():
        t = "".join(ch for ch in tok if unicodedata.category(ch)[0] in KEEP_CATEGORIES)
        if t:
            out.append(t)
    return out


def normalize_eojeol(text: str) -> str:
    return " ".join(split_eojeols(text))


def levenshtein(a, b) -> int:
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i]
        for j in range(1, len(b) + 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (0 if a[i - 1] == b[j - 1] else 1)))
        prev = cur
    return prev[len(b)]


def char_error_rate(ref: str, hyp: str) -> float:
    return levenshtein(list(ref), list(hyp)) / max(len(ref), 1)


@dataclass
class Alignment:
    # (원문 어절, 인식 어절 또는 None, "match"|"sub"|"del")
    items: list[tuple[str, str | None, str]] = field(default_factory=list)
    # (끼워 넣은 자리 = 이 번호의 원문 어절 앞, 인식 어절)
    insertions: list[tuple[int, str]] = field(default_factory=list)


def align_eojeol(reference: str, hypothesis: str, max_cer: float = 0.0) -> Alignment:
    ref = split_eojeols(reference)
    hyp = split_eojeols(hypothesis)

    def same(a: str, b: str) -> bool:
        return a == b or (max_cer > 0 and char_error_rate(a, b) <= max_cer)

    n, m = len(ref), len(hyp)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n, -1, -1):
        for j in range(m, -1, -1):
            if i == n:
                dp[i][j] = m - j
            elif j == m:
                dp[i][j] = n - i
            else:
                dp[i][j] = min(
                    dp[i + 1][j + 1] + (0 if same(ref[i], hyp[j]) else 1),
                    dp[i + 1][j] + 1,
                    dp[i][j + 1] + 1,
                )
    result = Alignment()
    i = j = 0
    while i < n or j < m:
        if i < n and j < m and same(ref[i], hyp[j]) and dp[i][j] == dp[i + 1][j + 1]:
            result.items.append((ref[i], hyp[j], "match"))
            i += 1
            j += 1
        elif i < n and j < m and dp[i][j] == dp[i + 1][j + 1] + 1:
            result.items.append((ref[i], hyp[j], "sub"))
            i += 1
            j += 1
        elif i < n and dp[i][j] == dp[i + 1][j] + 1:
            result.items.append((ref[i], None, "del"))
            i += 1
        else:
            result.insertions.append((i, hyp[j]))
            j += 1
    return result


@dataclass
class FluencyScore:
    wcpm: float
    accuracy: float
    errors: list[int]
    total: int
    correct: int


def fluency_score(reference: str, hypothesis: str, seconds: float, max_cer: float = 0.0) -> FluencyScore:
    """대치·삭제만 오류로 센다(CBM 관례). 끼워 넣기·되풀이는 시간으로 반영된다."""
    a = align_eojeol(reference, hypothesis, max_cer)
    errors = [i for i, it in enumerate(a.items) if it[2] != "match"]
    total = len(a.items)
    correct = total - len(errors)
    return FluencyScore(
        wcpm=correct / (seconds / 60) if seconds > 0 else 0.0,
        accuracy=correct / total if total > 0 else 0.0,
        errors=errors,
        total=total,
        correct=correct,
    )
