#!/usr/bin/env python3
"""Fixed loopback preview, with optional detached process and safe own-server reuse."""
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from urllib.request import urlopen
import argparse,json,subprocess,sys,time,webbrowser
ROOT=Path(__file__).resolve().parent
URL='http://127.0.0.1:4177/'
IDENTITY='after-the-lights-art-edition'
def running():
 try:
  with urlopen(URL+'_book-health',timeout=.5) as r:return json.load(r).get('edition')==IDENTITY
 except Exception:return False
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  if self.path=='/_book-health':
   body=json.dumps(dict(edition=IDENTITY,root=str(ROOT/'dist'))).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
  else:super().do_GET()
def main():
 p=argparse.ArgumentParser();p.add_argument('--background',action='store_true');p.add_argument('--no-browser',action='store_true');a=p.parse_args()
 if not (ROOT/'dist/index.html').is_file():raise SystemExit('缺少 dist/index.html，请先运行 npm run build。')
 if running():
  print('相册服务已运行：'+URL,flush=True)
  if not a.no_browser:webbrowser.open(URL)
  return
 if a.background:
  with (ROOT/'.server.log').open('ab') as log:child=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--no-browser'],cwd=ROOT,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True,close_fds=True)
  (ROOT/'.server.pid').write_text(str(child.pid))
  for _ in range(30):
   if running():
    print('相册服务已启动：'+URL,flush=True)
    if not a.no_browser:webbrowser.open(URL)
    return
   if child.poll() is not None:break
   time.sleep(.1)
  raise SystemExit('服务未能启动，详见 .server.log。')
 try:server=ThreadingHTTPServer(('127.0.0.1',4177),partial(Handler,directory=str(ROOT/'dist')))
 except OSError as e:raise SystemExit('4177 端口已被其他服务占用；请检查占用程序。'+str(e))
 print('After the Lights\n'+URL+'\n保持此窗口打开；按 Ctrl+C 关闭。',flush=True)
 if not a.no_browser:webbrowser.open(URL)
 try:server.serve_forever()
 except KeyboardInterrupt:pass
 finally:server.server_close()
if __name__=='__main__':main()
