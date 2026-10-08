// Python 실행 클라이언트 — 워커를 관리하고 Run(대화형) / Submit(채점) / 정적 검사를 제공한다.
//
// GitHub Pages는 응답 헤더를 바꿀 수 없어서, coi-serviceworker가 COOP/COEP를 넣어 준 경우에만
// SharedArrayBuffer를 쓸 수 있다 (crossOriginIsolated).
//   계층 A (격리 성공): input()이 진짜로 블록된다. Stop은 KeyboardInterrupt.
//   계층 B (격리 실패): 입력이 필요할 때마다 처음부터 다시 실행한다(재실행 방식). Stop은 워커 재시작.
// 채점은 입력이 미리 정해져 있으므로 두 계층의 판정이 같다.

const PY_FILES = ['elice_semantics.py', 'bridge.py', 'compat36.py', 'lint_rules.py'];
const enc = new TextEncoder();

export class PyRunner {
  constructor() {
    const isolated = globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';
    // 디버그: 주소에 ?tier=B 를 붙이면 호환 모드를 강제로 시험할 수 있다
    const forced = new URLSearchParams(globalThis.location?.search || '').get('tier');
    this.tier = forced === 'B' || !isolated ? 'B' : 'A';
    this.state = 'idle'; // idle | loading | ready | error
    this.python = null;
    this.error = null;
    this.worker = null;
    this.readyPromise = null;
    this.handlers = new Map();
    this.seq = 0;
    this.current = null; // 진행 중인 Run
    this.subscribers = new Set();
  }

  configure({ pyodideURL, pyBase, assetVersion }) {
    this.cfg = { pyodideURL, pyBase, assetVersion: assetVersion || '' };
  }

  info() {
    return { tier: this.tier, state: this.state, python: this.python, error: this.error };
  }

  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  _set(state, extra = {}) {
    this.state = state;
    Object.assign(this, extra);
    for (const fn of this.subscribers) fn(this.info());
  }

  start() {
    if (this.readyPromise) return this.readyPromise;
    if (!this.cfg) return Promise.reject(new Error('PyRunner가 설정되지 않았습니다'));
    this._set('loading', { error: null });
    const workerURL = new URL('./py-worker.js', import.meta.url);
    workerURL.searchParams.set('v', this.cfg.assetVersion);
    this.worker = new Worker(workerURL, { type: 'module' });
    this.worker.onmessage = (e) => this._onMessage(e.data);
    this.worker.onerror = (e) => this._fail(e.message || '워커 오류');
    let sab = null;
    if (this.tier === 'A') {
      sab = { ctrl: new SharedArrayBuffer(8), data: new SharedArrayBuffer(1 << 16), interrupt: new SharedArrayBuffer(1) };
      this.ctrl = new Int32Array(sab.ctrl);
      this.data = new Uint8Array(sab.data);
      this.interrupt = new Uint8Array(sab.interrupt);
    }
    this.readyPromise = new Promise((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });
    this.readyPromise.catch(() => {});
    this.worker.postMessage({ kind: 'init', ...this.cfg, pyFiles: PY_FILES, sab });
    return this.readyPromise;
  }

  _fail(msg) {
    this._set('error', { error: msg });
    this._rejectReady?.(new Error(msg));
  }

  restart() {
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    const pending = [...this.handlers.values()];
    this.handlers.clear();
    for (const h of pending) h.onAbort?.();
    return this.start();
  }

  _onMessage(m) {
    if (m.kind === 'ready') {
      this._set('ready', { python: m.python });
      this._resolveReady();
      return;
    }
    if (m.kind === 'init-error') {
      this._fail(m.error);
      return;
    }
    this.handlers.get(m.runId)?.onMessage(m);
  }

  _newId() {
    this.seq += 1;
    return String(this.seq);
  }

  // ---------------------------------------------------------------- Run (대화형)
  /** term: { write(text, stream), readLine(): Promise<string|null>, cancelInput() } */
  async run(code, term) {
    await this.start();
    this.stopping = false;
    return this.tier === 'A' ? this._runBlocking(code, term) : this._runReplay(code, term);
  }

  _runBlocking(code, term) {
    return new Promise((resolve) => {
      const runId = this._newId();
      Atomics.store(this.ctrl, 0, 0);
      this.interrupt[0] = 0;
      this.current = { runId, term };
      const finish = (res) => {
        this.handlers.delete(runId);
        if (this.current?.runId === runId) this.current = null;
        resolve(res);
      };
      this.handlers.set(runId, {
        onMessage: async (m) => {
          if (m.kind === 'stdout') term.write(m.text, m.stream);
          else if (m.kind === 'input-request') {
            const line = this.stopping ? null : await term.readLine();
            if (line === null || this.stopping) {
              Atomics.store(this.ctrl, 0, 2);
            } else {
              const bytes = enc.encode(line).slice(0, this.data.length);
              this.data.set(bytes);
              this.ctrl[1] = bytes.length;
              Atomics.store(this.ctrl, 0, 1);
            }
            Atomics.notify(this.ctrl, 0);
          } else if (m.kind === 'done') finish(m);
        },
        onAbort: () => finish({ status: 'interrupted' }),
      });
      this.worker.postMessage({ kind: 'run', runId, code });
    });
  }

  async _runReplay(code, term) {
    const inputs = [];
    const seed = Math.floor(Math.random() * 2 ** 31);
    let shown = ''; // 이미 화면에 보여 준 프로그램 출력(입력 에코 제외)
    for (;;) {
      const runId = this._newId();
      let received = '';
      const res = await new Promise((resolve) => {
        this.current = { runId, term };
        this.handlers.set(runId, {
          onMessage: (m) => {
            if (m.kind === 'stdout') {
              if (m.stream === 'err') return term.write(m.text, 'err');
              const start = received.length;
              received += m.text;
              if (received.length > shown.length) term.write(received.slice(Math.max(start, shown.length)));
            } else if (m.kind === 'done') {
              this.handlers.delete(runId);
              resolve(m);
            }
          },
          onAbort: () => resolve({ status: 'interrupted' }),
        });
        this.worker.postMessage({ kind: 'run', runId, code, inputs, seed });
      });
      this.current = null;
      if (!received.startsWith(shown)) term.write('\r\n(다시 실행되면서 출력이 달라졌습니다)\r\n' + received);
      shown = received;
      if (res.status !== 'need-input' || this.stopping) return res.status === 'need-input' ? { status: 'interrupted' } : res;
      const line = await term.readLine();
      if (line === null || this.stopping) return { status: 'interrupted' };
      inputs.push(line);
    }
  }

  /** 실행 중단 (Stop 버튼, Ctrl+C, 시간 제한) */
  stop() {
    this.stopping = true;
    const cur = this.current;
    cur?.term?.cancelInput?.();
    if (this.tier === 'A' && this.worker) {
      this.interrupt[0] = 2;
      Atomics.store(this.ctrl, 0, 2);
      Atomics.notify(this.ctrl, 0);
      const runId = cur?.runId;
      setTimeout(() => {
        if (runId && this.handlers.has(runId)) this.restart(); // 응답이 없으면 워커를 새로 만든다
      }, 1500);
    } else if (this.worker) {
      this.restart();
    }
  }

  // ---------------------------------------------------------------- Submit (채점)
  async grade(code, tests, { timeoutMs = 3000, onProgress } = {}) {
    await this.start();
    const results = [];
    for (let i = 0; i < tests.length; i += 1) {
      const r = await this._gradeOne(code, tests[i], timeoutMs);
      results.push(r);
      onProgress?.(i, r);
    }
    return results;
  }

  async _gradeOne(code, test, timeoutMs) {
    await this.start();
    return new Promise((resolve) => {
      const runId = this._newId();
      let done = false;
      let timer = null;
      const finish = (r) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.handlers.delete(runId);
        resolve(r);
      };
      this.handlers.set(runId, {
        onMessage: (m) => {
          if (m.kind === 'graded') finish(m.result);
          else if (m.kind === 'done') finish({ verdict: 'ERROR', stdout: '', error: m.traceback, elapsed_ms: 0 });
        },
        onAbort: () => finish({ verdict: 'TIMEOUT', stdout: '', error: null, elapsed_ms: timeoutMs }),
      });
      if (this.tier === 'A') this.interrupt[0] = 0;
      this.worker.postMessage({ kind: 'grade-one', runId, code, stdin: test.stdin, expected: test.expected });
      timer = setTimeout(() => {
        if (this.tier === 'A') {
          this.interrupt[0] = 2; // → TIMEOUT 판정으로 돌아온다
          setTimeout(() => {
            if (!done) this.restart();
          }, 1000);
        } else {
          this.restart(); // onAbort → TIMEOUT
        }
      }, timeoutMs);
    });
  }

  // ---------------------------------------------------------------- 정적 검사
  async check(code) {
    try {
      await this.start();
    } catch {
      return [];
    }
    return new Promise((resolve) => {
      const runId = this._newId();
      this.handlers.set(runId, {
        onMessage: (m) => {
          this.handlers.delete(runId);
          resolve(m.kind === 'checked' ? m.warnings : []);
        },
        onAbort: () => resolve([]),
      });
      this.worker.postMessage({ kind: 'check', runId, code });
    });
  }
}

export const runner = new PyRunner();
