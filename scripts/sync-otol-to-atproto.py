#!/usr/bin/env python3
"""
Sync Open Tree of Life data to an ATProto PDS.

Fetches a phylogenetic subtree from the OToL API, transforms each node
into a com.minomobi.phylo.node record, and writes it to the user's
ATProto repository. Record keys are OTT IDs, so re-running is idempotent
(existing records are skipped).

Usage:
    export BLUESKY_HANDLE=minomobi.com
    export BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

    # Sync Primates (~500 nodes, good for testing)
    python3 scripts/sync-otol-to-atproto.py --ott-id 913935 --max-depth 20

    # Sync Cephalopoda (~800 nodes)
    python3 scripts/sync-otol-to-atproto.py --ott-id 795941

    # Sync Mammalia (~6500 nodes, ~3 minutes batched, hours if --no-batch)
    python3 scripts/sync-otol-to-atproto.py --ott-id 244265

    # Dry run (just fetch and count, don't write)
    python3 scripts/sync-otol-to-atproto.py --ott-id 913935 --dry-run
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen

OTOL_API = "https://api.opentreeoflife.org/v3"
BSKY_PUBLIC_API = "https://public.api.bsky.app"
COLLECTION = "com.minomobi.phylo.node"
RATE_DELAY = 2.2  # seconds between single writes (stays under 1666/hr)
BATCH_SIZE = 200  # applyWrites supports up to 200 ops per call
BATCH_DELAY = 5   # seconds between batches (each batch = 200 records toward hourly limit)


# --- OToL API ---

def otol_post(endpoint, payload=None):
    """POST to the Open Tree of Life API."""
    url = f"{OTOL_API}/{endpoint}"
    data = json.dumps(payload or {}).encode()
    req = Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def fetch_subtree(ott_id):
    """Fetch the synthetic subtree rooted at ott_id. Returns Newick-style
    node structure with embedded node IDs."""
    result = otol_post("tree_of_life/subtree", {
        "node_id": f"ott{ott_id}",
        "format": "arguson",
        "height_limit": 200,
    })
    return result.get("arguson")


def fetch_taxon_info(ott_id):
    """Fetch taxonomy info for a single taxon."""
    return otol_post("taxonomy/taxon_info", {
        "ott_id": ott_id,
        "include_lineage": False,
    })


def flatten_arguson(node, parent_ott_id=None, nodes=None, max_depth=None, depth=0):
    """Recursively flatten an arguson tree into a list of node dicts."""
    if nodes is None:
        nodes = []
    if max_depth is not None and depth > max_depth:
        return nodes

    # Extract OTT ID from node_id (format: "ott12345" or "mrcaott12345ott67890")
    node_id = node.get("node_id", "")
    tax_info = node.get("taxon", {})
    ott_id = tax_info.get("ott_id")
    name = tax_info.get("name", node_id)
    rank = tax_info.get("rank", "no rank")
    unique_name = tax_info.get("unique_name", "")

    children = node.get("children", [])
    child_ott_ids = []
    for child in children:
        child_tax = child.get("taxon", {})
        child_ott = child_tax.get("ott_id")
        if child_ott:
            child_ott_ids.append(child_ott)

    num_tips = node.get("num_tips", 0)

    if ott_id:
        record = {
            "ottId": ott_id,
            "name": name,
            "rank": rank,
            "numTips": num_tips,
        }
        if unique_name and unique_name != name:
            record["commonName"] = unique_name
        if parent_ott_id:
            record["parentOttId"] = parent_ott_id
        if child_ott_ids:
            record["childOttIds"] = child_ott_ids
        nodes.append(record)

    # Recurse into children
    for child in children:
        flatten_arguson(child, parent_ott_id=ott_id, nodes=nodes,
                        max_depth=max_depth, depth=depth + 1)

    return nodes


# --- ATProto API ---

def resolve_handle(handle):
    """Resolve a Bluesky handle to a DID."""
    url = f"{BSKY_PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle={handle}"
    req = Request(url)
    with urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    return data["did"]


def resolve_pds(did):
    """Resolve a DID to a PDS endpoint."""
    if did.startswith("did:plc:"):
        url = f"https://plc.directory/{did}"
    elif did.startswith("did:web:"):
        host = did.split(":")[-1]
        url = f"https://{host}/.well-known/did.json"
    else:
        raise ValueError(f"Unknown DID method: {did}")

    req = Request(url)
    with urlopen(req, timeout=15) as resp:
        doc = json.loads(resp.read())

    for svc in doc.get("service", []):
        if svc.get("type") == "AtprotoPersonalDataServer":
            return svc["serviceEndpoint"]
    raise ValueError(f"No PDS endpoint found in DID document for {did}")


def create_session(pds, handle, password):
    """Authenticate and get a session token."""
    url = f"{pds}/xrpc/com.atproto.server.createSession"
    data = json.dumps({"identifier": handle, "password": password}).encode()
    req = Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=15) as resp:
        session = json.loads(resp.read())
    return session["accessJwt"], session["did"]


def list_existing_records(pds, did, token, limit=100):
    """List existing phylo.node records to avoid duplicates."""
    existing = set()
    cursor = None
    while True:
        url = f"{pds}/xrpc/com.atproto.repo.listRecords?repo={did}&collection={COLLECTION}&limit={limit}"
        if cursor:
            url += f"&cursor={cursor}"
        req = Request(url, headers={"Authorization": f"Bearer {token}"})
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        for rec in data.get("records", []):
            # rkey is the last segment of the AT URI
            rkey = rec["uri"].split("/")[-1]
            existing.add(rkey)
        cursor = data.get("cursor")
        if not cursor or not data.get("records"):
            break
    return existing


def write_record(pds, did, token, rkey, record):
    """Write a single phylo.node record to the PDS."""
    url = f"{pds}/xrpc/com.atproto.repo.createRecord"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload = {
        "repo": did,
        "collection": COLLECTION,
        "rkey": rkey,
        "record": {
            "$type": COLLECTION,
            "createdAt": now,
            **record,
        },
    }
    data = json.dumps(payload).encode()
    req = Request(url, data=data, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    })
    try:
        with urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
        return result.get("uri")
    except HTTPError as exc:
        body = exc.read().decode()
        print(f"  Error writing ott{rkey}: {exc.code} {body}", file=sys.stderr)
        return None


def write_batch(pds, did, token, records_batch):
    """Write up to 200 records in a single applyWrites call.
    Returns (success_count, error_count)."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    writes = []
    for rec in records_batch:
        writes.append({
            "$type": "com.atproto.repo.applyWrites#create",
            "collection": COLLECTION,
            "rkey": str(rec["ottId"]),
            "value": {
                "$type": COLLECTION,
                "createdAt": now,
                **rec,
            },
        })
    payload = {
        "repo": did,
        "writes": writes,
    }
    data = json.dumps(payload).encode()
    req = Request(f"{pds}/xrpc/com.atproto.repo.applyWrites", data=data, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    })
    try:
        with urlopen(req, timeout=60) as resp:
            json.loads(resp.read())
        return len(records_batch), 0
    except HTTPError as exc:
        body = exc.read().decode()
        print(f"  Batch error ({len(records_batch)} records): {exc.code} {body}", file=sys.stderr)
        # Fall back to individual writes
        print(f"  Falling back to individual writes for this batch...", file=sys.stderr)
        ok, err = 0, 0
        for rec in records_batch:
            uri = write_record(pds, did, token, str(rec["ottId"]), rec)
            if uri:
                ok += 1
            else:
                err += 1
            time.sleep(RATE_DELAY)
        return ok, err


# --- Main ---

def main():
    parser = argparse.ArgumentParser(
        description="Sync Open Tree of Life subtree to ATProto PDS"
    )
    parser.add_argument("--ott-id", type=int, required=True,
                        help="OTT ID of the root taxon (e.g., 244265 for Mammalia)")
    parser.add_argument("--max-depth", type=int, default=None,
                        help="Maximum tree depth to fetch (default: unlimited)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Fetch and count nodes without writing to PDS")
    parser.add_argument("--dump-json", type=str, default=None,
                        help="Dump fetched nodes to a JSON file (useful for visualization testing)")
    parser.add_argument("--no-batch", action="store_true",
                        help="Write one record at a time instead of using applyWrites batches")
    args = parser.parse_args()

    # Fetch from OToL
    print(f"Fetching subtree rooted at ott{args.ott_id} from Open Tree of Life...")
    tree = fetch_subtree(args.ott_id)
    if not tree:
        print("Error: Could not fetch subtree. Check that the OTT ID is valid.", file=sys.stderr)
        sys.exit(1)

    root_taxon = tree.get("taxon", {}).get("name", "unknown")
    print(f"Root taxon: {root_taxon}")

    print("Flattening tree...")
    nodes = flatten_arguson(tree, max_depth=args.max_depth)
    print(f"Found {len(nodes)} nodes with OTT IDs")

    # Count by rank
    rank_counts = {}
    for n in nodes:
        r = n.get("rank", "no rank")
        rank_counts[r] = rank_counts.get(r, 0) + 1
    print("Rank breakdown:")
    for rank, count in sorted(rank_counts.items(), key=lambda x: -x[1]):
        print(f"  {rank}: {count}")

    # Dump JSON if requested
    if args.dump_json:
        with open(args.dump_json, "w") as f:
            json.dump(nodes, f, indent=2)
        print(f"Wrote {len(nodes)} nodes to {args.dump_json}")

    if args.dry_run:
        if args.no_batch:
            est_hours = (len(nodes) * RATE_DELAY) / 3600
            print(f"\nDry run complete. Writing {len(nodes)} records individually would take ~{est_hours:.1f} hours.")
        else:
            num_batches = (len(nodes) + BATCH_SIZE - 1) // BATCH_SIZE
            est_mins = (num_batches * BATCH_DELAY) / 60
            print(f"\nDry run complete. Writing {len(nodes)} records in {num_batches} batches of {BATCH_SIZE} would take ~{est_mins:.1f} minutes.")
        return

    # Auth
    handle = os.environ.get("BLUESKY_HANDLE")
    password = os.environ.get("BLUESKY_APP_PASSWORD")
    if not handle or not password:
        print("Error: Set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD environment variables.", file=sys.stderr)
        sys.exit(1)

    print(f"\nAuthenticating as {handle}...")
    did = resolve_handle(handle)
    pds = resolve_pds(did)
    token, did = create_session(pds, handle, password)
    print(f"Authenticated. DID: {did}, PDS: {pds}")

    # Check existing records
    print("Checking for existing records...")
    existing = list_existing_records(pds, did, token)
    print(f"Found {len(existing)} existing records in {COLLECTION}")

    # Write records
    to_write = [n for n in nodes if str(n["ottId"]) not in existing]
    print(f"{len(to_write)} new records to write ({len(nodes) - len(to_write)} already exist)")

    if not to_write:
        print("Nothing to do!")
        return

    written = 0
    errors = 0

    if args.no_batch:
        est_hours = (len(to_write) * RATE_DELAY) / 3600
        print(f"Estimated time: {est_hours:.1f} hours (individual writes)")
        print(f"Writing records...\n")

        for i, node in enumerate(to_write):
            rkey = str(node["ottId"])
            uri = write_record(pds, did, token, rkey, node)
            if uri:
                written += 1
                if written % 50 == 0 or written == len(to_write):
                    pct = (i + 1) / len(to_write) * 100
                    print(f"  [{pct:5.1f}%] Written {written}/{len(to_write)} (errors: {errors})")
            else:
                errors += 1
            if i < len(to_write) - 1:
                time.sleep(RATE_DELAY)
    else:
        num_batches = (len(to_write) + BATCH_SIZE - 1) // BATCH_SIZE
        est_mins = (num_batches * BATCH_DELAY) / 60
        print(f"Writing {len(to_write)} records in {num_batches} batches of up to {BATCH_SIZE} (~{est_mins:.1f} minutes)")
        print(f"Using com.atproto.repo.applyWrites for batch writes\n")

        for batch_num in range(num_batches):
            start = batch_num * BATCH_SIZE
            end = min(start + BATCH_SIZE, len(to_write))
            batch = to_write[start:end]

            ok, err = write_batch(pds, did, token, batch)
            written += ok
            errors += err

            pct = end / len(to_write) * 100
            print(f"  [{pct:5.1f}%] Batch {batch_num + 1}/{num_batches}: {ok} written, {err} errors (total: {written}/{len(to_write)})")

            if batch_num < num_batches - 1:
                time.sleep(BATCH_DELAY)

    print(f"\nDone. Written: {written}, Errors: {errors}, Skipped: {len(nodes) - len(to_write)}")
    print(f"View at: https://bsky.app/profile/{handle}")
    print(f"Query records: {pds}/xrpc/com.atproto.repo.listRecords?repo={did}&collection={COLLECTION}&limit=10")


if __name__ == "__main__":
    main()
