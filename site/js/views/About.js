import { html } from '../lib/ui.js';
import { Layout, DISCLAIMER } from '../components/Layout.js';

const LICENSES = [
  ['Pyodide', 'MPL-2.0', 'https://github.com/pyodide/pyodide'],
  ['Monaco Editor', 'MIT', 'https://github.com/microsoft/monaco-editor'],
  ['xterm.js', 'MIT', 'https://github.com/xtermjs/xterm.js'],
  ['Preact + htm', 'MIT / Apache-2.0', 'https://github.com/developit/htm'],
  ['marked', 'MIT', 'https://github.com/markedjs/marked'],
  ['DOMPurify', 'Apache-2.0 / MPL-2.0', 'https://github.com/cure53/DOMPurify'],
  ['coi-serviceworker', 'MIT', 'https://github.com/gzuidhof/coi-serviceworker'],
];

export function About({ manifest, route }) {
  return html`<${Layout} route=${route} title=${manifest.config.title}>
    <h1>사이트 정보</h1>
    <section class="card notice-strong"><p>${DISCLAIMER}</p>
      <p>elice 화면의 배치와 흐름만 참고해 직접 만든 연습용 사이트이며, elice의 코드·이미지·로고를 사용하지 않습니다. 모든 문제는 이 사이트를 위해 새로 작성했습니다.</p></section>
    <section class="card">
      <h2>채점 방식</h2>
      <ul>
        <li><b>Run</b>: 터미널에서 직접 입력합니다. 입력한 값이 화면에 보입니다.</li>
        <li><b>Submit</b>: 공개 예시와 숨은 테스트를 모두 실행합니다. <code>input("프롬프트: ")</code>는 프롬프트를 출력한 뒤 줄을 바꾸고, 입력값은 출력에 들어가지 않습니다 (elice 채점 방식).</li>
        <li>출력은 끝의 줄바꿈만 무시하고 <b>공백까지 정확히</b> 비교합니다.</li>
        <li>기대 출력은 정답 코드를 Python 3.6(elice와 같은 버전)으로 실행해 만들었습니다.</li>
      </ul>
    </section>
    <section class="card">
      <h2>오픈소스 라이선스</h2>
      <ul>${LICENSES.map(([name, lic, url]) => html`<li><a href=${url} target="_blank" rel="noopener">${name}</a> — ${lic}</li>`)}</ul>
    </section>
  <//>`;
}
