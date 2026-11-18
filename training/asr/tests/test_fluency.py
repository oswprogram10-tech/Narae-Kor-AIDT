"""TS 구현과 같은 공통 시험 자료(tests/fixtures/fluency-align.json)를 통과하는지 본다."""
import json
import math
from pathlib import Path

import pytest

import fluency

FIXTURE = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "fluency-align.json"
CASES = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]


def test_fixture_size():
    assert len(CASES) >= 25


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_fixture(case):
    max_cer = case.get("maxCer", 0.0)
    a = fluency.align_eojeol(case["reference"], case["hypothesis"], max_cer)
    assert [list(x) for x in a.items] == case["items"]
    assert [list(x) for x in a.insertions] == case["insertions"]
    s = fluency.fluency_score(case["reference"], case["hypothesis"], case["seconds"], max_cer)
    assert s.errors == case["errors"]
    assert math.isclose(s.accuracy, case["accuracy"], abs_tol=1e-9)
    assert math.isclose(s.wcpm, case["wcpm"], abs_tol=1e-9)


def test_normalize():
    assert fluency.normalize_eojeol("  나는,  3개를   샀어요! ") == "나는 3개를 샀어요"
    assert fluency.split_eojeols("… — ,") == []


def test_spacing_option():
    ref = "그는 괜찮은 척하려고 애쓰는 것 같았다"
    hyp = "걔는괜찮은척하려고애쓰는것같았다"
    assert fluency.fluency_score(ref, hyp, 60).errors == [0]
    assert fluency.fluency_score(ref, hyp, 60, spacing="strict").correct == 0
    ops = [x[2] for x in fluency.align_eojeol("할 수 있다", "할수 있다", spacing="strict").items]
    assert ops == ["sub", "del", "match"]
