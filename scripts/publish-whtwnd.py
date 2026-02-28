#!/usr/bin/env python3
"""
Publish markdown files as com.whtwnd.blog.entry records to an ATProto PDS.

Images go straight from your filesystem to the PDS as blobs — they never
need to live in git. The script uploads blobs, rewrites the markdown with
permanent getBlob URLs, creates the record, and (with --rewrite) updates
the source file so the repo version has the final URLs.

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

    # Images alongside the markdown (resolved from entry dir)
    python3 scripts/publish-whtwnd.py time/entries/article.md

    # Images from an external directory (never touch git)
    python3 scripts/publish-whtwnd.py time/entries/article.md -I ~/images/

    # Upload, publish, and rewrite the source file with blob URLs
    python3 scripts/publish-whtwnd.py time/entries/article.md -I ~/images/ --rewrite
"""

import argparse
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
    """Parse YAML-like frontmatter from markdown text.

    Returns (meta_dict, content_string, frontmatter_block_string).
    The frontmatter block includes the --- delimiters and trailing newline,
    so it can be prepended verbatim when rewriting the file.
    """
    match = re.match(r'^(---\n.*?\n---\n)(.*)', text, re.DOTALL)
    if not match:
        return {}, text, ""
    frontmatter_block = match.group(1)
    meta = {}
    # Parse the YAML lines between the --- delimiters
    inner = frontmatter_block.strip().strip('-').strip()
    for line in inner.split('\n'):
        line = line.strip()
        if ':' in line:
            key, val = line.split(':', 1)
            val = val.strip().strip('"').strip("'")
            meta[key.strip()] = val
    return meta, match.group(2), frontmatter_block


# --- ATProto API ---

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
    """Upload a file as a blob and return the full BlobRef object."""
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
            blobref = data["blob"]
            cid = blobref["ref"]["$link"]
            size = blobref.get("size", len(body))
            print(f"    Uploaded blob {os.path.basename(filepath)} ({size} bytes) -> {cid}")
            return blobref
        except HTTPError as exc:
            if exc.code == 429 and attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                print(f"    Rate limited on blob upload, retrying in {delay}s...")
                time.sleep(delay)
                continue
            body_text = exc.read().decode() if hasattr(exc, 'read') else ""
            raise RuntimeError(f"uploadBlob failed ({exc.code}): {body_text}") from exc


def resolve_image_path(ref_path, entry_dir, image_dir=None):
    """Resolve a markdown image ref to an actual file on disk.

    Search order:
      1. --image-dir (basename match, then full relative path)
      2. Entry file's directory (relative path)
    """
    if image_dir:
        # Try basename match (e.g., "figures/photo.jpg" finds "photo.jpg" in image_dir)
        candidate = os.path.normpath(os.path.join(image_dir, os.path.basename(ref_path)))
        if os.path.isfile(candidate):
            return candidate
        # Try full relative path under image_dir
        candidate = os.path.normpath(os.path.join(image_dir, ref_path))
        if os.path.isfile(candidate):
            return candidate
    # Fall back to entry directory
    candidate = os.path.normpath(os.path.join(entry_dir, ref_path))
    if os.path.isfile(candidate):
        return candidate
    return None


def rewrite_images(content, entry_dir, pds, did, token, image_dir=None):
    """Find local image refs, upload as blobs, rewrite URLs, return blob metadata.

    Returns (rewritten_content, blobs_array) where blobs_array contains
    WhiteWind blobMetadata objects that anchor blobs to the record.
    Without this array, the PDS garbage-collects uploaded blobs.
    """
    blobs = []

    def replace_match(m):
        alt = m.group(1)
        path = m.group(2)
        # Skip URLs and data URIs — only process local paths
        if path.startswith(("http://", "https://", "data:")):
            return m.group(0)
        abs_path = resolve_image_path(path, entry_dir, image_dir)
        if not abs_path:
            print(f"    WARNING: Image not found: {path}")
            if image_dir:
                print(f"             Searched: {image_dir} and {entry_dir}")
            else:
                print(f"             Searched: {entry_dir}")
            print(f"             Keeping original ref")
            return m.group(0)
        blobref = upload_blob(pds, token, abs_path)
        cid = blobref["ref"]["$link"]
        # Anchor blob to record via WhiteWind blobMetadata
        blobs.append({
            "blobref": blobref,
            "name": os.path.basename(abs_path),
        })
        blob_url = f"{pds}/xrpc/com.atproto.sync.getBlob?did={did}&cid={cid}"
        return f"![{alt}]({blob_url})"

    rewritten = IMAGE_RE.sub(replace_match, content)
    return rewritten, blobs


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
    parser = argparse.ArgumentParser(
        description="Publish markdown files as WhiteWind blog entries to an ATProto PDS.",
        epilog="Images go from your filesystem straight to the PDS. They never need to be in git.",
    )
    parser.add_argument("files", nargs="+", metavar="FILE",
                        help="Markdown files to publish")
    parser.add_argument("-I", "--image-dir",
                        help="Directory containing images referenced in markdown. "
                             "Images are resolved here first, then relative to the entry file.")
    parser.add_argument("--rewrite", action="store_true",
                        help="After publish, rewrite the source markdown file with "
                             "permanent PDS blob URLs. The rewritten file can be committed "
                             "to git without any local image dependencies.")
    args = parser.parse_args()

    handle = os.environ.get("BLUESKY_HANDLE")
    password = os.environ.get("BLUESKY_APP_PASSWORD")
    if not handle or not password:
        print("Error: BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set")
        sys.exit(1)

    image_dir = None
    if args.image_dir:
        image_dir = os.path.abspath(args.image_dir)
        if not os.path.isdir(image_dir):
            print(f"Error: --image-dir does not exist: {image_dir}")
            sys.exit(1)
        print(f"Image directory: {image_dir}")

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
    for filepath in args.files:
        if not os.path.isfile(filepath):
            print(f"Skipping {filepath} (not a file)")
            continue

        print(f"\nProcessing {filepath}...")
        with open(filepath, "r", encoding="utf-8") as f:
            text = f.read()

        meta, content, frontmatter_block = parse_frontmatter(text)
        title = meta.get("title", "")
        if not title:
            print(f"  WARNING: No title in frontmatter, skipping")
            continue

        # Upload local images as blobs, rewrite URLs in markdown
        entry_dir = os.path.dirname(os.path.abspath(filepath))
        content_stripped = content.strip()
        rewritten_content, blobs = rewrite_images(
            content_stripped, entry_dir, pds, did, token, image_dir
        )

        record = {
            "content": rewritten_content,
            "title": title,
            "visibility": meta.get("visibility", "public"),
        }
        # Anchor blobs to the record (WhiteWind blobMetadata schema).
        # Without this, the PDS garbage-collects uploaded blobs.
        if blobs:
            record["blobs"] = blobs
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
        print(f"  Published: {uri}")

        # Rewrite source file with permanent blob URLs
        if args.rewrite and rewritten_content != content_stripped:
            rewritten_file = frontmatter_block + "\n" + rewritten_content + "\n"
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(rewritten_file)
            print(f"  Rewrote {filepath} with blob URLs")

        time.sleep(1)  # gentle rate limiting between writes

    print("\nAll done.")


if __name__ == "__main__":
    main()
