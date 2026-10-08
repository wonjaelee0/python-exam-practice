# -*- coding: utf-8 -*-
"""elice testroom 채점 의미론.

이 파일은 빌드 도구(GitHub Actions의 python:3.6 컨테이너)와 브라우저(Pyodide)가 함께 쓴다.
그래서 Python 3.6 문법만 사용한다 (walrus, dataclasses, f-string '=' 금지).

관찰 근거 (2026-10-08, elice 6주차 실습):
  - 채점 시 input(p)는 p를 출력한 뒤 줄을 바꾼다. 입력값은 출력되지 않는다.
  - Run 터미널에서는 입력값이 에코된다 (대화형 실행은 bridge.py 담당).
  - 비교는 공백까지 엄격하다 (제출 규칙 1~4).
"""
import builtins
import io
import random
import sys
import traceback

MAX_OUTPUT_CHARS = 200000
USER_FILENAME = 'main.py'


class OutputLimitExceeded(BaseException):
    """출력이 너무 많을 때 (무한 출력 방지). 사용자 코드의 except Exception에 잡히지 않도록 BaseException."""


class CappedStringIO(io.StringIO):
    def __init__(self, limit=MAX_OUTPUT_CHARS):
        io.StringIO.__init__(self)
        self._limit = limit
        self._size = 0

    def write(self, s):
        self._size += len(s)
        if self._size > self._limit:
            raise OutputLimitExceeded('출력이 %d자를 넘어 실행을 멈췄습니다' % self._limit)
        return io.StringIO.write(self, s)


def split_stdin(stdin_text):
    """표준입력 문자열을 줄 목록으로 바꾼다 (CRLF 허용, 마지막 빈 줄 제거)."""
    if not stdin_text:
        return []
    lines = stdin_text.replace('\r\n', '\n').split('\n')
    if lines and lines[-1] == '':
        lines.pop()
    return lines


def format_user_exc(exc_info=None):
    """사용자 코드(main.py) 프레임만 남긴 traceback 문자열."""
    etype, value, tb = exc_info or sys.exc_info()
    frames = [f for f in traceback.extract_tb(tb) if f.filename == USER_FILENAME]
    parts = []
    if frames:
        parts.append('Traceback (most recent call last):\n')
        parts.extend(traceback.format_list(frames))
    parts.extend(traceback.format_exception_only(etype, value))
    return ''.join(parts)


def run_graded(code, stdin_text='', passthrough=(), max_output=MAX_OUTPUT_CHARS):
    """elice 채점 방식으로 code를 실행한다.

    input(p): p를 출력 → 입력 한 줄 소비(에코 없음) → '\\n' 출력. 입력이 없으면 EOFError.

    반환: (status, stdout, error)
      status: 'ok' | 'error' | 'interrupted' | 'output-limit'
    passthrough: 잡지 않고 다시 던질 예외 타입 (빌드 도구의 시간 초과 신호 등)
    """
    feed = iter(split_stdin(stdin_text))
    out = CappedStringIO(max_output)

    def elice_input(prompt=''):
        out.write(str(prompt))
        try:
            line = next(feed)
        except StopIteration:
            raise EOFError('EOF when reading a line')
        out.write('\n')
        return line

    namespace = {'__name__': '__main__', '__builtins__': builtins}
    saved = (builtins.input, sys.stdout, sys.stdin)
    builtins.input = elice_input
    sys.stdout = out
    sys.stdin = io.StringIO(stdin_text or '')
    random.seed()  # 새 프로세스처럼: 시드를 고정하지 않은 무작위는 매번 달라진다
    status, error = 'ok', None
    try:
        exec(compile(code, USER_FILENAME, 'exec'), namespace)
    except passthrough:
        raise
    except SystemExit:
        pass
    except KeyboardInterrupt:
        status = 'interrupted'
    except OutputLimitExceeded as e:
        status, error = 'output-limit', str(e)
    except BaseException:
        status, error = 'error', format_user_exc()
    finally:
        builtins.input, sys.stdout, sys.stdin = saved
    return status, out.getvalue(), error


def normalize(text):
    """끝의 줄바꿈만 무시한다. 나머지(줄 끝 공백 포함)는 그대로 비교한다."""
    return text.replace('\r\n', '\n').rstrip('\n')


def classify(expected, actual):
    """기대 출력과 실제 출력을 비교해 판정 코드를 돌려준다. PASS만 정답이다.

    TRAILING_WS / WHITESPACE / CASE는 오답이지만, 연습 모드에서 원인을 알려 주기 위해 구분한다.
    """
    e, a = normalize(expected), normalize(actual)
    if e == a:
        return 'PASS'
    if [l.rstrip() for l in e.split('\n')] == [l.rstrip() for l in a.split('\n')]:
        return 'TRAILING_WS'
    if e.split() == a.split():
        return 'WHITESPACE'
    if e.lower() == a.lower():
        return 'CASE'
    return 'WRONG'
