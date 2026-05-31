"""
本地開發伺服器：靜態檔案 + /api/submit、/api/approve、/api/delete
用法：python dev-server.py
"""

import json
import os
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PORT       = 8765
POSTS_FILE   = Path(__file__).parent / "data" / "posts.json"
PENDING_FILE = Path(__file__).parent / "data" / "pending.json"


def _read_json(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"posts": []} if "posts" in path.name else {"pending": []}


def _write_json(path: Path, obj: dict):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/pending":
            self._json(_read_json(PENDING_FILE))
            return
        if path == "/api/posts":
            self._json(_read_json(POSTS_FILE))
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/submit":
            self._handle_submit()
        elif self.path == "/api/approve":
            self._handle_approve()
        elif self.path == "/api/delete":
            self._handle_delete()
        elif self.path == "/api/trigger":
            self._json({"success": True, "note": "dev mode — no actual scrape triggered"})
        elif self.path == "/api/edit":
            self._handle_edit()
        else:
            self.send_response(404)
            self.end_headers()

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        return body, json.loads(body)

    def _handle_submit(self):
        body, data = self._read_body()

        text_parts = [data.get("event_name", "")]
        if data.get("description"):
            text_parts.append(data["description"])
        text = "\n".join(p for p in text_parts if p)
        contact = data.get("contact", "")

        new_post = {
            "id": f"community_{abs(hash(body)) % 999999}",
            "username": data.get("organizer", ""),
            "text": text,
            "url": contact if contact.startswith("http") else None,
            "date": datetime.now(timezone.utc).strftime("%Y/%m/%d"),
            "source": "community",
            "venue_type": data.get("venue_type", ""),
            "day": data.get("day", "both"),
            "event_name": data.get("event_name", ""),
            "event_date": data.get("event_date", ""),
            "location": data.get("location", ""),
            "support_items": data.get("support_items", ""),
            "quantity": data.get("quantity", ""),
            "conditions": data.get("conditions", ""),
            "distribution_time": data.get("distribution_time", ""),
            "contact": contact,
        }

        pending = _read_json(PENDING_FILE)
        pending.setdefault("pending", []).append(new_post)
        _write_json(PENDING_FILE, pending)
        print(f"  [submit→pending] {new_post['username']} — {new_post['event_name']}")
        self._json({"success": True})

    def _handle_approve(self):
        _, data = self._read_body()
        post_id = data.get("id")

        pending = _read_json(PENDING_FILE)
        post = next((p for p in pending.get("pending", []) if p.get("id") == post_id), None)
        if not post:
            self._json({"success": False, "error": "not found in pending"})
            return

        posts = _read_json(POSTS_FILE)
        posts.setdefault("posts", []).append(post)
        posts["last_updated"] = datetime.now(timezone.utc).isoformat()
        _write_json(POSTS_FILE, posts)

        pending["pending"] = [p for p in pending.get("pending", []) if p.get("id") != post_id]
        _write_json(PENDING_FILE, pending)
        print(f"  [approve] {post.get('username')} — {post.get('event_name')}")
        self._json({"success": True})

    def _handle_edit(self):
        _, data = self._read_body()
        post_id = data.get("id")
        target  = data.get("target", "posts")
        fields  = data.get("fields", {})
        editable = {"event_name","text","location","support_items","quantity","conditions",
                    "distribution_time","url","day","venue_type"}
        fields = {k: v for k, v in fields.items() if k in editable}

        if target == "pending":
            obj = _read_json(PENDING_FILE); key = "pending"; path = PENDING_FILE
        else:
            obj = _read_json(POSTS_FILE); key = "posts"; path = POSTS_FILE

        updated = False
        for post in obj.get(key, []):
            if post.get("id") == post_id:
                post.update(fields)
                updated = True
                break

        if not updated:
            self._json({"success": False, "error": "post not found"})
            return

        if target != "pending":
            obj["last_updated"] = datetime.now(timezone.utc).isoformat()
        _write_json(path, obj)
        print(f"  [edit/{target}] id: {post_id}")
        self._json({"success": True})

    def _handle_delete(self):
        _, data = self._read_body()
        post_id = data.get("id")
        target  = data.get("target", "posts")

        if target == "pending":
            obj = _read_json(PENDING_FILE)
            key = "pending"
            path = PENDING_FILE
        else:
            obj = _read_json(POSTS_FILE)
            key = "posts"
            path = POSTS_FILE

        before = len(obj.get(key, []))
        obj[key] = [p for p in obj.get(key, []) if p.get("id") != post_id]
        if len(obj[key]) == before:
            self._json({"success": False, "error": "id not found"})
            return

        if target != "pending":
            obj["last_updated"] = datetime.now(timezone.utc).isoformat()
        _write_json(path, obj)
        print(f"  [delete/{target}] id: {post_id}")
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
