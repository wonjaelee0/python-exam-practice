"""브라우저(Pyodide 워커) 브리지: 대화형 실행(Run), 채점(Submit), 정적 검사.

JS(py-worker.js)가 이 모듈의 함수를 호출하고, 결과는 JSON 문자열로 돌려준다.
"""
import builtins
import io
import json
import random
import sys
import time

import elice_semantics as sem


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
