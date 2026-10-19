"""IDE 기능(한 줄씩 실행, 파이썬 셸)의 Python 쪽 동작 — 브라우저(Pyodide)와 같은 bridge.py를 CPython으로 확인한다."""
import json

import bridge


def trace(code, stdin="", **kw):
    return json.loads(bridge.trace_run(code, stdin, **kw))


def last_globals(res):
    return dict(res["steps"][-1]["stack"][0]["vars"])


def test_trace_lines_and_shared_objects():
    res = trace("a = [1, 2]\nb = a\nc = a.copy()\nb.append(3)\nprint(a)\n")
    assert res["status"] == "ok"
    assert [s["line"] for s in res["steps"] if s["ev"] == "line"] == [1, 2, 3, 4, 5]
    assert res["steps"][-1]["ev"] == "end"
    g = last_globals(res)
    assert g["a"]["r"] == "[1, 2, 3]"
    assert g["a"]["ref"] == g["b"]["ref"] != g["c"]["ref"]  # b = a 는 같은 객체, copy()는 다른 객체
    assert "ref" not in g.get("x", {})
    assert res["output"] == "[1, 2, 3]\n"


def test_trace_state_is_before_the_line():
    res = trace("x = 1\nx = x + 5\n")
    line2 = [s for s in res["steps"] if s["ev"] == "line" and s["line"] == 2][0]
    assert dict(line2["stack"][0]["vars"])["x"]["r"] == "1"  # 2번 줄을 실행하기 '전' 상태
    assert last_globals(res)["x"]["r"] == "6"


def test_trace_function_call_and_return():
    code = "def fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)\n\nprint(fact(3))\n"
    res = trace(code)
    calls = [s for s in res["steps"] if s["ev"] == "call"]
    rets = [s for s in res["steps"] if s["ev"] == "return"]
    assert [c["func"] for c in calls] == ["fact"] * 3
    assert [r["value"]["r"] for r in rets] == ["1", "2", "6"]
    deepest = max(res["steps"], key=lambda s: len(s["stack"]))
    assert [f["name"] for f in deepest["stack"]] == ["전역", "fact()", "fact()", "fact()"]
    assert res["output"] == "6\n"
    assert last_globals(res)["fact"]["k"] == "func"


def test_trace_input_is_echoed():
    res = trace("x = input('수: ')\nprint(int(x) * 2)\n", "21\n")
    assert res["output"] == "수: 21\n42\n"


def test_trace_missing_input():
    res = trace("x = input('수: ')\n")
    assert res["status"] == "error"
    assert "EOFError" in res["error"]
    assert res["steps"][-1]["ev"] == "error"


def test_trace_error_and_exception_step():
    res = trace("def f(x):\n    return 10 / x\n\nf(0)\n")
    assert res["status"] == "error"
    assert "ZeroDivisionError" in res["error"]
    exc = [s for s in res["steps"] if s["ev"] == "exception"]
    assert exc and exc[0]["line"] == 2
    assert not [s for s in res["steps"] if s["ev"] == "return"]  # 예외로 빠져나간 것은 '반환'이 아니다


def test_trace_handled_exception_then_return():
    code = "def f():\n    try:\n        1 / 0\n    except ZeroDivisionError:\n        return 'ok'\n\nf()\n"
    res = trace(code)
    assert res["status"] == "ok"
    assert [s["value"]["r"] for s in res["steps"] if s["ev"] == "return"] == ["'ok'"]


def test_trace_step_limit():
    res = trace("while True:\n    pass\n", max_steps=50)
    assert res["status"] == "step-limit"
    assert len(res["steps"]) == 51 and res["steps"][-1]["ev"] == "limit"


def test_trace_syntax_error():
    res = trace("print(\n")
    assert res["status"] == "error" and res["steps"] == []
    assert "SyntaxError" in res["error"]


def test_trace_object_and_class():
    code = "class Card:\n    def __init__(self, owner):\n        self.owner = owner\n\nc = Card('민수')\n"
    res = trace(code)
    g = last_globals(res)
    assert g["Card"]["k"] == "class"
    assert g["c"]["k"] == "obj" and g["c"]["r"].startswith("Card 객체") and "민수" in g["c"]["r"]


def test_trace_long_values_are_shortened():
    res = trace("a = list(range(1000))\ns = 'x' * 500\n")
    g = last_globals(res)
    assert len(g["a"]["r"]) < 80 and "..." in g["a"]["r"]
    assert len(g["s"]["r"]) < 80


class Collect:
    def __init__(self):
        self.text = ""

    def __call__(self, stream, text):
        self.text += text


def repl(source, read_line=lambda: None, can_input=True):
    out = Collect()
    res = json.loads(bridge.run_repl(source, out, read_line, can_input))
    return res, out.text


def test_repl_expression_and_state():
    bridge.repl_reset()
    assert repl("1 + 2")[1] == "3\n"
    assert repl("x = 5")[1] == ""
    assert repl("x * 2")[1] == "10\n"
    assert repl("'a' * 3")[1] == "'aaa'\n"
    assert repl("print('hi')")[1] == "hi\n"


def test_repl_blocks_and_errors():
    bridge.repl_reset()
    assert bridge.repl_check("for i in range(3):") == "incomplete"
    assert bridge.repl_check("for i in range(3):\n    print(i)") == "incomplete"
    assert bridge.repl_check("for i in range(3):\n    print(i)\n") == "complete"
    assert bridge.repl_check("print(") == "incomplete"
    assert bridge.repl_check("1 +* 2") == "complete"  # 문법 오류는 실행해서 오류를 보여 준다
    assert repl("for i in range(3):\n    print(i)\n")[1] == "0\n1\n2\n"
    res, _ = repl("1 / 0")
    assert res["status"] == "error" and "ZeroDivisionError" in res["traceback"]
    res, _ = repl("1 +* 2")
    assert res["status"] == "error" and "SyntaxError" in res["traceback"]
    res, text = repl("a = 1\nb = 2\nprint(a + b)")  # 여러 문장을 붙여 넣은 경우
    assert res["status"] == "ok" and text == "3\n"


def test_repl_input():
    bridge.repl_reset()
    res, text = repl("name = input('이름: ')\nprint(name + '님')", read_line=lambda: "민수")
    assert res["status"] == "ok" and text == "이름: 민수님\n"
    res, _ = repl("input()", can_input=False)
    assert res["status"] == "error" and "호환 모드" in res["traceback"]


def test_repl_adopts_last_run():
    out = Collect()
    json.loads(bridge.run_interactive("y = 7\ndef double(n):\n    return n * 2\n", out, lambda: None))
    assert bridge.repl_adopt_last_run() == "ok"
    assert repl("double(y)")[1] == "14\n"
