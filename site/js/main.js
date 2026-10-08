import { html, render, useEffect, useState } from './lib/ui.js';
import { loadManifest } from './lib/data.js';
import { asset } from './lib/paths.js';
import { runner } from './runtime/client.js';
import { Home } from './views/Home.js';
import { Problems } from './views/Problems.js';
import { Solve } from './views/Solve.js';
import { Settings } from './views/Settings.js';
import { About } from './views/About.js';

// 해시 라우팅: GitHub Pages는 서버 rewrite가 없으므로 #/경로 를 쓴다 (새로고침·링크 공유 안전)
function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { path: '/' + parts.join('/'), parts, query: new URLSearchParams(qs || '') };
}

function App() {
  const [route, setRoute] = useState(parseRoute());
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    loadManifest().then(
      (m) => {
        runner.configure({ pyodideURL: asset(m.runtime.pyodide), pyBase: asset('py/'), assetVersion: m.runtime.assetVersion });
        setManifest(m);
        // 첫 화면을 그린 뒤 Python을 미리 준비해 둔다 (첫 Run이 빨라짐)
        setTimeout(() => runner.start().catch(() => {}), 300);
      },
      (e) => setError(String(e.message || e)),
    );
  }, []);

  useEffect(() => {
    document.title = manifest ? manifest.config.title : 'Python 시험 연습장';
  }, [manifest]);

  if (error) {
    return html`<div class="fatal">
      <h1>문제 데이터를 불러오지 못했습니다</h1>
      <p>${error}</p>
      <p class="muted">로컬에서 실행 중이라면 <code>uv run tools/build.py</code>로 site/data를 먼저 만드세요.</p>
    </div>`;
  }
  if (!manifest) return html`<div class="boot">문제 목록을 불러오는 중…</div>`;

  const [a, b] = route.parts;
  if (a === 'p' && b) return html`<${Solve} key=${b} id=${decodeURIComponent(b)} manifest=${manifest} />`;
  if (a === 'problems') return html`<${Problems} key=${route.query.toString()} manifest=${manifest} route=${route.path} query=${route.query} />`;
  if (a === 'settings') return html`<${Settings} manifest=${manifest} route=${route.path} />`;
  if (a === 'about') return html`<${About} manifest=${manifest} route=${route.path} />`;
  return html`<${Home} manifest=${manifest} route="/" />`;
}

render(html`<${App} />`, document.getElementById('app'));

// 개발자 도구 콘솔에서 상태를 확인할 수 있게 노출 (예: __pyexam.runner.info())
window.__pyexam = { runner };
