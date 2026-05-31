"""
Vercel serverless — return the live posts.json straight from GitHub.

Admin page reads this instead of the Vercel-cached /data/posts.json so newly
approved posts show up in the "已發布" list immediately, without waiting for
Vercel to rebuild and evict its edge cache.
"""

from http.server import BaseHTTPRequestHandler
import base64
import json
import os
import urllib.request
import urllib.error

GITHUB_PAT   = os.environ.get("GITHUB_PAT", "")
GITHUB_OWNER = os.environ.get("GITHUB_OWNER", "")
GITHUB_REPO  = os.environ.get("GITHUB_REPO", "")
FILE_PATH    = "data/posts.json"


def _gh_get():
    url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{FILE_PATH}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {GITHUB_PAT}",
        "Accept": "application/vnd.github.v3+json",
    })
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


class handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store, max-age=0")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        try:
            meta = _gh_get()
            if meta is None:
                payload = {"posts": []}
            else:
                payload = json.loads(base64.b64decode(meta["content"]))
            self._respond(payload)
        except urllib.error.HTTPError as e:
            self._respond({"posts": [], "error": f"GitHub {e.code}"}, status=502)
        except Exception as e:
            self._respond({"posts": [], "error": str(e)}, status=500)

    def _respond(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass
