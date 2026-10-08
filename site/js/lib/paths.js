// 모든 경로는 사이트 루트(site/) 기준 상대경로로 만든다.
// GitHub Pages 프로젝트 사이트(/python-exam-practice/)든 로컬(/)이든 그대로 동작한다.
export const SITE_ROOT = new URL('../../', import.meta.url);
export const asset = (path) => new URL(path, SITE_ROOT).href;
