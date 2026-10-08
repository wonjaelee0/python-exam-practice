# -*- coding: utf-8 -*-
"""정답 코드를 elice 채점 방식으로 일괄 실행한다 (Python 3.6 호환 — python:3.6 컨테이너에서 실행).

입력(stdin):  {"jobs": [{"key": str, "code": str, "stdin": str, "timeout": float}]}
출력(stdout): {"python": str, "results": [{"key", "status", "stdout", "error", "elapsed_ms"}]}
"""
import io
import json
import os
import signal
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.environ.get('ELICE_PY') or os.path.join(HERE, '..', 'site', 'py'))

import elice_semantics as sem  # noqa: E402


class _Timeout(BaseException):
    pass


def _on_alarm(signum, frame):
    raise _Timeout()


def main():
    raw = sys.stdin.buffer.read().decode('utf-8')
    req = json.loads(raw)
    real_stdout = sys.stdout
    signal.signal(signal.SIGALRM, _on_alarm)
    results = []
    for job in req['jobs']:
        t0 = time.time()
        signal.setitimer(signal.ITIMER_REAL, float(job.get('timeout', 5.0)))
        try:
            status, out, err = sem.run_graded(job['code'], job.get('stdin', ''), passthrough=(_Timeout,))
        except _Timeout:
            status, out, err = 'timeout', '', '시간 초과'
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
        results.append({'key': job['key'], 'status': status, 'stdout': out, 'error': err,
                        'elapsed_ms': int((time.time() - t0) * 1000)})
    payload = json.dumps({'python': sys.version.split()[0], 'results': results}, ensure_ascii=False)
    out = io.TextIOWrapper(real_stdout.buffer, encoding='utf-8') if hasattr(real_stdout, 'buffer') else real_stdout
    out.write(payload)
    out.flush()


if __name__ == '__main__':
    main()
