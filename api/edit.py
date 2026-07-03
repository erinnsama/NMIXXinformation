"""
Vercel serverless — edit a post in pending.json or posts.json
"""

from http.server import BaseHTTPRequestHandler
import base64
import json
import os
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

GITHUB_PAT   = os.environ.get("GITHUB_PAT", "")
GITHUB_OWNER = os.environ.get("GITHUB_OWNER", "")
GITHUB_REPO  = os.environ.get("GITHUB_REPO", "")
PENDING_PATH = "data/pending.json"
POSTS_PATH   = "data/posts.json"

EDITABLE = {"event_name","text","location","support_items","quantity","conditions",
            "distribution_time","url","urls","day","venue_type"}


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
    payload = json.dumps({"message": message, "content": encoded, "sha": sha}).encode()
    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": f"Bearer {GITHUB_PAT}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
    }, method="PUT")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status in (200, 201)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise urllib.error.HTTPError(e.url, e.code, body, e.headers, None)


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
        try:
            data = json.loads(self.rfile.read(length))
        except Exception:
            self._respond({"success": False, "error": "invalid JSON"})
            return

        post_id = data.get("id")
        target  = data.get("target", "posts")
        fields  = {k: v for k, v in data.get("fields", {}).items() if k in EDITABLE}

        if not post_id or not fields:
            self._respond({"success": False, "error": "missing id or fields"})
            return

        file_path = PENDING_PATH if target == "pending" else POSTS_PATH
        list_key  = "pending"    if target == "pending" else "posts"

        for attempt in range(4):
            if attempt > 0:
                time.sleep(0.8)
            try:
                meta = _gh_get(file_path)
                obj  = json.loads(base64.b64decode(meta["content"]))

                updated = False
                for post in obj.get(list_key, []):
                    if post.get("id") == post_id:
                        post.update(fields)
                        updated = True
                        break

                if not updated:
                    self._respond({"success": False, "error": "post not found"})
                    return

                if target != "pending":
                    obj["last_updated"] = datetime.now(timezone.utc).isoformat()

                _gh_put(file_path, meta["sha"], obj, f"chore: edit post {post_id}")
                self._respond({"success": True})
                return

            except urllib.error.HTTPError as e:
                if e.code == 409 and attempt < 3:
                    continue
                self._respond({"success": False, "error": f"GitHub {e.code}: {e.reason[:80]}"})
                return
            except Exception as e:
                self._respond({"success": False, "error": str(e)})
                return

        self._respond({"success": False, "error": "重試失敗"})

    def _respond(self, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass
