#!/usr/bin/env python3
"""Announce an autopilot-built site to Bluesky from a dedicated bot account.

Reads ``auto/<slug>/ANNOUNCE.md``, substitutes the ``%%SITE_URL%%`` token with
the deployed URL ($SITE_URL), and posts it from the bot account — threaded if
the text exceeds the 300-char limit.

This is deliberately isolated from ``src/post_thread.py``'s main-account thread
pipeline: it only ever authenticates the bot account and never posts from the
primary handle. It reuses post_thread's proven API/facet helpers.

Usage:
    python3 src/announce_site.py auto/<slug>

Env:
    SITE_URL                     live URL to substitute for %%SITE_URL%%
    BLUESKY_BOT_HANDLE           bot account handle   (falls back to MODULO)
    BLUESKY_BOT_APP_PASSWORD     bot account app pw   (falls back to MODULO)
"""

import os
import sys
import time

from post_thread import authenticate, parse_richtext, create_post, CHAR_LIMIT


def chunk(text, limit=CHAR_LIMIT):
    """Split text into <=limit-char pieces on word boundaries."""
    words = text.split()
    chunks, cur = [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > limit:
            chunks.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        chunks.append(cur)
    return chunks or [text[:limit]]


def main():
    if len(sys.argv) < 2:
        print("usage: announce_site.py auto/<slug>", file=sys.stderr)
        sys.exit(2)

    site_dir = sys.argv[1].rstrip("/")
    announce_path = os.path.join(site_dir, "ANNOUNCE.md")
    if not os.path.exists(announce_path):
        print(f"No ANNOUNCE.md in {site_dir}; nothing to post.", file=sys.stderr)
        sys.exit(0)

    with open(announce_path, encoding="utf-8") as f:
        body = f.read().strip()

    site_url = os.environ.get("SITE_URL", "").strip()
    if "%%SITE_URL%%" in body:
        body = body.replace("%%SITE_URL%%", site_url).strip()
    elif site_url and site_url not in body:
        body = f"{body}\n{site_url}".strip()

    if not body:
        print("Empty announce body; skipping.", file=sys.stderr)
        sys.exit(0)

    handle = os.environ.get("BLUESKY_BOT_HANDLE") or os.environ.get("BLUESKY_MODULO_HANDLE", "")
    password = os.environ.get("BLUESKY_BOT_APP_PASSWORD") or os.environ.get("BLUESKY_MODULO_APP_PASSWORD", "")

    did, token = authenticate(handle, password)
    if not did or not token:
        print("ERROR: bot account authentication failed", file=sys.stderr)
        sys.exit(1)

    pieces = chunk(body)
    root_ref = parent_ref = None
    for i, piece in enumerate(pieces):
        clean, facets = parse_richtext(piece)
        reply = None
        if root_ref and parent_ref:
            reply = {"root": root_ref, "parent": parent_ref}
        uri, cid = create_post(clean, facets, did, token, reply_ref=reply)
        if not uri:
            print(f"Announce post {i + 1}/{len(pieces)} failed; stopping.", file=sys.stderr)
            sys.exit(1)
        ref = {"uri": uri, "cid": cid}
        if root_ref is None:
            root_ref = ref
        parent_ref = ref
        print(f"  Announced ({i + 1}/{len(pieces)}) @{handle}: {uri}")
        if i + 1 < len(pieces):
            time.sleep(2)


if __name__ == "__main__":
    main()
