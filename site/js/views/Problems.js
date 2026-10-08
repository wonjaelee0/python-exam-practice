import { html, useMemo, useState } from '../lib/ui.js';
import { progress, statusOf } from '../lib/storage.js';
import { Layout, Stars } from '../components/Layout.js';

const STATUS_LABEL = { untried: '안 풂', tried: '시도', solved: '정답' };
const FORMAT_LABEL = { write: '작성', fill: '빈칸', debug: '디버깅' };

export function Problems({ manifest, route, query }) {
  const [unit, setUnit] = useState(query.get('unit') || '');
  const [diff, setDiff] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const prog = progress.all();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return manifest.problems.filter((p) => {
      if (unit && p.unit !== unit) return false;
      if (diff && String(p.difficulty) !== diff) return false;
      if (status && statusOf(prog[p.id]) !== status) return false;
      if (needle && !(p.title.toLowerCase().includes(needle) || p.tags.some((t) => t.includes(needle)))) return false;
      return true;
    });
  }, [unit, diff, status, q, manifest]);

  const setUnitAndUrl = (v) => {
    setUnit(v);
    history.replaceState(null, '', v ? '#/problems?unit=' + v : '#/problems');
  };

  return html`<${Layout} route=${route} title=${manifest.config.title}>
    <h1>문제 목록 <small class="muted">${rows.length} / ${manifest.problems.length}</small></h1>
    <div class="filters">
      <select value=${unit} onChange=${(e) => setUnitAndUrl(e.target.value)} aria-label="단원">
        <option value="">전체 단원</option>
        ${manifest.units.filter((u) => u.count).map((u) => html`<option value=${u.id}>${u.short} ${u.title} (${u.count})</option>`)}
      </select>
      <select value=${diff} onChange=${(e) => setDiff(e.target.value)} aria-label="난이도">
        <option value="">전체 난이도</option>
        ${[1, 2, 3, 4, 5].map((n) => html`<option value=${n}>${'★'.repeat(n)}</option>`)}
      </select>
      <select value=${status} onChange=${(e) => setStatus(e.target.value)} aria-label="상태">
        <option value="">전체 상태</option>
        <option value="untried">안 푼 문제</option>
        <option value="tried">시도했지만 못 맞힘</option>
        <option value="solved">맞힌 문제</option>
      </select>
      <input type="search" placeholder="제목·태그 검색" value=${q} onInput=${(e) => setQ(e.target.value)} />
    </div>
    <table class="problem-table">
      <thead><tr><th>단원</th><th>#</th><th>제목</th><th>난이도</th><th>형식</th><th>상태</th></tr></thead>
      <tbody>
        ${rows.map((p) => {
          const st = statusOf(prog[p.id]);
          const u = manifest.unitById[p.unit];
          return html`<tr onClick=${() => (location.hash = '#/p/' + p.id)} class="clickable">
            <td><span class="badge">${u.short}</span></td>
            <td class="muted">${p.no}</td>
            <td><a href=${'#/p/' + p.id}>${p.title}</a></td>
            <td><${Stars} n=${p.difficulty} /></td>
            <td class="muted">${FORMAT_LABEL[p.format] || p.format}</td>
            <td><span class=${'status ' + st}>${STATUS_LABEL[st]}${prog[p.id] && st === 'tried' ? ` (${prog[p.id].best}점)` : ''}</span></td>
          </tr>`;
        })}
      </tbody>
    </table>
    ${rows.length === 0 ? html`<p class="muted">조건에 맞는 문제가 없습니다.</p>` : null}
  <//>`;
}
