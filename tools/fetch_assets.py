#!/usr/bin/env python3
"""외부 정적 파일(Pyodide, Monaco, xterm 등)을 tools/assets.json대로 내려받아 site/에 배치한다.

  uv run tools/fetch_assets.py            # 내려받기(캐시 재사용) + 배치
  uv run tools/fetch_assets.py --clean    # 배치 폴더를 비우고 다시 배치(버전을 바꿨을 때)

모든 파일은 버전과 SHA-256이 고정되어 있고, GitHub Pages에서 같은 출처(same-origin)로 서빙된다.
(교차 출처 격리(COEP) 환경에서 CDN 파일은 막힐 수 있으므로 CDN을 쓰지 않는다.)
"""
import argparse
import hashlib
import io
import json
import shutil
import sys
import tarfile
import urllib.request
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "tools" / "assets.json"


def download(url: str, cache: Path, sha256: str) -> bytes:
    cache.parent.mkdir(parents=True, exist_ok=True)
    if cache.exists():
        data = cache.read_bytes()
        if hashlib.sha256(data).hexdigest() == sha256:
            return data
    print(f"  내려받는 중: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "python-exam-practice"})
    with urllib.request.urlopen(req, timeout=300) as r:
        data = r.read()
    digest = hashlib.sha256(data).hexdigest()
    if digest != sha256:
        raise SystemExit(f"SHA-256 불일치: {url}\n  기대 {sha256}\n  실제 {digest}")
    cache.write_bytes(data)
    return data


def safe_rel(name: str) -> PurePosixPath:
    p = PurePosixPath(name)
    if p.is_absolute() or ".." in p.parts:
        raise SystemExit(f"압축 파일 안의 위험한 경로: {name}")
    return p


def extract(data: bytes, mode: str, dest: Path, files: dict, dirs: dict) -> int:
    count = 0
    with tarfile.open(fileobj=io.BytesIO(data), mode=mode) as tar:
        members = {m.name: m for m in tar.getmembers() if m.isfile()}
        for src, rel in files.items():
            m = members.get(src)
            if m is None:
                raise SystemExit(f"압축 파일에 {src} 이(가) 없습니다")
            out = dest / safe_rel(rel)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(tar.extractfile(m).read())
            count += 1
        for prefix, rel_prefix in dirs.items():
            for name, m in members.items():
                if not name.startswith(prefix):
                    continue
                rel = safe_rel(rel_prefix + name[len(prefix):])
                out = dest / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(tar.extractfile(m).read())
                count += 1
    return count


def npm_url(name: str, version: str) -> str:
    base = name.split("/")[-1]
    return f"https://registry.npmjs.org/{name}/-/{base}-{version}.tgz"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--clean", action="store_true", help="배치 폴더를 비우고 다시 배치")
    ap.add_argument("--cache", default=str(ROOT / ".cache" / "assets"), help="다운로드 캐시 폴더")
    args = ap.parse_args()
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    cache_dir = Path(args.cache)

    jobs = []
    py = cfg["pyodide"]
    jobs.append(("pyodide", py["version"], py["url"], py["sha256"], "r:bz2", py["dest"], py.get("files", {}), py.get("dirs", {})))
    for pkg in cfg["npm"]:
        jobs.append((pkg["name"], pkg["version"], npm_url(pkg["name"], pkg["version"]), pkg["sha256"], "r:gz",
                     pkg["dest"], pkg.get("files", {}), pkg.get("dirs", {})))

    # 같은 dest를 공유하는 패키지가 있으므로 폴더 단위로 한 번만 비운다 (site/ 자체는 비우지 않음)
    if args.clean:
        for dest in {ROOT / j[5] for j in jobs if j[5] != "site"}:
            if dest.exists():
                shutil.rmtree(dest)

    for name, version, url, sha, mode, dest_rel, files, dirs in jobs:
        safe_name = name.replace("/", "_").replace("@", "")
        data = download(url, cache_dir / f"{safe_name}-{version}{'.tar.bz2' if mode.endswith('bz2') else '.tgz'}", sha)
        n = extract(data, mode, ROOT / dest_rel, files, dirs)
        print(f"✓ {name} {version} → {dest_rel} ({n}개 파일)")


if __name__ == "__main__":
    sys.exit(main())
