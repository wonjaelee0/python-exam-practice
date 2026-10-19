import { html } from '../lib/ui.js';

/**
 * 드래그로 크기를 바꾸는 경계선.
 *  dir 'x': 세로 막대(좌우로 끌기), 'y': 가로 막대(위아래로 끌기)
 *  onDrag(clientX, clientY): 끄는 동안 계속 호출, onEnd(): 놓았을 때, onReset(): 두 번 클릭
 */
export function Splitter({ dir = 'x', onDrag, onEnd, onReset, title, className = '' }) {
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    el.classList.add('dragging');
    document.body.classList.add('resizing-' + dir);
    const move = (ev) => onDrag(ev.clientX, ev.clientY);
    const up = () => {
      el.classList.remove('dragging');
      document.body.classList.remove('resizing-' + dir);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      onEnd?.();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return html`<div class=${`splitter splitter-${dir} ${className}`} role="separator"
    aria-orientation=${dir === 'x' ? 'vertical' : 'horizontal'}
    title=${title || '끌어서 크기 조절 · 두 번 클릭하면 처음 크기'}
    onPointerDown=${onPointerDown} onDblClick=${onReset}></div>`;
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
