// 풀이 화면 — elice testroom 배치 재현
//  상단바 | 번호 사이드바 | 문제(흰 배경) | 에디터(main.py) + Run/Submit 바 + 터미널/채점 결과 | PREVIOUS · n / N · NEXT
import { html, useEffect, useMemo, useRef, useState } from '../lib/ui.js';
import { loadUnit } from '../lib/data.js';
import { md, addCopyButtons, copyText } from '../lib/markdown.js';
import { drafts, progress, settings, meta, statusOf } from '../lib/storage.js';
import { VERDICT, lineDiff, showSpaces } from '../lib/diff.js';
import { runner } from '../runtime/client.js';
import { loadMonaco, createEditor, setMarkers } from '../components/editor.js';
import { TermView } from '../components/terminal.js';
import { EngineBadge, Stars, DISCLAIMER } from '../components/Layout.js';

const splitLines = (s) => (s || '').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
const fmtDate = (t) =>
  new Date(t).toLocaleString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });

export function Solve({ id, manifest }) {
  const metaInfo = manifest.byId[id];
  const unit = metaInfo && manifest.unitById[metaInfo.unit];
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!metaInfo) return;
    meta.setLastProblem(id);
    loadUnit(manifest, metaInfo.unit).then(setData, (e) => setLoadError(String(e)));
  }, [id]);

  if (!metaInfo) return html`<div class="fatal">없는 문제입니다: ${id} <a href="#/problems">문제 목록</a></div>`;
  if (loadError) return html`<div class="fatal">문제를 불러오지 못했습니다: ${loadError}</div>`;
  if (!data) return html`<div class="boot">문제를 불러오는 중…</div>`;
  const problem = data.problems.find((p) => p.id === id);
  return html`<${Workspace} key=${id} problem=${problem} siblings=${data.problems} unit=${unit} manifest=${manifest} />`;
}

function Workspace({ problem, siblings, unit, manifest }) {
  const id = problem.id;
  const [conf, setConf] = useState(settings.get());
  const [engine, setEngine] = useState(runner.info());
  const [running, setRunning] = useState(false);
  const [grading, setGrading] = useState(null); // { done, total }
  const [results, setResults] = useState(null);
  const [tab, setTab] = useState('terminal');
  const [remaining, setRemaining] = useState(0);
  const [warnings, setWarnings] = useState([]);
  const [drawer, setDrawer] = useState(false);
  const [lastSubmit, setLastSubmit] = useState(() => {
    const p = progress.get(id);
    return p ? { score: p.last, at: p.lastAt } : null;
  });
  const [editorError, setEditorError] = useState(null);

  const editorEl = useRef(null);
  const termEl = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const termRef = useRef(null);
  const runningRef = useRef(false);
  const timerRef = useRef(null);
  const actions = useRef({});

  const idx = siblings.findIndex((p) => p.id === id);
  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];
  const prog = progress.all();

  useEffect(() => runner.subscribe(setEngine), []);

  // 에디터 + 터미널 생성
  useEffect(() => {
    let disposed = false;
    const term = new TermView(termEl.current, { fontSize: conf.termFontSize, onInterrupt: () => actions.current.stop() });
    termRef.current = term;
    term.status('/* Code has not run yet. */');
    const initial = drafts.get(id)?.code ?? problem.starter ?? '';
    let saveTimer = null;
    loadMonaco()
      .then((monaco) => {
        if (disposed) return;
        monacoRef.current = monaco;
        editorRef.current = createEditor(monaco, editorEl.current, {
          value: initial,
          fontSize: conf.fontSize,
          onChange: (code) => {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => drafts.set(id, code), 400);
          },
          onRun: () => actions.current.run(),
          onSubmit: () => actions.current.submit(),
        });
        editorRef.current.focus();
      })
      .catch((e) => setEditorError(String(e)));
    runner.start().catch(() => {});
    return () => {
      disposed = true;
      clearTimeout(saveTimer);
      if (editorRef.current) drafts.set(id, editorRef.current.getValue());
      if (runningRef.current) runner.stop();
      clearInterval(timerRef.current);
      editorRef.current?.dispose();
      term.dispose();
    };
  }, []);

  // 에디터 밖에서도 단축키 동작
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;
      if (e.target.closest?.('.monaco-editor')) return; // 에디터 안에서는 Monaco가 처리
      e.preventDefault();
      if (e.shiftKey) actions.current.submit();
      else actions.current.run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const applyWarnings = (ws) => {
    setWarnings(ws);
    if (monacoRef.current && editorRef.current) setMarkers(monacoRef.current, editorRef.current, ws);
  };

  const currentCode = () => (editorRef.current ? editorRef.current.getValue() : drafts.get(id)?.code ?? problem.starter);

  actions.current.stop = () => {
    if (runningRef.current) runner.stop();
  };

  actions.current.run = async (presetInputs) => {
    if (runningRef.current) {
      runner.stop();
      return;
    }
    if (grading) return;
    const term = termRef.current;
    const code = currentCode();
    drafts.set(id, code);
    runningRef.current = true;
    setRunning(true);
    setTab('terminal');
    term.reset();
    term.status('/* Code is running... */');
    term.setAccepting(true);
    if (presetInputs) term.queueInput(presetInputs);
    term.focus();
    try {
      applyWarnings(await runner.check(code));
      const limit = manifest.config.runLimitSec;
      const deadline = Date.now() + limit * 1000;
      setRemaining(limit);
      timerRef.current = setInterval(() => {
        const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setRemaining(left);
        if (left <= 0) {
          clearInterval(timerRef.current);
          term.write('\n실행 시간 제한을 넘어 중단합니다.\n', 'err');
          runner.stop();
        }
      }, 250);
      const res = await runner.run(code, term);
      if (res.status === 'error' && res.traceback) term.write(res.traceback, 'err');
      else if (res.status === 'output-limit') term.write('\n' + res.traceback + '\n', 'err');
      else if (res.status === 'interrupted') term.write('\n^C 실행을 중단했습니다.\n', 'err');
    } catch (e) {
      term.write('\nPython을 실행할 수 없습니다: ' + e.message + '\n', 'err');
    } finally {
      clearInterval(timerRef.current);
      term.setAccepting(false);
      term.write('\n');
      term.status('/* Code running is complete! */');
      runningRef.current = false;
      setRunning(false);
    }
  };

  actions.current.submit = async () => {
    if (grading) return;
    if (runningRef.current) runner.stop();
    const code = currentCode();
    drafts.set(id, code);
    const tests = problem.tests;
    setTab('results');
    setGrading({ done: 0, total: tests.length });
    setResults(null);
    try {
      const ws = await runner.check(code);
      applyWarnings(ws);
      const items = await runner.grade(code, tests, {
        timeoutMs: problem.limits?.time_ms || 3000,
        onProgress: (i) => setGrading({ done: i + 1, total: tests.length }),
      });
      const passed = items.filter((r) => r.verdict === 'PASS').length;
      const raw = Math.round((100 * passed) / tests.length);
      const syntax36 = ws.filter((w) => w.source === 'compat36' && w.kind === 'syntax');
      const score = syntax36.length ? 0 : raw;
      const at = Date.now();
      progress.record(id, { score, passed, total: tests.length });
      setLastSubmit({ score, at });
      setResults({ items, score, raw, passed, total: tests.length, warnings: ws, syntax36, at });
    } catch (e) {
      setResults({ error: String(e.message || e) });
    } finally {
      setGrading(null);
    }
  };

  const resetCode = () => {
    if (!editorRef.current) return;
    if (!confirm('작성한 코드를 지우고 처음 코드로 되돌릴까요?')) return;
    editorRef.current.setValue(problem.starter || '');
    drafts.clear(id);
  };

  const toggleNumbar = () => setConf(settings.set({ showNumbar: !conf.showNumbar }));
  const hide = conf.hideResults;

  return html`<div class=${'solve' + (conf.showNumbar ? '' : ' no-numbar')}>
    <header class="solve-top">
      <button class="icon-btn" title="번호 목록 접기/펴기" onClick=${toggleNumbar}>${conf.showNumbar ? '⇤' : '⇥'}</button>
      <a class="crumb" href=${'#/problems?unit=' + unit.id}>${unit.short} ${unit.title}</a>
      <span class="sep">/</span>
      <b class="crumb-title">${problem.no}. ${problem.title}</b>
      <span class="spacer"></span>
      ${hide ? html`<span class="mode-pill" title="설정에서 끌 수 있습니다">시험처럼 모드</span>` : null}
      <button class="info-btn" onClick=${() => setDrawer(true)}>ⓘ Test Information</button>
      <a class="top-link" href="#/problems">문제 목록</a>
      <a class="top-link" href="#/">홈</a>
    </header>

    <div class="solve-body">
      <nav class="numbar" aria-label="문제 번호">
        ${siblings.map((p) => {
          const st = statusOf(prog[p.id]);
          return html`<a href=${'#/p/' + p.id} class=${'num' + (p.id === id ? ' active' : '')} title=${p.title}>
            <span>${p.no}</span>
            ${st === 'solved' ? html`<small class="ok">✓</small>` : st === 'tried' ? html`<small>Submit</small>` : null}
          </a>`;
        })}
      </nav>

      <${ProblemPanel} problem=${problem} unit=${unit} onRunWith=${(lines) => actions.current.run(lines)} />

      <section class="code-pane">
        <div class="tabs">
          <span class="tab active"><span class="py-dot"></span>main.py</span>
          <span class="spacer"></span>
          <button class="icon-btn" title="처음 코드로 되돌리기" onClick=${resetCode}>⟳</button>
        </div>
        <div class="editor-host" ref=${editorEl}>
          ${editorError ? html`<div class="fatal">${editorError}</div>` : null}
        </div>
        <div class="runbar">
          ${running
            ? html`<button class="btn-stop" onClick=${() => actions.current.run()}>Stop</button>`
            : html`<button class="btn-run" onClick=${() => actions.current.run()} disabled=${!!grading}>Run</button>`}
          <button class="btn-submit" onClick=${() => actions.current.submit()} disabled=${!!grading}>
            ${grading ? `채점 중 ${grading.done}/${grading.total}` : 'Submit'}
          </button>
          ${running
            ? html`<span class="remaining">Remaining: ${mmss(remaining)}</span>`
            : html`<div class="last"><small>Last submit score</small><b>${hide || !lastSubmit ? '--' : lastSubmit.score}</b></div>
                <div class="last"><small>Last submit datetime</small><b>${lastSubmit ? fmtDate(lastSubmit.at) : '--'}</b></div>`}
          <span class="spacer"></span>
          <${EngineBadge} info=${engine} />
        </div>
        <div class="bottom">
          <div class="bottom-tabs">
            <button class=${tab === 'terminal' ? 'active' : ''} onClick=${() => setTab('terminal')}>터미널</button>
            <button class=${tab === 'results' ? 'active' : ''} onClick=${() => setTab('results')}>
              채점 결과${results?.items && !hide ? ` (${results.passed}/${results.total})` : ''}
            </button>
            ${warnings.length ? html`<button class="warn-count" onClick=${() => setTab('results')} title="코드 검사 경고">⚠ ${warnings.length}</button>` : null}
          </div>
          <div class="term-host" ref=${termEl} style=${tab === 'terminal' ? '' : 'display:none'}></div>
          ${tab === 'results'
            ? html`<${ResultPanel} results=${results} grading=${grading} warnings=${warnings} hide=${hide} tests=${problem.tests} />`
            : null}
        </div>
      </section>
    </div>

    <footer class="solve-foot">
      ${prev ? html`<a class="pager" href=${'#/p/' + prev.id}>‹ PREVIOUS</a>` : html`<span class="pager disabled">‹ PREVIOUS</span>`}
      <span class="pager-count">${problem.no} / ${siblings.length}</span>
      ${next ? html`<a class="pager next" href=${'#/p/' + next.id}>NEXT ›</a>` : html`<span class="pager disabled">NEXT ›</span>`}
    </footer>

    <${TestInfo} open=${drawer} onClose=${() => setDrawer(false)} />
  </div>`;
}

function ProblemPanel({ problem, unit, onRunWith }) {
  const ref = useRef(null);
  const body = useMemo(() => md(problem.statement), [problem.id]);
  const [solution, setSolution] = useState(null);
  useEffect(() => addCopyButtons(ref.current), [problem.id]);
  const pubs = problem.tests.filter((t) => t.public);
  const pre = problem.style === 'elice-pre';

  return html`<article class="problem-pane">
    <h1 class="p-title">${problem.title}</h1>
    <div class="p-meta">
      <span class="badge">${unit.short}</span>
      <${Stars} n=${problem.difficulty} />
      ${problem.format === 'fill' ? html`<span class="badge alt">빈칸 채우기</span>` : null}
      ${problem.format === 'debug' ? html`<span class="badge alt">버그 고치기</span>` : null}
    </div>
    <div class="md" ref=${ref} dangerouslySetInnerHTML=${{ __html: body }}></div>

    <h2 class="ex-title">${pre ? 'TestCase' : '예시 결과'}</h2>
    ${pubs.map((t, k) => html`<div class="example">
      ${pre ? html`<h3>Test Case-${k + 1}</h3>` : pubs.length > 1 ? html`<h3>예시 ${k + 1}</h3>` : null}
      ${t.stdin
        ? html`<h4 class="io-label">${pre ? 'Input Sample' : 'Input'}
              <button class="link-btn" onClick=${() => onRunWith(splitLines(t.stdin))} title="이 입력을 자동으로 넣어 Run">▶ 이 입력으로 Run</button></h4>
            ${splitLines(t.stdin).map((line) => html`<div class="io-box"><code>${line}</code>
              <button class="copy" onClick=${(e) => copyText(line, e.currentTarget)}>Copy</button></div>`)}`
        : null}
      <h4 class="io-label">${pre ? 'Output Sample' : 'Output'}</h4>
      <div class="io-box out"><pre>${t.expected}</pre>
        <button class="copy" onClick=${(e) => copyText(t.expected, e.currentTarget)}>Copy</button></div>
    </div>`)}

    <section class="hints">
      ${problem.hints.map((h, i) => html`<details><summary>힌트 ${i + 1}</summary><div class="md" dangerouslySetInnerHTML=${{ __html: md(h) }}></div></details>`)}
      ${problem.explanation ? html`<details><summary>해설</summary><div class="md" dangerouslySetInnerHTML=${{ __html: md(problem.explanation) }}></div></details>` : null}
      <details onToggle=${(e) => e.currentTarget.open && !solution && setSolution(problem.solutionCode())}>
        <summary>정답 코드 보기</summary>
        ${solution ? html`<div class="io-box out"><pre>${solution}</pre><button class="copy" onClick=${(e) => copyText(solution, e.currentTarget)}>Copy</button></div>` : null}
      </details>
    </section>
    <p class="p-foot">${DISCLAIMER}</p>
  </article>`;
}

function ResultPanel({ results, grading, warnings, hide, tests }) {
  const [open, setOpen] = useState(() => new Set());
  useEffect(() => {
    if (results?.items) {
      const first = results.items.findIndex((r) => r.verdict !== 'PASS');
      setOpen(new Set(first >= 0 ? [first] : []));
    }
  }, [results]);
  const toggle = (i) => setOpen((s) => {
    const n = new Set(s);
    n.has(i) ? n.delete(i) : n.add(i);
    return n;
  });

  const warnList = warnings.length
    ? html`<ul class="warn-list">${warnings.map((w) => html`<li class=${w.level}>
        <span class="wl">${w.source === 'compat36' ? 'Python 3.6' : w.kind === 'rule' ? `규칙 ${w.rule}` : '검사'}</span>
        줄 ${w.line}: ${w.message}</li>`)}</ul>`
    : null;

  if (grading) return html`<div class="results"><p class="muted">채점 중… ${grading.done} / ${grading.total}</p></div>`;
  if (!results) return html`<div class="results"><p class="muted">Submit을 누르면 공개 예시와 숨은 테스트로 채점합니다.</p>${warnList}</div>`;
  if (results.error) return html`<div class="results"><p class="bad">채점 중 오류: ${results.error}</p></div>`;
  if (hide)
    return html`<div class="results">
      <p><b>제출했습니다.</b> <span class="muted">시험처럼 모드에서는 점수와 틀린 테스트를 숨깁니다. (설정에서 끌 수 있음)</span></p>
      ${warnList}
    </div>`;

  return html`<div class="results">
    <div class=${'score ' + (results.score === 100 ? 'ok' : 'bad')}>
      <b>${results.score}</b><span>점</span>
      <span class="muted">· ${results.passed} / ${results.total} 테스트 통과</span>
      ${results.syntax36.length ? html`<span class="bad"> · elice(Python 3.6)에서는 문법 오류라 0점 (사이트 기준 ${results.raw}점)</span>` : null}
    </div>
    ${warnList}
    <div class="tests">
      ${results.items.map((r, i) => {
        const t = tests[i];
        const v = VERDICT[r.verdict] || VERDICT.WRONG;
        const isOpen = open.has(i);
        return html`<div class=${'test-row ' + v.tone}>
          <button class="test-head" onClick=${() => toggle(i)}>
            <span>${isOpen ? '▾' : '▸'} 테스트 ${i + 1}</span>
            <span class="chip">${t.public ? '공개' : '숨김'}</span>
            <span class=${'verdict ' + v.tone}>${v.label}</span>
            <span class="ms">${r.elapsed_ms}ms</span>
          </button>
          ${isOpen ? html`<div class="test-body">
            ${t.note ? html`<p class="note">💡 ${t.note}</p>` : null}
            ${v.tip ? html`<p class="note">${v.tip}</p>` : null}
            <div class="io-pair">
              <div><h4>입력</h4><pre>${t.stdin || '(입력 없음)'}</pre></div>
            </div>
            ${r.error ? html`<div><h4>오류</h4><pre class="err">${r.error}</pre></div>` : null}
            ${r.verdict === 'TIMEOUT' ? null : html`<${OutputDiff} expected=${t.expected} actual=${r.stdout} />`}
          </div>` : null}
        </div>`;
      })}
    </div>
  </div>`;
}

function OutputDiff({ expected, actual }) {
  const rows = lineDiff(expected, actual);
  return html`<table class="diff">
    <thead><tr><th></th><th>기대 출력</th><th>내 출력</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr class=${r.same ? '' : 'neq'}>
      <td class="ln">${r.no}</td>
      <td><code>${r.exp === undefined ? html`<i class="muted">(없음)</i>` : showSpaces(r.exp)}</code></td>
      <td><code>${r.act === undefined ? html`<i class="muted">(없음)</i>` : showSpaces(r.act)}</code></td>
    </tr>`)}</tbody>
  </table>
  <p class="muted small">공백은 · 로 표시했습니다. 빨간 줄이 다른 줄입니다.</p>`;
}

function TestInfo({ open, onClose }) {
  return html`<aside class=${'drawer' + (open ? ' open' : '')} aria-hidden=${!open}>
    <header><h2>Test Info</h2><button class="icon-btn" onClick=${onClose} aria-label="닫기">✕</button></header>
    <div class="drawer-body">
      <div class="info-card">
        <h3>답안 제출 규칙 (elice 공지와 같은 규칙)</h3>
        <ol>
          <li><code>:</code> 뒤 한 칸 공백 — <code>input("Hi: ")</code>, <code>print("Hi:", a)</code>, <code>print(f"Hi: {a}")</code></li>
          <li>출력 시 <code>,</code> 뒤 한 칸 공백</li>
          <li>모든 문장은 대문자로 시작, 그 외에는 소문자</li>
          <li>문장 끝 기호(<code>.</code>, <code>!</code> 등) 앞에는 공백 없음</li>
          <li>random 모듈 사용 시 <code>random.seed(1)</code>로 시드 고정</li>
        </ol>
      </div>
      <div class="info-card">
        <h3>채점 방식</h3>
        <ul>
          <li>Submit하면 공개 예시와 숨은 테스트를 모두 실행합니다.</li>
          <li><code>input("프롬프트: ")</code>는 프롬프트를 출력한 뒤 줄을 바꿉니다. 입력값은 출력에 들어가지 않습니다.</li>
          <li>출력 끝의 줄바꿈만 무시하고, 공백까지 정확히 비교합니다.</li>
          <li>시험장은 Python 3.6입니다. 3.6에서 문법 오류가 나는 코드는 0점으로 표시합니다.</li>
        </ul>
      </div>
      <div class="info-card">
        <h3>단축키</h3>
        <ul>
          <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> — Run (실행 중이면 Stop)</li>
          <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> — Submit</li>
          <li>터미널에서 <kbd>Ctrl</kbd> + <kbd>C</kbd> — 실행 중단</li>
        </ul>
      </div>
    </div>
  </aside>
  ${open ? html`<div class="drawer-backdrop" onClick=${onClose}></div>` : null}`;
}
