import { html, useEffect, useMemo, useRef, useState } from '../lib/ui.js';
import { quizStats } from '../lib/storage.js';
import { md } from '../lib/markdown.js';
import { loadAllQuizzes, grade, isEmpty, filledCode, shuffle, normOutput, squeeze, TYPE_LABEL, TYPE_ORDER, CIRCLED, BLANK } from '../lib/quiz.js';
import { Layout } from '../components/Layout.js';

const DEFAULT_PROMPT = {
  predict: '다음 코드의 **실행 결과**를 쓰시오. 실행 중 오류가 나면 오류 이름(예: `TypeError`)을 쓰시오.',
  blank: '빈칸 `_____`에 알맞은 코드를 쓰시오.',
};

function pickItems(all, query, stats) {
  const ids = (query.get('ids') || '').split(',').filter(Boolean);
  if (ids.length) {
    const byId = Object.fromEntries(all.map((it) => [it.id, it]));
    return ids.map((id) => byId[id]).filter(Boolean);
  }
  const sets = (query.get('sets') || '').split(',').filter(Boolean);
  const types = (query.get('types') || TYPE_ORDER.join(',')).split(',').filter(Boolean);
  const scope = query.get('scope') || 'all';
  let items = all.filter((it) => (!sets.length || sets.includes(it.set)) && types.includes(it.type));
  if (scope === 'wrong') items = items.filter((it) => stats[it.id] && !stats[it.id].last);
  if (scope === 'new') items = items.filter((it) => !stats[it.id]);
  if (query.get('shuffle') !== '0') items = shuffle(items);
  const n = query.get('n') || '20';
  return n === 'all' ? items : items.slice(0, Number(n) || 20);
}

function Markdown({ text, cls = 'md' }) {
  return html`<div class=${cls} dangerouslySetInnerHTML=${{ __html: md(text) }}></div>`;
}

function Code({ code }) {
  return html`<pre class="quiz-code"><code>${code}</code></pre>`;
}

function BlankCode({ item, value, onChange, locked, verdicts, onEnter }) {
  const parts = item.code.split(BLANK);
  const first = useRef(null);
  useEffect(() => {
    if (!locked && first.current) first.current.focus();
  }, [item.id]);
  return html`<pre class="quiz-code blank-code"><code>${parts.map((part, i) => html`${part}${
    i < parts.length - 1
      ? html`<input
          ref=${i === 0 ? first : null}
          class=${'blank-input ' + (verdicts ? (verdicts[i] ? 'ok' : 'bad') : '')}
          value=${value[i] || ''}
          size=${Math.max(4, (value[i] || '').length + 1)}
          disabled=${locked}
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          aria-label=${`빈칸 ${i + 1}`}
          onInput=${(e) => onChange(i, e.target.value)}
          onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
        />`
      : null
  }`)}</code></pre>`;
}

function blankVerdicts(item, response) {
  return item.secret.answer.map((accepted, i) => {
    const g = squeeze(response?.[i] || '');
    return g !== '' && accepted.some((a) => squeeze(a) === g);
  });
}

/** 정답·해설 (답한 뒤, 또는 결과 화면에서) */
function Reveal({ item, response, correct }) {
  const sec = item.secret;
  let answer = null;
  if (item.type === 'mc') {
    answer = html`<p><b>정답: ${CIRCLED[sec.answer - 1]}</b> ${item.choices[sec.answer - 1]}</p>`;
  } else if (item.type === 'ox') {
    answer = html`<p><b>정답: ${sec.answer}</b></p>`;
  } else if (item.type === 'short') {
    answer = html`<p><b>정답: <code>${sec.answer[0]}</code></b>${sec.answer.length > 1 ? html` <span class="muted">(인정: ${sec.answer.slice(1).join(', ')})</span>` : null}</p>`;
  } else if (item.type === 'predict') {
    answer = sec.error
      ? html`<p><b>정답: 오류 <code>${sec.answer}</code></b> — 이 코드는 실행 중 오류가 납니다.</p>`
      : html`<div class="io-pair">
          <div><h4>실행 결과 (정답)</h4><pre class="quiz-out">${sec.answer}</pre></div>
          ${correct === false && response != null ? html`<div><h4>내 답</h4><pre class="quiz-out mine">${normOutput(response) || ' '}</pre></div>` : null}
        </div>`;
  } else if (item.type === 'blank') {
    answer = html`<div>
      <p><b>정답:</b> ${sec.answer.map((alts, i) => html`<span class="blank-ans">(${i + 1}) <code>${alts[0]}</code>${alts.length > 1 ? html` <span class="muted">또는 ${alts.slice(1).map((a) => html`<code>${a}</code> `)}</span>` : null}</span>`)}</p>
      <div class="io-pair">
        <div><h4>완성된 코드</h4><pre class="quiz-code">${filledCode(item)}</pre></div>
        <div><h4>실행 결과${item.stdin ? ' (입력: ' + item.stdin.trim().split('\n').join(', ') + ')' : ''}</h4><pre class="quiz-out">${sec.output || '(출력 없음)'}</pre></div>
      </div>
    </div>`;
  } else if (item.type === 'essay') {
    answer = html`<div class="essay-answer">
      <h4>모범 답안</h4>
      <${Markdown} text=${sec.answer} />
      ${sec.points && sec.points.length ? html`<h4>채점 포인트</h4><ul class="points">${sec.points.map((p) => html`<li>${p}</li>`)}</ul>` : null}
    </div>`;
  }
  return html`<div class="reveal">
    ${answer}
    ${sec.explanation ? html`<div class="explain"><h4>해설</h4><${Markdown} text=${sec.explanation} /></div>` : null}
  </div>`;
}

function Question({ item, response, setResponse, locked, onSubmit, verdict }) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (!locked && inputRef.current) inputRef.current.focus();
  }, [item.id, locked]);
  const prompt = item.prompt || DEFAULT_PROMPT[item.type] || '';
  const showVerdict = verdict === true || verdict === false;

  let body = null;
  if (item.type === 'mc') {
    body = html`<ol class="choices">
      ${item.choices.map((c, i) => {
        const n = i + 1;
        let cls = 'choice';
        if (response === n) cls += ' picked';
        if (showVerdict && n === item.secret.answer) cls += ' right';
        if (showVerdict && response === n && n !== item.secret.answer) cls += ' wrong';
        return html`<li><button type="button" class=${cls} disabled=${locked} onClick=${() => setResponse(n)}>
          <span class="num">${CIRCLED[i]}</span><span class="md inline" dangerouslySetInnerHTML=${{ __html: md(c) }}></span>
        </button></li>`;
      })}
    </ol>`;
  } else if (item.type === 'ox') {
    body = html`<div class="ox-row">
      ${['O', 'X'].map((v) => {
        let cls = 'ox-btn';
        if (response === v) cls += ' picked';
        if (showVerdict && v === item.secret.answer) cls += ' right';
        if (showVerdict && response === v && v !== item.secret.answer) cls += ' wrong';
        return html`<button type="button" class=${cls} disabled=${locked} onClick=${() => setResponse(v, true)}>${v}</button>`;
      })}
    </div>`;
  } else if (item.type === 'short') {
    body = html`<input ref=${inputRef} class=${'short-input ' + (showVerdict ? (verdict ? 'ok' : 'bad') : '')} value=${response || ''} disabled=${locked}
      placeholder="답을 입력하고 Enter" spellcheck="false" autocapitalize="off" autocomplete="off"
      onInput=${(e) => setResponse(e.target.value)}
      onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(); } }} />`;
  } else if (item.type === 'predict') {
    body = html`<div>
      <${Code} code=${item.code} />
      <textarea ref=${inputRef} class=${'predict-input ' + (showVerdict ? (verdict ? 'ok' : 'bad') : '')} rows="4" value=${response || ''} disabled=${locked}
        placeholder="실행 결과를 쓰세요 (여러 줄 가능, Ctrl+Enter로 제출)" spellcheck="false" autocapitalize="off"
        onInput=${(e) => setResponse(e.target.value)}
        onKeyDown=${(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmit(); } }}></textarea>
    </div>`;
  } else if (item.type === 'blank') {
    const value = Array.isArray(response) ? response : [];
    body = html`<${BlankCode} item=${item} value=${value} locked=${locked}
      verdicts=${showVerdict ? blankVerdicts(item, value) : null}
      onEnter=${onSubmit}
      onChange=${(i, v) => { const next = value.slice(); next[i] = v; setResponse(next); }} />`;
  } else if (item.type === 'essay') {
    body = html`<textarea ref=${inputRef} class="essay-input" rows="5" value=${response || ''} disabled=${locked}
      placeholder="답안을 직접 써 본 뒤 '모범 답안 보기'를 누르세요 (쓰지 않아도 됩니다)"
      onInput=${(e) => setResponse(e.target.value)}></textarea>`;
  }

  return html`<div class="quiz-q">
    <${Markdown} text=${prompt} cls="md quiz-prompt" />
    ${body}
  </div>`;
}

export function QuizPlay({ manifest, route, query }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [idx, setIdx] = useState(0);
  const [responses, setResponses] = useState({});
  const respRef = useRef({}); // 키를 빠르게 연달아 눌러도 최신 응답을 읽도록
  const revealedRef = useRef({}); // 같은 문항을 두 번 채점하지 않도록
  const [results, setResults] = useState({}); // id → true/false (서술형은 스스로 판단)
  const [revealed, setRevealed] = useState({}); // id → 정답 공개 여부
  const [done, setDone] = useState(false);
  const mode = query.get('mode') === 'exam' ? 'exam' : 'instant';
  const setLabel = useMemo(() => Object.fromEntries((manifest.quizzes || []).map((s) => [s.id, s.short])), [manifest]);

  useEffect(() => {
    const stats = quizStats.all();
    loadAllQuizzes(manifest).then(
      (sets) => setItems(pickItems(sets.flatMap((s) => s.items), query, stats)),
      (e) => setError(String(e.message || e)),
    );
  }, []);

  const item = items ? items[idx] : null;
  const response = item ? responses[item.id] : undefined;
  const isRevealed = item ? !!revealed[item.id] : false;

  const setResponse = (v, autoSubmit = false) => {
    if (!item || isRevealed) return;
    respRef.current = { ...respRef.current, [item.id]: v };
    setResponses(respRef.current);
    if (autoSubmit && mode === 'instant' && item.type === 'ox') submitWith(v);
  };

  const record = (it, correct) => {
    quizStats.record(it.id, correct);
    setResults((r) => ({ ...r, [it.id]: correct }));
  };

  const submitWith = (resp) => {
    if (!item) return;
    if (item.type === 'essay') {
      revealedRef.current[item.id] = true;
      setRevealed((r) => ({ ...r, [item.id]: true }));
      return;
    }
    if (isEmpty(item, resp)) return;
    if (mode === 'instant') {
      if (revealedRef.current[item.id]) return;
      revealedRef.current[item.id] = true;
      record(item, grade(item, resp));
      setRevealed((r) => ({ ...r, [item.id]: true }));
    } else {
      next();
    }
  };
  const submit = () => submitWith(respRef.current[item?.id]);

  const finishExam = () => {
    const res = {};
    const rev = {};
    for (const it of items) {
      rev[it.id] = true;
      if (it.type === 'essay') continue;
      const resp = respRef.current[it.id];
      const ok = isEmpty(it, resp) ? false : grade(it, resp);
      res[it.id] = ok;
      quizStats.record(it.id, ok);
    }
    setResults(res);
    setRevealed(rev);
    setDone(true);
  };

  const next = () => {
    if (idx + 1 < items.length) setIdx(idx + 1);
    else if (mode === 'exam') finishExam();
    else setDone(true);
  };
  const prev = () => idx > 0 && setIdx(idx - 1);

  // 키보드: 1~6 보기 선택, O/X, Enter 제출·다음 (한 번만 등록하고 최신 상태는 ref로 읽는다)
  const live = useRef(null);
  live.current = { item, done, isRevealed, results, mode, setResponse, submit, next };
  useEffect(() => {
    const onKey = (e) => {
      const { item, done, results, mode, setResponse, submit, next } = live.current;
      if (!item || done) return;
      const isRevealed = !!revealedRef.current[item.id];
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (item.type === 'mc' && !isRevealed && /^[1-6]$/.test(e.key) && Number(e.key) <= item.choices.length) {
        setResponse(Number(e.key));
      } else if (item.type === 'ox' && !isRevealed && /^[oOxX]$/.test(e.key)) {
        setResponse(e.key.toUpperCase(), true);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (isRevealed && (item.type !== 'essay' || results[item.id] !== undefined || mode === 'exam')) next();
        else submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const header = (body) => html`<${Layout} route=${route} title=${manifest.config.title}>${body}<//>`;

  if (error) return header(html`<p class="bad">퀴즈를 불러오지 못했습니다: ${error}</p>`);
  if (!items) return header(html`<p class="muted">퀴즈를 불러오는 중…</p>`);
  if (!items.length) {
    return header(html`<div class="quiz-empty">
      <h1>풀 문항이 없습니다</h1>
      <p class="muted">조건에 맞는 문항이 없어요. 오답 노트라면 틀린 문항이 없다는 뜻입니다 👍</p>
      <a class="btn primary" href="#/quiz">퀴즈 홈으로</a>
    </div>`);
  }

  if (done) return header(html`<${Summary} items=${items} responses=${responses} results=${results} setLabel=${setLabel} query=${query}
    onSelfGrade=${(it, ok) => record(it, ok)} />`);

  const graded = results[item.id];
  const answeredCount = mode === 'instant' ? Object.keys(results).length : Object.keys(responses).length;
  const correctCount = Object.values(results).filter((v) => v === true).length;

  return header(html`<div class="quiz-play">
    <div class="quiz-top">
      <a href="#/quiz" class="muted">← 퀴즈 홈</a>
      <span class="quiz-progress-text">${idx + 1} / ${items.length}</span>
      ${mode === 'instant' ? html`<span class="muted">맞힘 ${correctCount} / ${answeredCount}</span>` : html`<span class="badge alt">시험처럼</span>`}
    </div>
    <div class="quiz-progress"><span style=${`width:${(100 * (idx + (isRevealed ? 1 : 0))) / items.length}%`}></span></div>

    <article class="quiz-card">
      <div class="quiz-meta">
        <span class="badge">${setLabel[item.set] || item.set}</span>
        <span class="badge alt">${TYPE_LABEL[item.type]}</span>
        ${item.difficulty > 1 ? html`<span class="stars" title=${'난이도 ' + item.difficulty + '/3'}>${'★'.repeat(item.difficulty)}</span>` : null}
        <span class="muted small qid">${item.id}</span>
      </div>

      <${Question} item=${item} response=${response} setResponse=${setResponse} locked=${isRevealed} onSubmit=${submit}
        verdict=${mode === 'instant' && isRevealed ? graded : undefined} />

      ${mode === 'instant' && isRevealed && item.type !== 'essay'
        ? html`<div class=${'verdict-banner ' + (graded ? 'ok' : 'bad')}>${graded ? '✓ 정답입니다' : '✗ 오답입니다'}</div>`
        : null}
      ${isRevealed && mode === 'instant' ? html`<${Reveal} item=${item} response=${response} correct=${graded} />` : null}

      <div class="quiz-actions">
        ${mode === 'exam' && idx > 0 ? html`<button type="button" class="btn" onClick=${prev}>← 이전</button>` : null}
        ${!isRevealed && item.type !== 'essay' && mode === 'instant'
          ? html`<button type="button" class="btn primary" disabled=${isEmpty(item, response)} onClick=${submit}>확인</button>`
          : null}
        ${!isRevealed && item.type !== 'essay' && mode === 'exam'
          ? html`<button type="button" class="btn primary" onClick=${next}>${idx + 1 < items.length ? (isEmpty(item, response) ? '건너뛰기 →' : '다음 →') : '제출하고 채점'}</button>`
          : null}
        ${!isRevealed && item.type === 'essay' && mode === 'instant'
          ? html`<button type="button" class="btn primary" onClick=${submit}>모범 답안 보기</button>`
          : null}
        ${!isRevealed && item.type === 'essay' && mode === 'exam'
          ? html`<button type="button" class="btn primary" onClick=${next}>${idx + 1 < items.length ? '다음 →' : '제출하고 채점'}</button>`
          : null}
        ${isRevealed && item.type === 'essay' && graded === undefined
          ? html`<span class="self-grade">스스로 채점:
              <button type="button" class="btn ok" onClick=${() => record(item, true)}>맞았어요</button>
              <button type="button" class="btn danger" onClick=${() => record(item, false)}>부족해요</button>
            </span>`
          : null}
        ${isRevealed && (item.type !== 'essay' || graded !== undefined)
          ? html`<button type="button" class="btn primary" onClick=${next}>${idx + 1 < items.length ? '다음 문항 →' : '결과 보기'}</button>`
          : null}
        ${mode === 'exam' ? html`<button type="button" class="btn ghost-right" onClick=${finishExam}>지금 채점하기</button>` : null}
      </div>
    </article>
  </div>`);
}

function Summary({ items, responses, results, setLabel, query, onSelfGrade }) {
  const [open, setOpen] = useState(() => new Set());
  const gradable = items.filter((it) => results[it.id] === true || results[it.id] === false);
  const correct = gradable.filter((it) => results[it.id]).length;
  const wrong = items.filter((it) => results[it.id] === false);
  const pct = gradable.length ? Math.round((100 * correct) / gradable.length) : 0;
  const byType = TYPE_ORDER.map((t) => {
    const its = gradable.filter((it) => it.type === t);
    return { t, n: its.length, ok: its.filter((it) => results[it.id]).length };
  }).filter((r) => r.n);
  const retryQuery = new URLSearchParams(query);
  retryQuery.set('t', String(Date.now() % 100000));
  const toggle = (id) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return html`<div class="quiz-summary">
    <h1>결과</h1>
    <div class="hero summary-hero">
      <div>
        <div class=${'big-score ' + (pct >= 80 ? 'ok' : pct >= 50 ? 'mid' : 'bad')}>${correct} / ${gradable.length} <small>(${pct}점)</small></div>
        <p class="muted">${items.length - gradable.length > 0 ? `서술형 ${items.length - gradable.length}문항은 스스로 채점하지 않아 점수에서 뺐습니다.` : ''}</p>
        <div class="cta">
          ${wrong.length ? html`<a class="btn primary" href=${'#/quiz/play?mode=instant&ids=' + wrong.map((it) => it.id).join(',')}>틀린 ${wrong.length}문항 다시 풀기</a>` : null}
          <a class="btn" href=${'#/quiz/play?' + retryQuery.toString()}>같은 조건으로 새로 풀기</a>
          <a class="btn" href="#/quiz">퀴즈 홈</a>
        </div>
      </div>
      <table class="type-table">
        <thead><tr><th>유형</th><th>맞힘</th></tr></thead>
        <tbody>${byType.map((r) => html`<tr><td>${TYPE_LABEL[r.t]}</td><td>${r.ok} / ${r.n}</td></tr>`)}</tbody>
      </table>
    </div>

    <h2>문항별 확인</h2>
    <ol class="review-list">
      ${items.map((it) => {
        const r = results[it.id];
        const mark = r === true ? '✓' : r === false ? '✗' : '–';
        const first = (it.prompt || it.code || '').split('\n').find((l) => l.trim()) || it.id;
        return html`<li class=${'review ' + (r === true ? 'ok' : r === false ? 'bad' : '')}>
          <button type="button" class="review-head" onClick=${() => toggle(it.id)}>
            <span class="mark">${mark}</span>
            <span class="badge">${setLabel[it.set] || it.set}</span>
            <span class="badge alt">${TYPE_LABEL[it.type]}</span>
            <span class="review-title">${first.replace(/[#*`>]/g, '').slice(0, 80)}</span>
          </button>
          ${open.has(it.id)
            ? html`<div class="review-body">
                <${Question} item=${it} response=${responses[it.id]} setResponse=${() => {}} locked=${true} onSubmit=${() => {}} verdict=${r} />
                <${Reveal} item=${it} response=${responses[it.id]} correct=${r} />
                ${it.type === 'essay' && r === undefined
                  ? html`<p class="self-grade">스스로 채점:
                      <button type="button" class="btn ok" onClick=${() => onSelfGrade(it, true)}>맞았어요</button>
                      <button type="button" class="btn danger" onClick=${() => onSelfGrade(it, false)}>부족해요</button></p>`
                  : null}
              </div>`
            : null}
        </li>`;
      })}
    </ol>
  </div>`;
}
