import { html, useState } from '../lib/ui.js';
import { meta } from '../lib/storage.js';

export const DISCLAIMER =
  '이 사이트는 elice 및 서울대학교와 무관한 비공식 개인 학습용 연습장입니다. 개인 정보를 수집하지 않으며, 모든 기록은 이 브라우저에만 저장됩니다.';

export function Disclaimer() {
  const [open, setOpen] = useState(!meta.disclaimerSeen());
  if (!open) return null;
  return html`<div class="disclaimer-banner" role="note">
    <span>⚠️ ${DISCLAIMER}</span>
    <button type="button" onClick=${() => { meta.setDisclaimerSeen(); setOpen(false); }}>확인</button>
  </div>`;
}

export function Footer() {
  return html`<footer class="site-footer">
    <p>${DISCLAIMER}</p>
    <p><a href="#/about">사이트 정보 · 오픈소스 라이선스</a></p>
  </footer>`;
}

export function Layout({ route, title, children }) {
  const nav = [
    ['#/', '홈', route === '/'],
    ['#/problems', '문제', route.startsWith('/problems')],
    ['#/settings', '설정', route.startsWith('/settings')],
    ['#/about', '정보', route.startsWith('/about')],
  ];
  return html`<div class="page">
    <${Disclaimer} />
    <header class="site-header">
      <a class="brand" href="#/">🐍 ${title}</a>
      <nav>${nav.map(([href, label, active]) => html`<a href=${href} class=${active ? 'active' : ''}>${label}</a>`)}</nav>
    </header>
    <main class="page-main">${children}</main>
    <${Footer} />
  </div>`;
}

export function Stars({ n }) {
  return html`<span class="stars" title=${`난이도 ${n}/5`}>${'★'.repeat(n)}<span class="dim">${'★'.repeat(5 - n)}</span></span>`;
}

export function EngineBadge({ info }) {
  if (!info) return null;
  const map = {
    idle: ['wait', 'Python 대기'],
    loading: ['wait', 'Python 준비 중…'],
    ready: info.tier === 'A' ? ['ok', `Python ${info.python} 준비됨`] : ['warn', `Python ${info.python} (호환 모드)`],
    error: ['bad', 'Python 로딩 실패'],
  };
  const [tone, label] = map[info.state] || map.idle;
  const tip =
    info.state === 'error'
      ? info.error
      : info.tier === 'A'
        ? '표준 모드: input()이 elice처럼 입력을 기다립니다.'
        : '호환 모드: 이 브라우저에서는 교차 출처 격리가 꺼져 있어 입력할 때마다 프로그램을 처음부터 다시 실행합니다. 채점 결과는 같습니다.';
  return html`<span class=${'engine ' + tone} title=${tip}>● ${label}</span>`;
}
