"""
Vercel serverless — approve a pending post: move from pending.json to posts.json
"""

from http.server import BaseHTTPRequestHandler
import base64
import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timezone

GITHUB_PAT   = os.environ.get("GITHUB_PAT", "")
GITHUB_OWNER = os.environ.get("GITHUB_OWNER", "")
GITHUB_REPO  = os.environ.get("GITHUB_REPO", "")
PENDING_PATH = "data/pending.json"
POSTS_PATH   = "data/posts.json"


def _gh_get(path):
    url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{path}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {GITHUB_PAT}",
        "Accept": "application/vnd.github.v3+json",
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def _gh_put(path, sha, content_obj, message):
    encoded = base64.b64encode(
        json.dumps(content_obj, ensure_ascii=False, indent=2).encode()
    ).decode()
    url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{path}"
    payload = json.dumps({
        "message": message,
        "content": encoded,
        "sha": sha,
    }).encode()
    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": f"Bearer {GITHUB_PAT}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
    }, method="PUT")
    with urllib.request.urlopen(req) as r:
        return r.status in (200, 201)


class handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except Exception:
            self._respond({"success": False, "error": "invalid JSON"})
            return

        post_id = data.get("id")
        if not post_id:
            self._respond({"success": False, "error": "missing id"})
            return

        try:
            pending_meta = _gh_get(PENDING_PATH)
            pending_data = json.loads(base64.b64decode(pending_meta["content"]))

            post = next((p for p in pending_data.get("pending", []) if p.get("id") == post_id), None)
            if not post:
                self._respond({"success": False, "error": "post not found in pending"})
                return

            posts_meta = _gh_get(POSTS_PATH)
            posts_data = json.loads(base64.b64decode(posts_meta["content"]))
            posts_data.setdefault("posts", []).append(post)
            posts_data["last_updated"] = datetime.now(timezone.utc).isoformat()
            _gh_put(POSTS_PATH, posts_meta["sha"], posts_data, "chore: approve community post")

            pending_data["pending"] = [p for p in pending_data.get("pending", []) if p.get("id") != post_id]
            _gh_put(PENDING_PATH, pending_meta["sha"], pending_data, "chore: remove approved post from pending")

            self._respond({"success": True})
        except urllib.error.HTTPError as e:
            self._respond({"success": False, "error": f"GitHub {e.code}"})
        except Exception as e:
            self._respond({"success": False, "error": str(e)})

    def _respond(self, obj):
        body = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass
