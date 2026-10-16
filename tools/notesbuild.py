"""요약 노트 빌드 — content/notes/*.yaml → site/data/notes/*.json

노트 형식
  id       파일 이름과 같음 (예: w03)
  short    짧은 이름 (예: 3주차)
  title    제목
  order    정렬 순서 (작을수록 앞)
  summary  목록 카드에 보일 한 줄 설명 (선택)
  course   과목 id (없으면 default_course)
  quiz     관련 이론 퀴즈 세트 id (선택)
  units    관련 코딩 문제 단원 id 목록 (선택)
  body     본문 (마크다운) — 강의자료 원문을 옮기지 않고 직접 정리한 내용만
"""
import hashlib
import json
import re
from pathlib import Path

import yaml

REQUIRED = ("id", "short", "title", "body")
EXTERNAL_IMG = re.compile(r"!\[[^\]]*\]\(\s*(https?:)?//|<img[^>]+src=[\"']\s*(https?:)?//", re.I)
META_KEYS = ("id", "short", "title", "order", "summary", "course", "private", "quiz", "units")


def load(root: Path, default_course="basic", private=False):
    """(노트 목록, 오류 목록)"""
    notes, errors = [], []
    for path in sorted((root / "notes").glob("*.yaml")):
        try:
            d = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as e:
            errors.append(f"{path.name}: YAML 문법 오류: {e}")
            continue
        if d.get("id") != path.stem:
            errors.append(f"{path.name}: id '{d.get('id')}'와 파일 이름이 다릅니다")
            continue
        missing = [k for k in REQUIRED if not str(d.get(k) or "").strip()]
        if missing:
            errors.append(f"{path.name}: 필수 항목 없음 {missing}")
            continue
        if EXTERNAL_IMG.search(d["body"]):
            errors.append(f"{path.name}: 본문에 외부 이미지 링크 금지")
            continue
        units = d.get("units") or []
        if not isinstance(units, list):
            errors.append(f"{path.name}: units는 목록이어야 합니다")
            continue
        notes.append({
            "id": d["id"], "short": str(d["short"]), "title": str(d["title"]), "order": d.get("order", 99),
            "summary": str(d.get("summary") or ""), "course": d.get("course") or default_course, "private": private,
            "quiz": d.get("quiz"), "units": [str(u) for u in units], "body": d["body"],
        })
    return notes, errors


def check_links(notes, unit_ids, quiz_ids):
    """관련 퀴즈·단원 id가 실제로 있는지 확인"""
    errors = []
    for n in notes:
        if n["quiz"] and n["quiz"] not in quiz_ids:
            errors.append(f"{n['id']}: 없는 퀴즈 세트 '{n['quiz']}'")
        for u in n["units"]:
            if u not in unit_ids:
                errors.append(f"{n['id']}: 없는 단원 '{u}'")
    return errors


def write(out_dir: Path, notes):
    ndir = out_dir / "notes"
    ndir.mkdir(parents=True, exist_ok=True)
    entries, hashes = [], []
    for n in sorted(notes, key=lambda n: (n["order"], n["id"])):
        body = json.dumps(n, ensure_ascii=False, sort_keys=True)
        h = hashlib.sha256(body.encode("utf-8")).hexdigest()[:10]
        hashes.append(h)
        fname = f"notes/{n['id']}.{h}.json"
        (out_dir / fname).write_text(body, encoding="utf-8")
        entries.append({**{k: n[k] for k in META_KEYS}, "file": fname})
    return entries, hashes
