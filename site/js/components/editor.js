// Monaco 에디터 (elice와 같은 에디터). 빌드 도구 없이 AMD 로더로 불러온다.
import { asset } from '../lib/paths.js';

let monacoPromise = null;

export function loadMonaco() {
  if (monacoPromise) return monacoPromise;
  monacoPromise = new Promise((resolve, reject) => {
    const base = asset('vendor/monaco/min/vs');
    const script = document.createElement('script');
    script.src = base + '/loader.js';
    script.onload = () => {
      window.require.config({ paths: { vs: base } });
      window.require(['vs/editor/editor.main'], () => {
        defineTheme(window.monaco);
        resolve(window.monaco);
      }, reject);
    };
    script.onerror = () => reject(new Error('Monaco 에디터를 불러오지 못했습니다'));
    document.head.appendChild(script);
  });
  monacoPromise.catch(() => {
    monacoPromise = null;
  });
  return monacoPromise;
}

function defineTheme(monaco) {
  monaco.editor.defineTheme('exam-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'c792ea', fontStyle: 'italic' },
      { token: 'string', foreground: 'a5d6a7' },
      { token: 'number', foreground: 'f78c6c' },
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#1e1f24',
      'editor.lineHighlightBackground': '#2a2b31',
      'editorLineNumber.foreground': '#5c6070',
      'editorLineNumber.activeForeground': '#c9ccd6',
      'editorGutter.background': '#1e1f24',
    },
  });
}

export function createEditor(monaco, el, { value, fontSize = 15, onChange, onRun, onSubmit }) {
  const editor = monaco.editor.create(el, {
    value,
    language: 'python',
    theme: 'exam-dark',
    automaticLayout: true,
    fontSize,
    fontFamily: 'D2Coding, "JetBrains Mono", Menlo, Consolas, "Apple SD Gothic Neo", "Malgun Gothic", monospace',
    tabSize: 4,
    insertSpaces: true,
    detectIndentation: false,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    renderWhitespace: 'selection',
    wordWrap: 'off',
    fixedOverflowWidgets: true,
    padding: { top: 8 },
    unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: true },
  });
  editor.onDidChangeModelContent(() => onChange?.(editor.getValue()));
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRun?.());
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => onSubmit?.());
  return editor;
}

/** 정적 검사 결과를 에디터 밑줄로 표시 */
export function setMarkers(monaco, editor, warnings) {
  const model = editor.getModel();
  if (!model) return;
  const sev = { error: monaco.MarkerSeverity.Error, warning: monaco.MarkerSeverity.Warning, info: monaco.MarkerSeverity.Info };
  monaco.editor.setModelMarkers(
    model,
    'exam-check',
    (warnings || []).map((w) => ({
      startLineNumber: w.line,
      endLineNumber: w.line,
      startColumn: w.col || 1,
      endColumn: model.getLineMaxColumn(Math.min(w.line, model.getLineCount())),
      message: w.message,
      severity: sev[w.level] ?? monaco.MarkerSeverity.Warning,
    })),
  );
}
