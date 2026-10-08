"""elice 제출 규칙 검사 (Test Information에 공지된 규칙).

  1. ":" 뒤 한 칸 공백 (e.g. input("Hi: "), print("Hi:", a), print(f"Hi: {a}"))
  2. 출력 시 "," 뒤 한 칸 공백
  3. 모든 문장은 대문자로 시작, 그 외에는 소문자
  4. 문장 끝 기호('.', '!' 등) 앞에는 공백 없음
  5. random 모듈 사용 시 seed를 1로 고정: random.seed(1)

출력은 실행해 봐야 알 수 있으므로, 여기서는 코드에 적힌 문자열만 보고 '가능성 높은 실수'를 알려 준다.
"""
import ast
import re

_LETTER_BEFORE_COLON = re.compile(r"[A-Za-z가-힣)\]]:(?=[^\s:=/])")
_COMMA_NO_SPACE = re.compile(r",(?=[^\s\d'\"])|(?<=\D),(?=\d)")
_SPACE_BEFORE_PUNCT = re.compile(r"\s[.!?](?:\s|$)")


def _w(node, code, message, rule, level="warning"):
    return {"line": getattr(node, "lineno", 1), "col": getattr(node, "col_offset", 0) + 1, "level": level,
            "code": code, "kind": "rule", "rule": rule, "message": message, "source": "rules"}


def _call_name(call):
    f = call.func
    if isinstance(f, ast.Name):
        return f.id
    if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name):
        return f"{f.value.id}.{f.attr}"
    return ""


def _segments(node):
    """문자열 상수 / f-string을 [('text', str) | ('expr', None)] 목록으로."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return [("text", node.value)]
    if isinstance(node, ast.JoinedStr):
        segs = []
        for v in node.values:
            if isinstance(v, ast.Constant) and isinstance(v.value, str):
                segs.append(("text", v.value))
            else:
                segs.append(("expr", None))
        return segs
    return None


def _check_text_rules(node, segs, out, where):
    for idx, (kind, text) in enumerate(segs):
        if kind != "text":
            continue
        nxt_expr = idx + 1 < len(segs) and segs[idx + 1][0] == "expr"
        if text.endswith(":") and nxt_expr:
            out.append(_w(node, "rule1-colon", f"{where}: ':' 뒤에 공백 한 칸이 필요합니다 (예: f'합계: {{x}}')", 1))
        elif _LETTER_BEFORE_COLON.search(text):
            out.append(_w(node, "rule1-colon", f"{where}: ':' 뒤에 공백 한 칸이 필요합니다", 1))
        if text.endswith(",") and nxt_expr:
            out.append(_w(node, "rule2-comma", f"{where}: ',' 뒤에 공백 한 칸이 필요합니다 (예: f'{{a}}, {{b}}')", 2))
        elif _COMMA_NO_SPACE.search(text):
            out.append(_w(node, "rule2-comma", f"{where}: ',' 뒤에 공백 한 칸이 필요합니다", 2))
        if _SPACE_BEFORE_PUNCT.search(text):
            out.append(_w(node, "rule4-punct", f"{where}: 문장부호('.', '!', '?') 앞에는 공백이 없어야 합니다", 4))
        stripped = text.strip()
        if (re.match(r"^[a-z][a-z']*\s+[a-z]", stripped) and stripped[-1:] in ".!?" and idx == 0):
            out.append(_w(node, "rule3-capital", f"{where}: 영어 문장은 대문자로 시작합니다 (예: 'Hello world.')", 3, "info"))


def _check_input(call, out):
    if not call.args:
        return
    segs = _segments(call.args[0])
    if not segs:
        return
    last = segs[-1]
    if last[0] == "text" and last[1].rstrip(" ") .endswith(":") and not last[1].endswith(" "):
        out.append(_w(call, "rule1-prompt", "input 프롬프트의 ':' 뒤에 공백 한 칸이 필요합니다 (예: input('이름: '))", 1))
    _check_text_rules(call, segs, out, "input 프롬프트")


def _check_print(call, out):
    kw = {k.arg: k.value for k in call.keywords if k.arg}
    sep = kw.get("sep")
    default_sep = sep is None or (isinstance(sep, ast.Constant) and sep.value == " ")
    if isinstance(sep, ast.Constant) and isinstance(sep.value, str) and sep.value == ",":
        out.append(_w(call, "rule2-sep", "sep=','는 ',' 뒤 공백 규칙에 어긋납니다 → sep=', '", 2))
    args = call.args
    for i, arg in enumerate(args):
        segs = _segments(arg)
        if segs:
            _check_text_rules(arg, segs, out, "출력 문자열")
        if not default_sep or i == 0:
            continue
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str) and arg.value.strip() in (".", "!", "?", ",") \
                and arg.value[:1] != " " and arg.value.strip() == arg.value:
            out.append(_w(arg, "rule4-print-punct",
                          f"print(..., '{arg.value}')는 '{arg.value}' 앞에 공백이 생깁니다 → f-string이나 + 로 붙이세요", 4))
        prev = args[i - 1]
        if isinstance(prev, ast.Constant) and isinstance(prev.value, str) and prev.value.endswith(" "):
            out.append(_w(prev, "print-double-space",
                          "print는 값 사이에 공백을 넣으므로 문자열 끝의 공백까지 합쳐 두 칸이 됩니다 (예: print('합계:', x))", 1))


def check(code):
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return []
    out = []
    uses_random, seeded_1 = False, False
    for node in ast.walk(tree):
        if isinstance(node, ast.Import) and any(a.name == "random" for a in node.names):
            uses_random = True
        elif isinstance(node, ast.ImportFrom) and node.module == "random":
            uses_random = True
        elif isinstance(node, ast.Call):
            name = _call_name(node)
            if name in ("random.seed", "seed") and node.args and isinstance(node.args[0], ast.Constant) \
                    and node.args[0].value == 1:
                seeded_1 = True
            elif name == "input":
                _check_input(node, out)
            elif name == "print":
                _check_print(node, out)
    if uses_random and not seeded_1:
        out.append({"line": 1, "col": 1, "level": "warning", "code": "rule5-seed", "kind": "rule", "rule": 5,
                    "message": "random 모듈을 쓸 때는 random.seed(1)로 시드를 고정해야 합니다 (규칙 5)",
                    "source": "rules"})
    if "_____" in code:
        out.append({"line": code[:code.index("_____")].count("\n") + 1, "col": 1, "level": "warning",
                    "code": "blank-left", "kind": "blank", "message": "아직 채우지 않은 빈칸(_____)이 있습니다",
                    "source": "rules"})
    seen, uniq = set(), []
    for w in out:
        key = (w["line"], w["code"])
        if key not in seen:
            seen.add(key)
            uniq.append(w)
    return uniq
