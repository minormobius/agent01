#!/usr/bin/env python3
"""Post threads to Bluesky with multi-account minophim replies.

Post format (markdown files in posts/):

    ---
    Thread title
    ---
    Main post from @minomobi.com
    ---
    Another main post (thread continues)
    ---
    @modulo
    Modulo's comment — replies to the thread root.
    ---
    @morphyx
    Morphyx's reply — replies to Modulo's comment.

Sections without an @marker post from the main account as a thread chain.
Sections starting with @modulo or @morphyx post from those accounts as
replies branching off the thread root (minophim chain among themselves).
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen

MAX_POSTS = 12  # increased from 9 to accommodate minophim replies
CHAR_LIMIT = 300


# ---------------------------------------------------------------------------
# Bluesky API helpers
# ---------------------------------------------------------------------------

def api_call(endpoint, data, token=None):
    """POST to the Bluesky XRPC API. Returns parsed JSON."""
    url = f"https://bsky.social/xrpc/{endpoint}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body = json.dumps(data).encode()
    req = Request(url, data=body, headers=headers, method="POST")

    try:
        with urlopen(req) as resp:
            return json.loads(resp.read())
    except HTTPError as exc:
        try:
            error_body = json.loads(exc.read())
        except Exception:
            error_body = {"status": exc.code, "error": str(exc)}
        print(f"API error ({endpoint}): {error_body}", file=sys.stderr)
        return error_body


def authenticate(handle, password):
    """Authenticate with Bluesky. Returns (did, access_token) or (None, None)."""
    if not handle or not password:
        return None, None

    resp = api_call("com.atproto.server.createSession", {
        "identifier": handle,
        "password": password,
    })

    did = resp.get("did")
    token = resp.get("accessJwt")

    if did and token:
        print(f"  Authenticated: {handle} ({did})")
        return did, token

    print(f"  Auth failed for {handle}: {resp}", file=sys.stderr)
    return None, None


# ---------------------------------------------------------------------------
# Rich text (markdown links → Bluesky facets)
# ---------------------------------------------------------------------------

def parse_richtext(text):
    """Convert markdown link syntax to plain text + Bluesky facets list."""
    facets = []

    # Pass 1: [display](url) → display text + link facet
    clean = ""
    last = 0
    for m in re.finditer(r'\[([^\]]+)\]\(([^)]+)\)', text):
        clean += text[last:m.start()]
        display, url = m.group(1), m.group(2)
        byte_start = len(clean.encode("utf-8"))
        clean += display
        byte_end = len(clean.encode("utf-8"))
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        facets.append({
            "index": {"byteStart": byte_start, "byteEnd": byte_end},
            "features": [{"$type": "app.bsky.richtext.facet#link", "uri": url}],
        })
        last = m.end()
    clean += text[last:]

    # Pass 2: bare https:// URLs
    for m in re.finditer(r'https?://[^\s\)\]]+', clean):
        url = m.group(0).rstrip(".,;:!?")
        bs = len(clean[:m.start()].encode("utf-8"))
        be = bs + len(url.encode("utf-8"))
        if not any(f["index"]["byteStart"] <= bs and f["index"]["byteEnd"] >= be for f in facets):
            facets.append({
                "index": {"byteStart": bs, "byteEnd": be},
                "features": [{"$type": "app.bsky.richtext.facet#link", "uri": url}],
            })

    # Pass 3: bare domains (minomobi.com, etc.)
    domain_re = r'(?<![/\w@])([a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|org|net|io|co|dev|social|app)\b[/\w.-]*)'
    for m in re.finditer(domain_re, clean):
        dt = m.group(0).rstrip(".,;:!?")
        bs = len(clean[:m.start()].encode("utf-8"))
        be = bs + len(dt.encode("utf-8"))
        if not any(f["index"]["byteStart"] <= bs and f["index"]["byteEnd"] >= be for f in facets):
            facets.append({
                "index": {"byteStart": bs, "byteEnd": be},
                "features": [{"$type": "app.bsky.richtext.facet#link", "uri": "https://" + dt}],
            })

    facets.sort(key=lambda f: f["index"]["byteStart"])
    return clean, facets


# ---------------------------------------------------------------------------
# Posting
# ---------------------------------------------------------------------------

def create_post(text, facets, did, token, reply_ref=None):
    """Create a post. Returns (uri, cid) or (None, None) on failure."""
    record = {
        "$type": "app.bsky.feed.post",
        "text": text,
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }
    if facets:
        record["facets"] = facets
    if reply_ref:
        record["reply"] = reply_ref

    resp = api_call("com.atproto.repo.createRecord", {
        "repo": did,
        "collection": "app.bsky.feed.post",
        "record": record,
    }, token=token)

    uri = resp.get("uri")
    cid = resp.get("cid")
    if not uri:
        print(f"  Post failed: {resp}", file=sys.stderr)
    return uri, cid


# ---------------------------------------------------------------------------
# Post file parsing
# ---------------------------------------------------------------------------

MINOPHIM = {"modulo", "morphyx"}


def parse_post_file(filepath):
    """Parse a post markdown file into (title, sections).

    Each section is a tuple: (account_key, text)
      account_key: "main" | "modulo" | "morphyx"
    """
    with open(filepath) as f:
        content = f.read()

    parts = re.split(r'^---\s*$', content, flags=re.MULTILINE)

    # parts[0] = before first ---  (usually empty)
    # parts[1] = title block
    # parts[2:] = post sections
    if len(parts) < 3:
        return "", []

    title = parts[1].strip()
    sections = []

    for raw in parts[2:]:
        text = raw.strip()
        if not text:
            continue

        lines = text.split("\n", 1)
        first_line = lines[0].strip().lower()

        # Detect @modulo / @morphyx marker
        if first_line.lstrip("@") in MINOPHIM and first_line.startswith("@"):
            account = first_line[1:]
            body = lines[1].strip() if len(lines) > 1 else ""
            if body:
                sections.append((account, body))
        else:
            sections.append(("main", text))

    return title, sections


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def process_file(filepath, accounts):
    """Post a single thread file. Returns number of posts created."""
    title, sections = parse_post_file(filepath)
    if not sections:
        print(f"  No content in {filepath}, skipping")
        return 0

    main_count = sum(1 for a, _ in sections if a == "main")
    mino_count = sum(1 for a, _ in sections if a != "main")
    print(f"  Title: {title}")
    print(f"  Sections: {len(sections)} ({main_count} main, {mino_count} minophim)")

    # Thread tracking
    thread_root_uri = None
    thread_root_cid = None
    main_parent_uri = None      # chains main account posts
    main_parent_cid = None
    minophim_parent_uri = None  # chains minophim replies
    minophim_parent_cid = None
    post_count = 0

    for account_key, text in sections:
        if post_count >= MAX_POSTS:
            print(f"  Reached max posts ({MAX_POSTS}), stopping")
            break

        if account_key not in accounts:
            print(f"  WARNING: No credentials for @{account_key}, skipping")
            continue

        acct = accounts[account_key]
        clean_text, facets = parse_richtext(text)

        # Truncate if over limit
        if len(clean_text) > CHAR_LIMIT:
            print(f"  WARNING: Post is {len(clean_text)} chars, truncating")
            clean_text = clean_text[:CHAR_LIMIT - 3] + "..."
            byte_limit = len(clean_text.encode("utf-8"))
            facets = [f for f in facets if f["index"]["byteEnd"] <= byte_limit]

        # Build reply reference
        reply_ref = None
        if account_key == "main" and thread_root_uri:
            # Main thread: chain off previous main post
            reply_ref = {
                "root": {"uri": thread_root_uri, "cid": thread_root_cid},
                "parent": {"uri": main_parent_uri, "cid": main_parent_cid},
            }
        elif account_key in MINOPHIM and thread_root_uri:
            if minophim_parent_uri:
                # Subsequent minophim: reply to previous minophim comment
                reply_ref = {
                    "root": {"uri": thread_root_uri, "cid": thread_root_cid},
                    "parent": {"uri": minophim_parent_uri, "cid": minophim_parent_cid},
                }
            else:
                # First minophim: reply to thread root
                reply_ref = {
                    "root": {"uri": thread_root_uri, "cid": thread_root_cid},
                    "parent": {"uri": thread_root_uri, "cid": thread_root_cid},
                }

        uri, cid = create_post(
            clean_text, facets, acct["did"], acct["token"], reply_ref
        )

        if not uri:
            print(f"  Post failed for @{account_key}, continuing...")
            continue

        post_count += 1
        facet_info = f", {len(facets)} links" if facets else ""
        print(f"  Posted ({post_count}/{MAX_POSTS}) @{account_key}{facet_info}: {uri}")

        # Update tracking refs
        if not thread_root_uri:
            thread_root_uri = uri
            thread_root_cid = cid

        if account_key == "main":
            main_parent_uri = uri
            main_parent_cid = cid
        else:
            minophim_parent_uri = uri
            minophim_parent_cid = cid

        time.sleep(2)

    return post_count


def main():
    if len(sys.argv) < 2:
        print("Usage: post_thread.py <post_file> [post_file...]")
        sys.exit(1)

    # --- Authenticate all accounts ---
    print("Authenticating...")
    accounts = {}

    # Main account (required)
    did, token = authenticate(
        os.environ.get("BLUESKY_HANDLE", ""),
        os.environ.get("BLUESKY_APP_PASSWORD", ""),
    )
    if not did:
        print("ERROR: Main account authentication failed", file=sys.stderr)
        sys.exit(1)
    accounts["main"] = {"did": did, "token": token}

    # Modulo (optional)
    did, token = authenticate(
        os.environ.get("BLUESKY_MODULO_HANDLE", ""),
        os.environ.get("BLUESKY_MODULO_APP_PASSWORD", ""),
    )
    if did:
        accounts["modulo"] = {"did": did, "token": token}

    # Morphyx (optional)
    did, token = authenticate(
        os.environ.get("BLUESKY_MORPHYX_HANDLE", ""),
        os.environ.get("BLUESKY_MORPHYX_APP_PASSWORD", ""),
    )
    if did:
        accounts["morphyx"] = {"did": did, "token": token}

    print(f"Accounts ready: {', '.join(accounts.keys())}")

    # --- Process each post file ---
    total = 0
    for filepath in sys.argv[1:]:
        print(f"\nProcessing: {filepath}")
        total += process_file(filepath, accounts)

    print(f"\nDone. {total} posts created.")


if __name__ == "__main__":
    main()
