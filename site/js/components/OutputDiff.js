import { html } from '../lib/ui.js';
import { lineDiff, showSpaces } from '../lib/diff.js';

/** 기대 출력과 실제 출력을 줄 단위로 나란히 비교 (공백은 ·로 표시) */
export function OutputDiff({ expected, actual, actualLabel = '내 출력' }) {
  const rows = lineDiff(expected, actual);
  return html`<table class="diff">
    <thead><tr><th></th><th>기대 출력</th><th>${actualLabel}</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr class=${r.same ? '' : 'neq'}>
      <td class="ln">${r.no}</td>
      <td><code>${r.exp === undefined ? html`<i class="muted">(없음)</i>` : showSpaces(r.exp)}</code></td>
      <td><code>${r.act === undefined ? html`<i class="muted">(없음)</i>` : showSpaces(r.act)}</code></td>
    </tr>`)}</tbody>
  </table>
  <p class="muted small">공백은 · 로 표시했습니다. 빨간 줄이 다른 줄입니다.</p>`;
}
