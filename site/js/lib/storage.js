// 브라우저(localStorage)에만 저장한다. 서버로 보내지 않는다.
// <id>.github.io의 모든 프로젝트 사이트가 같은 저장 공간(origin)을 쓰므로 모든 키에 접두어를 붙인다.
const NS = 'pyexam:v1:';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(NS + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('저장 실패', e);
    return false;
  }
}

function remove(key) {
  try {
    localStorage.removeItem(NS + key);
  } catch {
    /* 무시 */
  }
}

export const drafts = {
  get: (id) => read('draft:' + id, null),
  set: (id, code) => write('draft:' + id, { code, at: Date.now() }),
  clear: (id) => remove('draft:' + id),
};

export const progress = {
  all: () => read('progress', {}),
  get: (id) => read('progress', {})[id] || null,
  record(id, { score, passed, total }) {
    const all = read('progress', {});
    const prev = all[id] || { tries: 0, best: 0 };
    const now = Date.now();
    all[id] = {
      tries: prev.tries + 1,
      best: Math.max(prev.best, score),
      last: score,
      lastAt: now,
      passed,
      total,
      solvedAt: prev.solvedAt || (score === 100 ? now : null),
    };
    write('progress', all);
    return all[id];
  },
};

export function statusOf(p) {
  if (!p) return 'untried';
  return p.best === 100 ? 'solved' : 'tried';
}

export const settings = {
  defaults: {
    fontSize: 15, termFontSize: 14, hideResults: false, showNumbar: true,
    // 풀이 화면 배치: 문제 칸 너비(px, null이면 기본), 문제 숨기기, 터미널 높이(px), 문제 글자 크기, 공백 보기
    problemWidth: null, problemHidden: false, bottomHeight: null, problemFontSize: 15, showWhitespace: false,
  },
  get() {
    return { ...this.defaults, ...read('settings', {}) };
  },
  set(patch) {
    const next = { ...this.get(), ...patch };
    write('settings', next);
    return next;
  },
};

/** 이론 퀴즈 기록: { 문항id: { n: 푼 횟수, ok: 맞힌 횟수, last: 마지막 결과, at } } */
export const quizStats = {
  all: () => read('quiz', {}),
  record(id, correct) {
    const all = read('quiz', {});
    const prev = all[id] || { n: 0, ok: 0 };
    all[id] = { n: prev.n + 1, ok: prev.ok + (correct ? 1 : 0), last: !!correct, at: Date.now() };
    write('quiz', all);
  },
};

export const quizPrefs = {
  get: () => read('quizPrefs', null),
  set: (v) => write('quizPrefs', v),
};

export const meta = {
  lastProblem: () => read('last', null),
  setLastProblem: (id) => write('last', id),
  disclaimerSeen: () => read('disclaimerSeen', false),
  setDisclaimerSeen: () => write('disclaimerSeen', true),
  course: () => read('course', null),
  setCourse: (id) => write('course', id),
};

export function exportAll() {
  const data = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NS)) data[k.slice(NS.length)] = localStorage.getItem(k);
  }
  return { app: 'python-exam-practice', version: 1, exportedAt: new Date().toISOString(), data };
}

export function importAll(obj) {
  if (!obj || obj.app !== 'python-exam-practice' || typeof obj.data !== 'object') {
    throw new Error('이 사이트에서 내보낸 파일이 아닙니다');
  }
  let n = 0;
  for (const [k, v] of Object.entries(obj.data)) {
    localStorage.setItem(NS + k, v);
    n += 1;
  }
  return n;
}

export function resetAll() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NS)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
  return keys.length;
}

/** 자유 연습 IDE: 파일 목록 [{id, name, code, tests:[{stdin, expected}], traceInput}], 열린 파일, 화면 설정 */
export const ideStore = {
  files: () => read('ide:files', null),
  saveFiles: (files) => write('ide:files', files),
  active: () => read('ide:active', null),
  setActive: (id) => write('ide:active', id),
  prefs: () => ({ fontSize: 15, whitespace: false, wrap: false, bigPanel: false, ...read('ide:prefs', {}) }),
  setPrefs(patch) {
    const next = { ...this.prefs(), ...patch };
    write('ide:prefs', next);
    return next;
  },
  /** 다른 화면(풀이 화면 등)에서 IDE로 파일을 보낸다 */
  addFile(file) {
    const files = this.files() || [];
    const id = newFileId();
    files.push({ tests: [], traceInput: '', ...file, id, name: uniqueFileName(files, file.name) });
    this.saveFiles(files);
    this.setActive(id);
    return id;
  },
};

export function newFileId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 같은 이름이 있으면 abc_2.py, abc_3.py … */
export function uniqueFileName(files, name, exceptId) {
  let base = String(name || 'untitled.py').trim().replace(/[\\/]/g, '_') || 'untitled.py';
  if (!/\.py$/i.test(base)) base += '.py';
  const taken = new Set(files.filter((f) => f.id !== exceptId).map((f) => f.name));
  if (!taken.has(base)) return base;
  const stem = base.replace(/\.py$/i, '');
  for (let n = 2; ; n += 1) {
    const cand = `${stem}_${n}.py`;
    if (!taken.has(cand)) return cand;
  }
}
