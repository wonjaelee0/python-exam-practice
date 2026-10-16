import { html } from '../lib/ui.js';
import { progress, statusOf, meta } from '../lib/storage.js';
import { Layout } from '../components/Layout.js';
import { courseInfo, inCourse } from '../lib/course.js';

function daysUntil(dateStr) {
  const target = new Date(dateStr + 'T00:00:00+09:00');
  const now = new Date();
  return Math.ceil((target - now) / 86400000);
}

export function Home({ manifest, route }) {
  const prog = progress.all();
  const course = courseInfo();
  const units = manifest.units.filter((u) => u.count > 0 && inCourse(u));
  const unitIds = new Set(units.map((u) => u.id));
  const probs = manifest.problems.filter((p) => unitIds.has(p.unit));
  const last = meta.lastProblem();
  const lastMeta = last && manifest.byId[last] && unitIds.has(manifest.byId[last].unit) ? manifest.byId[last] : null;
  const d = course.examDate ? daysUntil(course.examDate) : null;
  const total = probs.length;
  const solved = probs.filter((p) => statusOf(prog[p.id]) === 'solved').length;
  const quizCount = (manifest.quizzes || []).filter(inCourse).reduce((n, q) => n + q.count, 0);
  const noteCount = (manifest.notes || []).filter(inCourse).length;

  const firstUnsolved = (unitId) =>
    manifest.problems.find((p) => p.unit === unitId && statusOf(prog[p.id]) !== 'solved') ||
    manifest.problems.find((p) => p.unit === unitId);

  return html`<${Layout} route=${route} title=${manifest.config.title}>
    <section class="hero">
      <div>
        <p class="course-kicker">${course.title}${course.subtitle ? ' · ' + course.subtitle : ''}</p>
        <h1>elice 시험처럼 연습하기</h1>
        <p class="lead">Run으로 직접 입력해 보고, Submit으로 숨은 테스트까지 채점받으세요. 채점은 elice와 같은 방식(Python 3.6 기준 출력, 공백까지 정확히 비교)으로 합니다.</p>
        <div class="cta">
          ${lastMeta ? html`<a class="btn primary" href=${'#/p/' + lastMeta.id}>이어서 풀기 · ${lastMeta.title}</a>` : null}
          <a class=${'btn ' + (lastMeta ? '' : 'primary')} href="#/problems">문제 목록</a>
          ${quizCount ? html`<a class="btn" href="#/quiz">이론 퀴즈 ${quizCount}문항 (객관식·O/X·단답형·출력 예측)</a>` : null}
          ${noteCount ? html`<a class="btn" href="#/notes">요약 노트 ${noteCount}편</a>` : null}
        </div>
      </div>
      <div class="hero-stats">
        ${d == null ? null : html`<div class="stat"><b>${d > 0 ? 'D-' + d : d === 0 ? 'D-DAY' : '시험 끝'}</b><span>${course.examLabel} ${course.examDate}</span></div>`}
        <div class="stat"><b>${solved} / ${total}</b><span>맞힌 문제</span></div>
      </div>
    </section>

    <section>
      <h2>단원별 진행</h2>
      <div class="unit-grid">
        ${units.length === 0 ? html`<p class="muted">이 과목에는 아직 문제가 없습니다.</p>` : null}
        ${units.map((u) => {
          const items = manifest.problems.filter((p) => p.unit === u.id);
          const ok = items.filter((p) => statusOf(prog[p.id]) === 'solved').length;
          const tried = items.filter((p) => statusOf(prog[p.id]) === 'tried').length;
          const next = firstUnsolved(u.id);
          return html`<article class="unit-card">
            <div class="unit-head"><span class="badge">${u.short}</span><h3>${u.title}</h3>${u.private ? html`<span class="badge private" title="git에 올라가지 않는 원본 — 이 컴퓨터의 로컬 사이트에서만 보입니다">🔒 로컬 전용</span>` : null}</div>
            <p class="muted">${u.summary}</p>
            <div class="bar" title=${`정답 ${ok}, 시도 ${tried}, 전체 ${u.count}`}>
              <span class="ok" style=${`width:${(100 * ok) / u.count}%`}></span>
              <span class="tried" style=${`width:${(100 * tried) / u.count}%`}></span>
            </div>
            <div class="unit-foot">
              <span class="muted">${ok} / ${u.count} 정답</span>
              <span>
                <a href=${'#/problems?unit=' + u.id}>목록</a>
                ${next ? html` · <a href=${'#/p/' + next.id}>풀기 →</a>` : null}
              </span>
            </div>
          </article>`;
        })}
      </div>
    </section>

    <section class="tips">
      <h2>시험 전에 꼭 기억하기</h2>
      <ul>
        <li><b>제출 규칙</b>: <code>:</code> 뒤 한 칸 공백 (<code>input("이름: ")</code>), <code>,</code> 뒤 한 칸 공백, 문장부호 앞 공백 없음, <code>random.seed(1)</code></li>
        <li><b>채점 출력</b>: <code>input("프롬프트: ")</code>의 프롬프트도 출력에 들어갑니다. 프롬프트 문구를 지문과 글자 하나까지 똑같이 쓰세요.</li>
        <li><b>Python 3.6</b>: 시험장은 Python 3.6입니다. <code>f"{x=}"</code>, f-string 안에 같은 따옴표, <code>:=</code>는 오류가 납니다. 이 사이트가 경고해 줍니다.</li>
        <li><b>결과 비공개</b>: 실제 시험은 어떤 테스트가 틀렸는지 알려 주지 않습니다. 설정의 <a href="#/settings">시험처럼 모드</a>로 연습해 보세요.</li>
      </ul>
    </section>
  <//>`;
}
