"""이론 퀴즈 빌드·검증 — content/quizzes/*.yaml → site/data/quiz/*.json

문항 유형
  mc       객관식      choices + answer(1부터 시작하는 번호)
  ox       O/X         answer: O | X
  short    단답형      answer: 문자열 또는 문자열 목록(허용 답안), ignore_case: true 가능
  predict  출력 예측   code — 정답은 사람이 쓰지 않고 Python 3.6으로 실행해 만든다.
                       error: true 이면 실행 시 오류가 나야 하고, 정답은 오류 이름(예: TypeError)
  blank    코드 빈칸   code 안의 _____ 개수만큼 blanks(빈칸별 허용 답안 목록)
                       첫 번째 답으로 채운 코드를 실행해 결과를 보여 주고, 다른 허용 답도 같은 결과인지 확인한다
  essay    서술형      answer(모범 답안) + points(채점 포인트) — 자동 채점하지 않고 스스로 확인

공통: id(파일 id로 시작), prompt, explanation, difficulty(1~3), verify(선택: 3.6에서 오류 없이 실행돼야 하는 확인 코드)
"""
import base64
import hashlib
import json
import re
from pathlib import Path

import yaml

import compat36

TYPES = {"mc", "ox", "short", "predict", "blank", "essay"}
BLANK = "_____"
EXTERNAL_IMG = re.compile(r"!\[[^\]]*\]\(\s*(https?:)?//|<img[^>]+src=[\"']\s*(https?:)?//", re.I)


def _b64(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def _as_list(v):
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x) for x in v]
    return [str(v)]


def _compat(label: str, code: str, errors: list) -> None:
    try:
        compile(code, "main.py", "exec")
    except SyntaxError as e:
        errors.append(f"{label}: 문법 오류 {e.msg} (줄 {e.lineno})")
        return
    for w in compat36.check(code):
        errors.append(f"{label}: 줄 {w['line']} {w['message']}")


def fill_blanks(code: str, answers: list) -> str:
    parts = code.split(BLANK)
    out = parts[0]
    for ans, rest in zip(answers, parts[1:]):
        out += ans + rest
    return out


def check_item(item: dict, set_id: str, seen: set) -> tuple:
    """스키마 검사. (오류 목록, 경고 목록)"""
    errors, warnings = [], []
    qid = item.get("id")
    if not isinstance(qid, str) or not qid.startswith(set_id + "-"):
        errors.append(f"id는 '{set_id}-'로 시작해야 합니다 ({qid!r})")
    elif qid in seen:
        errors.append(f"id 중복: {qid}")
    t = item.get("type")
    if t not in TYPES:
        errors.append(f"type은 {sorted(TYPES)} 중 하나 ({t!r})")
        return errors, warnings
    if t not in ("predict", "blank") and not str(item.get("prompt") or "").strip():
        errors.append("prompt가 비어 있습니다")
    d = item.get("difficulty", 1)
    if not isinstance(d, int) or not 1 <= d <= 3:
        errors.append("difficulty는 1~3 정수")
    for key in ("prompt", "explanation"):
        if EXTERNAL_IMG.search(str(item.get(key) or "")):
            errors.append(f"{key}에 외부 이미지 링크 금지")
    if t == "mc":
        choices = item.get("choices")
        if not isinstance(choices, list) or not 2 <= len(choices) <= 6:
            errors.append("객관식 choices는 2~6개 목록")
        else:
            texts = [str(c).strip() for c in choices]
            if any(not c for c in texts):
                errors.append("빈 보기가 있습니다")
            if len(set(texts)) != len(texts):
                errors.append("같은 보기가 두 번 있습니다")
            a = item.get("answer")
            if not isinstance(a, int) or not 1 <= a <= len(choices):
                errors.append(f"answer는 1~{len(choices)} 사이의 보기 번호")
    elif t == "ox":
        if item.get("answer") not in ("O", "X"):
            errors.append("O/X 문항의 answer는 O 또는 X")
    elif t == "short":
        if not [a for a in _as_list(item.get("answer")) if a.strip()]:
            errors.append("단답형 answer(허용 답안)가 없습니다")
    elif t == "predict":
        code = item.get("code")
        if not isinstance(code, str) or not code.strip():
            errors.append("출력 예측 문항에 code가 없습니다")
        elif "input(" in code:
            errors.append("출력 예측 코드에는 input()을 쓰지 않습니다")
        else:
            _compat("code", code, errors)
        if "answer" in item:
            errors.append("출력 예측의 정답은 실행으로 만듭니다 (answer를 쓰지 마세요)")
    elif t == "blank":
        code = item.get("code")
        blanks = item.get("blanks")
        if not isinstance(code, str) or BLANK not in code:
            errors.append(f"코드 빈칸 문항의 code에 {BLANK}가 없습니다")
        elif not isinstance(blanks, list) or len(blanks) != code.count(BLANK):
            errors.append(f"blanks 개수({len(blanks) if isinstance(blanks, list) else 0})가 빈칸 수({code.count(BLANK)})와 다릅니다")
        else:
            for i, b in enumerate(blanks, 1):
                if not [a for a in _as_list(b) if a.strip()]:
                    errors.append(f"빈칸 {i}의 허용 답안이 없습니다")
            if not errors:
                _compat("code(정답으로 채운 코드)", fill_blanks(code, [_as_list(b)[0] for b in blanks]), errors)
    elif t == "essay":
        if not str(item.get("answer") or "").strip():
            errors.append("서술형 answer(모범 답안)가 없습니다")
    if item.get("verify"):
        _compat("verify", str(item["verify"]), errors)
    if t != "essay" and not str(item.get("explanation") or "").strip():
        warnings.append("해설(explanation)이 없습니다")
    return errors, warnings


def load_sets(content: Path, only):
    sets, reports = [], {}
    seen = set()
    for path in sorted((content / "quizzes").glob("*.yaml")):
        try:
            qs = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as e:
            reports[path.stem] = {"errors": [f"YAML 문법 오류: {e}"], "warnings": []}
            continue
        sid = qs.get("id")
        if sid != path.stem:
            reports[path.stem] = {"errors": [f"id '{sid}'와 파일 이름 '{path.stem}'이 다릅니다"], "warnings": []}
            continue
        if only and sid not in only:
            continue
        items = []
        for item in qs.get("items") or []:
            if not isinstance(item, dict):
                reports.setdefault(sid, {"errors": [], "warnings": []})["errors"].append("문항은 딕셔너리여야 합니다")
                continue
            errors, warnings = check_item(item, sid, seen)
            qid = item.get("id") or f"{sid}-?"
            seen.add(qid)
            reports[qid] = {"errors": errors, "warnings": warnings}
            if not errors:
                items.append(item)
        sets.append({"meta": {k: qs.get(k) for k in ("id", "short", "title", "order", "summary")}, "items": items})
    return sets, reports


def jobs_for(sets, timeout):
    """(해시 시드 1 실행 목록, 시드 2 실행 목록)"""
    jobs, jobs2 = [], []
    for s in sets:
        for item in s["items"]:
            qid, t = item["id"], item["type"]
            if t == "predict":
                job = {"key": f"quiz::{qid}::run", "code": item["code"], "stdin": "", "timeout": timeout}
                jobs.append(job)
                jobs2.append(job)
            elif t == "blank":
                blanks = [_as_list(b) for b in item["blanks"]]
                first = [b[0] for b in blanks]
                job = {"key": f"quiz::{qid}::run", "code": fill_blanks(item["code"], first),
                       "stdin": str(item.get("stdin") or ""), "timeout": timeout}
                jobs.append(job)
                jobs2.append(job)
                for i, alts in enumerate(blanks):
                    for j, alt in enumerate(alts[1:], 1):
                        filled = list(first)
                        filled[i] = alt
                        jobs.append({"key": f"quiz::{qid}::b{i}_{j}", "code": fill_blanks(item["code"], filled),
                                     "stdin": str(item.get("stdin") or ""), "timeout": timeout})
            if item.get("verify"):
                jobs.append({"key": f"quiz::{qid}::verify", "code": str(item["verify"]), "stdin": "", "timeout": timeout})
    return jobs, jobs2


def _exc_name(err: str) -> str:
    lines = [ln for ln in (err or "").strip().splitlines() if ln.strip()]
    return lines[-1].split(":")[0].strip() if lines else ""


def finish(sets, res, res2, reports):
    """실행 결과로 정답을 만들고 검사한다. 통과한 문항만 남긴 세트 목록을 돌려준다."""
    built = []
    for s in sets:
        ok_items = []
        for item in s["items"]:
            qid, t = item["id"], item["type"]
            rep = reports[qid]
            errors = rep["errors"]
            secret = {"explanation": str(item.get("explanation") or "")}
            if item.get("verify"):
                r = res[f"quiz::{qid}::verify"]
                if r["status"] != "ok":
                    errors.append(f"verify 실패: {(r['error'] or r['status']).strip()[-300:]}")
            if t == "mc":
                secret["answer"] = item["answer"]
            elif t == "ox":
                secret["answer"] = item["answer"]
            elif t == "short":
                secret["answer"] = [a for a in _as_list(item["answer"]) if a.strip()]
            elif t == "essay":
                secret["answer"] = str(item["answer"])
                secret["points"] = _as_list(item.get("points"))
            elif t == "predict":
                r, r2 = res[f"quiz::{qid}::run"], res2[f"quiz::{qid}::run"]
                if item.get("error"):
                    if r["status"] != "error":
                        errors.append("error: true인데 오류 없이 실행됩니다")
                    elif r["stdout"].strip():
                        errors.append("오류 문항은 오류 전에 아무것도 출력하지 않아야 합니다")
                    else:
                        secret["answer"] = _exc_name(r["error"])
                        secret["error"] = True
                else:
                    if r["status"] != "ok":
                        errors.append(f"코드 실행 실패({r['status']}): {(r['error'] or '').strip()[-300:]}")
                    elif not r["stdout"].strip():
                        errors.append("출력이 없습니다")
                    elif r2["stdout"] != r["stdout"]:
                        errors.append("실행할 때마다 출력이 달라집니다 (집합 출력 순서 등)")
                    else:
                        secret["answer"] = r["stdout"].rstrip("\n")
            elif t == "blank":
                r, r2 = res[f"quiz::{qid}::run"], res2[f"quiz::{qid}::run"]
                blanks = [_as_list(b) for b in item["blanks"]]
                if r["status"] != "ok":
                    errors.append(f"정답으로 채운 코드가 실패({r['status']}): {(r['error'] or '').strip()[-300:]}")
                elif r2["stdout"] != r["stdout"]:
                    errors.append("실행할 때마다 출력이 달라집니다")
                else:
                    for i, alts in enumerate(blanks):
                        for j, alt in enumerate(alts[1:], 1):
                            ra = res[f"quiz::{qid}::b{i}_{j}"]
                            if ra["status"] != "ok" or ra["stdout"] != r["stdout"]:
                                errors.append(f"빈칸 {i + 1}의 허용 답 {alt!r}로 채우면 결과가 다릅니다")
                    secret["answer"] = blanks
                    secret["output"] = r["stdout"].rstrip("\n")
            if errors:
                continue
            pub = {"id": qid, "type": t, "prompt": str(item.get("prompt") or ""), "difficulty": item.get("difficulty", 1)}
            if t == "mc":
                pub["choices"] = [str(c) for c in item["choices"]]
            if t in ("predict", "blank"):
                pub["code"] = item["code"].rstrip("\n")
            if t == "blank":
                pub["nblanks"] = item["code"].count(BLANK)
                if item.get("stdin"):
                    pub["stdin"] = str(item["stdin"])
            if t == "short" and item.get("ignore_case"):
                pub["ignoreCase"] = True
            pub["enc"] = _b64(json.dumps(secret, ensure_ascii=False))
            ok_items.append(pub)
        built.append({"meta": s["meta"], "items": ok_items})
    return built


def write(out_dir: Path, built):
    qdir = out_dir / "quiz"
    qdir.mkdir(parents=True, exist_ok=True)
    entries, hashes = [], []
    for s in sorted(built, key=lambda s: (s["meta"].get("order") or 99, s["meta"]["id"])):
        if not s["items"]:
            continue
        body = json.dumps({"set": s["meta"], "items": s["items"]}, ensure_ascii=False, sort_keys=True)
        h = hashlib.sha256(body.encode("utf-8")).hexdigest()[:10]
        hashes.append(h)
        fname = f"quiz/{s['meta']['id']}.{h}.json"
        (out_dir / fname).write_text(body, encoding="utf-8")
        types = {}
        for it in s["items"]:
            types[it["type"]] = types.get(it["type"], 0) + 1
        entries.append({**s["meta"], "file": fname, "count": len(s["items"]), "types": types})
    return entries, hashes
