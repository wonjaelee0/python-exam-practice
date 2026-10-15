import { html, useEffect, useMemo, useState } from '../lib/ui.js';
import { quizStats, quizPrefs } from '../lib/storage.js';
import { loadAllQuizzes, TYPE_LABEL, TYPE_ORDER } from '../lib/quiz.js';
import { Layout } from '../components/Layout.js';

const COUNTS = ['10', '20', '30', 'all'];

function defaultPrefs(sets) {
  return { sets: sets.map((s) => s.id), types: TYPE_ORDER.slice(), n: '20', scope: 'all', mode: 'instant', shuffle: true };
}

export function QuizHome({ manifest, route }) {
  const sets = manifest.quizzes || [];
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [prefs, setPrefs] = useState(() => {
    const saved = quizPrefs.get();
    const base = defaultPrefs(sets);
    if (!saved) return base;
    const valid = (saved.sets || []).filter((id) => sets.some((s) => s.id === id));
    return { ...base, ...saved, sets: valid.length ? valid : base.sets };
  });
  const stats = quizStats.all();

  useEffect(() => {
    loadAllQuizzes(manifest).then(setData, (e) => setError(String(e.message || e)));
  }, []);
  useEffect(() => {
    quizPrefs.set(prefs);
  }, [prefs]);

  const update = (patch) => setPrefs((p) => ({ ...p, ...patch }));
  const toggle = (key, value) =>
    setPrefs((p) => {
      const cur = new Set(p[key]);
      if (cur.has(value)) cur.delete(value);
      else cur.add(value);
      return { ...p, [key]: [...cur] };
    });

  const allItems = useMemo(() => (data ? data.flatMap((d) => d.items) : []), [data]);
  const pool = useMemo(
    () =>
      allItems.filter((it) => {
        if (!prefs.sets.includes(it.set) || !prefs.types.includes(it.type)) return false;
        const st = stats[it.id];
        if (prefs.scope === 'wrong') return st && !st.last;
        if (prefs.scope === 'new') return !st;
        return true;
      }),
    [allItems, prefs],
  );

  const answered = allItems.filter((it) => stats[it.id]).length;
  const wrongNow = allItems.filter((it) => stats[it.id] && !stats[it.id].last).length;

  const start = (override = {}) => {
    const p = { ...prefs, ...override };
    const q = new URLSearchParams({
      sets: p.sets.join(','),
      types: p.types.join(','),
      n: p.n,
      scope: p.scope,
      mode: p.mode,
      shuffle: p.shuffle ? '1' : '0',
      t: String(Date.now() % 100000),
    });
    location.hash = '#/quiz/play?' + q.toString();
  };

  if (!sets.length) {
    return html`<${Layout} route=${route} title=${manifest.config.title}>
      <h1>이론 퀴즈</h1><p class="muted">아직 퀴즈 데이터가 없습니다.</p>
    <//>`;
  }

  return html`<${Layout} route=${route} title=${manifest.config.title}>
    <section class="hero quiz-hero">
      <div>
        <h1>이론 퀴즈</h1>
        <p class="lead">중간고사 유형(객관식 · O/X · 단답형 · 출력 예측 · 코드 빈칸 · 서술형)으로 1~7주차 이론을 점검합니다. 출력 예측과 코드 빈칸의 정답은 시험장과 같은 Python 3.6으로 실행해 만들었습니다.</p>
      </div>
      <div class="hero-stats">
        <div class="stat"><b>${answered} / ${allItems.length || '…'}</b><span>푼 문항</span></div>
        <div class="stat"><b>${wrongNow}</b><span>오답 노트</span></div>
      </div>
    </section>

    ${error ? html`<p class="bad">퀴즈를 불러오지 못했습니다: ${error}</p>` : null}

    <section class="quiz-setup">
      <h2>주차 <small class="muted">(여러 개 선택 가능)</small></h2>
      <div class="chip-row">
        <button type="button" class="chip ghost" onClick=${() => update({ sets: sets.map((s) => s.id) })}>전체 선택</button>
        <button type="button" class="chip ghost" onClick=${() => update({ sets: [] })}>모두 해제</button>
      </div>
      <div class="quiz-set-grid">
        ${sets.map((s) => {
          const items = data ? data.find((d) => d.set.id === s.id)?.items || [] : [];
          const done = items.filter((it) => stats[it.id]).length;
          const ok = items.filter((it) => stats[it.id] && stats[it.id].last).length;
          const on = prefs.sets.includes(s.id);
          return html`<label class=${'quiz-set ' + (on ? 'on' : '')}>
            <input type="checkbox" checked=${on} onChange=${() => toggle('sets', s.id)} />
            <div>
              <div class="unit-head"><span class="badge">${s.short}</span><b>${s.title}</b></div>
              <p class="muted small">${s.summary}</p>
              <div class="bar" title=${`맞힘 ${ok}, 푼 문항 ${done}, 전체 ${s.count}`}>
                <span class="ok" style=${`width:${(100 * ok) / s.count}%`}></span>
                <span class="tried" style=${`width:${(100 * (done - ok)) / s.count}%`}></span>
              </div>
              <span class="muted small">${s.count}문항 · 맞힘 ${ok} · 틀림 ${done - ok}</span>
            </div>
          </label>`;
        })}
      </div>

      <h2>문항 유형</h2>
      <div class="chip-row">
        ${TYPE_ORDER.map((t) => {
          const n = allItems.filter((it) => it.type === t && prefs.sets.includes(it.set)).length;
          const on = prefs.types.includes(t);
          return html`<button type="button" class=${'chip ' + (on ? 'on' : '')} aria-pressed=${on} onClick=${() => toggle('types', t)}>
            ${TYPE_LABEL[t]} <span class="muted">${data ? n : ''}</span>
          </button>`;
        })}
      </div>

      <div class="quiz-options">
        <label>문항 수
          <select value=${prefs.n} onChange=${(e) => update({ n: e.target.value })}>
            ${COUNTS.map((c) => html`<option value=${c}>${c === 'all' ? '전체' : c + '문항'}</option>`)}
          </select>
        </label>
        <label>범위
          <select value=${prefs.scope} onChange=${(e) => update({ scope: e.target.value })}>
            <option value="all">전체 문항</option>
            <option value="new">안 푼 문항만</option>
            <option value="wrong">틀린 문항만 (오답 노트)</option>
          </select>
        </label>
        <label>채점
          <select value=${prefs.mode} onChange=${(e) => update({ mode: e.target.value })}>
            <option value="instant">한 문항씩 바로 채점</option>
            <option value="exam">시험처럼 (끝나고 한꺼번에 채점)</option>
          </select>
        </label>
        <label class="check"><input type="checkbox" checked=${prefs.shuffle} onChange=${(e) => update({ shuffle: e.target.checked })} /> 순서 섞기</label>
      </div>

      <div class="cta">
        <button type="button" class="btn primary" disabled=${!data || pool.length === 0} onClick=${() => start()}>
          시작하기 ${data ? `(${prefs.n === 'all' ? pool.length : Math.min(pool.length, Number(prefs.n))}문항)` : ''}
        </button>
        ${wrongNow ? html`<button type="button" class="btn" onClick=${() => start({ sets: sets.map((s) => s.id), types: TYPE_ORDER.slice(), scope: 'wrong', n: 'all' })}>오답 노트 전체 풀기 (${wrongNow})</button>` : null}
      </div>
      ${data && pool.length === 0 ? html`<p class="muted">조건에 맞는 문항이 없습니다. 주차·유형·범위를 바꿔 보세요.</p>` : null}
    </section>

    <section class="tips">
      <h2>사용법</h2>
      <ul>
        <li>객관식은 숫자 키 <kbd>1</kbd>~<kbd>5</kbd>, O/X는 <kbd>O</kbd>·<kbd>X</kbd> 키, 다음 문항은 <kbd>Enter</kbd>로 넘어갑니다.</li>
        <li>출력 예측은 줄 끝 공백과 앞뒤 빈 줄을 무시하고 비교합니다. 오류가 나는 코드라면 오류 이름(예: <code>TypeError</code>)을 쓰세요.</li>
        <li>코드 빈칸은 공백을 무시하고 비교합니다 (<code>x%2==0</code>과 <code>x % 2 == 0</code>은 같은 답).</li>
        <li>서술형은 모범 답안과 채점 포인트를 보고 스스로 확인합니다.</li>
        <li>기록은 이 브라우저에만 저장됩니다. 틀린 문항은 '오답 노트'로 다시 풀 수 있습니다.</li>
      </ul>
    </section>
  <//>`;
}
