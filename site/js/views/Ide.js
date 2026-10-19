// 자유 연습 IDE (#/ide)
//  상단바 | 파일·예제·코드 조각 | 에디터 + 실행 바 + 아래 패널(터미널 · 테스트 · 한 줄씩 실행 · 파이썬 셸 · 검사)
//  파일은 이 브라우저(localStorage)에만 저장한다.
import { html, useEffect, useRef, useState } from '../lib/ui.js';
import { ideStore, newFileId, uniqueFileName } from '../lib/storage.js';
import { runner } from '../runtime/client.js';
import { loadMonaco, createEditor, setMarkers } from '../components/editor.js';
import { TermView } from '../components/terminal.js';
import { EngineBadge, toggleFullscreen } from '../components/Layout.js';
import { OutputDiff } from '../components/OutputDiff.js';
import { VERDICT, showSpaces } from '../lib/diff.js';
import { WELCOME, EXAMPLES, SNIPPETS } from '../lib/ide-content.js';
import { Splitter, clamp } from '../components/Splitter.js';

const MAX_STEPS = 1000;
const splitLines = (s) => (s || '').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
const cloneFile = (f) => ({
  name: f.name,
  code: f.code,
  tests: (f.tests || []).map((t) => ({ stdin: t.stdin || '', expected: t.expected || '' })),
  traceInput: f.traceInput || '',
});

function b64urlEncode(text) {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return new TextDecoder().decode(Uint8Array.from(atob(t), (c) => c.charCodeAt(0)));
}

function loadFiles() {
  let files = ideStore.files();
  if (!Array.isArray(files) || !files.length) {
    files = [{ id: newFileId(), ...cloneFile(WELCOME) }];
    ideStore.saveFiles(files);
  }
  return files.map((f) => ({ tests: [], traceInput: '', ...f }));
}

const RUN_LABEL = {
  ok: ['ok', '✓ 실행 완료'],
  error: ['bad', '✗ 오류로 끝남'],
  interrupted: ['bad', '■ 중단됨'],
  'output-limit': ['bad', '✗ 출력이 너무 많음'],
};

export function Ide({ manifest, query }) {
  const filesRef = useRef(null);
  if (!filesRef.current) filesRef.current = loadFiles();
  const [activeId, setActiveIdState] = useState(() => {
    const saved = ideStore.active();
    return filesRef.current.some((f) => f.id === saved) ? saved : filesRef.current[0].id;
  });
  const activeIdRef = useRef(activeId);
  const [, setTick] = useState(0);
  const rerender = () => setTick((n) => n + 1);

  const [prefs, setPrefsState] = useState(() => ideStore.prefs());
  const [engine, setEngine] = useState(runner.info());
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [lastRun, setLastRun] = useState(null);
  const [tab, setTab] = useState('terminal');
  const [warnings, setWarnings] = useState([]);
  const [grading, setGrading] = useState(null);
  const [results, setResults] = useState({});
  const [trace, setTrace] = useState(null);
  const [tracing, setTracing] = useState(false);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState(null);
  const [editorError, setEditorError] = useState(null);

  const editorEl = useRef(null);
  const termEl = useRef(null);
  const shellEl = useRef(null);
  const fileInput = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const termRef = useRef(null);
  const shellRef = useRef(null);
  const decoRef = useRef(null);
  const models = useRef(new Map());
  const viewStates = useRef(new Map());
  const runningRef = useRef(false);
  const tracingRef = useRef(false);
  const gradingRef = useRef(false);
  const traceRef = useRef(null);
  const ranInIde = useRef(false);
  const shell = useRef({ started: false, busy: false, buffer: [] });
  const timers = useRef({});
  const disposed = useRef(false);
  const actions = useRef({});
  const paneRef = useRef(null);
  const dragH = useRef(null);
  traceRef.current = trace;

  const files = filesRef.current;
  const active = files.find((f) => f.id === activeId) || files[0];
  const activeFile = () => filesRef.current.find((f) => f.id === activeIdRef.current) || filesRef.current[0];
  const persist = () => ideStore.saveFiles(filesRef.current);
  const setPrefs = (patch) => setPrefsState(ideStore.setPrefs(patch));
  const showToast = (text) => {
    setToast(text);
    clearTimeout(timers.current.toast);
    timers.current.toast = setTimeout(() => setToast(null), 2600);
  };

  const modelFor = (file) => {
    let m = models.current.get(file.id);
    if (!m || m.isDisposed()) {
      m = monacoRef.current.editor.createModel(file.code, 'python');
      models.current.set(file.id, m);
    }
    return m;
  };
  const codeOf = (file) => {
    const m = models.current.get(file.id);
    return m && !m.isDisposed() ? m.getValue() : file.code;
  };
  const currentCode = () => codeOf(activeFile());
  const saveNow = () => {
    clearTimeout(timers.current.save);
    const f = filesRef.current.find((x) => x.id === activeIdRef.current);
    if (f) f.code = codeOf(f);
    persist();
  };

  const applyWarnings = (ws) => {
    setWarnings(ws);
    if (monacoRef.current && editorRef.current) setMarkers(monacoRef.current, editorRef.current, ws);
  };
  const scheduleCheck = (delay = 800) => {
    clearTimeout(timers.current.check);
    timers.current.check = setTimeout(async () => {
      const id = activeIdRef.current;
      const ws = await runner.check(currentCode());
      if (!disposed.current && id === activeIdRef.current) applyWarnings(ws);
    }, delay);
  };

  const exitTrace = () => {
    decoRef.current?.clear();
    editorRef.current?.updateOptions({ readOnly: false });
    setTrace(null);
  };

  const switchFile = (id) => {
    const editor = editorRef.current;
    const cur = filesRef.current.find((f) => f.id === activeIdRef.current);
    if (cur && cur.id === id) return;
    exitTrace();
    if (cur) {
      clearTimeout(timers.current.save);
      cur.code = codeOf(cur);
      if (editor) viewStates.current.set(cur.id, editor.saveViewState());
    }
    activeIdRef.current = id;
    ideStore.setActive(id);
    setActiveIdState(id);
    persist();
    const file = filesRef.current.find((f) => f.id === id);
    if (editor && monacoRef.current && file) {
      editor.setModel(modelFor(file));
      const vs = viewStates.current.get(id);
      if (vs) editor.restoreViewState(vs);
      editor.focus();
    }
    setWarnings([]);
    scheduleCheck(200);
  };

  const addNewFile = (base) => {
    const file = { id: newFileId(), tests: [], traceInput: '', ...base };
    file.name = uniqueFileName(filesRef.current, base.name);
    filesRef.current.push(file);
    persist();
    switchFile(file.id);
    return file;
  };

  // ---------------------------------------------------------------- 에디터 · 터미널 · 셸 만들기
  useEffect(() => {
    disposed.current = false;
    const term = new TermView(termEl.current, { fontSize: 14, onInterrupt: () => actions.current.stop() });
    termRef.current = term;
    term.status('/* Ctrl+Enter(⌘+Enter)로 실행합니다. input()은 여기에 입력하세요. */');
    const sh = new TermView(shellEl.current, { fontSize: 14, onInterrupt: () => actions.current.shellInterrupt() });
    shellRef.current = sh;
    loadMonaco()
      .then((monaco) => {
        if (disposed.current) return;
        monacoRef.current = monaco;
        const editor = createEditor(monaco, editorEl.current, {
          value: '',
          fontSize: prefs.fontSize,
          onChange: (code) => {
            const f = filesRef.current.find((x) => x.id === activeIdRef.current);
            if (!f) return;
            f.code = code;
            clearTimeout(timers.current.save);
            timers.current.save = setTimeout(persist, 500);
            scheduleCheck();
          },
          onRun: () => actions.current.run(),
          onSubmit: () => actions.current.grade(),
        });
        const blank = editor.getModel();
        editor.setModel(modelFor(activeFile()));
        blank?.dispose();
        editor.updateOptions({ renderWhitespace: prefs.whitespace ? 'all' : 'selection', wordWrap: prefs.wrap ? 'on' : 'off' });
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => actions.current.save());
        decoRef.current = editor.createDecorationsCollection();
        editorRef.current = editor;
        editor.focus();
        scheduleCheck(300);
      })
      .catch((e) => setEditorError(String(e.message || e)));
    runner.start().catch(() => {});
    const unsub = runner.subscribe(setEngine);
    return () => {
      disposed.current = true;
      unsub();
      for (const t of Object.values(timers.current)) {
        clearTimeout(t);
        clearInterval(t);
      }
      try {
        saveNow();
      } catch {
        /* 저장 실패는 무시 */
      }
      if (runningRef.current || shell.current.busy) runner.stop();
      sh.cancelInput();
      editorRef.current?.dispose();
      for (const m of models.current.values()) m.dispose();
      term.dispose();
      sh.dispose();
    };
  }, []);

  // 공유 링크(#/ide?share=…)로 들어오면 새 파일로 연다
  useEffect(() => {
    const share = query?.get('share');
    if (!share) return;
    try {
      const data = JSON.parse(b64urlDecode(share));
      const tests = Array.isArray(data.t) ? data.t.map((t) => ({ stdin: String(t.i ?? ''), expected: String(t.o ?? '') })) : [];
      const file = addNewFile({ name: String(data.n || '공유받은_코드.py'), code: String(data.c ?? ''), tests });
      showToast(`공유받은 코드를 '${file.name}'(으)로 열었습니다`);
    } catch {
      showToast('공유 링크를 읽지 못했습니다');
    }
    history.replaceState(null, '', location.pathname + location.search + '#/ide');
  }, []);

  // 단축키: 에디터 밖에서도 Ctrl+Enter / Ctrl+Shift+Enter / Ctrl+S
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.target.closest?.('.monaco-editor')) return; // 에디터 안에서는 Monaco 명령이 처리
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) actions.current.grade();
        else actions.current.run();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        actions.current.save();
      }
    };
    // 한 줄씩 실행 중: ← → Home End Esc (에디터에 커서가 있어도 단계 이동)
    const onTraceKey = (e) => {
      const t = traceRef.current;
      if (!t || !t.steps?.length || e.ctrlKey || e.metaKey || e.altKey) return;
      const inMonaco = !!e.target.closest?.('.monaco-editor');
      const tag = e.target.tagName;
      if (!inMonaco && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return;
      if (e.target.closest?.('.xterm')) return;
      const go = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (go) actions.current.step(go);
      else if (e.key === 'Home') actions.current.go(0);
      else if (e.key === 'End') actions.current.go(Infinity);
      else if (e.key === 'Escape') actions.current.exitTrace();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onTraceKey, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onTraceKey, true);
    };
  }, []);

  // 한 줄씩 실행: 지금 줄(초록)과 방금 실행한 줄(보라)을 에디터에 표시
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const deco = decoRef.current;
    if (!editor || !monaco || !deco) return;
    const steps = trace?.steps;
    if (!steps?.length || trace.fileId !== activeId) {
      deco.clear();
      return;
    }
    const step = steps[trace.index];
    const prev = steps[trace.index - 1];
    const decs = [];
    const add = (line, cls) =>
      decs.push({ range: new monaco.Range(line, 1, line, 1), options: { isWholeLine: true, className: cls, linesDecorationsClassName: cls + '-mark' } });
    if (prev?.line && prev.ev === 'line' && prev.line !== step.line) add(prev.line, 'trace-prev');
    if (step.line) {
      add(step.line, step.ev === 'exception' ? 'trace-error' : step.ev === 'return' ? 'trace-return' : 'trace-next');
      editor.revealLineInCenterIfOutsideViewport(step.line);
    }
    deco.set(decs);
  }, [trace, activeId]);

  // 화면 설정
  useEffect(() => {
    editorRef.current?.updateOptions({
      fontSize: prefs.fontSize,
      renderWhitespace: prefs.whitespace ? 'all' : 'selection',
      wordWrap: prefs.wrap ? 'on' : 'off',
    });
    for (const t of [termRef.current, shellRef.current]) {
      if (!t) continue;
      t.term.options.fontSize = Math.max(11, prefs.fontSize - 1);
      t.refit();
    }
  }, [prefs.fontSize, prefs.whitespace, prefs.wrap]);

  // 탭을 바꾸면 터미널 크기를 다시 맞추고, 셸은 처음 열 때 시작
  useEffect(() => {
    const t = setTimeout(() => {
      if (tab === 'terminal') termRef.current?.refit();
      if (tab === 'shell') {
        shellRef.current?.refit();
        shellRef.current?.focus();
      }
    }, 30);
    if (tab === 'shell' && !shell.current.started && shellRef.current) {
      shell.current.started = true;
      shellLoop();
    }
    return () => clearTimeout(t);
  }, [tab, prefs.bigPanel]);

  // ---------------------------------------------------------------- 파이썬 셸
  const shellPrompt = () => shellRef.current?.write(shell.current.buffer.length ? '... ' : '>>> ');

  const shellLoop = async () => {
    const sh = shellRef.current;
    sh.setAccepting(true);
    sh.status('# Python 셸 — 식이나 문장을 입력하고 Enter를 누르면 바로 실행됩니다.');
    sh.status('# for·def처럼 여러 줄인 코드는 마지막에 빈 줄을 한 번 더 입력하면 실행됩니다.');
    sh.status('# 편집기에서 Run을 하면, 끝난 뒤의 변수를 여기서 그대로 쓸 수 있습니다. (Ctrl+C: 취소·중단)');
    if (ranInIde.current && (await runner.replAdopt()) === 'ok') sh.status(`# 마지막 Run의 변수를 불러왔습니다`);
    for (;;) {
      if (disposed.current) return;
      shellPrompt();
      const line = await sh.readLine();
      if (disposed.current) return;
      if (line === null) {
        sh.write('\nKeyboardInterrupt\n', 'err');
        shell.current.buffer = [];
        continue;
      }
      shell.current.buffer.push(line);
      const src = shell.current.buffer.join('\n');
      if (!src.trim()) {
        shell.current.buffer = [];
        continue;
      }
      if (runningRef.current || tracingRef.current || gradingRef.current) {
        sh.write('편집기에서 실행 중인 작업이 끝난 뒤에 다시 입력하세요.\n', 'err');
        shell.current.buffer = [];
        continue;
      }
      if ((await runner.replCheck(src)) === 'incomplete') continue;
      shell.current.buffer = [];
      shell.current.busy = true;
      let res = null;
      try {
        res = await runner.repl(src, sh);
      } finally {
        shell.current.busy = false;
      }
      if (res?.status === 'error' && res.traceback) sh.write(res.traceback, 'err');
      else if (res?.status === 'output-limit') sh.write('\n' + res.traceback + '\n', 'err');
      else if (res?.status === 'interrupted') {
        sh.write('\nKeyboardInterrupt\n', 'err');
        if (runner.tier === 'B') sh.status('# 호환 모드에서는 중단하면 셸이 초기화됩니다.');
      }
    }
  };

  actions.current.shellInterrupt = () => {
    if (shell.current.busy) runner.stop();
    else shellRef.current?.cancelInput();
  };

  actions.current.resetShell = async () => {
    if (shell.current.busy) runner.stop();
    await runner.replReset();
    shell.current.buffer = [];
    const sh = shellRef.current;
    sh.reset();
    sh.status('# 셸을 초기화했습니다. 변수가 모두 지워졌습니다.');
    shellPrompt();
    sh.focus();
  };

  // ---------------------------------------------------------------- 실행 · 채점 · 한 줄씩 실행
  actions.current.stop = () => {
    if (runningRef.current) runner.stop();
  };

  actions.current.save = () => {
    saveNow();
    showToast('저장했습니다 — 입력할 때마다 이 브라우저에 자동 저장됩니다');
  };

  actions.current.run = async (presetLines) => {
    if (runningRef.current) {
      runner.stop();
      return;
    }
    if (shell.current.busy || tracingRef.current || gradingRef.current) {
      showToast('다른 실행이 끝난 뒤에 Run 하세요');
      return;
    }
    exitTrace();
    const file = activeFile();
    saveNow();
    const code = currentCode();
    const term = termRef.current;
    runningRef.current = true;
    setRunning(true);
    setTab('terminal');
    term.reset();
    term.status(`/* ${file.name} 실행 중… (Stop 또는 Ctrl+C로 중단) */`);
    term.setAccepting(true);
    if (presetLines?.length) term.queueInput(presetLines);
    term.focus();
    let res = null;
    try {
      applyWarnings(await runner.check(code));
      const limit = manifest.config.runLimitSec || 120;
      const deadline = Date.now() + limit * 1000;
      setRemaining(limit);
      timers.current.countdown = setInterval(() => {
        const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setRemaining(left);
        if (left <= 0) {
          clearInterval(timers.current.countdown);
          term.write('\n실행 시간 제한을 넘어 중단합니다.\n', 'err');
          runner.stop();
        }
      }, 250);
      res = await runner.run(code, term);
      if (res.status === 'error' && res.traceback) term.write(res.traceback, 'err');
      else if (res.status === 'output-limit') term.write('\n' + res.traceback + '\n', 'err');
      else if (res.status === 'interrupted') term.write('\n^C 실행을 중단했습니다.\n', 'err');
    } catch (e) {
      term.write('\nPython을 실행할 수 없습니다: ' + e.message + '\n', 'err');
    } finally {
      clearInterval(timers.current.countdown);
      term.setAccepting(false);
      term.write('\n');
      term.status(res?.status === 'ok' ? `/* 실행 완료 · 걸린 시간 ${res.elapsed_ms} ms (입력 기다린 시간 포함) */` : '/* 실행이 끝났습니다 */');
      runningRef.current = false;
      setRunning(false);
      setLastRun(res ? { status: res.status, ms: res.elapsed_ms } : null);
    }
    if (res && res.status !== 'interrupted') {
      ranInIde.current = true;
      if (shell.current.started && !shell.current.busy && (await runner.replAdopt()) === 'ok') {
        const sh = shellRef.current;
        sh.write('\n');
        sh.status(`# ${file.name} 실행이 끝난 뒤의 변수로 셸을 새로 시작했습니다`);
        shellPrompt();
      }
    }
  };

  actions.current.grade = async () => {
    if (gradingRef.current || tracingRef.current || shell.current.busy) return;
    const file = activeFile();
    if (!file.tests.length) {
      setTab('tests');
      showToast('테스트를 먼저 추가하세요 — 입력과 기대 출력을 적으면 됩니다');
      return;
    }
    if (runningRef.current) runner.stop();
    exitTrace();
    saveNow();
    const code = currentCode();
    const tests = file.tests.map((t) => ({ stdin: t.stdin, expected: t.expected }));
    setTab('tests');
    gradingRef.current = true;
    setGrading({ done: 0, total: tests.length });
    try {
      applyWarnings(await runner.check(code));
      const items = await runner.grade(code, tests, {
        timeoutMs: 5000,
        onProgress: (i) => setGrading({ done: i + 1, total: tests.length }),
      });
      setResults((r) => ({ ...r, [file.id]: { items, tests } }));
    } catch (e) {
      setResults((r) => ({ ...r, [file.id]: { error: String(e.message || e) } }));
    } finally {
      gradingRef.current = false;
      setGrading(null);
    }
  };

  actions.current.trace = async (stdinText) => {
    if (runningRef.current) {
      showToast('실행 중인 프로그램을 먼저 멈추세요');
      return;
    }
    if (shell.current.busy || tracingRef.current || gradingRef.current) return;
    const file = activeFile();
    if (typeof stdinText === 'string') file.traceInput = stdinText;
    const input = file.traceInput || '';
    saveNow();
    const code = currentCode();
    exitTrace();
    setTab('trace');
    tracingRef.current = true;
    setTracing(true);
    try {
      const res = await runner.trace(code, input, { maxSteps: MAX_STEPS, timeoutMs: 10000 });
      if (disposed.current) return;
      setTrace({ ...res, fileId: file.id, index: 0, input });
      if (res.steps?.length && activeIdRef.current === file.id) editorRef.current?.updateOptions({ readOnly: true });
    } catch (e) {
      setTrace({ status: 'error', error: String(e.message || e), steps: [], output: '', fileId: file.id, index: 0, input });
    } finally {
      tracingRef.current = false;
      setTracing(false);
    }
  };

  const clampTo = (t, i) => (t && t.steps?.length ? { ...t, index: Math.max(0, Math.min(t.steps.length - 1, i)) } : t);
  actions.current.step = (d) => setTrace((t) => clampTo(t, (t?.index || 0) + d));
  actions.current.go = (i) => setTrace((t) => clampTo(t, i));
  actions.current.exitTrace = exitTrace;

  // ---------------------------------------------------------------- 파일
  const fileActions = {
    open: (id) => switchFile(id),
    create() {
      const n = filesRef.current.length + 1;
      const name = prompt('새 파일 이름', `untitled${n}.py`);
      if (name === null) return;
      addNewFile({ name: name.trim() || `untitled${n}.py`, code: '' });
    },
    rename() {
      const f = activeFile();
      const name = prompt('파일 이름', f.name);
      if (name === null || !name.trim()) return;
      f.name = uniqueFileName(filesRef.current, name, f.id);
      persist();
      rerender();
    },
    duplicate() {
      saveNow();
      const f = activeFile();
      addNewFile({ ...cloneFile(f), name: f.name.replace(/\.py$/i, '') + '_복사본.py' });
      showToast('복제했습니다');
    },
    remove() {
      const f = activeFile();
      if (!confirm(`'${f.name}' 파일을 삭제할까요? 되돌릴 수 없습니다.`)) return;
      const list = filesRef.current;
      const idx = list.findIndex((x) => x.id === f.id);
      list.splice(idx, 1);
      if (!list.length) list.push({ id: newFileId(), name: 'main.py', code: '', tests: [], traceInput: '' });
      activeIdRef.current = null; // 지운 파일을 다시 저장하지 않도록
      switchFile(list[Math.min(idx, list.length - 1)].id);
      const m = models.current.get(f.id);
      models.current.delete(f.id);
      m?.dispose();
      viewStates.current.delete(f.id);
      setResults((r) => {
        const next = { ...r };
        delete next[f.id];
        return next;
      });
      persist();
      showToast(`'${f.name}'을(를) 삭제했습니다`);
    },
    download() {
      saveNow();
      const f = activeFile();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([f.code], { type: 'text/x-python;charset=utf-8' }));
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    upload: () => fileInput.current?.click(),
    async onUpload(e) {
      for (const file of [...(e.target.files || [])]) {
        if (file.size > 500000) {
          showToast(`${file.name}: 파일이 너무 큽니다`);
          continue;
        }
        addNewFile({ name: file.name.replace(/\.txt$/i, '.py'), code: await file.text() });
      }
      e.target.value = '';
    },
    share() {
      saveNow();
      const f = activeFile();
      const payload = { n: f.name, c: f.code };
      if (f.tests.length) payload.t = f.tests.map((t) => ({ i: t.stdin, o: t.expected }));
      const url = location.origin + location.pathname + location.search + '#/ide?share=' + b64urlEncode(JSON.stringify(payload));
      const note = url.length > 8000 ? ' (코드가 길어 일부 메신저에서 잘릴 수 있어요)' : '';
      const fallback = () => prompt('이 링크를 복사하세요', url);
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(() => showToast('공유 링크를 복사했습니다' + note), fallback);
      } else {
        fallback();
      }
    },
    example(ex) {
      addNewFile({ ...cloneFile(ex), name: ex.name });
      showToast(`예제 '${ex.label}'을(를) 새 파일로 열었습니다 — 🔍 한 줄씩 실행해 보세요`);
    },
    snippet(sn) {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;
      if (traceRef.current?.steps?.length) exitTrace();
      const model = editor.getModel();
      const pos = editor.getPosition();
      const line = model.getLineContent(pos.lineNumber);
      const indent = (line.match(/^[ \t]*/) || [''])[0];
      const body = sn.code
        .replace(/\n$/, '')
        .split('\n')
        .map((l, k) => (k === 0 || !l ? l : indent + l))
        .join('\n');
      const end = model.getLineMaxColumn(pos.lineNumber);
      const edit = line.trim()
        ? { range: new monaco.Range(pos.lineNumber, end, pos.lineNumber, end), text: '\n' + indent + body }
        : { range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, end), text: indent + body };
      editor.executeEdits('snippet', [{ ...edit, forceMoveMarkers: true }]);
      editor.pushUndoStop();
      editor.focus();
    },
  };

  // ---------------------------------------------------------------- 테스트 편집
  const editTests = (fn) => {
    const f = activeFile();
    f.tests = fn(f.tests.slice());
    persist();
    rerender();
  };
  const testActions = {
    add() {
      editTests((ts) => [...ts, { stdin: '', expected: '' }]);
      setTab('tests');
    },
    remove(i) {
      editTests((ts) => ts.filter((_, k) => k !== i));
      setResults((r) => ({ ...r, [activeFile().id]: undefined }));
    },
    field: (i, key, value) => editTests((ts) => ts.map((t, k) => (k === i ? { ...t, [key]: value } : t))),
    run: (i) => actions.current.run(active.tests[i].stdin ? splitLines(active.tests[i].stdin) : []),
    trace: (i) => actions.current.trace(active.tests[i].stdin || ''),
  };

  const jumpTo = (line) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
  };

  // 아래 패널 높이 끌어서 조절
  const dragBottom = (x, y) => {
    const pane = paneRef.current.getBoundingClientRect();
    const h = clamp(pane.bottom - y, 110, pane.height - 38 - 52 - 80);
    paneRef.current.style.setProperty('--bottom-h', h + 'px');
    dragH.current = Math.round(h);
  };
  const endBottom = () => {
    if (dragH.current) setPrefs({ bottomH: dragH.current, bigPanel: false });
    dragH.current = null;
  };

  const res = results[active.id];
  const passCount = res?.items ? res.items.filter((r) => r.verdict === 'PASS').length : 0;
  const inTrace = !!(trace?.steps?.length && trace.fileId === active.id);
  const tabs = [
    ['terminal', '터미널'],
    ['tests', `테스트${active.tests.length ? ` (${res?.items ? `${passCount}/${res.items.length}` : active.tests.length})` : ''}`],
    ['trace', '한 줄씩 실행'],
    ['shell', '파이썬 셸'],
    ['check', `검사${warnings.length ? ` ⚠ ${warnings.length}` : ' ✓'}`],
  ];
  const [runTone, runText] = (lastRun && RUN_LABEL[lastRun.status]) || [];

  return html`<div class="ide">
    <header class="solve-top ide-top">
      <button class="icon-btn" title="파일 목록 접기/펴기" onClick=${() => setPrefs({ side: prefs.side === false })}>☰</button>
      <a class="crumb" href="#/">🐍 ${manifest.config.title}</a>
      <span class="sep">/</span>
      <b class="crumb-title">Python IDE</b>
      <span class="spacer"></span>
      <div class="ide-tools">
        <button class="tool" title="글자 작게" onClick=${() => setPrefs({ fontSize: Math.max(11, ideStore.prefs().fontSize - 1) })}>A−</button>
        <span class="tool-val">${prefs.fontSize}</span>
        <button class="tool" title="글자 크게" onClick=${() => setPrefs({ fontSize: Math.min(28, ideStore.prefs().fontSize + 1) })}>A+</button>
        <button class=${'tool' + (prefs.whitespace ? ' on' : '')} title="공백을 ·으로 보이기" onClick=${() => setPrefs({ whitespace: !prefs.whitespace })}>공백 보기</button>
        <button class=${'tool' + (prefs.wrap ? ' on' : '')} title="긴 줄 자동 줄 바꿈" onClick=${() => setPrefs({ wrap: !prefs.wrap })}>줄 바꿈</button>
        <button class="tool" title="전체 화면으로 보기 (Esc로 나가기)" onClick=${toggleFullscreen}>전체 화면</button>
      </div>
      <button class="info-btn" onClick=${() => setHelp(true)}>ⓘ 사용법</button>
      <a class="top-link" href="#/problems">문제 목록</a>
      <a class="top-link" href="#/">홈</a>
    </header>

    <div class=${'ide-body' + (prefs.side === false ? ' no-side' : '')}>
      <${Sidebar} files=${files} activeId=${active.id} act=${fileActions} />

      <section class=${'code-pane ide-pane' + (prefs.bigPanel ? ' big' : '')} ref=${paneRef}
        style=${prefs.bottomH && !prefs.bigPanel ? `--bottom-h: ${prefs.bottomH}px` : ''}>
        <div class="tabs">
          <span class="tab active"><span class="py-dot"></span>${active.name}</span>
          ${inTrace ? html`<span class="trace-pill" title="Esc 또는 ✕ 끝내기로 편집으로 돌아갑니다">한 줄씩 실행 중 · 편집 잠김</span>` : null}
          <span class="spacer"></span>
          <span class="saved-note">자동 저장</span>
        </div>
        <div class="editor-host" ref=${editorEl}>
          ${editorError ? html`<div class="fatal">${editorError}</div>` : null}
        </div>
        <div class="runbar">
          ${running
            ? html`<button class="btn-stop" onClick=${() => actions.current.run()}>Stop</button>`
            : html`<button class="btn-run" onClick=${() => actions.current.run()} disabled=${!!grading || tracing} title="Ctrl/⌘ + Enter">Run</button>`}
          <button class="btn-trace" onClick=${() => actions.current.trace()} disabled=${running || tracing || !!grading} title="줄마다 변수 변화를 기록해 보여 줍니다">
            ${tracing ? '기록 중…' : '🔍 한 줄씩 실행'}
          </button>
          <button class="btn-submit" onClick=${() => actions.current.grade()} disabled=${!!grading || tracing} title="Ctrl/⌘ + Shift + Enter">
            ${grading ? `채점 중 ${grading.done}/${grading.total}` : `✓ 테스트 채점${active.tests.length ? ` (${active.tests.length})` : ''}`}
          </button>
          ${running
            ? html`<span class="remaining">Remaining: ${mmss(remaining)}</span>`
            : runText
              ? html`<span class=${'run-info ' + runTone}>${runText}${lastRun.status === 'ok' ? ` · 걸린 시간 ${lastRun.ms} ms` : ''}</span>`
              : null}
          <span class="spacer"></span>
          ${toast ? html`<span class="toast" role="status">${toast}</span>` : null}
          <${EngineBadge} info=${engine} />
        </div>
        <div class="bottom">
          <${Splitter} dir="y" className="split-bottom" onDrag=${dragBottom} onEnd=${endBottom}
            onReset=${() => setPrefs({ bottomH: null, bigPanel: false })} title="끌어서 아래 패널 높이 조절 · 두 번 클릭하면 처음 높이" />
          <div class="bottom-tabs">
            ${tabs.map(([key, label]) => html`<button class=${tab === key ? 'active' : ''} onClick=${() => setTab(key)}>${label}</button>`)}
            <span class="spacer"></span>
            ${tab === 'terminal' ? html`<button class="tab-tool" onClick=${() => termRef.current?.reset()}>출력 지우기</button>` : null}
            ${tab === 'shell' ? html`<button class="tab-tool" onClick=${() => actions.current.resetShell()}>셸 초기화</button>` : null}
            <button class="tab-tool" onClick=${() => setPrefs({ bigPanel: !prefs.bigPanel, bottomH: null })}>${prefs.bigPanel ? '패널 작게 ▾' : '패널 크게 ▴'}</button>
          </div>
          <div class="term-host" ref=${termEl} style=${tab === 'terminal' ? '' : 'display:none'}></div>
          <div class="term-host" ref=${shellEl} style=${tab === 'shell' ? '' : 'display:none'}></div>
          ${tab === 'tests'
            ? html`<${TestsPanel} file=${active} res=${res} grading=${grading} act=${testActions} onGrade=${() => actions.current.grade()} />`
            : null}
          ${tab === 'trace'
            ? html`<${TracePanel} trace=${trace && trace.fileId === active.id ? trace : null} tracing=${tracing} input=${active.traceInput || ''}
                onInput=${(v) => { active.traceInput = v; persist(); rerender(); }}
                onStart=${() => actions.current.trace()} onGo=${(i) => actions.current.go(i)} onExit=${exitTrace} />`
            : null}
          ${tab === 'check' ? html`<${CheckPanel} warnings=${warnings} onJump=${jumpTo} />` : null}
        </div>
      </section>
    </div>
    <input type="file" accept=".py,.txt,text/x-python,text/plain" multiple hidden ref=${fileInput} onChange=${(e) => fileActions.onUpload(e)} />
    <${IdeHelp} open=${help} onClose=${() => setHelp(false)} />
  </div>`;
}

function Sidebar({ files, activeId, act }) {
  return html`<aside class="ide-side">
    <div class="side-sec">
      <div class="side-head">
        <span>파일</span>
        <span class="spacer"></span>
        <button class="icon-btn sm" title="새 파일" onClick=${() => act.create()}>＋</button>
        <button class="icon-btn sm" title="내 컴퓨터의 .py 파일 열기" onClick=${() => act.upload()}>📂</button>
      </div>
      <ul class="file-list">
        ${files.map((f) => html`<li class=${f.id === activeId ? 'active' : ''}>
          <button onClick=${() => act.open(f.id)} title=${f.name}><span class="py-dot"></span><span class="fname">${f.name}</span></button>
        </li>`)}
      </ul>
      <div class="file-actions">
        <button onClick=${() => act.rename()}>이름 바꾸기</button>
        <button onClick=${() => act.duplicate()}>복제</button>
        <button onClick=${() => act.download()}>다운로드</button>
        <button onClick=${() => act.share()} title="코드를 담은 링크를 복사합니다">링크 공유</button>
        <button class="danger" onClick=${() => act.remove()}>삭제</button>
      </div>
    </div>
    <details class="side-sec" open>
      <summary>예제 열기</summary>
      <ul class="side-list">
        ${EXAMPLES.map((ex) => html`<li><button onClick=${() => act.example(ex)} title="새 파일로 엽니다">${ex.label}</button></li>`)}
      </ul>
    </details>
    <details class="side-sec" open>
      <summary>코드 조각 넣기</summary>
      <ul class="side-list">
        ${SNIPPETS.map((sn) => html`<li><button onClick=${() => act.snippet(sn)} title=${sn.code}>${sn.label}</button></li>`)}
      </ul>
    </details>
  </aside>`;
}

function TestsPanel({ file, res, grading, act, onGrade }) {
  const tests = file.tests;
  return html`<div class="results ide-tests">
    <p class="muted small">
      elice 채점과 같은 방식으로 실행합니다 — <code>input("…")</code>의 프롬프트 뒤에서 줄이 바뀌고 입력값은 출력에 나오지 않으며,
      출력 끝의 줄바꿈만 빼고 공백까지 그대로 비교합니다.
    </p>
    ${tests.length === 0
      ? html`<p>아직 테스트가 없습니다. 문제의 <b>입력 예시</b>와 <b>출력 예시</b>를 적어 두면 Ctrl+Shift+Enter로 한 번에 채점할 수 있어요.</p>`
      : null}
    ${tests.map((t, i) => {
      const r = res?.items?.[i];
      const stale = r && res.tests?.[i] && (res.tests[i].stdin !== t.stdin || res.tests[i].expected !== t.expected);
      return html`<${TestCard} key=${i} i=${i} test=${t} r=${r} stale=${stale} act=${act} />`;
    })}
    ${res?.error ? html`<p class="bad">채점 중 오류: ${res.error}</p>` : null}
    <div class="row gap">
      <button class="mini" onClick=${() => act.add()}>＋ 테스트 추가</button>
      ${tests.length
        ? html`<button class="mini primary" onClick=${onGrade} disabled=${!!grading}>
            ${grading ? `채점 중 ${grading.done}/${grading.total}` : '✓ 모두 채점 (Ctrl+Shift+Enter)'}
          </button>`
        : null}
    </div>
  </div>`;
}

function TestCard({ i, test, r, stale, act }) {
  const noExpected = !test.expected.trim();
  const hard = r && ['ERROR', 'TIMEOUT', 'OUTPUT_LIMIT'].includes(r.verdict);
  const v = r ? VERDICT[r.verdict] || VERDICT.WRONG : null;
  return html`<div class="ide-test">
    <div class="ide-test-head">
      <b>테스트 ${i + 1}</b>
      ${r
        ? hard || !noExpected
          ? html`<span class=${'verdict ' + v.tone}>${v.label}</span>`
          : html`<span class="chip">출력 확인</span>`
        : null}
      ${r ? html`<span class="ms">${r.elapsed_ms}ms</span>` : null}
      ${stale ? html`<span class="chip">수정됨 — 다시 채점하세요</span>` : null}
      <span class="spacer"></span>
      <button class="mini" onClick=${() => act.run(i)} title="이 입력을 터미널에 차례로 넣어 Run">▶ 이 입력으로 Run</button>
      <button class="mini" onClick=${() => act.trace(i)} title="이 입력으로 한 줄씩 실행">🔍 한 줄씩</button>
      <button class="mini danger" onClick=${() => act.remove(i)} title="테스트 삭제">✕</button>
    </div>
    <div class="ide-test-io">
      <label>입력 <small>한 줄에 하나씩 — input()에 차례로 들어갑니다</small>
        <textarea rows="3" spellcheck="false" value=${test.stdin} placeholder="(입력 없음)"
          onInput=${(e) => act.field(i, 'stdin', e.target.value)}></textarea>
      </label>
      <label>기대 출력 <small>문제의 출력 예시를 그대로 (비우면 출력만 보여 줌)</small>
        <textarea rows="3" spellcheck="false" value=${test.expected} placeholder="예) 이름: ⏎ 민수님 환영합니다."
          onInput=${(e) => act.field(i, 'expected', e.target.value)}></textarea>
      </label>
    </div>
    ${r
      ? html`<div class="test-body">
          ${v?.tip && !noExpected ? html`<p class="note">${v.tip}</p>` : null}
          ${r.error ? html`<h4>오류</h4><pre class="err">${r.error}</pre>` : null}
          ${r.verdict === 'TIMEOUT'
            ? null
            : noExpected
              ? html`<h4>채점 출력 (공백은 ·)</h4><pre>${showSpaces(r.stdout) || '(출력 없음)'}</pre>`
              : html`<${OutputDiff} expected=${test.expected} actual=${r.stdout} actualLabel="채점 출력" />`}
        </div>`
      : null}
  </div>`;
}

function describe(step, trace) {
  switch (step.ev) {
    case 'line':
      return html`<b>${step.line}번 줄</b>을 실행할 차례입니다. <span class="muted">(변수는 이 줄을 실행하기 <b>전</b> 값)</span>`;
    case 'call':
      return html`<b>${step.func}()</b> 함수를 호출했습니다 — 매개변수에 값이 들어갔습니다.`;
    case 'return':
      return html`<b>${step.func}()</b> 함수가 <code>${step.value?.r}</code> 을(를) 돌려주고 끝납니다.`;
    case 'exception':
      return html`<b>${step.line}번 줄</b>에서 오류가 났습니다: <code>${step.exc}</code>`;
    case 'end':
      return '프로그램이 끝났습니다. 마지막 변수 값입니다.';
    case 'error':
      return '오류로 프로그램이 멈췄습니다.';
    case 'limit':
      return `${trace.maxSteps || MAX_STEPS}단계까지만 기록했습니다. (반복이 너무 많거나 무한 반복일 수 있어요)`;
    case 'stopped':
      return '시간이 너무 오래 걸려 멈췄습니다. 여기까지의 기록입니다.';
    default:
      return '';
  }
}

function refColor(ref) {
  return `background: hsl(${(ref * 67) % 360} 65% 42%)`;
}

function TracePanel({ trace, tracing, input, onInput, onStart, onGo, onExit }) {
  const framesEl = useRef(null);
  // 재귀처럼 프레임이 많아지면 지금 실행 중인 프레임이 보이도록 스크롤
  useEffect(() => {
    framesEl.current?.querySelector('.frame.current')?.scrollIntoView({ block: 'nearest' });
  }, [trace?.index]);
  if (tracing) return html`<div class="results"><p class="muted">줄마다 변수를 기록하는 중…</p></div>`;
  if (!trace) {
    return html`<div class="results trace-start">
      <p>프로그램을 <b>한 줄씩</b> 실행하면서 변수 값, 함수 호출과 반환, 출력이 어떻게 바뀌는지 봅니다.
        출력 예측 문제를 손으로 따라가 본 뒤 맞는지 확인할 때 좋아요.</p>
      <label class="ide-field">input()에 들어갈 값 <small>한 줄에 하나씩 (입력이 없는 코드면 비워 두기)</small>
        <textarea rows="3" spellcheck="false" value=${input} placeholder="예) 민수" onInput=${(e) => onInput(e.target.value)}></textarea>
      </label>
      <div class="row gap"><button class="mini primary" onClick=${onStart}>🔍 한 줄씩 실행 시작</button></div>
      <p class="muted small">최대 ${MAX_STEPS}단계까지 기록합니다. 기록하는 동안 편집이 잠기고, ← → 키로 앞뒤로 움직이며 Esc로 끝냅니다.
        같은 리스트·딕셔너리를 가리키는 변수에는 같은 <span class="ref" style=${refColor(1)}>#번호</span>가 붙습니다.</p>
    </div>`;
  }
  if (!trace.steps?.length) {
    return html`<div class="results">
      <p class="bad">${trace.status === 'timeout' ? '시간이 너무 오래 걸려 기록하지 못했습니다.' : '실행하기 전에 오류가 났습니다.'}</p>
      ${trace.error ? html`<pre class="err trace-err">${trace.error}</pre>` : null}
      <button class="mini" onClick=${onExit}>닫기</button>
    </div>`;
  }
  const { steps, index } = trace;
  const step = steps[index];
  const prev = steps[index - 1];
  const prevStack = prev?.stack || [];
  const refCount = {};
  for (const fr of step.stack) for (const [, v] of fr.vars) if (v.ref) refCount[v.ref] = (refCount[v.ref] || 0) + 1;
  const outNow = trace.output.slice(0, step.out);
  const outPrev = prev ? trace.output.slice(0, Math.min(prev.out, step.out)) : '';
  const last = index === steps.length - 1;
  return html`<div class="trace-wrap">
    <div class="trace-bar">
      <button class="mini" onClick=${() => onGo(0)} disabled=${index === 0} title="처음 (Home)">⏮</button>
      <button class="mini" onClick=${() => onGo(index - 1)} disabled=${index === 0} title="이전 (←)">◀ 이전</button>
      <button class="mini primary" onClick=${() => onGo(index + 1)} disabled=${last} title="다음 (→)">다음 ▶</button>
      <button class="mini" onClick=${() => onGo(steps.length - 1)} disabled=${last} title="끝 (End)">⏭</button>
      <input type="range" min="0" max=${steps.length - 1} value=${index} aria-label="단계" onInput=${(e) => onGo(Number(e.target.value))} />
      <span class="trace-count">${index + 1} / ${steps.length}</span>
      <button class="mini" onClick=${onExit} title="편집으로 돌아가기 (Esc)">✕ 끝내기</button>
    </div>
    <div class=${'trace-desc ev-' + step.ev}>${describe(step, trace)}</div>
    <div class="trace-grid">
      <div class="trace-frames" ref=${framesEl}>
        ${step.stack.map((fr, fi) => html`<${FrameBox} frame=${fr} prev=${prevStack[fi]?.name === fr.name ? prevStack[fi] : null}
          current=${fi === step.stack.length - 1 && step.stack.length > 1} refCount=${refCount} />`)}
      </div>
      <div class="trace-out">
        <h4>출력${trace.input ? html` <small>(입력: ${splitLines(trace.input).join(' / ')})</small>` : null}</h4>
        <pre>${outPrev}<mark>${outNow.slice(outPrev.length)}</mark>${outNow ? '' : html`<span class="muted">(아직 출력 없음)</span>`}</pre>
        ${last && trace.error ? html`<pre class="err trace-err">${trace.error}</pre>` : null}
      </div>
    </div>
  </div>`;
}

function FrameBox({ frame, prev, current, refCount }) {
  const before = prev ? Object.fromEntries(prev.vars) : null;
  return html`<div class=${'frame' + (current ? ' current' : '')}>
    <div class="frame-head">${frame.name}${frame.kind === 'func' && frame.line ? html` <small>· ${frame.line}번 줄</small>` : null}</div>
    ${frame.vars.length
      ? html`<table><tbody>
          ${frame.vars.map(([name, v]) => {
            const old = before?.[name];
            const changed = before && (!old || old.r !== v.r || old.ref !== v.ref);
            const dim = v.k === 'func' || v.k === 'class';
            const shared = v.ref && refCount[v.ref] > 1;
            return html`<tr class=${(changed ? 'changed' : '') + (dim ? ' dim' : '')}>
              <th>${name}</th>
              <td><code>${v.r}</code>${shared ? html` <span class="ref" style=${refColor(v.ref)} title="같은 객체를 가리키는 변수가 여러 개입니다">#${v.ref}</span>` : null}</td>
              <td class="t">${dim ? '' : v.t}</td>
            </tr>`;
          })}
        </tbody></table>`
      : html`<p class="muted small frame-empty">(변수 없음)</p>`}
  </div>`;
}

function CheckPanel({ warnings, onJump }) {
  return html`<div class="results">
    <p class="muted small">elice는 <b>Python 3.6</b>입니다. 3.6에서 오류가 나는 문법과 제출 규칙(<code>:</code> 뒤 공백 등)을 코드를 고칠 때마다 검사합니다.</p>
    ${warnings.length
      ? html`<ul class="warn-list">${warnings.map((w) => html`<li class=${w.level}>
          <button class="link-btn warn-jump" onClick=${() => onJump(w.line)}>줄 ${w.line}</button>
          <span class="wl">${w.source === 'compat36' ? 'Python 3.6' : w.kind === 'rule' ? `규칙 ${w.rule}` : '검사'}</span>
          ${w.message}</li>`)}</ul>`
      : html`<p class="ok-text">✓ 지금 코드에서 찾은 문제가 없습니다.</p>`}
  </div>`;
}

function IdeHelp({ open, onClose }) {
  return html`<aside class=${'drawer' + (open ? ' open' : '')} aria-hidden=${!open}>
      <header><h2>Python IDE 사용법</h2><button class="icon-btn" onClick=${onClose} aria-label="닫기">✕</button></header>
      <div class="drawer-body">
        <div class="info-card">
          <h3>단축키</h3>
          <ul>
            <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> — Run (실행 중이면 Stop)</li>
            <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> — 테스트 모두 채점</li>
            <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>S</kbd> — 저장 (입력할 때마다 자동 저장됨)</li>
            <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>/</kbd> — 주석 넣기·빼기</li>
            <li>한 줄씩 실행 중 — <kbd>←</kbd> <kbd>→</kbd> 이전·다음, <kbd>Home</kbd> <kbd>End</kbd> 처음·끝, <kbd>Esc</kbd> 끝내기</li>
            <li>터미널·셸에서 <kbd>Ctrl</kbd> + <kbd>C</kbd> — 실행 중단</li>
          </ul>
        </div>
        <div class="info-card">
          <h3>기능</h3>
          <ul>
            <li><b>파일</b> — 여러 파일을 만들 수 있고 이 브라우저에 자동 저장됩니다. 다운로드·열기·링크 공유를 할 수 있고, 설정의 백업에도 들어갑니다.</li>
            <li><b>테스트</b> — 입력과 기대 출력을 적고 채점하면 elice처럼 공백까지 비교합니다. 기대 출력을 비우면 채점 출력만 보여 줍니다.</li>
            <li><b>한 줄씩 실행</b> — 줄마다 변수, 함수 호출·반환, 출력을 기록합니다. 노란 줄은 방금 바뀐 변수, 같은 #번호는 같은 객체입니다.</li>
            <li><b>파이썬 셸</b> — 식을 넣으면 결과가 바로 나옵니다. Run을 하면 그 프로그램의 변수를 이어서 쓸 수 있습니다.</li>
            <li><b>검사</b> — Python 3.6에서 안 되는 문법과 제출 규칙 위반을 알려 줍니다. 줄 번호를 누르면 그 줄로 갑니다.</li>
            <li><b>예제·코드 조각</b> — 왼쪽 목록에서 예제를 새 파일로 열거나, 자주 쓰는 코드를 커서 위치에 넣습니다.</li>
          </ul>
        </div>
        <div class="info-card">
          <h3>참고</h3>
          <ul>
            <li>브라우저 안의 Python은 최신 버전이라 3.6에서 오류가 나는 문법도 실행될 수 있습니다. 검사 탭의 경고를 꼭 확인하세요.</li>
            <li>코드는 이 브라우저에만 저장되고 어디로도 보내지 않습니다. 공유 링크는 코드를 주소 안에 담습니다.</li>
          </ul>
        </div>
      </div>
    </aside>
    ${open ? html`<div class="drawer-backdrop" onClick=${onClose}></div>` : null}`;
}
