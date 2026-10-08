#!/usr/bin/env python3
"""문제 빌드·검증 도구 — content/*.yaml → site/data/*.json

  uv run tools/build.py                 # Docker가 켜져 있으면 python:3.6 컨테이너, 아니면 로컬 파이썬
  uv run tools/build.py --py36 docker   # CI 기준 (elice와 같은 Python 3.6)
  uv run tools/build.py --only b05      # 일부 단원만 검사 (출력 파일은 쓰지 않음)

기대출력은 사람이 쓰지 않는다. 정답 코드를 elice 채점 방식(input 프롬프트 + 줄바꿈, 입력 에코 없음)으로
실행해 만든다. 아래 품질 게이트를 통과하지 못한 문제는 사이트에 넣지 않고 빌드를 실패로 끝낸다.

  V1 스키마  V2 Python 3.6 실행  V3 기대출력 자동 생성  V4 결정성(해시 시드 2종)
  V5 대체 정답 일치  V6 오답 코드 판별  V7 3.6 호환·제출 규칙  V8 지문에 출력 문구 명시
  V9 테스트 구성(공개 1+, 숨김 2+)  V10 외부 이미지 금지  V11 실행 시간
"""
import argparse
import ast
import base64
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
SITE = ROOT / "site"
PY_DIR = SITE / "py"
sys.path.insert(0, str(PY_DIR))

import compat36  # noqa: E402
import elice_semantics as sem  # noqa: E402
import lint_rules  # noqa: E402

DOCKER_IMAGE = "python:3.6-slim"
FORMATS = {"write", "fill", "debug"}
STYLES = {"elice-main", "elice-pre", "elice-extra"}
REQUIRED = ["id", "title", "unit", "difficulty", "statement", "solution", "tests"]
EXTERNAL_IMG = re.compile(r"!\[[^\]]*\]\(\s*(https?:)?//|<img[^>]+src=[\"']\s*(https?:)?//", re.I)
STRICT_RULES = {1, 2, 4, 5}  # 정답 코드가 어기면 빌드 실패


def load_yaml(path: Path):
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def b64(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


# ---------------------------------------------------------------- 실행기
def docker_ready() -> bool:
    if not shutil.which("docker"):
        return False
    try:
        return subprocess.run(["docker", "info"], capture_output=True, timeout=15).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def run_jobs(jobs: list, mode: str, hash_seed: int) -> tuple[str, dict]:
    payload = json.dumps({"jobs": jobs}, ensure_ascii=False).encode("utf-8")
    env = dict(os.environ, PYTHONHASHSEED=str(hash_seed), ELICE_PY=str(PY_DIR), PYTHONIOENCODING="utf-8")
    if mode == "docker":
        cmd = ["docker", "run", "--rm", "-i", "--network", "none", "--memory", "1g",
               "-e", f"PYTHONHASHSEED={hash_seed}", "-e", "ELICE_PY=/py", "-e", "PYTHONIOENCODING=utf-8",
               "-v", f"{PY_DIR}:/py:ro", "-v", f"{ROOT / 'tools'}:/tools:ro",
               DOCKER_IMAGE, "python", "/tools/run36.py"]
    else:
        cmd = [sys.executable, str(ROOT / "tools" / "run36.py")]
    proc = subprocess.run(cmd, input=payload, capture_output=True, env=env, timeout=3600)
    if proc.returncode != 0:
        raise SystemExit(f"실행기 오류 ({mode}):\n{proc.stderr.decode('utf-8', 'replace')[-3000:]}")
    data = json.loads(proc.stdout.decode("utf-8"))
    return data["python"], {r["key"]: r for r in data["results"]}


# ---------------------------------------------------------------- 검사
def literal_texts(code: str) -> list[str]:
    """print/input에 직접 적힌 문자열 조각 (지문에 그 문구가 나와야 한다)."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return []
    out = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in ("print", "input")):
            continue
        for arg in node.args:
            parts = [arg] if isinstance(arg, ast.Constant) else (arg.values if isinstance(arg, ast.JoinedStr) else [])
            for p in parts:
                if isinstance(p, ast.Constant) and isinstance(p.value, str):
                    t = p.value.strip()
                    if len(t) >= 2 and re.search(r"[가-힣A-Za-z]", t):
                        out.append(t)
    return out


def static_check(label: str, code: str, strict: bool, errors: list, warnings: list) -> None:
    try:
        compile(code, "main.py", "exec")
    except SyntaxError as e:
        errors.append(f"{label}: 문법 오류 {e.msg} (줄 {e.lineno})")
        return
    for w in compat36.check(code):
        errors.append(f"{label}: 줄 {w['line']} {w['message']}")
    for w in lint_rules.check(code):
        msg = f"{label}: 줄 {w['line']} {w['message']}"
        if w["code"] == "blank-left" or (strict and w.get("rule") in STRICT_RULES):
            errors.append(msg)
        else:
            warnings.append(msg)


def validate_schema(p: dict, path: Path, units: dict, seen: set, errors: list, warnings: list) -> None:
    for key in REQUIRED:
        if key not in p or p[key] in (None, ""):
            errors.append(f"필수 항목 '{key}' 없음")
    if errors:
        return
    if p["id"] != path.stem:
        errors.append(f"id '{p['id']}'와 파일 이름 '{path.stem}'이 다릅니다")
    if p["id"] in seen:
        errors.append(f"id 중복: {p['id']}")
    if p["unit"] not in units:
        errors.append(f"없는 단원: {p['unit']}")
    if path.parent.name != p["unit"]:
        warnings.append(f"단원 폴더({path.parent.name})와 unit({p['unit']})이 다릅니다")
    if not isinstance(p["difficulty"], int) or not 1 <= p["difficulty"] <= 5:
        errors.append("difficulty는 1~5 정수")
    if p.get("format", "write") not in FORMATS:
        errors.append(f"format은 {sorted(FORMATS)} 중 하나")
    if p.get("style", "elice-main") not in STYLES:
        errors.append(f"style은 {sorted(STYLES)} 중 하나")
    if p.get("format") == "fill" and "_____" not in (p.get("starter") or ""):
        errors.append("빈칸형(fill)은 starter에 _____가 있어야 합니다")
    if EXTERNAL_IMG.search(p["statement"]):
        errors.append("지문에 외부 이미지 링크 금지 (GitHub Pages 교차 출처 격리·저작권)")
    tests = p["tests"]
    if not isinstance(tests, list) or not tests:
        errors.append("tests는 비어 있지 않은 목록")
        return
    for i, t in enumerate(tests, 1):
        if not isinstance(t, dict) or not isinstance(t.get("stdin", ""), str):
            errors.append(f"테스트 {i}: stdin은 문자열")
        if "generator" in t:
            errors.append(f"테스트 {i}: generator는 아직 지원하지 않습니다")
    n_pub = sum(1 for t in tests if t.get("public"))
    n_hid = len(tests) - n_pub
    if n_pub < 1:
        errors.append("공개 테스트(public: true)가 1개 이상 필요합니다")
    if n_hid < 2:
        errors.append("숨은 테스트가 2개 이상 필요합니다")
    elif n_hid < 3:
        warnings.append("숨은 테스트 3개 이상 권장")
    if not p.get("mutants"):
        warnings.append("오답 코드(mutants)가 없습니다 — 테스트 판별력을 확인할 수 없음")
    if not p.get("alt_solutions"):
        warnings.append("대체 정답(alt_solutions)이 없습니다")


# ---------------------------------------------------------------- 메인
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--py36", choices=["auto", "docker", "local"], default="auto",
                    help="정답 실행 환경 (docker = elice와 같은 Python 3.6)")
    ap.add_argument("--only", nargs="*", help="이 단원만 검사 (출력 파일은 쓰지 않음)")
    ap.add_argument("--out", default=str(SITE / "data"))
    args = ap.parse_args()

    mode = args.py36
    if mode == "auto":
        mode = "docker" if docker_ready() else "local"
    if mode == "local":
        print(f"⚠ 로컬 파이썬({sys.version.split()[0]})으로 실행합니다. elice와 같은 3.6 검증은 CI(Docker)에서 이뤄집니다.\n")

    config = load_yaml(CONTENT / "config.yaml")
    default_ms = int(config["limits"]["time_ms"])
    build_timeout = float(config["limits"]["build_timeout_s"])
    units = {}
    for path in sorted((CONTENT / "units").glob("*.yaml")):
        u = load_yaml(path)
        units[u["id"]] = u

    problems, reports = [], {}
    seen = set()
    for path in sorted((CONTENT / "problems").rglob("*.yaml")):
        errors, warnings = [], []
        try:
            p = load_yaml(path) or {}
        except yaml.YAMLError as e:
            reports[path.stem] = {"path": path, "errors": [f"YAML 문법 오류: {e}"], "warnings": []}
            continue
        if args.only and p.get("unit") not in args.only:
            continue
        validate_schema(p, path, units, seen, errors, warnings)
        pid = p.get("id", path.stem)
        seen.add(pid)
        if not errors:
            p.setdefault("format", "write")
            p.setdefault("style", "elice-main")
            p.setdefault("starter", "")
            p["limits"] = {"time_ms": default_ms, **(p.get("limits") or {})}
            for t in p["tests"]:
                t.setdefault("stdin", "")
                t["public"] = bool(t.get("public"))
            static_check("정답", p["solution"], True, errors, warnings)
            for k, alt in enumerate(p.get("alt_solutions") or [], 1):
                static_check(f"대체 정답 {k}", alt, False, errors, warnings)
            if EXTERNAL_IMG.search(p.get("explanation") or ""):
                errors.append("해설에 외부 이미지 링크 금지")
        reports[pid] = {"path": path, "errors": errors, "warnings": warnings}
        if not errors:
            problems.append(p)

    # ---- 실행 (정답·대체 정답·오답 코드 × 테스트)
    jobs, jobs2 = [], []
    for p in problems:
        pid = p["id"]
        for i, t in enumerate(p["tests"]):
            jobs.append({"key": f"{pid}::sol::{i}", "code": p["solution"], "stdin": t["stdin"], "timeout": build_timeout})
            jobs2.append(jobs[-1])
            for k, alt in enumerate(p.get("alt_solutions") or []):
                jobs.append({"key": f"{pid}::alt{k}::{i}", "code": alt, "stdin": t["stdin"], "timeout": build_timeout})
            for k, m in enumerate(p.get("mutants") or []):
                jobs.append({"key": f"{pid}::mut{k}::{i}", "code": m["code"], "stdin": t["stdin"], "timeout": build_timeout})
    py_version, res = run_jobs(jobs, mode, 1) if jobs else ("-", {})
    _, res2 = run_jobs(jobs2, mode, 2) if jobs2 else ("-", {})

    built = []
    for p in problems:
        pid = p["id"]
        rep = reports[pid]
        errors, warnings = rep["errors"], rep["warnings"]
        n = len(p["tests"])
        sol = [res[f"{pid}::sol::{i}"] for i in range(n)]
        for i, r in enumerate(sol):
            if r["status"] != "ok":
                errors.append(f"정답 코드가 테스트 {i + 1}에서 실패({r['status']}): {(r['error'] or '').strip()[-300:]}")
        if errors:
            continue
        expected = [r["stdout"] for r in sol]
        for i in range(n):
            if res2[f"{pid}::sol::{i}"]["stdout"] != expected[i]:
                errors.append(f"테스트 {i + 1}: 실행할 때마다 출력이 달라집니다 (set 출력 순서? random.seed(1) 누락?)")
        for k, _ in enumerate(p.get("alt_solutions") or []):
            for i in range(n):
                r = res[f"{pid}::alt{k}::{i}"]
                if r["status"] != "ok" or sem.classify(expected[i], r["stdout"]) != "PASS":
                    detail = r["error"] or f"출력 {r['stdout'][:120]!r} ≠ 기대 {expected[i][:120]!r}"
                    errors.append(f"대체 정답 {k + 1}이(가) 테스트 {i + 1}에서 정답과 다릅니다: {detail.strip()[-300:]}")
                    break
        for k, m in enumerate(p.get("mutants") or []):
            caught = [i for i in range(n) if res[f"{pid}::mut{k}::{i}"]["status"] != "ok"
                      or sem.classify(expected[i], res[f"{pid}::mut{k}::{i}"]["stdout"]) != "PASS"]
            if not caught:
                errors.append(f"오답 코드 '{m.get('name', k + 1)}'를 잡는 테스트가 없습니다 (테스트 보강 필요)")
            elif all(p["tests"][i]["public"] for i in caught):
                warnings.append(f"오답 코드 '{m.get('name', k + 1)}'는 공개 예시로만 잡힙니다")
        if not any(e.strip() for e in expected):
            errors.append("모든 테스트의 출력이 비어 있습니다")
        hidden_outputs = [expected[i] for i in range(n) if not p["tests"][i]["public"]]
        if len(hidden_outputs) >= 2 and len(set(hidden_outputs)) == 1:
            warnings.append("숨은 테스트의 기대출력이 모두 같습니다 — 다양한 경우를 넣으세요")
        slowest = max(r["elapsed_ms"] for r in sol)
        if slowest > p["limits"]["time_ms"] / 10:
            warnings.append(f"정답 실행이 느립니다 ({slowest}ms) — 브라우저 제한 {p['limits']['time_ms']}ms")
        public_text = p["statement"] + "\n".join(expected[i] for i in range(n) if p["tests"][i]["public"])
        for lit in literal_texts(p["solution"]):
            if lit not in public_text:
                warnings.append(f"정답이 출력하는 문구 {lit!r}가 지문·공개 예시에 없습니다")
        if errors:
            continue
        built.append((p, expected))

    # ---- 보고
    n_err = sum(1 for r in reports.values() if r["errors"])
    for pid, rep in reports.items():
        mark = "✗" if rep["errors"] else ("△" if rep["warnings"] else "✓")
        if rep["errors"] or rep["warnings"]:
            print(f"{mark} {pid}")
            for e in rep["errors"]:
                print(f"    오류: {e}")
            for w in rep["warnings"]:
                print(f"    경고: {w}")
    print(f"\n실행 환경: {mode} (Python {py_version}) · 문제 {len(reports)}개 중 통과 {len(built)}개 · 오류 {n_err}개")

    if args.only:
        print("(--only: 출력 파일을 쓰지 않았습니다)")
        return 1 if n_err else 0

    # ---- 출력
    out_dir = Path(args.out)
    units_dir = out_dir / "units"
    if units_dir.exists():
        shutil.rmtree(units_dir)
    units_dir.mkdir(parents=True)
    by_unit: dict[str, list] = {}
    for p, expected in built:
        by_unit.setdefault(p["unit"], []).append((p, expected))

    manifest_units, manifest_problems, hashes = [], [], []
    for uid in sorted(units, key=lambda u: units[u].get("order", 99)):
        items = sorted(by_unit.get(uid, []), key=lambda pe: (pe[0]["difficulty"], pe[0]["id"]))
        out_problems = []
        for no, (p, expected) in enumerate(items, 1):
            tests = []
            for t, exp in zip(p["tests"], expected):
                body = {"stdin": t["stdin"], "expected": exp}
                if t.get("note"):
                    body["note"] = t["note"]
                tests.append({"public": True, **body} if t["public"]
                             else {"public": False, "enc": b64(json.dumps(body, ensure_ascii=False))})
            out_problems.append({
                "id": p["id"], "no": no, "title": p["title"], "unit": uid, "difficulty": p["difficulty"],
                "tags": p.get("tags") or [], "format": p["format"], "style": p["style"],
                "statement": p["statement"], "starter": p["starter"], "hints": p.get("hints") or [],
                "explanation": p.get("explanation") or "", "limits": p["limits"], "tests": tests,
                "solution": b64(p["solution"]),
            })
            manifest_problems.append({"id": p["id"], "unit": uid, "no": no, "title": p["title"],
                                      "difficulty": p["difficulty"], "tags": p.get("tags") or [], "format": p["format"]})
        u = units[uid]
        body = json.dumps({"unit": u, "problems": out_problems}, ensure_ascii=False, sort_keys=True)
        h = hashlib.sha256(body.encode("utf-8")).hexdigest()[:10]
        hashes.append(h)
        fname = f"units/{uid}.{h}.json"
        (out_dir / fname).write_text(body, encoding="utf-8")
        manifest_units.append({"id": uid, "title": u["title"], "short": u.get("short", uid), "order": u.get("order", 99),
                               "summary": u.get("summary", ""), "file": fname, "count": len(out_problems)})

    assets = json.loads((ROOT / "tools" / "assets.json").read_text(encoding="utf-8"))
    # 실행 엔진 파일(워커 + 파이썬)의 내용 해시 — 주소에 붙여 Pages의 10분 캐시 때문에 옛 파일과 섞이지 않게 한다
    runtime_files = sorted(PY_DIR.glob("*.py")) + [SITE / "js" / "runtime" / "py-worker.js"]
    runtime_hash = hashlib.sha256(b"".join(f.read_bytes() for f in runtime_files)).hexdigest()[:10]
    manifest = {
        "buildId": hashlib.sha256("".join(hashes).encode()).hexdigest()[:12],
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "runtime": {"pyodide": f"pyodide/{assets['pyodide']['version']}/", "assetVersion": runtime_hash,
                    "validatedWith": f"{mode} Python {py_version}"},
        "config": {"runLimitSec": config["run"]["limit_sec"], "examDate": str(config["site"]["exam_date"]),
                   "title": config["site"]["title"]},
        "units": manifest_units,
        "problems": manifest_problems,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    counts = Counter(p["unit"] for p, _ in built)
    print("단원별: " + ", ".join(f"{u} {counts.get(u, 0)}" for u in sorted(units, key=lambda x: units[x].get('order', 99))))
    print(f"→ {out_dir.relative_to(ROOT)}/manifest.json (buildId {manifest['buildId']})")
    return 1 if n_err else 0


if __name__ == "__main__":
    sys.exit(main())
