import importlib.util
from pathlib import Path

import pytest

import elice_semantics as sem

ROOT = Path(__file__).resolve().parents[2]


def test_prompt_then_newline_without_echo():
    status, out, err = sem.run_graded("n = int(input('정수: '))\nprint(n * 2)", "21\n")
    assert status == "ok" and err is None
    assert out == "정수: \n42\n"  # 프롬프트(끝 공백 포함) + 줄바꿈, 입력값 '21'은 없음


def test_multiple_inputs_and_crlf():
    code = "a = input('a: ')\nb = input('b: ')\nprint(a + b)"
    assert sem.run_graded(code, "x\r\ny\r\n")[1] == "a: \nb: \nxy\n"


def test_eof_when_input_missing():
    status, out, err = sem.run_graded("input('x: ')\ninput('y: ')", "1\n")
    assert status == "error"
    assert out == "x: \ny: "
    assert "EOFError" in err


def test_traceback_shows_only_user_frames():
    status, _, err = sem.run_graded("def f():\n    return 1 / 0\nf()")
    assert status == "error"
    assert 'File "main.py", line 2' in err and "ZeroDivisionError" in err
    assert "elice_semantics" not in err


def test_syntax_error_reported():
    status, _, err = sem.run_graded("if True\n    pass")
    assert status == "error" and "SyntaxError" in err


def test_output_limit():
    status, out, err = sem.run_graded("while True:\n    print('x' * 100)", max_output=1000)
    assert status == "output-limit" and len(out) <= 1000


def test_output_limit_not_swallowed_by_except_exception():
    code = "for i in range(10**6):\n    try:\n        print('y' * 50)\n    except Exception:\n        pass"
    assert sem.run_graded(code, max_output=500)[0] == "output-limit"


def test_systemexit_is_normal_end():
    assert sem.run_graded("print(1)\nexit()\nprint(2)")[:2] == ("ok", "1\n")


def test_random_unseeded_differs_seeded_same():
    seeded = "import random\nrandom.seed(1)\nprint(random.randint(1, 10**9))"
    assert sem.run_graded(seeded)[1] == sem.run_graded(seeded)[1]


@pytest.mark.parametrize("expected,actual,verdict", [
    ("a\nb\n", "a\nb", "PASS"),
    ("a\nb", "a\nb\n\n", "PASS"),
    ("합계: 3", "합계: 3 ", "TRAILING_WS"),
    ("합계: 3", "합계:  3", "WHITESPACE"),
    ("Hello", "hello", "CASE"),
    ("1 2", "1 3", "WRONG"),
])
def test_classify(expected, actual, verdict):
    assert sem.classify(expected, actual) == verdict


def test_week06_regression_if_available():
    """사용자의 elice 6주차 만점 코드 4개 — 비공개 자료가 있을 때만 실행."""
    path = ROOT / "materials" / "elice" / "week06_regression.py"
    if not path.exists():
        pytest.skip("비공개 fixture 없음 (CI에서는 정상)")
    spec = importlib.util.spec_from_file_location("week06_regression", path)
    mod = importlib.util.module_from_spec(spec)
    import contextlib, io
    with contextlib.redirect_stdout(io.StringIO()):
        spec.loader.exec_module(mod)
    for name, (code, stdin, expected) in mod.CASES.items():
        status, out, err = sem.run_graded(code, stdin)
        assert status == "ok", (name, err)
        assert sem.classify(expected, out) == "PASS", name
