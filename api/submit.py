"""
Vercel serverless — community fan support submission
Commits the new post to data/posts.json via GitHub API so Vercel auto-redeploys.
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
FILE_PATH    = "data/posts.json"


def _gh_get():
    url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{FILE_PATH}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {GITHUB_PAT}",
        "Accept": "application/vnd.github.v3+json",
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def _gh_put(sha, content_obj):
    encoded = base64.b64encode(
        json.dumps(content_obj, ensure_ascii=False, indent=2).encode()
    ).decode()
    url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{FILE_PATH}"
    payload = json.dumps({
        "message": "chore: add community fan support submission",
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


def _build_post(data, body_bytes):
    text_parts = [data.get("event_name", "")]
    if data.get("description"):
        text_parts.append(data["description"])
    text = "\n".join(p for p in text_parts if p)
    contact = data.get("contact", "")
    return {
        "id": f"community_{abs(hash(body_bytes)) % 999999}",
        "username": data.get("organizer", ""),
        "text": text,
        "url": contact if contact.startswith("http") else None,
        "date": datetime.now(timezone.utc).strftime("%Y/%m/%d"),
        "source": "community",
        "event_name": data.get("event_name", ""),
        "event_date": data.get("event_date", ""),
        "location": data.get("location", ""),
        "contact": contact,
    }


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

        try:
            file_meta = _gh_get()
            existing = json.loads(base64.b64decode(file_meta["content"]))
            new_post = _build_post(data, body)
            existing.setdefault("posts", []).append(new_post)
            existing["last_updated"] = datetime.now(timezone.utc).isoformat()
            ok = _gh_put(file_meta["sha"], existing)
            self._respond({"success": ok})
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
