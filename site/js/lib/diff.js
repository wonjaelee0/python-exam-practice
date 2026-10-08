export const VERDICT = {
  PASS: { label: '통과', tone: 'ok' },
  TRAILING_WS: { label: '줄 끝 공백이 다름', tone: 'bad', tip: '줄 끝에 공백이 더 있거나 빠졌습니다. elice에서도 오답 처리될 수 있어요.' },
  WHITESPACE: { label: '공백·줄바꿈이 다름', tone: 'bad', tip: '글자는 같지만 공백이나 줄바꿈 위치가 다릅니다. print의 sep/end, ": " 공백을 확인하세요.' },
  CASE: { label: '대소문자가 다름', tone: 'bad', tip: '글자는 같지만 대문자/소문자가 다릅니다.' },
  WRONG: { label: '출력이 다름', tone: 'bad' },
  ERROR: { label: '실행 오류', tone: 'bad' },
  TIMEOUT: { label: '시간 초과', tone: 'bad', tip: '무한 반복이거나, 입력을 더 기다리고 있을 수 있어요.' },
  OUTPUT_LIMIT: { label: '출력이 너무 많음', tone: 'bad' },
};

const lines = (s) => (s || '').replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');

/** 줄 단위 비교 (기대/실제를 같은 줄 번호끼리 맞춘다) */
export function lineDiff(expected, actual) {
  const e = lines(expected);
  const a = lines(actual);
  const n = Math.max(e.length, a.length);
  const rows = [];
  for (let i = 0; i < n; i += 1) rows.push({ no: i + 1, exp: e[i], act: a[i], same: e[i] === a[i] });
  return rows;
}

/** 공백을 눈에 보이게: 공백 → ·, 탭 → → */
export function showSpaces(s) {
  return (s ?? '').replace(/ /g, '·').replace(/\t/g, '→');
}
