"""
本地開發伺服器：同時提供靜態檔案 + 處理 /api/submit POST
用法：python dev-server.py
"""

import json
import os
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PORT = 8765
DATA_FILE = Path(__file__).parent / "data" / "posts.json"


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/api/submit":
            self._handle_submit()
        elif self.path == "/api/delete":
            self._handle_delete()
        elif self.path == "/api/trigger":
            self._json({"success": True, "note": "dev mode — no actual scrape triggered"})
        else:
            self.send_response(404)
            self.end_headers()

    def _handle_submit(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except Exception:
            self._json({"success": False, "error": "invalid JSON"}, 400)
            return

        existing = json.loads(DATA_FILE.read_text(encoding="utf-8"))

        text_parts = [data.get("event_name", "")]
        if data.get("description"):
            text_parts.append(data["description"])
        text = "\n".join(p for p in text_parts if p)

        contact = data.get("contact", "")
        post_url = contact if contact.startswith("http") else None

        new_post = {
            "id": f"community_{abs(hash(body)) % 999999}",
            "username": data.get("organizer", ""),
            "text": text,
            "url": post_url,
            "date": datetime.now(timezone.utc).strftime("%Y/%m/%d"),
            "source": "community",
            "event_name": data.get("event_name", ""),
            "event_date": data.get("event_date", ""),
            "location": data.get("location", ""),
            "contact": contact,
        }

        existing.setdefault("posts", []).append(new_post)
        existing["last_updated"] = datetime.now(timezone.utc).isoformat()
        DATA_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  [submit] saved: {new_post['username']} — {new_post['event_name']}")
        self._json({"success": True})

    def _handle_delete(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except Exception:
            self._json({"success": False, "error": "invalid JSON"}, 400)
            return

        post_id = data.get("id")
        existing = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        before = len(existing.get("posts", []))
        existing["posts"] = [p for p in existing.get("posts", []) if p.get("id") != post_id]

        if len(existing["posts"]) == before:
            self._json({"success": False, "error": "id not found"})
            return

        existing["last_updated"] = datetime.now(timezone.utc).isoformat()
        DATA_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  [delete] removed id: {post_id}")
        self._json({"success": True})

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} {fmt % args}")


os.chdir(Path(__file__).parent)
print(f"Dev server → http://localhost:{PORT}")
HTTPServer(("", PORT), Handler).serve_forever()
