"""Serves the built Clarea (C:\\Users\\32icv\\clarea-web) like GitHub Pages: clean addresses fall back to 404.html."""
import os, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("CLAREA_ROOT") or r"C:\Users\32icv\clarea-web"   # (on GitHub: the repo itself)

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path) and "." not in os.path.basename(self.path.split("?")[0]):
            self.path = "/404.html"                     # clean address: the app decides what to show
        return super().send_head()

ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8150), H).serve_forever()
