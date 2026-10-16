import { html, useEffect, useRef, useState } from '../lib/ui.js';
import { Layout } from '../components/Layout.js';
import { inCourse } from '../lib/course.js';
import { loadNote } from '../lib/data.js';
import { md, addCopyButtons } from '../lib/markdown.js';
import { quizStats } from '../lib/storage.js';
import { TYPE_ORDER } from '../lib/quiz.js';

function quizHref(setId, scope) {
  const q = new URLSearchParams({
    sets: setId,
    types: TYPE_ORDER.join(','),
    n: scope === 'wrong' ? 'all' : '20',
    scope,
    mode: 'instant',
    shuffle: '1',
    t: String(Date.now() % 100000),
  });
  return '#/quiz/play?' + q.toString();
}

/** 요약 노트 목록 (#/notes) */
export function NotesHome({ manifest, route }) {
  const notes = (manifest.notes || []).filter(inCourse);
  return html`<${Layout} route=${route} title=${manifest.config.title}>
    <h1>요약 노트</h1>
    <p class="lead">시험 직전에 훑어보는 주차별 핵심 정리와 자주 틀리는 함정 모음입니다. 노트 끝에서 그 주차의 이론 퀴즈와 코딩 문제로 바로 이동할 수 있습니다.</p>
    ${notes.length === 0
      ? html`<p class="muted">이 과목에는 아직 요약 노트가 없습니다. 위의 과목 선택을 바꿔 보세요.</p>`
      : html`<div class="unit-grid note-grid">
          ${notes.map(
            (n) => html`<a class="unit-card note-card" href=${'#/notes/' + n.id}>
              <div class="unit-head"><span class="badge">${n.short}</span><h3>${n.title}</h3></div>
              ${n.summary ? html`<p class="muted">${n.summary}</p>` : null}
            </a>`,
          )}
        </div>`}
  <//>`;
}

/** 요약 노트 한 편 (#/notes/:id) */
export function NoteView({ id, manifest, route }) {
  const all = manifest.notes || [];
  const entry = all.find((n) => n.id === id);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (entry) loadNote(entry).then(setNote, (e) => setError(String(e.message || e)));
  }, [entry && entry.file]);
  useEffect(() => addCopyButtons(bodyRef.current), [note]);

  if (!entry) {
    return html`<${Layout} route=${route} title=${manifest.config.title}>
      <h1>노트를 찾을 수 없습니다</h1>
      <p><a href="#/notes">요약 노트 목록으로</a></p>
    <//>`;
  }

  const list = all.filter((n) => n.course === entry.course);
  const i = list.findIndex((n) => n.id === id);
  const prev = list[i - 1];
  const next = list[i + 1];
  const quiz = entry.quiz && (manifest.quizzes || []).find((q) => q.id === entry.quiz);
  const stats = quizStats.all();
  const wrong = quiz ? Object.keys(stats).filter((k) => k.startsWith(quiz.id + '-') && !stats[k].last).length : 0;
  const units = entry.units.map((u) => manifest.unitById[u]).filter((u) => u && u.count);

  return html`<${Layout} route=${route} title=${manifest.config.title}>
    <article class="study-note">
      <p class="note-crumbs"><a href="#/notes">요약 노트</a> / ${entry.short}</p>
      <h1><span class="badge">${entry.short}</span> ${entry.title}</h1>
      ${error
        ? html`<p class="muted">노트를 불러오지 못했습니다: ${error}</p>`
        : note
          ? html`<div class="md note-body" ref=${bodyRef} dangerouslySetInnerHTML=${{ __html: md(note.body) }}></div>`
          : html`<p class="muted">불러오는 중…</p>`}
      ${quiz || units.length
        ? html`<section class="note-actions">
            <h2>바로 연습하기</h2>
            <div class="cta">
              ${quiz ? html`<a class="btn primary" href=${quizHref(quiz.id, 'all')}>${quiz.short} 이론 퀴즈 (${Math.min(20, quiz.count)}문항 무작위)</a>` : null}
              ${wrong ? html`<a class="btn" href=${quizHref(quiz.id, 'wrong')}>틀린 퀴즈 ${wrong}문항 다시 풀기</a>` : null}
              ${units.map((u) => html`<a class="btn" href=${'#/problems?unit=' + u.id}>${u.short} 코딩 문제 ${u.count}개</a>`)}
            </div>
          </section>`
        : null}
      <nav class="note-pager">
        ${prev ? html`<a href=${'#/notes/' + prev.id}>← ${prev.short} ${prev.title}</a>` : html`<span></span>`}
        ${next ? html`<a href=${'#/notes/' + next.id}>${next.short} ${next.title} →</a>` : null}
      </nav>
    </article>
  <//>`;
}
