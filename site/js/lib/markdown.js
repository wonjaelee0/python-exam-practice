import { marked } from '../../vendor/marked/marked.esm.js';
import DOMPurify from '../../vendor/dompurify/purify.es.mjs';

export function md(text) {
  return DOMPurify.sanitize(marked.parse(text || '', { gfm: true, breaks: false }));
}

/** 버튼 글자를 직접 바꾸지 않고 클래스로 잠깐 표시한다 (Preact가 관리하는 글자 노드를 건드리면 "CopyCopy"처럼 겹칠 수 있음) */
function flash(button, cls) {
  if (!button) return;
  button.classList.remove('copied', 'sent');
  button.classList.add(cls);
  clearTimeout(button._flashTimer);
  button._flashTimer = setTimeout(() => button.classList.remove(cls), 1200);
}

/**
 * Copy 버튼 동작. elice처럼 코드가 실행 중이면 터미널에 바로 입력(+Enter)하고,
 * 아니면 클립보드에 복사한다. toTerminal(text)는 입력했으면 true를 돌려준다.
 */
export async function copyText(text, button, toTerminal) {
  if (toTerminal && toTerminal(text)) {
    flash(button, 'sent');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    flash(button, 'copied');
  } catch {
    /* 클립보드 권한이 없으면 조용히 무시 */
  }
}

/** 지문 안의 코드 블록에 elice처럼 Copy 버튼을 붙인다 */
export function addCopyButtons(root, toTerminal) {
  if (!root) return;
  root.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector(':scope > .copy')) return;
    const b = document.createElement('button');
    b.className = 'copy';
    b.type = 'button';
    b.textContent = 'Copy';
    b.addEventListener('click', () => copyText((pre.querySelector('code') || pre).textContent, b, toTerminal));
    pre.appendChild(b);
  });
}
