// Pyodide 실행 워커 (module worker)
//  - 계층 A: SharedArrayBuffer가 있으면 input()이 Atomics.wait로 진짜 블록되고, Stop은 interrupt buffer로 처리
//  - 계층 B: 없으면 bridge.run_interactive가 입력 큐 소진 시 need-input으로 멈춘다(재실행 방식)

let py = null;
let bridge = null;
let ctrl = null; // Int32Array [state, length]  state: 0 대기, 1 입력 도착, 2 중단
let data = null; // Uint8Array 입력 바이트
let interrupt = null; // Uint8Array(1) — 2를 쓰면 KeyboardInterrupt
const decoder = new TextDecoder();

self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.kind === 'init') return init(m);
  if (!bridge) {
    self.postMessage({ kind: 'done', runId: m.runId, status: 'error', traceback: 'Python이 아직 준비되지 않았습니다.' });
    return;
  }
  try {
    if (m.kind === 'run') {
      if (interrupt) interrupt[0] = 0;
      const emit = (stream, text) => self.postMessage({ kind: 'stdout', runId: m.runId, stream, text });
      // 주의: Pyodide는 JS null을 None이 아닌 JsNull로 넘긴다 → '값 없음'은 undefined(→ None)로 보낸다
      const readLine = ctrl ? () => readLineBlocking(m.runId) : () => undefined;
      const inputs = Array.isArray(m.inputs) ? JSON.stringify(m.inputs) : undefined;
      const seed = Number.isInteger(m.seed) ? m.seed : undefined;
      const res = JSON.parse(bridge.run_interactive(m.code, emit, readLine, inputs, seed));
      self.postMessage({ kind: 'done', runId: m.runId, ...res });
    } else if (m.kind === 'grade-one') {
      if (interrupt) interrupt[0] = 0;
      const result = JSON.parse(bridge.grade_one(m.code, m.stdin ?? '', m.expected ?? ''));
      self.postMessage({ kind: 'graded', runId: m.runId, result });
    } else if (m.kind === 'check') {
      self.postMessage({ kind: 'checked', runId: m.runId, warnings: JSON.parse(bridge.check(m.code)) });
    }
  } catch (e) {
    self.postMessage({ kind: 'done', runId: m.runId, status: 'error', traceback: String((e && e.message) || e) });
  }
};

function readLineBlocking(runId) {
  Atomics.store(ctrl, 0, 0);
  self.postMessage({ kind: 'input-request', runId });
  Atomics.wait(ctrl, 0, 0);
  if (Atomics.load(ctrl, 0) === 2) return undefined; // 사용자가 중단 (→ Python None)
  const len = ctrl[1];
  return decoder.decode(data.slice(0, len)); // SAB 뷰는 바로 decode할 수 없어 복사
}

async function init(m) {
  try {
    const { loadPyodide } = await import(m.pyodideURL + 'pyodide.mjs');
    py = await loadPyodide({ indexURL: m.pyodideURL, stdout: () => {}, stderr: () => {} });
    if (m.sab) {
      ctrl = new Int32Array(m.sab.ctrl);
      data = new Uint8Array(m.sab.data);
      interrupt = new Uint8Array(m.sab.interrupt);
      py.setInterruptBuffer(interrupt);
    }
    py.FS.mkdirTree('/home/pyodide/.lib');
    for (const name of m.pyFiles) {
      const r = await fetch(m.pyBase + name + '?v=' + encodeURIComponent(m.assetVersion || ''));
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      py.FS.writeFile('/home/pyodide/.lib/' + name, await r.text());
    }
    py.runPython("import sys\nsys.path.insert(0, '/home/pyodide/.lib')");
    bridge = py.pyimport('bridge');
    const version = py.runPython('import sys\nsys.version.split()[0]');
    self.postMessage({ kind: 'ready', python: version });
  } catch (e) {
    self.postMessage({ kind: 'init-error', error: String((e && e.stack) || e) });
  }
}
