import { html, useEffect, useState } from '../lib/ui.js';
import { settings, exportAll, importAll, resetAll, progress } from '../lib/storage.js';
import { Layout, EngineBadge } from '../components/Layout.js';
import { runner } from '../runtime/client.js';

export function Settings({ manifest, route }) {
  const [s, setS] = useState(settings.get());
  const [msg, setMsg] = useState('');
  const [engine, setEngine] = useState(runner.info());
  useEffect(() => runner.subscribe(setEngine), []);
  const update = (patch) => setS(settings.set(patch));

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportAll(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `python-exam-practice-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg('내보냈습니다. 다른 컴퓨터에서 "가져오기"로 불러오세요.');
  };
  const doImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const n = importAll(JSON.parse(await file.text()));
      setS(settings.get());
      setMsg(`${n}개 항목을 가져왔습니다.`);
    } catch (err) {
      setMsg('가져오기 실패: ' + err.message);
    }
    e.target.value = '';
  };
  const doReset = () => {
    if (!confirm('이 브라우저에 저장된 코드·기록·설정을 모두 지울까요? 되돌릴 수 없습니다.')) return;
    const n = resetAll();
    setS(settings.get());
    setMsg(`${n}개 항목을 지웠습니다.`);
  };
  const solvedCount = Object.values(progress.all()).filter((p) => p.best === 100).length;

  return html`<${Layout} route=${route} title=${manifest.config.title}>
    <h1>설정</h1>
    <section class="card">
      <h2>연습 방식</h2>
      <label class="row">
        <input type="checkbox" checked=${s.hideResults} onChange=${(e) => update({ hideResults: e.target.checked })} />
        <span><b>시험처럼 모드</b> — Submit 결과(점수·틀린 테스트)를 숨깁니다. 실제 시험처럼 스스로 검증하는 연습을 할 때 켜세요.</span>
      </label>
    </section>
    <section class="card">
      <h2>글자 크기</h2>
      <label class="row">에디터
        <input type="range" min="12" max="22" value=${s.fontSize} onInput=${(e) => update({ fontSize: +e.target.value })} /> ${s.fontSize}px</label>
      <label class="row">터미널
        <input type="range" min="11" max="20" value=${s.termFontSize} onInput=${(e) => update({ termFontSize: +e.target.value })} /> ${s.termFontSize}px</label>
      <label class="row">문제 글자
        <input type="range" min="12" max="22" value=${s.problemFontSize} onInput=${(e) => update({ problemFontSize: +e.target.value })} /> ${s.problemFontSize}px</label>
    </section>
    <section class="card">
      <h2>풀이 화면 배치</h2>
      <label class="row">
        <input type="checkbox" checked=${s.showWhitespace} onChange=${(e) => update({ showWhitespace: e.target.checked })} />
        <span><b>공백 보기</b> — 코드의 공백을 ·으로 보여 줍니다. <code>: </code> 뒤 공백 같은 제출 규칙을 확인할 때 좋습니다.</span>
      </label>
      <p class="muted">풀이 화면에서 문제와 코드 사이, 코드와 터미널 사이 경계선을 끌어 크기를 바꿀 수 있습니다.
        지금: 문제 칸 ${s.problemHidden ? '숨김' : s.problemWidth ? s.problemWidth + 'px' : '기본'} · 터미널 ${s.bottomHeight ? s.bottomHeight + 'px' : '기본'}</p>
      <div class="row gap">
        <button class="btn" onClick=${() => { update({ problemWidth: null, problemHidden: false, bottomHeight: null, showNumbar: true }); setMsg('풀이 화면 배치를 처음대로 되돌렸습니다.'); }}>배치 초기화</button>
      </div>
    </section>
    <section class="card">
      <h2>내 기록 (이 브라우저에만 저장됨)</h2>
      <p class="muted">맞힌 문제 ${solvedCount}개. 컴퓨터실과 집을 오갈 때는 내보내기 → 가져오기로 옮기세요.</p>
      <div class="row gap">
        <button class="btn" onClick=${doExport}>내보내기</button>
        <label class="btn">가져오기<input type="file" accept="application/json" hidden onChange=${doImport} /></label>
        <button class="btn danger" onClick=${doReset}>모두 지우기</button>
      </div>
      ${msg ? html`<p class="notice">${msg}</p>` : null}
    </section>
    <section class="card">
      <h2>실행 엔진</h2>
      <p><${EngineBadge} info=${engine} /></p>
      <p class="muted">브라우저 안의 Python(Pyodide ${manifest.runtime.pyodide.split('/')[1]})으로 실행합니다.
        문제의 기대 출력은 ${manifest.runtime.validatedWith}로 검증했습니다. 데이터 버전 ${manifest.buildId}.</p>
    </section>
  <//>`;
}
