"""브라우저(Pyodide 워커) 브리지: 대화형 실행(Run), 채점(Submit), 정적 검사,
IDE의 한 줄씩 실행(추적)과 파이썬 셸.

JS(py-worker.js)가 이 모듈의 함수를 호출하고, 결과는 JSON 문자열로 돌려준다.
"""
import builtins
import codeop
import io
import json
import random
import reprlib
import sys
import time
import traceback
import types

import elice_semantics as sem

_LAST_RUN = {"ns": None}  # 마지막 Run의 변수 공간 — IDE 셸이 이어받을 수 있다


class NeedInput(BaseException):
    """계층 B(재실행 방식): 입력 큐가 비어 실행을 멈추는 신호."""


def _absent(value):
    """JS의 undefined(None)와 null(JsNull) 모두 '값 없음'으로 본다."""
    return value is None or type(value).__name__ == "JsNull"


class _StreamWriter(io.TextIOBase):
    """print 출력을 JS로 보낸다. 줄바꿈 단위로 모아서 보내 메시지 수를 줄인다."""

    def __init__(self, emit, stream, limit):
        super().__init__()
        self._emit, self._stream, self._limit = emit, stream, limit
        self._buf, self._pending, self._total = [], 0, 0

    def writable(self):
        return True

    def write(self, s):
        if not isinstance(s, str):
            raise TypeError(f"write() argument must be str, not {type(s).__name__}")
        self._total += len(s)
        if self._total > self._limit:
            self.flush()
            raise sem.OutputLimitExceeded(f"출력이 {self._limit}자를 넘어 실행을 멈췄습니다")
        self._buf.append(s)
        self._pending += len(s)
        if "\n" in s or self._pending >= 2048:
            self.flush()
        return len(s)

    def flush(self):
        if self._buf:
            text = "".join(self._buf)
            self._buf, self._pending = [], 0
            self._emit(self._stream, text)


class _InteractiveStdin(io.TextIOBase):
    """sys.stdin.readline()도 input()과 같은 입력 통로를 쓰게 한다."""

    def __init__(self, reader):
        super().__init__()
        self._reader = reader

    def readable(self):
        return True

    def readline(self, size=-1):
        try:
            return self._reader("") + "\n"
        except EOFError:
            return ""


def run_interactive(code, emit, read_line, inputs_json=None, seed=None, max_output=1_000_000):
    """Run 버튼.

    - 계층 A: read_line()이 입력을 기다리며 블록한다 (None을 돌려주면 사용자가 중단한 것).
    - 계층 B: inputs_json 큐를 다 쓰면 NeedInput으로 멈춘다 → JS가 입력을 받아 처음부터 다시 실행.
    """
    out = _StreamWriter(emit, "out", max_output)
    err = _StreamWriter(emit, "err", 100_000)
    queue = None if _absent(inputs_json) else json.loads(inputs_json)

    def run_input(prompt=""):
        out.write(str(prompt))
        out.flush()
        if queue is not None:
            if queue:
                return queue.pop(0)
            raise NeedInput()
        line = read_line()
        if _absent(line):
            raise KeyboardInterrupt()
        return str(line)

    ns = {"__name__": "__main__", "__builtins__": builtins}
    saved = (builtins.input, sys.stdout, sys.stderr, sys.stdin)
    builtins.input, sys.stdout, sys.stderr = run_input, out, err
    sys.stdin = _InteractiveStdin(run_input)
    if _absent(seed):
        random.seed()
    else:
        random.seed(int(seed))  # 재실행해도 같은 무작위 흐름 (사용자의 random.seed(1)이 있으면 그 값이 우선)
    status, tb = "ok", None
    t0 = time.perf_counter()
    try:
        exec(compile(code, sem.USER_FILENAME, "exec"), ns)
    except SystemExit:
        pass
    except NeedInput:
        status = "need-input"
    except KeyboardInterrupt:
        status = "interrupted"
    except sem.OutputLimitExceeded as e:
        status, tb = "output-limit", str(e)
    except BaseException:
        status, tb = "error", sem.format_user_exc()
    finally:
        try:
            out.flush()
            err.flush()
        finally:
            builtins.input, sys.stdout, sys.stderr, sys.stdin = saved
            _LAST_RUN["ns"] = ns
    elapsed = round((time.perf_counter() - t0) * 1000)
    return json.dumps({"status": status, "traceback": tb, "elapsed_ms": elapsed}, ensure_ascii=False)


def grade_one(code, stdin_text, expected):
    """Submit: 테스트 하나를 elice 채점 방식으로 실행하고 판정한다."""
    t0 = time.perf_counter()
    status, out, error = sem.run_graded(code, stdin_text or "")
    elapsed = round((time.perf_counter() - t0) * 1000)
    if status == "ok":
        verdict = sem.classify(expected or "", out)
    elif status == "interrupted":
        verdict = "TIMEOUT"
    elif status == "output-limit":
        verdict = "OUTPUT_LIMIT"
    else:
        verdict = "ERROR"
    return json.dumps({"verdict": verdict, "stdout": out, "error": error, "elapsed_ms": elapsed},
                      ensure_ascii=False)


def check(code):
    """정적 검사: elice(Python 3.6) 호환성 + 제출 규칙 + 빈칸 남김."""
    import compat36
    import lint_rules

    warnings = compat36.check(code) + lint_rules.check(code)
    return json.dumps(warnings, ensure_ascii=False)


# ---------------------------------------------------------------- IDE: 한 줄씩 실행 (추적)
CO_OPTIMIZED = 0x0001  # 함수 본문 코드 객체에만 붙는 플래그 (모듈·클래스 본문에는 없음)
_PLAIN = (int, float, complex, bool, str, bytes, type(None), tuple, range, frozenset)


class _StepLimit(BaseException):
    """추적 단계가 너무 많아 실행을 멈추는 신호 (사용자의 except Exception에 잡히지 않게 BaseException)."""


def _make_repr():
    r = reprlib.Repr()
    r.maxlevel = 3
    r.maxlist = r.maxtuple = r.maxset = r.maxfrozenset = r.maxdeque = r.maxarray = 12
    r.maxdict = 8
    r.maxstring = 60
    r.maxlong = 40
    r.maxother = 60
    return r


_REPR = _make_repr()


def _snap(value, refs):
    """변수 값 하나를 화면용으로 요약: r(표시 문자열), t(자료형), k(종류), ref(같은 객체 번호)."""
    kind = None
    try:
        if isinstance(value, types.FunctionType):
            code = value.__code__
            text, kind = "함수 %s(%s)" % (value.__name__, ", ".join(code.co_varnames[:code.co_argcount])), "func"
        elif isinstance(value, type):
            text, kind = "클래스 %s" % value.__name__, "class"
        elif type(value).__repr__ is object.__repr__ and hasattr(value, "__dict__"):
            text, kind = "%s 객체 %s" % (type(value).__name__, _REPR.repr(vars(value))), "obj"
        else:
            text = _REPR.repr(value)
    except Exception:
        text = "<값을 표시할 수 없음>"
    item = {"r": text, "t": type(value).__name__}
    if kind:
        item["k"] = kind
    if kind not in ("func", "class") and not isinstance(value, _PLAIN):
        # 바뀔 수 있는 값(리스트·딕셔너리·집합·객체)은 번호를 붙여 '같은 객체'인지 보이게 한다.
        # 객체를 붙잡아 두어 추적하는 동안 id가 다른 객체에 다시 쓰이지 않게 한다.
        key = id(value)
        if key not in refs:
            refs[key] = (len(refs) + 1, value)
        item["ref"] = refs[key][0]
    return item


def _vars_of(mapping, refs):
    out = []
    for name, value in list(mapping.items()):
        if name.startswith("__") and name.endswith("__"):
            continue
        if isinstance(value, types.ModuleType):
            continue
        out.append([name, _snap(value, refs)])
    return out


def _frame_info(frame, refs):
    code = frame.f_code
    if code.co_name == "<module>":
        name, kind, mapping = "전역", "module", frame.f_globals
    elif code.co_flags & CO_OPTIMIZED:
        name, kind, mapping = code.co_name + "()", "func", frame.f_locals
    else:
        name, kind, mapping = "class " + code.co_name, "class", frame.f_locals
    return {"name": name, "kind": kind, "line": frame.f_lineno, "vars": _vars_of(mapping, refs)}


def _stack(frame, refs):
    frames = []
    f = frame
    while f is not None and f.f_code.co_filename == sem.USER_FILENAME:
        frames.append(f)
        f = f.f_back
    return [_frame_info(f, refs) for f in reversed(frames)]


def trace_run(code, stdin_text="", max_steps=1000, seed=None):
    """IDE의 '한 줄씩 실행': 줄마다 변수 상태를 기록한다.

    input()은 터미널처럼 입력값을 화면에 보여 준다(에코). 입력이 모자라면 EOFError.
    반환 JSON: status(ok|error|step-limit|interrupted|output-limit), error, output, steps[]
      step: ev(line|call|return|exception|end|error|limit|stopped), line, out(그때까지의 출력 길이), stack[]
    """
    feed = iter(sem.split_stdin(stdin_text or ""))
    out = sem.CappedStringIO(100000)
    steps, refs, unwinding = [], {}, set()

    def trace_input(prompt=""):
        out.write(str(prompt))
        try:
            line = next(feed)
        except StopIteration:
            raise EOFError("입력이 더 없습니다 (입력 칸에 값을 더 넣어 주세요)")
        out.write(line + "\n")
        return line

    def record(frame, ev, **extra):
        if len(steps) >= max_steps:
            raise _StepLimit()
        step = {"ev": ev, "line": frame.f_lineno, "out": out._size}
        step.update(extra)
        step["stack"] = _stack(frame, refs)
        steps.append(step)

    def tracer(frame, event, arg):
        code_obj = frame.f_code
        if code_obj.co_filename != sem.USER_FILENAME:
            return None
        is_func = bool(code_obj.co_flags & CO_OPTIMIZED) and code_obj.co_name != "<module>"
        if event == "call":
            if is_func:
                record(frame, "call", func=code_obj.co_name)
        elif event == "line":
            unwinding.discard(id(frame))  # 예외가 이 프레임 안에서 처리됐다
            record(frame, "line")
        elif event == "return":
            if id(frame) in unwinding:
                unwinding.discard(id(frame))  # 예외로 빠져나가는 중 (반환값 없음)
            elif is_func:
                record(frame, "return", func=code_obj.co_name, value=_snap(arg, refs))
        elif event == "exception":
            unwinding.add(id(frame))
            exc = arg[1]
            record(frame, "exception", exc="%s: %s" % (type(exc).__name__, exc))
        return tracer

    try:
        compiled = compile(code, sem.USER_FILENAME, "exec")
    except SyntaxError:
        return json.dumps({"status": "error", "error": sem.format_user_exc(), "output": "", "steps": []},
                          ensure_ascii=False)

    ns = {"__name__": "__main__", "__builtins__": builtins}
    saved = (builtins.input, sys.stdout, sys.stdin)
    builtins.input, sys.stdout = trace_input, out
    sys.stdin = io.StringIO(stdin_text or "")
    if seed is None:
        random.seed()
    else:
        random.seed(int(seed))
    status, error = "ok", None
    sys.settrace(tracer)
    try:
        exec(compiled, ns)
    except _StepLimit:
        status = "step-limit"
    except SystemExit:
        pass
    except KeyboardInterrupt:
        status = "interrupted"
    except sem.OutputLimitExceeded as e:
        status, error = "output-limit", str(e)
    except BaseException:
        status, error = "error", sem.format_user_exc()
    finally:
        sys.settrace(None)
        builtins.input, sys.stdout, sys.stdin = saved

    final_ev = {"ok": "end", "error": "error", "step-limit": "limit", "interrupted": "stopped"}.get(status, "error")
    steps.append({"ev": final_ev, "line": None, "out": out._size,
                  "stack": [{"name": "전역", "kind": "module", "line": None, "vars": _vars_of(ns, refs)}]})
    return json.dumps({"status": status, "error": error, "output": out.getvalue(), "steps": steps,
                       "maxSteps": max_steps}, ensure_ascii=False)


# ---------------------------------------------------------------- IDE: 파이썬 셸 (REPL)
_REPL = {"ns": None}
_SHELL_FILES = ("<stdin>", sem.USER_FILENAME)


def _new_ns():
    return {"__name__": "__main__", "__builtins__": builtins}


def repl_reset():
    _REPL["ns"] = _new_ns()
    return "ok"


def repl_adopt_last_run():
    """마지막 Run이 끝난 뒤의 변수 공간으로 셸을 새로 시작한다 (IDLE처럼)."""
    ns = _LAST_RUN["ns"]
    _REPL["ns"] = ns if ns is not None else _new_ns()
    return "ok" if ns is not None else "none"


def repl_check(source):
    """'incomplete'(다음 줄이 더 필요) 또는 'complete'. 문법 오류도 실행해서 보여 주도록 complete."""
    try:
        compiled = codeop.compile_command(source, "<stdin>", "single")
    except (SyntaxError, OverflowError, ValueError):
        return "complete"
    return "incomplete" if compiled is None else "complete"


def _format_shell_exc():
    etype, value, tb = sys.exc_info()
    frames = [f for f in traceback.extract_tb(tb) if f.filename in _SHELL_FILES]
    parts = []
    if frames:
        parts.append("Traceback (most recent call last):\n")
        parts.extend(traceback.format_list(frames))
    parts.extend(traceback.format_exception_only(etype, value))
    return "".join(parts)


def run_repl(source, emit, read_line, can_input=True):
    """셸에 입력한 한 덩어리를 실행한다. 식이면 결과(repr)를 바로 보여 준다."""
    if _REPL["ns"] is None:
        repl_reset()
    ns = _REPL["ns"]
    out = _StreamWriter(emit, "out", 1_000_000)
    err = _StreamWriter(emit, "err", 100_000)

    def repl_input(prompt=""):
        out.write(str(prompt))
        out.flush()
        if not can_input:
            raise RuntimeError("이 브라우저(호환 모드)의 셸에서는 input()을 쓸 수 없습니다. 편집기에서 Run으로 실행하세요.")
        line = read_line()
        if _absent(line):
            raise KeyboardInterrupt()
        return str(line)

    try:
        compiled = compile(source, "<stdin>", "single")
    except SyntaxError:
        first = sys.exc_info()
        try:
            compiled = compile(source, "<stdin>", "exec")  # 여러 문장을 한꺼번에 붙여 넣은 경우
        except SyntaxError:
            text = "".join(traceback.format_exception_only(first[0], first[1]))
            return json.dumps({"status": "error", "traceback": text}, ensure_ascii=False)

    saved = (builtins.input, sys.stdout, sys.stderr, sys.stdin)
    builtins.input, sys.stdout, sys.stderr = repl_input, out, err
    sys.stdin = _InteractiveStdin(repl_input)
    status, tb = "ok", None
    try:
        exec(compiled, ns)
    except SystemExit:
        pass
    except KeyboardInterrupt:
        status = "interrupted"
    except sem.OutputLimitExceeded as e:
        status, tb = "output-limit", str(e)
    except BaseException:
        status, tb = "error", _format_shell_exc()
    finally:
        try:
            out.flush()
            err.flush()
        finally:
            builtins.input, sys.stdout, sys.stderr, sys.stdin = saved
    return json.dumps({"status": status, "traceback": tb}, ensure_ascii=False)
