"""elice(Python 3.6.0) 호환성 검사.

사이트(Pyodide)는 최신 파이썬이라 돌아가지만, 시험장(elice, 3.6.0)에서는 오류가 나는 코드를 찾는다.
최신 파이썬(3.12+)에서만 실행된다 — Pyodide와 빌드 도구.

ast.parse(feature_version=(3, 6))는 :=, match, 위치 전용 인자는 잡지만
f-string 관련 위반(f'{x=}', 중괄호 안 같은 따옴표, 중괄호 안 역슬래시)은 통과시킨다 → 토큰을 직접 검사한다.
"""
import ast
import io
import token
import tokenize

_FSTART = {t for t in (getattr(token, "FSTRING_START", None), getattr(token, "TSTRING_START", None)) if t is not None}
_FMIDDLE = {t for t in (getattr(token, "FSTRING_MIDDLE", None), getattr(token, "TSTRING_MIDDLE", None)) if t is not None}
_FEND = {t for t in (getattr(token, "FSTRING_END", None), getattr(token, "TSTRING_END", None)) if t is not None}

SYNTAX_MSG = "elice(Python 3.6)에서는 SyntaxError: "


def _w(line, col, code, message, kind="syntax", level="error"):
    return {"line": max(1, int(line or 1)), "col": max(1, int(col or 0) + 1), "level": level,
            "code": code, "kind": kind, "message": message, "source": "compat36"}


def _quote(prefix_and_quote):
    """'f"' / "rf'''" 같은 시작 토큰에서 따옴표 부분만."""
    return prefix_and_quote.lstrip("rRbBuUfFtT")


def _scan_fstrings(code):
    out = []
    try:
        toks = list(tokenize.generate_tokens(io.StringIO(code).readline))
    except (tokenize.TokenError, SyntaxError, IndentationError):
        return out
    stack = []  # 열린 f-string들: {"quote", "in_field", "depth"}
    for i, tok in enumerate(toks):
        ttype, tstr, start = tok.type, tok.string, tok.start
        if ttype in _FSTART:
            if stack and stack[-1]["in_field"]:
                outer = stack[-1]["quote"]
                if len(outer) == 1 and _quote(tstr)[:1] == outer:
                    out.append(_w(start[0], start[1], "fstring-nested-quote",
                                  SYNTAX_MSG + "f-string 중괄호 안에서 바깥과 같은 따옴표를 썼습니다 (3.12부터 허용)"))
            stack.append({"quote": _quote(tstr), "in_field": False, "depth": 0})
            continue
        if not stack:
            continue
        cur = stack[-1]
        if ttype in _FEND:
            stack.pop()
            continue
        if ttype in _FMIDDLE:
            continue
        if not cur["in_field"]:
            if ttype == token.OP and tstr == "{":
                cur["in_field"], cur["depth"] = True, 0
            continue
        # --- 여기부터 중괄호 안(표현식 부분) ---
        if ttype == token.OP:
            if tstr in "([{":
                cur["depth"] += 1
            elif tstr in ")]}":
                if tstr == "}" and cur["depth"] == 0:
                    cur["in_field"] = False
                else:
                    cur["depth"] -= 1
            elif tstr == "=" and cur["depth"] == 0:
                nxt = toks[i + 1] if i + 1 < len(toks) else None
                if nxt is not None and (nxt.string in ("}", "!", ":") or nxt.type in _FMIDDLE):
                    out.append(_w(start[0], start[1], "fstring-debug",
                                  SYNTAX_MSG + "f'{x=}' 형식은 Python 3.8부터 지원합니다 → f'x={x}'"))
            continue
        if ttype == token.COMMENT:
            out.append(_w(start[0], start[1], "fstring-comment", SYNTAX_MSG + "f-string 중괄호 안에는 주석(#)을 쓸 수 없습니다"))
        elif ttype in (token.NL, token.NEWLINE) and len(cur["quote"]) == 1:
            out.append(_w(start[0], start[1], "fstring-multiline",
                          SYNTAX_MSG + "한 줄 f-string의 중괄호 안에서 줄을 바꿀 수 없습니다"))
        elif ttype == token.STRING:
            if len(cur["quote"]) == 1 and _quote(tstr)[:1] == cur["quote"]:
                out.append(_w(start[0], start[1], "fstring-nested-quote",
                              SYNTAX_MSG + "f-string 중괄호 안에서 바깥과 같은 따옴표를 썼습니다 (3.12부터 허용) → 다른 따옴표를 쓰세요"))
            if "\\" in tstr:
                out.append(_w(start[0], start[1], "fstring-backslash",
                              SYNTAX_MSG + "f-string 중괄호 안에는 역슬래시(\\)를 쓸 수 없습니다 → 변수에 먼저 담으세요"))
    return out


# 3.7 이후에 생긴 것들 (실행되면 elice에서 오류)
_ATTR_NEW = {
    "removeprefix": ("3.9", "str.removeprefix()"),
    "removesuffix": ("3.9", "str.removesuffix()"),
    "isascii": ("3.7", "str.isascii()"),
    "bit_count": ("3.10", "int.bit_count()"),
}
_MOD_ATTR_NEW = {
    ("math", "prod"): "3.8", ("math", "isqrt"): "3.8", ("math", "comb"): "3.8", ("math", "perm"): "3.8",
    ("math", "dist"): "3.8", ("math", "lcm"): "3.9", ("math", "nextafter"): "3.9", ("math", "ulp"): "3.9",
    ("math", "cbrt"): "3.11", ("math", "exp2"): "3.11", ("math", "sumprod"): "3.12",
    ("statistics", "fmean"): "3.8", ("statistics", "geometric_mean"): "3.8", ("statistics", "multimode"): "3.8",
    ("statistics", "correlation"): "3.10", ("statistics", "linear_regression"): "3.10",
    ("itertools", "pairwise"): "3.10", ("itertools", "batched"): "3.12",
    ("functools", "cache"): "3.9", ("random", "randbytes"): "3.9", ("random", "binomialvariate"): "3.12",
}
_MODULES_NEW = {"dataclasses": "3.7", "zoneinfo": "3.9", "graphlib": "3.9", "tomllib": "3.11", "contextvars": "3.7"}
_BUILTINS_NEW = {"breakpoint": "3.7", "aiter": "3.10", "anext": "3.10"}
_GENERIC_BUILTINS = {"list", "dict", "set", "tuple", "frozenset", "type"}


def _api(line, col, code, message):
    return _w(line, col, code, "elice(Python 3.6)에서는 실행 시 오류: " + message, kind="api")


def _scan_api(tree):
    out = []
    module_alias = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                module_alias[a.asname or a.name] = a.name
                if a.name in _MODULES_NEW:
                    out.append(_api(node.lineno, node.col_offset, "module-new",
                                    f"{a.name} 모듈은 Python {_MODULES_NEW[a.name]}부터 있습니다"))
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            if mod in _MODULES_NEW:
                out.append(_api(node.lineno, node.col_offset, "module-new", f"{mod} 모듈은 Python {_MODULES_NEW[mod]}부터 있습니다"))
            if mod == "__future__" and any(a.name == "annotations" for a in node.names):
                out.append(_w(node.lineno, node.col_offset, "future-annotations",
                              SYNTAX_MSG + "from __future__ import annotations는 3.7부터 지원합니다"))
            for a in node.names:
                if (mod, a.name) in _MOD_ATTR_NEW:
                    out.append(_api(node.lineno, node.col_offset, "func-new",
                                    f"{mod}.{a.name}은(는) Python {_MOD_ATTR_NEW[(mod, a.name)]}부터 있습니다"))
        elif isinstance(node, ast.Attribute):
            base = node.value
            if isinstance(base, ast.Name) and (module_alias.get(base.id, base.id), node.attr) in _MOD_ATTR_NEW:
                mod = module_alias.get(base.id, base.id)
                out.append(_api(node.lineno, node.col_offset, "func-new",
                                f"{mod}.{node.attr}은(는) Python {_MOD_ATTR_NEW[(mod, node.attr)]}부터 있습니다"))
            elif node.attr in _ATTR_NEW:
                ver, label = _ATTR_NEW[node.attr]
                out.append(_api(node.lineno, node.col_offset, "method-new", f"{label}는 Python {ver}부터 있습니다"))
        elif isinstance(node, ast.Call):
            f = node.func
            if isinstance(f, ast.Name) and f.id in _BUILTINS_NEW:
                out.append(_api(node.lineno, node.col_offset, "builtin-new", f"{f.id}()는 Python {_BUILTINS_NEW[f.id]}부터 있습니다"))
            if isinstance(f, ast.Name) and f.id == "zip" and any(k.arg == "strict" for k in node.keywords):
                out.append(_api(node.lineno, node.col_offset, "zip-strict", "zip(strict=...)는 Python 3.10부터 있습니다"))
            if isinstance(f, ast.Attribute) and f.attr == "gcd" and len(node.args) > 2:
                out.append(_api(node.lineno, node.col_offset, "gcd-many", "math.gcd()에 인자 3개 이상은 Python 3.9부터 됩니다"))
            if (isinstance(f, ast.Name) and f.id == "reversed" and node.args and isinstance(node.args[0], ast.Call)
                    and isinstance(node.args[0].func, ast.Attribute) and node.args[0].func.attr in ("keys", "values", "items")):
                out.append(_api(node.lineno, node.col_offset, "reversed-dict", "딕셔너리 뷰에 reversed()는 Python 3.8부터 됩니다 → reversed(list(...))"))
        elif isinstance(node, (ast.BinOp, ast.AugAssign)) and isinstance(node.op, ast.BitOr):
            sides = [node.left, node.right] if isinstance(node, ast.BinOp) else [node.value]
            if any(isinstance(s, ast.Dict) or (isinstance(s, ast.Call) and isinstance(s.func, ast.Name) and s.func.id == "dict")
                   for s in sides):
                out.append(_api(node.lineno, node.col_offset, "dict-union", "딕셔너리 합치기 | 연산자는 Python 3.9부터 됩니다 → update() 사용"))
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            anns = [a.annotation for a in node.args.args + node.args.kwonlyargs if a.annotation is not None]
            if node.returns is not None:
                anns.append(node.returns)
            for ann in anns:
                if isinstance(ann, ast.Subscript) and isinstance(ann.value, ast.Name) and ann.value.id in _GENERIC_BUILTINS:
                    out.append(_api(ann.lineno, ann.col_offset, "generic-annotation",
                                    f"{ann.value.id}[...] 형태의 타입 표기는 Python 3.9부터 됩니다 (함수 정의 시 TypeError)"))
    return out


def check(code):
    """반환: [{'line', 'col', 'level', 'code', 'kind', 'message', 'source'}]"""
    out = []
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return out  # 일반 문법 오류는 실행할 때 traceback으로 보여 준다
    try:
        ast.parse(code, feature_version=(3, 6))
    except SyntaxError as e:
        out.append(_w(e.lineno, (e.offset or 1) - 1, "syntax36", SYNTAX_MSG + (e.msg or "문법 오류")))
    out.extend(_scan_fstrings(code))
    out.extend(_scan_api(tree))
    seen, uniq = set(), []
    for w in out:
        key = (w["line"], w["code"])
        if key not in seen:
            seen.add(key)
            uniq.append(w)
    return uniq
