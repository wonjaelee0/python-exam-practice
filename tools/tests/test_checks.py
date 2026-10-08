import pytest

import compat36
import lint_rules


def codes(warnings):
    return {w["code"] for w in warnings}


@pytest.mark.parametrize("src,code", [
    ("x = 1\nprint(f'{x=}')", "fstring-debug"),
    ("x = 1\nprint(f'{x = }')", "fstring-debug"),
    ('d = {"a": 1}\nprint(f"{d["a"]}")', "fstring-nested-quote"),
    ("a = ['x']\nprint(f\"{'\\n'.join(a)}\")", "fstring-backslash"),
    ("if (n := 3) > 2:\n    print(n)", "syntax36"),
    ("def f(a, /):\n    return a", "syntax36"),
    ("s = 'abc'\nprint(s.removeprefix('a'))", "method-new"),
    ("import math\nprint(math.prod([1, 2]))", "func-new"),
    ("from math import comb\nprint(comb(4, 2))", "func-new"),
    ("a = {'x': 1}\nb = a | {'y': 2}", "dict-union"),
    ("print(list(zip([1], [2], strict=True)))", "zip-strict"),
    ("import dataclasses", "module-new"),
    ("def f(a: list[int]):\n    return a", "generic-annotation"),
])
def test_compat36_flags(src, code):
    assert code in codes(compat36.check(src)), compat36.check(src)


@pytest.mark.parametrize("src", [
    "name = 'A'\nprint(f'{name}: {3.14159:.2f}')",
    "d = {'a': 1}\nprint(f\"{d['a']}\")",
    "x = 5\nprint(f'{x:>10}')",
    "print(f'{1 == 1}')",
    "print(f'{dict(a=1)}')",
    "w = 3\nprint(f'{3.14159:{w}.2f}')",
    "s = f'''{\n1 + 2\n}'''",
    "import math\nprint(math.gcd(4, 6))",
    "print({1, 2} | {3})",
])
def test_compat36_clean(src):
    assert compat36.check(src) == []


def test_compat36_ignores_plain_syntax_error():
    assert compat36.check("if True\n  pass") == []


@pytest.mark.parametrize("src,code", [
    ("name = input('이름:')", "rule1-prompt"),
    ("x = 1\nprint(f'합계:{x}')", "rule1-colon"),
    ("a, b = 1, 2\nprint(f'{a},{b}')", "rule2-comma"),
    ("print(1, 2, sep=',')", "rule2-sep"),
    ("x = 1\nprint(x, '.')", "rule4-print-punct"),
    ("print('끝 .')", "rule4-punct"),
    ("x = 3\nprint('합계: ', x)", "print-double-space"),
    ("import random\nprint(random.randint(1, 6))", "rule5-seed"),
    ("n = _____", "blank-left"),
])
def test_lint_rules_flags(src, code):
    assert code in codes(lint_rules.check(src)), lint_rules.check(src)


@pytest.mark.parametrize("src", [
    "name = input('이름: ')\nprint('안녕,', name)",
    "x = 1\nprint(f'합계: {x}')\nprint('합계:', x)",
    "a, b = 1, 2\nprint(f'{a}, {b}')",
    "print('시간 10:30')",
    "print('1,000원')",
    "import random\nrandom.seed(1)\nprint(random.randint(1, 6))",
    "print('Hello, world!')",
    "print(f'{1}.')",
])
def test_lint_rules_clean(src):
    assert lint_rules.check(src) == [], lint_rules.check(src)
