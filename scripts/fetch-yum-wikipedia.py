#!/usr/bin/env python3
"""
Pre-fetch Wikipedia data for all Yum food pool entries.

Fetches thumbnail URLs and extracts for all ~780 foods via the
Wikipedia API, outputs a compact JSON file for browser-side use.

Output format:
  {
    "count": 780,
    "fetched_at": "2026-04-03T...",
    "foods": {
      "Apple": { "thumb": "https://...", "extract": "An apple is..." },
      "Banana": { "thumb": "https://...", "extract": "A banana is..." },
      ...
    }
  }

Usage:
    pip install requests
    python3 scripts/fetch-yum-wikipedia.py

    python3 scripts/fetch-yum-wikipedia.py \
        --pool-js cards/js/yum-pool.js \
        --output cards/data/yum-wikipedia.json
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

import requests


WIKI_API = "https://en.wikipedia.org/w/api.php"
BATCH_SIZE = 20  # Wikipedia API limit for prop queries
REQUEST_DELAY = 0.2


def parse_pool_js(path):
    """Extract food titles from yum-pool.js."""
    with open(path) as f:
        content = f.read()
    pattern = r'f\("([^"]+)",\s*"([^"]+)"\)'
    matches = re.findall(pattern, content)
    print(f"Parsed {len(matches)} foods from {path}", file=sys.stderr)
    return matches


def fetch_batch(titles, session):
    """Fetch thumbnail + extract for a batch of titles (max 20)."""
    params = {
        "action": "query",
        "titles": "|".join(titles),
        "prop": "extracts|pageimages",
        "exintro": True,
        "explaintext": True,
        "piprop": "thumbnail",
        "pithumbsize": 300,
        "format": "json",
        "origin": "*",
    }
    try:
        resp = session.get(WIKI_API, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        pages = data.get("query", {}).get("pages", {})

        results = {}
        for page in pages.values():
            if page.get("pageid"):
                title = page["title"]
                entry = {}
                thumb = page.get("thumbnail", {}).get("source")
                if thumb:
                    entry["thumb"] = thumb
                extract = page.get("extract", "")
                if extract:
                    # Truncate long extracts to ~300 chars
                    if len(extract) > 350:
                        cut = extract[:300].rfind(". ")
                        if cut > 100:
                            extract = extract[:cut + 1]
                        else:
                            extract = extract[:300] + "..."
                    entry["extract"] = extract
                results[title] = entry
        return results
    except Exception as e:
        print(f"  Batch error: {e}", file=sys.stderr)
        return {}


def main():
    parser = argparse.ArgumentParser(description="Pre-fetch Wikipedia data for Yum foods")
    parser.add_argument("--pool-js", default="cards/js/yum-pool.js")
    parser.add_argument("--output", default="cards/data/yum-wikipedia.json")
    args = parser.parse_args()

    foods = parse_pool_js(args.pool_js)
    titles = [f[0] for f in foods]
    categories = {f[0]: f[1] for f in foods}

    session = requests.Session()
    session.headers.update({
        "User-Agent": "YumCards/1.0 (https://cards.mino.mobi/yum; educational project)"
    })

    all_data = {}
    total = len(titles)

    for i in range(0, total, BATCH_SIZE):
        batch = titles[i:i + BATCH_SIZE]
        results = fetch_batch(batch, session)
        all_data.update(results)

        fetched = len(all_data)
        print(f"  {min(i + BATCH_SIZE, total)}/{total} queried, "
              f"{fetched} found", file=sys.stderr)
        time.sleep(REQUEST_DELAY)

    # Match back — Wikipedia may normalize titles differently
    # Build a lookup for case-insensitive matching
    wiki_lower = {k.lower(): k for k in all_data}

    # Final output: keyed by our pool title
    output_foods = {}
    matched = 0
    with_thumb = 0
    for title in titles:
        if title in all_data:
            output_foods[title] = all_data[title]
            matched += 1
            if "thumb" in all_data[title]:
                with_thumb += 1
        elif title.lower() in wiki_lower:
            wiki_title = wiki_lower[title.lower()]
            output_foods[title] = all_data[wiki_title]
            matched += 1
            if "thumb" in all_data[wiki_title]:
                with_thumb += 1
        else:
            # Try without disambiguation suffix
            clean = re.sub(r'\s*\([^)]*\)', '', title).strip()
            if clean in all_data:
                output_foods[title] = all_data[clean]
                matched += 1
                if "thumb" in all_data[clean]:
                    with_thumb += 1
            elif clean.lower() in wiki_lower:
                wiki_title = wiki_lower[clean.lower()]
                output_foods[title] = all_data[wiki_title]
                matched += 1
                if "thumb" in all_data[wiki_title]:
                    with_thumb += 1

    output = {
        "count": len(titles),
        "matched": matched,
        "with_thumbnails": with_thumb,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "foods": output_foods,
    }

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(output, f, separators=(",", ":"), ensure_ascii=False)

    size_kb = os.path.getsize(args.output) // 1024
    print(f"\nDone! {matched}/{total} matched, {with_thumb} with thumbnails",
          file=sys.stderr)
    print(f"Wrote {args.output} ({size_kb}KB)", file=sys.stderr)

    # Show some misses
    misses = [t for t in titles if t not in output_foods]
    if misses:
        print(f"\nMissed {len(misses)} foods:", file=sys.stderr)
        for m in misses[:20]:
            print(f"  - {m}", file=sys.stderr)


if __name__ == "__main__":
    main()
