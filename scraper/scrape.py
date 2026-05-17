"""
Threads scraper for NMIXX 高雄場應援資訊
Runs via GitHub Actions; writes to ../data/posts.json
"""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

USERNAME = os.environ["THREADS_USERNAME"]
PASSWORD = os.environ["THREADS_PASSWORD"]

DATA_FILE = Path(__file__).parent.parent / "data" / "posts.json"

QUERIES = [
    "NMIXX 演唱會應援",
    "NMIXX 高雄應援",
    "NMIXX 高雄場",
    "NMIXX ZERO FRONTIER 高雄",
    "NMIXX KAOHSIUNG 應援",
]

# Only keep posts from May–July 2026
DATE_FROM = datetime(2026, 5, 1, tzinfo=timezone.utc)
DATE_TO   = datetime(2026, 7, 31, 23, 59, tzinfo=timezone.utc)


def login(page):
    print("→ Logging in to Threads...")
    page.goto("https://www.threads.net/login", wait_until="domcontentloaded")
    time.sleep(3)

    # Threads login uses Instagram's auth flow
    try:
        page.wait_for_selector('input[autocomplete="username"]', timeout=10000)
        page.fill('input[autocomplete="username"]', USERNAME)
        page.fill('input[autocomplete="current-password"]', PASSWORD)
        page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle", timeout=20000)
        time.sleep(4)
        print("  Login done")
    except PWTimeout:
        print("  Login timeout — may already be on a logged-in state or selector changed")


def search_query(page, query):
    """Navigate to Threads search and extract post cards."""
    encoded = query.replace(" ", "%20").replace("：", "%EF%BC%9A")
    url = f"https://www.threads.net/search?q={encoded}&serp_type=default"

    try:
        page.goto(url, wait_until="domcontentloaded", timeout=20000)
        time.sleep(3)
        page.wait_for_load_state("networkidle", timeout=10000)
    except PWTimeout:
        pass

    posts = []
    # Try to grab post containers — selectors may need updating if Threads changes its DOM
    cards = page.query_selector_all('article, [role="article"], [data-pressable-container]')

    for card in cards[:25]:
        try:
            # Text
            text_el = (
                card.query_selector('[data-testid="thread_post_text"]')
                or card.query_selector('[dir="auto"]')
            )
            if not text_el:
                continue
            text = text_el.inner_text().strip()
            if not text or len(text) < 5:
                continue

            # Username
            username = "unknown"
            user_el = card.query_selector('a[href^="/@"]')
            if user_el:
                username = user_el.get_attribute("href").lstrip("/@") or "unknown"

            # Post URL
            url_el = card.query_selector('a[href*="/post/"]')
            post_url = None
            if url_el:
                href = url_el.get_attribute("href") or ""
                post_url = f"https://www.threads.net{href}" if href.startswith("/") else href

            posts.append({
                "id": post_url or f"{username}_{abs(hash(text)) % 99999}",
                "username": username,
                "text": text,
                "url": post_url,
                "date": datetime.now(timezone.utc).strftime("%Y/%m/%d"),
                "source": "threads",
            })
        except Exception as e:
            print(f"    card parse error: {e}")
            continue

    return posts


def scrape():
    all_posts = []
    seen_ids = set()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
        ctx = browser.new_context(
            locale="zh-TW",
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        )
        page = ctx.new_page()

        login(page)

        for query in QUERIES:
            print(f"→ Searching: {query}")
            posts = search_query(page, query)
            for p in posts:
                if p["id"] not in seen_ids:
                    seen_ids.add(p["id"])
                    all_posts.append(p)
            print(f"  {len(posts)} posts found ({len(all_posts)} total unique)")
            time.sleep(2)

        browser.close()

    # Preserve existing community submissions
    existing = {"posts": [], "last_updated": None}
    if DATA_FILE.exists():
        existing = json.loads(DATA_FILE.read_text(encoding="utf-8"))

    community = [p for p in existing.get("posts", []) if p.get("source") == "community"]

    output = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "posts": all_posts + community,
    }

    DATA_FILE.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✓ Saved {len(all_posts)} Threads + {len(community)} community posts → data/posts.json")


if __name__ == "__main__":
    scrape()
