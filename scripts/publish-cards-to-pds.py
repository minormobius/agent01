#!/usr/bin/env python3
"""
Publish scored Wikipedia card data to ATProto PDS.

Reads deep-wikipedia.json (full scored catalog) and writes records to the PDS
as com.minomobi.cards.catalog entries — one record per Wikinatomy bin.
Each record contains all articles for that category with stats, extracts,
and thumbnail URLs. This eliminates the Wikipedia API dependency at runtime:
the card viewer reads from the PDS instead.

Usage:
    export BLUESKY_HANDLE=minomobi.com
    export BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

    # Publish all scored articles
    python3 scripts/publish-cards-to-pds.py

    # From specific input
    python3 scripts/publish-cards-to-pds.py --input cards/data/deep-wikipedia.json

    # Dry run — show what would be written
    python3 scripts/publish-cards-to-pds.py --dry-run

    # Replace existing records
    python3 scripts/publish-cards-to-pds.py --replace
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BSKY_PUBLIC_API = "https://public.api.bsky.app"
COLLECTION = "com.minomobi.cards.catalog"
MAX_RETRIES = 4
RETRY_BASE_DELAY = 3
BATCH_SIZE = 10
BATCH_DELAY = 2

BIN_ORDER = [
    "LIFE_SCI", "MEDICINE", "PHYS_SCI", "EARTH", "COSMOS", "MATH",
    "TECH", "GEO", "HISTORY", "MILITARY", "SOCIETY", "PHILOSOPHY",
    "LITERATURE", "VISUAL_ARTS", "MUSIC", "FILM", "SPORTS", "EVERYDAY",
]


# ── ATProto helpers (adapted from sync-otol-to-atproto.py) ──────

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


def list_existing_records(pds, did, token, collection=COLLECTION):
    existing = {}
    cursor = None
    while True:
        url = (f"{pds}/xrpc/com.atproto.repo.listRecords"
               f"?repo={did}&collection={collection}&limit=100")
        if cursor:
            url += f"&cursor={cursor}"
        req = Request(url, headers={"Authorization": f"Bearer {token}"})
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        for rec in data.get("records", []):
            rkey = rec["uri"].split("/")[-1]
            existing[rkey] = rec.get("value", {})
        cursor = data.get("cursor")
        if not cursor or not data.get("records"):
            break
    return existing


def put_record(pds, did, token, rkey, record):
    """Create or update a record using putRecord (idempotent)."""
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
    data = json.dumps(payload, ensure_ascii=False).encode()

    for attempt in range(MAX_RETRIES + 1):
        req = Request(url, data=data, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        })
        try:
            with urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read())
            return result.get("uri")
        except HTTPError as exc:
            body = exc.read().decode()
            if exc.code == 429 and attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                print(f"  Rate limited on {rkey}, retry {attempt + 1}/{MAX_RETRIES} in {delay}s",
                      file=sys.stderr)
                time.sleep(delay)
                continue
            print(f"  Error writing {rkey}: {exc.code} {body[:200]}", file=sys.stderr)
            return None


def delete_records(pds, did, token, rkeys):
    """Delete records in batches."""
    for i in range(0, len(rkeys), BATCH_SIZE):
        batch = rkeys[i:i + BATCH_SIZE]
        writes = [{
            "$type": "com.atproto.repo.applyWrites#delete",
            "collection": COLLECTION,
            "rkey": rkey,
        } for rkey in batch]
        payload = {"repo": did, "writes": writes}
        data = json.dumps(payload).encode()
        req = Request(f"{pds}/xrpc/com.atproto.repo.applyWrites", data=data, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        })
        try:
            with urlopen(req, timeout=60) as resp:
                json.loads(resp.read())
            print(f"  Deleted {len(batch)} records", file=sys.stderr)
        except HTTPError as exc:
            print(f"  Delete error: {exc.code} {exc.read().decode()[:200]}", file=sys.stderr)
        time.sleep(BATCH_DELAY)


# ── Record building ─────────────────────────────────────────────

def build_catalog_record(bin_key, articles, generated_at):
    """Build a single catalog record for one Wikinatomy bin.

    Each record holds all articles for a category, with:
    - title, stats, short extract, thumbnail URL
    - Compact enough to serve directly to the card viewer
    """
    items = []
    for a in articles:
        stats = a.get("stats", {})
        item = {
            "title": a["title"],
            "atk": stats.get("atk", 50),
            "def": stats.get("def", 50),
            "spc": stats.get("spc", 50),
            "spd": stats.get("spd", 50),
            "hp": stats.get("hp", 500),
            "rarity": stats.get("rarity", "common"),
        }
        # Include extract if available (truncate to 300 chars)
        extract = a.get("extract", "")
        if extract:
            item["extract"] = extract[:300]
        # Include thumbnail if available
        thumb = a.get("thumbnail")
        if thumb:
            item["thumbnail"] = thumb
        items.append(item)

    return {
        "bin": bin_key,
        "count": len(items),
        "generatedAt": generated_at,
        "articles": items,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Publish card catalog to ATProto PDS")
    parser.add_argument("--input", default="cards/data/deep-wikipedia.json",
                        help="Scored articles JSON")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be written without writing")
    parser.add_argument("--replace", action="store_true",
                        help="Delete existing catalog records before writing")
    args = parser.parse_args()

    # Load scored articles
    print(f"Loading {args.input}...", file=sys.stderr)
    with open(args.input) as f:
        data = json.load(f)

    articles = data.get("articles", [])
    meta = data.get("meta", {})
    generated_at = meta.get("generated_at",
                            datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))

    print(f"Loaded {len(articles)} articles", file=sys.stderr)

    # Group by bin
    by_bin = {}
    for a in articles:
        b = a.get("bin", "HISTORY")
        if b not in by_bin:
            by_bin[b] = []
        by_bin[b].append(a)

    # Show distribution
    print(f"\nBin distribution:", file=sys.stderr)
    total_size = 0
    for bin_key in BIN_ORDER:
        arts = by_bin.get(bin_key, [])
        record = build_catalog_record(bin_key, arts, generated_at)
        size = len(json.dumps(record, ensure_ascii=False).encode())
        total_size += size
        print(f"  {bin_key:14s}: {len(arts):4d} articles, {size / 1024:.0f}KB record",
              file=sys.stderr)
    print(f"  {'TOTAL':14s}: {len(articles):4d} articles, {total_size / 1024:.0f}KB total",
          file=sys.stderr)

    if args.dry_run:
        print(f"\nDry run — would write {len(by_bin)} records to PDS", file=sys.stderr)
        return

    # Authenticate
    handle = os.environ.get("BLUESKY_HANDLE")
    password = os.environ.get("BLUESKY_APP_PASSWORD")
    if not handle or not password:
        print("ERROR: Set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD", file=sys.stderr)
        sys.exit(1)

    print(f"\nResolving {handle}...", file=sys.stderr)
    did = resolve_handle(handle)
    pds = resolve_pds(did)
    print(f"  DID: {did}", file=sys.stderr)
    print(f"  PDS: {pds}", file=sys.stderr)

    token, _ = create_session(pds, handle, password)
    print(f"  Authenticated", file=sys.stderr)

    # Check existing records
    existing = list_existing_records(pds, did, token)
    print(f"  Existing catalog records: {len(existing)}", file=sys.stderr)

    if args.replace and existing:
        print(f"\n  Deleting {len(existing)} existing records...", file=sys.stderr)
        delete_records(pds, did, token, list(existing.keys()))

    # Write records
    print(f"\nWriting {len(by_bin)} catalog records...", file=sys.stderr)
    ok, err = 0, 0
    for bin_key in BIN_ORDER:
        arts = by_bin.get(bin_key, [])
        if not arts:
            continue

        record = build_catalog_record(bin_key, arts, generated_at)
        size = len(json.dumps(record, ensure_ascii=False).encode())
        print(f"  {bin_key}: {len(arts)} articles ({size / 1024:.0f}KB)...",
              file=sys.stderr, end=" ")

        uri = put_record(pds, did, token, bin_key, record)
        if uri:
            print("OK", file=sys.stderr)
            ok += 1
        else:
            print("FAILED", file=sys.stderr)
            err += 1
        time.sleep(BATCH_DELAY)

    print(f"\nDone: {ok} written, {err} failed", file=sys.stderr)

    # Write a manifest record with metadata
    manifest = {
        "bin": "_manifest",
        "count": len(articles),
        "generatedAt": generated_at,
        "articles": [],  # empty — this is metadata only
        "source": meta.get("source", "Wikipedia Featured Articles"),
        "bins": {b: len(arts) for b, arts in by_bin.items()},
        "totalArticles": len(articles),
    }
    print(f"\nWriting manifest record...", file=sys.stderr)
    uri = put_record(pds, did, token, "_manifest", manifest)
    print(f"  Manifest: {'OK' if uri else 'FAILED'}", file=sys.stderr)


if __name__ == "__main__":
    main()
