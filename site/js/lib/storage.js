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
  defaults: { fontSize: 15, termFontSize: 14, hideResults: false, showNumbar: true },
  get() {
    return { ...this.defaults, ...read('settings', {}) };
  },
  set(patch) {
    const next = { ...this.get(), ...patch };
    write('settings', next);
    return next;
  },
};

export const meta = {
  lastProblem: () => read('last', null),
  setLastProblem: (id) => write('last', id),
  disclaimerSeen: () => read('disclaimerSeen', false),
  setDisclaimerSeen: () => write('disclaimerSeen', true),
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
