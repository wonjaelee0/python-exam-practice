#!/usr/bin/env python3
"""비공개 자료(강의 노트북, elice 원문)가 저장소·배포물에 섞이지 않았는지 검사한다.

  uv run tools/leak_guard.py --git          # git에 올라간(올라갈) 파일 검사
  uv run tools/leak_guard.py --site site    # GitHub Pages에 배포할 폴더 검사

GitHub Pages 사이트는 저장소가 private이어도 공개된다. 하나라도 걸리면 실패(종료 코드 1).
"""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN_PARTS = {"materials", "midterms"}
FORBIDDEN_SUFFIXES = {".ipynb"}


def bad(path: str) -> bool:
    p = Path(path)
    return bool(FORBIDDEN_PARTS.intersection(p.parts)) or p.suffix.lower() in FORBIDDEN_SUFFIXES


def check_git() -> list[str]:
    out = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [f for f in out.splitlines() if bad(f)]


def check_site(site: Path) -> list[str]:
    return [str(p.relative_to(site)) for p in site.rglob("*") if p.is_file() and bad(str(p.relative_to(site)))]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--git", action="store_true")
    ap.add_argument("--site")
    args = ap.parse_args()
    found = []
    if args.git:
        found += [f"git: {f}" for f in check_git()]
    if args.site:
        found += [f"site: {f}" for f in check_site(Path(args.site))]
    if found:
        print("✗ 비공개 자료가 포함되어 있습니다:\n  " + "\n  ".join(found))
        return 1
    print("✓ 비공개 자료 없음")
    return 0


if __name__ == "__main__":
    sys.exit(main())
