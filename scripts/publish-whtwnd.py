#!/usr/bin/env python3
"""
Publish markdown files as com.whtwnd.blog.entry records to an ATProto PDS.

Reads markdown files with YAML frontmatter, authenticates to the PDS,
and creates or updates WhiteWind blog entries. Matches by title to
avoid duplicates — if an entry with the same title already exists,
it is updated in place via putRecord.

Frontmatter format:
    ---
    title: "Article Title"
    subtitle: "By Modulo, with Morphyx"
    createdAt: "2026-02-19T12:00:00.000Z"
    visibility: "public"
    ---
    Markdown content here...

Usage:
    export BLUESKY_HANDLE=minomobi.bsky.social
    export BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

    python3 scripts/publish-whtwnd.py time/entries/2026-02-19-cheyava-falls.md
    python3 scripts/publish-whtwnd.py time/entries/*.md
"""

import json
import mimetypes
import os
import re
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BSKY_PUBLIC_API = "https://public.api.bsky.app"
COLLECTION = "com.whtwnd.blog.entry"
MAX_RETRIES = 4
RETRY_BASE_DELAY = 3

# Markdown image pattern: ![alt](path)
IMAGE_RE = re.compile(r'!\[([^\]]*)\]\(([^)]+)\)')


# --- Frontmatter parsing ---

def parse_frontmatter(text):
    """Parse YAML-like frontmatter from markdown text."""
    match = re.match(r'^---\n(.*?)\n---\n(.*)', text, re.DOTALL)
    if not match:
        return {}, text
    meta = {}
    for line in match.group(1).split('\n'):
        line = line.strip()
        if ':' in line:
            key, val = line.split(':', 1)
            val = val.strip().strip('"').strip("'")
            meta[key.strip()] = val
    return meta, match.group(2)


# --- ATProto API (same patterns as sync-otol-to-atproto.py) ---

def resolve_handle(handle):
    url = f"{BSKY_PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle={handle}"
    with urlopen(Request(url), timeout=15) as resp:
        return json.loads(resp.read())["did"]


def resolve_pds(did):
    if did.startswith("did:plc:"):
        url = f"https://plc.directory/{did}"
    elif did.startswith("did:web:"):
        host = did.split(":")[-1]
        url = f"https://{host}/.well-known/did.json"
    else:
        raise ValueError(f"Unknown DID method: {did}")

    with urlopen(Request(url), timeout=15) as resp:
        doc = json.loads(resp.read())

    for svc in doc.get("service", []):
        if svc.get("type") == "AtprotoPersonalDataServer":
            return svc["serviceEndpoint"]
    raise ValueError(f"No PDS endpoint in DID doc for {did}")


def create_session(pds, handle, password):
    url = f"{pds}/xrpc/com.atproto.server.createSession"
    data = json.dumps({"identifier": handle, "password": password}).encode()
    req = Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=15) as resp:
        session = json.loads(resp.read())
    return session["accessJwt"], session["did"]


def list_entries(pds, did, token):
    """List all existing blog entries, returning {title: rkey} mapping."""
    entries = {}
    cursor = None
    while True:
        url = f"{pds}/xrpc/com.atproto.repo.listRecords?repo={did}&collection={COLLECTION}&limit=100"
        if cursor:
            url += f"&cursor={cursor}"
        req = Request(url, headers={"Authorization": f"Bearer {token}"})
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        for rec in data.get("records", []):
            title = rec.get("value", {}).get("title", "")
            rkey = rec["uri"].split("/")[-1]
            if title:
                entries[title] = rkey
        cursor = data.get("cursor")
        if not cursor or not data.get("records"):
            break
    return entries


def put_record(pds, did, token, rkey, record):
    """Create or update a record with a specific rkey."""
    url = f"{pds}/xrpc/com.atproto.repo.putRecord"
    payload = {
        "repo": did,
        "collection": COLLECTION,
        "rkey": rkey,
        "record": {
            "$type": COLLECTION,
            **record,
        },
    }
    data = json.dumps(payload).encode()
    req = Request(url, data=data, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    })

    for attempt in range(MAX_RETRIES + 1):
        try:
            with urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except HTTPError as exc:
            if exc.code == 429 and attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                print(f"  Rate limited, retrying in {delay}s...")
                time.sleep(delay)
                continue
            body = exc.read().decode() if hasattr(exc, 'read') else ""
            raise RuntimeError(f"putRecord failed ({exc.code}): {body}") from exc


def upload_blob(pds, token, filepath):
    """Upload a file as a blob and return the CID."""
    mime, _ = mimetypes.guess_type(filepath)
    if not mime:
        mime = "application/octet-stream"
    with open(filepath, "rb") as f:
        body = f.read()
    req = Request(
        f"{pds}/xrpc/com.atproto.repo.uploadBlob",
        data=body,
        headers={
            "Content-Type": mime,
            "Authorization": f"Bearer {token}",
        },
    )
    for attempt in range(MAX_RETRIES + 1):
        try:
            with urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
            cid = data["blob"]["ref"]["$link"]
            size = data["blob"]["size"]
            print(f"    Uploaded blob {os.path.basename(filepath)} ({size} bytes) → {cid}")
            return cid
        except HTTPError as exc:
            if exc.code == 429 and attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                print(f"    Rate limited on blob upload, retrying in {delay}s...")
                time.sleep(delay)
                continue
            body_text = exc.read().decode() if hasattr(exc, 'read') else ""
            raise RuntimeError(f"uploadBlob failed ({exc.code}): {body_text}") from exc


def rewrite_images(content, entry_dir, pds, did, token):
    """Find local image refs in markdown, upload as blobs, rewrite URLs."""
    def replace_match(m):
        alt = m.group(1)
        path = m.group(2)
        # Skip URLs and data URIs — only process local paths
        if path.startswith(("http://", "https://", "data:")):
            return m.group(0)
        # Resolve relative to the entry file's directory
        abs_path = os.path.normpath(os.path.join(entry_dir, path))
        if not os.path.isfile(abs_path):
            print(f"    WARNING: Image not found: {abs_path}, keeping original ref")
            return m.group(0)
        cid = upload_blob(pds, token, abs_path)
        blob_url = f"{pds}/xrpc/com.atproto.sync.getBlob?did={did}&cid={cid}"
        return f"![{alt}]({blob_url})"

    return IMAGE_RE.sub(replace_match, content)


def create_record(pds, did, token, record):
    """Create a new record (PDS generates TID rkey)."""
    url = f"{pds}/xrpc/com.atproto.repo.createRecord"
    payload = {
        "repo": did,
        "collection": COLLECTION,
        "record": {
            "$type": COLLECTION,
            **record,
        },
    }
    data = json.dumps(payload).encode()
    req = Request(url, data=data, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    })

    for attempt in range(MAX_RETRIES + 1):
        try:
            with urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except HTTPError as exc:
            if exc.code == 429 and attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                print(f"  Rate limited, retrying in {delay}s...")
                time.sleep(delay)
                continue
            body = exc.read().decode() if hasattr(exc, 'read') else ""
            raise RuntimeError(f"createRecord failed ({exc.code}): {body}") from exc


# --- Main ---

def main():
    if len(sys.argv) < 2:
        print("Usage: publish-whtwnd.py <file.md> [file2.md ...]")
        sys.exit(1)

    handle = os.environ.get("BLUESKY_HANDLE")
    password = os.environ.get("BLUESKY_APP_PASSWORD")
    if not handle or not password:
        print("Error: BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set")
        sys.exit(1)

    # Authenticate
    print(f"Resolving {handle}...")
    did = resolve_handle(handle)
    pds = resolve_pds(did)
    print(f"PDS: {pds}")
    token, did = create_session(pds, handle, password)
    print(f"Authenticated as {did}")

    # List existing entries for title matching
    print("Listing existing entries...")
    existing = list_entries(pds, did, token)
    print(f"Found {len(existing)} existing entries")

    # Process each file
    for filepath in sys.argv[1:]:
        if not os.path.isfile(filepath):
            print(f"Skipping {filepath} (not a file)")
            continue

        print(f"\nProcessing {filepath}...")
        with open(filepath, "r", encoding="utf-8") as f:
            text = f.read()

        meta, content = parse_frontmatter(text)
        title = meta.get("title", "")
        if not title:
            print(f"  WARNING: No title in frontmatter, skipping")
            continue

        # Upload local images as blobs, rewrite URLs in markdown
        entry_dir = os.path.dirname(os.path.abspath(filepath))
        content = rewrite_images(content.strip(), entry_dir, pds, did, token)

        record = {
            "content": content,
            "title": title,
            "visibility": meta.get("visibility", "public"),
        }
        if meta.get("subtitle"):
            record["subtitle"] = meta["subtitle"]
        if meta.get("createdAt"):
            record["createdAt"] = meta["createdAt"]

        if title in existing:
            rkey = existing[title]
            print(f"  Updating existing entry (rkey={rkey}): {title}")
            result = put_record(pds, did, token, rkey, record)
        else:
            print(f"  Creating new entry: {title}")
            result = create_record(pds, did, token, record)

        uri = result.get("uri", "?")
        print(f"  Done: {uri}")
        time.sleep(1)  # gentle rate limiting between writes

    print("\nAll done.")


if __name__ == "__main__":
    main()
