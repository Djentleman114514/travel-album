#!/usr/bin/env python3
"""Serve the local bookshelf and existing book assets on loopback."""
import argparse
import errno
import json
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent / "site"
URL = "http://127.0.0.1:4180/"
IDENTITY = "mocha-photo-books-library-site"


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/_library-health":
            body = json.dumps({"app": IDENTITY, "root": str(ROOT)}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def send_head(self):
        parts = Path(unquote(urlsplit(self.path).path)).parts
        resolved = Path(self.translate_path(self.path)).resolve()
        if any(part.startswith(".") for part in parts) or not resolved.is_relative_to(ROOT):
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description="本地摄影书架")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not ROOT.is_dir():
        raise SystemExit("网站尚未构建，请先在项目根目录运行 npm run build。")
    try:
        with urlopen(URL + "_library-health", timeout=1) as response:
            health = json.load(response)
        running = isinstance(health, dict) and health.get("app") == IDENTITY and health.get("root") == str(ROOT)
    except (OSError, ValueError):
        running = False
    if running:
        print("书架已在运行：" + URL, flush=True)
        if not args.no_browser:
            webbrowser.open(URL)
        return
    try:
        server = ThreadingHTTPServer(("127.0.0.1", 4180), partial(Handler, directory=str(ROOT)))
    except OSError as error:
        message = "4180 端口已被其他程序占用，请检查后重试。" if error.errno == errno.EADDRINUSE else "无法启动本地服务："
        raise SystemExit(message + str(error))
    print("Photo Books Library\n" + URL + "\n保持此窗口打开；按 Ctrl+C 停止。", flush=True)
    if not args.no_browser:
        webbrowser.open(URL)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
