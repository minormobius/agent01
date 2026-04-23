#!/usr/bin/env python3
"""
Publish the Answers category taxonomy to the curator PDS.

Reads answers/categories.json and writes one com.minomobi.answers.category
record per node. Parents are written before children so that children can
reference the parent's strongRef (uri + cid).

The rkey of each record is the dotted path of slugs, e.g.:
    - top-level:  "health"
    - child:      "health.mental-health"

This makes the taxonomy deterministic and idempotent — re-running the
script rewrites the same rkeys via putRecord without creating duplicates.

Usage:
    export BLUESKY_HANDLE=minomobi.com
    export BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

    python3 scripts/publish-answers-categories.py
    python3 scripts/publish-answers-categories.py --dry-run
    python3 scripts/publish-answers-categories.py --prune   # delete records not in the tree
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
COLLECTION = "com.minomobi.answers.category"
MAX_RETRIES = 4
RETRY_BASE_DELAY = 3
WRITE_DELAY = 0.5


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


def list_existing_records(pds, did, token):
    existing = {}
    cursor = None
    while True:
        url = (f"{pds}/xrpc/com.atproto.repo.listRecords"
               f"?repo={did}&collection={COLLECTION}&limit=100")
        if cursor:
            url += f"&cursor={cursor}"
        req = Request(url, headers={"Authorization": f"Bearer {token}"})
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        for rec in data.get("records", []):
            rkey = rec["uri"].split("/")[-1]
            existing[rkey] = {"uri": rec["uri"], "cid": rec["cid"], "value": rec.get("value", {})}
        cursor = data.get("cursor")
        if not cursor or not data.get("records"):
            break
    return existing


def put_record(pds, did, token, rkey, record):
    url = f"{pds}/xrpc/com.atproto.repo.putRecord"
    payload = {
        "repo": did,
        "collection": COLLECTION,
        "rkey": rkey,
        "record": {"$type": COLLECTION, **record},
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
            return {"uri": result["uri"], "cid": result["cid"]}
        except HTTPError as exc:
            body = exc.read().decode()
            if exc.code == 429 and attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                print(f"  Rate limited on {rkey}, retry {attempt + 1}/{MAX_RETRIES} in {delay}s",
                      file=sys.stderr)
                time.sleep(delay)
                continue
            print(f"  Error writing {rkey}: {exc.code} {body[:300]}", file=sys.stderr)
            return None


def delete_record(pds, did, token, rkey):
    url = f"{pds}/xrpc/com.atproto.repo.deleteRecord"
    payload = {"repo": did, "collection": COLLECTION, "rkey": rkey}
    data = json.dumps(payload).encode()
    req = Request(url, data=data, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    })
    try:
        with urlopen(req, timeout=15) as resp:
            resp.read()
        return True
    except HTTPError as exc:
        print(f"  Delete error for {rkey}: {exc.code} {exc.read().decode()[:200]}",
              file=sys.stderr)
        return False


def flatten(categories, parent_path=None, parent_slug=None, out=None):
    """Depth-first flatten into a list of (rkey, name, description, parent_rkey)."""
    if out is None:
        out = []
    for cat in categories:
        slug = cat["slug"]
        rkey = f"{parent_slug}.{slug}" if parent_slug else slug
        out.append({
            "rkey": rkey,
            "name": cat["name"],
            "description": cat.get("description"),
            "parent_rkey": parent_slug,
        })
        children = cat.get("children") or []
        if children:
            flatten(children, parent_path=rkey, parent_slug=rkey, out=out)
    return out


def main():
    parser = argparse.ArgumentParser(description="Publish Answers category taxonomy to PDS")
    parser.add_argument("--input", default="answers/categories.json",
                        help="Taxonomy JSON (default: answers/categories.json)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be written without writing")
    parser.add_argument("--prune", action="store_true",
                        help="Delete existing category records not present in the taxonomy")
    args = parser.parse_args()

    print(f"Loading {args.input}...", file=sys.stderr)
    with open(args.input) as f:
        tree = json.load(f)

    flat = flatten(tree["categories"])
    print(f"Flattened taxonomy: {len(flat)} categories", file=sys.stderr)

    wanted_rkeys = {node["rkey"] for node in flat}

    if args.dry_run:
        for node in flat:
            parent = f" (parent={node['parent_rkey']})" if node["parent_rkey"] else ""
            print(f"  {node['rkey']:50s}  {node['name']}{parent}")
        print(f"\nDry run — would write {len(flat)} records", file=sys.stderr)
        return

    handle = os.environ.get("BLUESKY_HANDLE")
    password = os.environ.get("BLUESKY_APP_PASSWORD")
    if not handle or not password:
        print("ERROR: Set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD", file=sys.stderr)
        sys.exit(1)

    print(f"Resolving {handle}...", file=sys.stderr)
    did = resolve_handle(handle)
    pds = resolve_pds(did)
    print(f"  DID: {did}", file=sys.stderr)
    print(f"  PDS: {pds}", file=sys.stderr)

    token, _ = create_session(pds, handle, password)

    print("Listing existing category records...", file=sys.stderr)
    existing = list_existing_records(pds, did, token)
    print(f"  Found {len(existing)} existing records", file=sys.stderr)

    # Track strongRefs of written records so children can reference parents
    written = {}
    created_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    for node in flat:
        record = {
            "name": node["name"],
            "slug": node["rkey"].split(".")[-1],
            "createdAt": created_at,
        }
        if node.get("description"):
            record["description"] = node["description"]
        if node["parent_rkey"]:
            parent_ref = written.get(node["parent_rkey"])
            if not parent_ref:
                print(f"  SKIP {node['rkey']}: parent {node['parent_rkey']} was not written",
                      file=sys.stderr)
                continue
            record["parent"] = parent_ref

        result = put_record(pds, did, token, node["rkey"], record)
        if result:
            written[node["rkey"]] = result
            print(f"  wrote {node['rkey']}", file=sys.stderr)
        time.sleep(WRITE_DELAY)

    print(f"\nWrote {len(written)} / {len(flat)} records", file=sys.stderr)

    if args.prune:
        stale = sorted(set(existing) - wanted_rkeys)
        if stale:
            print(f"\nPruning {len(stale)} stale records...", file=sys.stderr)
            for rkey in stale:
                if delete_record(pds, did, token, rkey):
                    print(f"  deleted {rkey}", file=sys.stderr)
                time.sleep(WRITE_DELAY)
        else:
            print("\nNo stale records to prune", file=sys.stderr)


if __name__ == "__main__":
    main()
