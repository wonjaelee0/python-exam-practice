import { marked } from '../../vendor/marked/marked.esm.js';
import DOMPurify from '../../vendor/dompurify/purify.es.mjs';

export function md(text) {
  return DOMPurify.sanitize(marked.parse(text || '', { gfm: true, breaks: false }));
}

export async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    if (button) {
      const prev = button.textContent;
      button.textContent = '복사됨';
      setTimeout(() => (button.textContent = prev), 1200);
    }
  } catch {
    /* 클립보드 권한이 없으면 조용히 무시 */
  }
}

/** 지문 안의 코드 블록에 elice처럼 Copy 버튼을 붙인다 */
export function addCopyButtons(root) {
  if (!root) return;
  root.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector(':scope > .copy')) return;
    const b = document.createElement('button');
    b.className = 'copy';
    b.type = 'button';
    b.textContent = 'Copy';
    b.addEventListener('click', () => copyText((pre.querySelector('code') || pre).textContent, b));
    pre.appendChild(b);
  });
}
