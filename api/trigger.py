"""
Vercel serverless function — triggers GitHub Actions workflow_dispatch
so the front-end update button kicks off a fresh Threads scrape.
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.request
import urllib.error

GITHUB_PAT   = os.environ.get("GITHUB_PAT", "")
GITHUB_OWNER = os.environ.get("GITHUB_OWNER", "")
GITHUB_REPO  = os.environ.get("GITHUB_REPO", "")


def _trigger_workflow():
    if not all([GITHUB_PAT, GITHUB_OWNER, GITHUB_REPO]):
        return False, "Missing env vars (GITHUB_PAT / GITHUB_OWNER / GITHUB_REPO)"

    url = (
        f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}"
        "/actions/workflows/scrape.yml/dispatches"
    )
    payload = json.dumps({"ref": "main"}).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {GITHUB_PAT}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status == 204, None
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return False, f"GitHub API {e.code}: {body}"


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
        success, error = _trigger_workflow()
        body = json.dumps({"success": success, "error": error}).encode()

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # suppress default access log
