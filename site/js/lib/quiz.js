// 이론 퀴즈: 문항 불러오기 + 채점
import { asset } from './paths.js';

export const TYPE_LABEL = { mc: '객관식', ox: 'O/X', short: '단답형', predict: '출력 예측', blank: '코드 빈칸', essay: '서술형' };
export const TYPE_ORDER = ['mc', 'ox', 'short', 'predict', 'blank', 'essay'];
export const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥'];
export const BLANK = '_____';

const cache = new Map();
const decodeB64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

/** 퀴즈 세트 하나를 불러온다. 정답·해설은 item.secret에 풀어 둔다 (화면에는 답한 뒤에만 보여 준다) */
export function loadQuizSet(entry) {
  if (!cache.has(entry.file)) {
    const p = fetch(asset('data/' + entry.file))
      .then((r) => {
        if (!r.ok) throw new Error(`${entry.file} (HTTP ${r.status})`);
        return r.json();
      })
      .then((data) => {
        for (const it of data.items) {
          it.secret = JSON.parse(decodeB64(it.enc));
          delete it.enc;
          it.set = data.set.id;
        }
        return data;
      });
    p.catch(() => cache.delete(entry.file));
    cache.set(entry.file, p);
  }
  return cache.get(entry.file);
}

export function loadAllQuizzes(manifest) {
  return Promise.all((manifest.quizzes || []).map(loadQuizSet));
}

/** 따옴표 밖의 공백을 모두 지운다 (코드 조각 비교용: `x%2==0`과 `x % 2 == 0`을 같게) */
export function squeeze(s) {
  let out = '';
  let q = null;
  for (const ch of String(s ?? '').trim()) {
    if (q) {
      out += ch;
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      out += ch;
    } else if (!/\s/.test(ch)) {
      out += ch;
    }
  }
  return out;
}

/** 출력 비교용: 줄 끝 공백과 앞뒤 빈 줄은 무시 */
export function normOutput(s) {
  return String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

function sameShort(item, given, accepted) {
  const norm = (v) => (item.ignoreCase ? squeeze(v).toLowerCase() : squeeze(v));
  const g = norm(given);
  return g !== '' && accepted.some((a) => norm(a) === g);
}

/** 채점: true / false, 서술형은 null(스스로 판단) */
export function grade(item, response) {
  const sec = item.secret;
  switch (item.type) {
    case 'mc':
      return response === sec.answer;
    case 'ox':
      return response === sec.answer;
    case 'short':
      return sameShort(item, response, sec.answer);
    case 'predict':
      if (sec.error) {
        const first = normOutput(response).split(/[\s:(]/)[0].toLowerCase();
        return first !== '' && first === String(sec.answer).toLowerCase();
      }
      return normOutput(response) !== '' && normOutput(response) === normOutput(sec.answer);
    case 'blank':
      return (
        Array.isArray(response) &&
        sec.answer.every((accepted, i) => {
          const g = squeeze(response[i]);
          return g !== '' && accepted.some((a) => squeeze(a) === g);
        })
      );
    default:
      return null;
  }
}

/** 응답이 비어 있는지 (빈 답은 제출하지 않게) */
export function isEmpty(item, response) {
  if (response == null) return true;
  if (item.type === 'blank') return !Array.isArray(response) || response.every((v) => !String(v || '').trim());
  if (item.type === 'mc') return typeof response !== 'number';
  return String(response).trim() === '';
}

/** 정답 코드(빈칸을 첫 번째 정답으로 채운 코드) */
export function filledCode(item) {
  const parts = item.code.split(BLANK);
  return parts.reduce((acc, part, i) => acc + (i === 0 ? '' : item.secret.answer[i - 1][0]) + part, '');
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
