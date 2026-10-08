// xterm.js 터미널 + 간단한 줄 입력기(에코·백스페이스·Enter·붙여넣기·Ctrl+C)
// elice Run 터미널처럼: 프롬프트 뒤에 입력한 글자가 보이고, Enter를 누르면 줄이 바뀐다.
import { Terminal } from '../../vendor/xterm/xterm.mjs';
import { FitAddon } from '../../vendor/xterm/addon-fit.mjs';

const STATUS_COLOR = '\x1b[1;38;2;196;167;255m';
const ERR_COLOR = '\x1b[38;2;255;123;114m';
const RESET = '\x1b[0m';

function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

export class TermView {
  constructor(el, { fontSize = 14, onInterrupt } = {}) {
    this.term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize,
      fontFamily: 'D2Coding, "JetBrains Mono", Menlo, Consolas, "Apple SD Gothic Neo", "Malgun Gothic", monospace',
      lineHeight: 1.25,
      scrollback: 5000,
      theme: { background: '#1e1f24', foreground: '#e6e6e6', cursor: '#e6e6e6', selectionBackground: '#45475a' },
    });
    this.fit = new FitAddon();
    this.term.loadAddon(this.fit);
    this.term.open(el);
    this.resizeObserver = new ResizeObserver(() => this.refit());
    this.resizeObserver.observe(el);
    this.refit();
    this.onInterrupt = onInterrupt;
    this.accepting = false; // 프로그램 실행 중(입력을 받을 수 있는 상태)
    this.resolver = null; // 지금 입력을 기다리는 readLine
    this.buf = ''; // 입력 중인 줄
    this.pending = []; // 미리 입력된(붙여넣은) 줄들
    this.term.onData((d) => this._onData(d));
  }

  refit() {
    try {
      this.fit.fit();
    } catch {
      /* 숨겨진 상태 */
    }
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.term.dispose();
  }

  reset() {
    this.term.reset();
    this.buf = '';
    this.pending = [];
  }

  write(text, stream = 'out') {
    if (!text) return;
    this.term.write(stream === 'err' ? ERR_COLOR + text + RESET : text);
  }

  status(message) {
    this.term.write(`${STATUS_COLOR}${message}${RESET}\r\n`);
  }

  /** 실행 시작/종료 (실행 중에만 키 입력을 받는다) */
  setAccepting(on) {
    this.accepting = on;
    if (!on) {
      this.buf = '';
      this.pending = [];
    }
  }

  /** 예시 입력을 미리 넣어 둔다 (입력 요청이 오면 차례로 사용) */
  queueInput(lines) {
    this.pending.push(...lines);
  }

  readLine() {
    if (this.pending.length) {
      const line = this.pending.shift();
      this.term.write(line + '\r\n');
      return Promise.resolve(line);
    }
    this.term.focus();
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  cancelInput() {
    const r = this.resolver;
    this.resolver = null;
    this.buf = '';
    r?.(null);
  }

  focus() {
    this.term.focus();
  }

  _onData(data) {
    if (data === '\x03') {
      this.onInterrupt?.();
      return;
    }
    if (!this.accepting || data.startsWith('\x1b')) return; // 화살표 등 제어 키는 무시
    const parts = data.replace(/\r\n?|\n/g, '\r').split('\r');
    parts.forEach((part, i) => {
      if (i > 0) this._commit();
      for (const ch of part) {
        if (ch === '\x7f' || ch === '\b') this._backspace();
        else if (ch >= ' ' || ch === '\t') {
          this.buf += ch;
          this.term.write(ch);
        }
      }
    });
  }

  _backspace() {
    if (!this.buf) return;
    const chars = [...this.buf];
    const last = chars.pop();
    this.buf = chars.join('');
    const w = isWide(last.codePointAt(0)) ? 2 : 1;
    this.term.write('\b'.repeat(w) + ' '.repeat(w) + '\b'.repeat(w));
  }

  _commit() {
    const line = this.buf;
    this.buf = '';
    this.term.write('\r\n');
    const r = this.resolver;
    this.resolver = null;
    if (r) r(line);
    else this.pending.push(line); // 프로그램이 아직 입력을 요청하지 않았으면 미리 입력으로 보관
  }
}
