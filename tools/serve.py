#!/usr/bin/env python3
"""site/를 GitHub Pages와 같은 조건으로 로컬에서 서빙한다.

  uv run tools/serve.py              # http://localhost:8000/python-exam-practice/
  uv run tools/serve.py --port 8080

Pages와 같게: 저장소 이름 경로 아래에서 서빙, COOP/COEP 헤더 없음(서비스워커가 넣어야 함),
cache-control: max-age=600, 없는 경로는 404.html. → 경로·격리 문제를 배포 전에 잡는다.
"""
import argparse
import http.server
import mimetypes
import posixpath
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
BASE = "/python-exam-practice/"

mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("application/json", ".json")


class PagesLikeHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)

    def translate_path(self, path):
        path = urllib.parse.urlsplit(path).path
        if not path.startswith(BASE):
            return str(SITE / "__missing__")
        rel = posixpath.normpath(urllib.parse.unquote(path[len(BASE):]))
        if rel.startswith("..") or rel.startswith("/"):
            return str(SITE / "__missing__")
        return str(SITE / rel) if rel != "." else str(SITE)

    def do_GET(self):
        if self.path in ("/", ""):
            self.send_response(302)
            self.send_header("Location", BASE)
            self.end_headers()
            return
        target = Path(self.translate_path(self.path))
        if not target.exists():
            body = (SITE / "404.html").read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache" if DEV else "max-age=600")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


DEV = False


def main():
    global DEV
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--dev", action="store_true", help="캐시 끄기 (개발 중 수정 사항을 바로 확인)")
    args = ap.parse_args()
    DEV = args.dev
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), PagesLikeHandler)
    print(f"http://localhost:{args.port}{BASE}  (Ctrl+C로 종료)")
    server.serve_forever()


if __name__ == "__main__":
    main()
