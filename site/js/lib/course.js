// 과목(컴퓨팅 기초 / 컴퓨팅 핵심) 선택 — 브라우저에 저장하고, 바뀌면 화면 전체를 다시 그린다
import { meta } from './storage.js';

let manifestRef = null;

export function initCourses(manifest) {
  manifestRef = manifest;
}

/** 문제나 퀴즈가 하나라도 있는 과목만 (빈 과목은 선택지에 보이지 않게) */
export function courses() {
  if (!manifestRef) return [];
  const def = manifestRef.config.defaultCourse || 'basic';
  const has = new Set([
    ...manifestRef.units.filter((u) => u.count > 0).map((u) => u.course || def),
    ...(manifestRef.quizzes || []).map((q) => q.course || def),
  ]);
  return (manifestRef.courses || []).filter((c) => has.has(c.id));
}

export function currentCourse() {
  const list = courses();
  const saved = meta.course();
  if (list.some((c) => c.id === saved)) return saved;
  return (manifestRef && manifestRef.config.defaultCourse) || (list[0] && list[0].id) || 'basic';
}

export function courseInfo(id = currentCourse()) {
  return courses().find((c) => c.id === id) || { id, title: id, examDate: null, examLabel: '시험' };
}

export function setCourse(id) {
  meta.setCourse(id);
  window.dispatchEvent(new CustomEvent('pyexam:course', { detail: id }));
}

/** 단원·퀴즈 세트가 지금 고른 과목에 속하는지 */
export function inCourse(obj) {
  return (obj.course || (manifestRef && manifestRef.config.defaultCourse) || 'basic') === currentCourse();
}
