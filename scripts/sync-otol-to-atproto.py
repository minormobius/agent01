#!/usr/bin/env python3
"""
Sync Open Tree of Life data to ATProto PDS using adaptive chunking.

Fetches a phylogenetic subtree from the OToL API, partitions it into
adaptive clade chunks (packing as many nodes as will fit per record),
and writes each chunk as a com.minomobi.phylo.clade record.

Adaptive chunking: small subtrees are inlined into their parent's record.
Large subtrees get their own record. The algorithm greedily packs nodes,
splitting at natural boundaries when a chunk would exceed the threshold.
This minimizes total records while staying well under ATProto's 1 MiB
record size limit.

Usage:
    export BLUESKY_HANDLE=minomobi.com
    export BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

    # Sync Primates (~1000 nodes → ~5 clade records)
    python3 scripts/sync-otol-to-atproto.py --ott-id 913935

    # Sync Mammalia (~6500 nodes → ~30 clade records)
    python3 scripts/sync-otol-to-atproto.py --ott-id 244265

    # Use Modulo's account
    python3 scripts/sync-otol-to-atproto.py --ott-id 913935 --account modulo

    # Dry run with JSON dump
    python3 scripts/sync-otol-to-atproto.py --ott-id 913935 --dry-run --dump-json clades.json

    # Custom chunk size (default 250 nodes per clade)
    python3 scripts/sync-otol-to-atproto.py --ott-id 913935 --chunk-size 150
"""

import argparse
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen

OTOL_API = "https://api.opentreeoflife.org/v3"
BSKY_PUBLIC_API = "https://public.api.bsky.app"
COLLECTION = "com.minomobi.phylo.clade"
LEGACY_COLLECTION = "com.minomobi.phylo.node"
MAX_CHUNK_NODES = 250          # default nodes per clade record (~50-75 KB)
BATCH_SIZE = 10                # applyWrites limit (lowered from 200 by Bluesky)
BATCH_DELAY = 3                # seconds between batches
RATE_DELAY = 2.2               # seconds between individual writes (fallback)

# Account presets matching GitHub secrets
ACCOUNTS = {
    "main": {
        "handle_env": "BLUESKY_HANDLE",
        "password_env": "BLUESKY_APP_PASSWORD",
    },
    "modulo": {
        "handle_env": "BLUESKY_MODULO_HANDLE",
        "password_env": "BLUESKY_MODULO_APP_PASSWORD",
    },
    "morphyx": {
        "handle_env": "BLUESKY_MORPHYX_HANDLE",
        "password_env": "BLUESKY_MORPHYX_APP_PASSWORD",
    },
}


# --- OToL API ---

def otol_post(endpoint, payload=None):
    """POST to the Open Tree of Life API."""
    url = f"{OTOL_API}/{endpoint}"
    data = json.dumps(payload or {}).encode()
    req = Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def fetch_subtree(ott_id, height_limit=-1):
    """Fetch the synthetic subtree rooted at ott_id. Returns arguson JSON.
    The OToL API has a hard limit of 25,000 tips per request.
    Use height_limit to constrain depth for large clades."""
    result = otol_post("tree_of_life/subtree", {
        "node_id": f"ott{ott_id}",
        "format": "arguson",
        "height_limit": height_limit,
    })
    return result.get("arguson")


def collect_named_descendants(node):
    """Walk down through unnamed (mrca) nodes to find all named descendant OTT IDs.
    Stops at the first named node in each branch."""
    result = []
    for child in node.get("children", []):
        child_ott = child.get("taxon", {}).get("ott_id")
        if child_ott:
            result.append(child_ott)
        else:
            result.extend(collect_named_descendants(child))
    return result


def flatten_arguson(node, parent_ott_id=None, nodes=None, max_depth=None, depth=0):
    """Recursively flatten an arguson tree into a list of node dicts.
    Unnamed interior nodes (mrcaott...) are collapsed: their children
    inherit the nearest named ancestor as parent."""
    if nodes is None:
        nodes = []
    if max_depth is not None and depth > max_depth:
        return nodes

    tax_info = node.get("taxon", {})
    ott_id = tax_info.get("ott_id")
    name = tax_info.get("name", node.get("node_id", ""))
    rank = tax_info.get("rank", "no rank")
    unique_name = tax_info.get("unique_name", "")
    num_tips = node.get("num_tips", 0)

    if ott_id:
        child_ott_ids = collect_named_descendants(node)
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

    effective_parent = ott_id if ott_id else parent_ott_id
    for child in node.get("children", []):
        flatten_arguson(child, parent_ott_id=effective_parent, nodes=nodes,
                        max_depth=max_depth, depth=depth + 1)

    return nodes


# --- Adaptive Chunking ---

def partition_into_clades(flat_nodes, max_nodes=MAX_CHUNK_NODES):
    """Partition a flat node list into adaptive clade chunks.

    Each clade record contains a connected subtree. Small subtrees are
    packed entirely into their parent's record. Large subtrees are split
    into their own clade record, referenced by the parent via 'refs'.

    The algorithm processes children smallest-first to maximize packing —
    small genera get inlined, only the large ones split out.

    Returns a list of clade dicts ready to write as ATProto records.
    """
    # Build tree index from flat nodes
    by_id = {n["ottId"]: n for n in flat_nodes}
    children_of = defaultdict(list)
    root_id = None

    for n in flat_nodes:
        parent = n.get("parentOttId")
        if parent is None:
            root_id = n["ottId"]
        else:
            children_of[parent].append(n["ottId"])

    if root_id is None:
        raise ValueError("No root node found (all nodes have parentOttId)")

    # Compute subtree sizes
    size_cache = {}

    def subtree_size(ott_id):
        if ott_id in size_cache:
            return size_cache[ott_id]
        count = 1
        for child_id in children_of.get(ott_id, []):
            count += subtree_size(child_id)
        size_cache[ott_id] = count
        return count

    # Pre-compute all sizes
    subtree_size(root_id)

    # Partition into clades
    clades = []

    def make_clade(root_ott_id):
        """Create a clade record rooted at root_ott_id."""
        clade_nodes = []
        child_clade_ids = []

        def fill(ott_id):
            clade_nodes.append(by_id[ott_id])
            # Sort children smallest-first to maximize packing
            kids = sorted(
                children_of.get(ott_id, []),
                key=lambda cid: subtree_size(cid)
            )
            for child_id in kids:
                child_size = subtree_size(child_id)
                remaining = max_nodes - len(clade_nodes)
                if child_size <= remaining:
                    # Inline: this subtree fits
                    fill(child_id)
                else:
                    # Split: too large, becomes its own clade record
                    child_clade_ids.append(child_id)
                    make_clade(child_id)

        fill(root_ott_id)
        clades.append({
            "rootOttId": root_ott_id,
            "nodes": clade_nodes,
            "refs": child_clade_ids,
        })

    make_clade(root_id)
    return clades


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


def list_existing_records(pds, did, token, collection=COLLECTION, limit=100):
    """List existing records to check for duplicates."""
    existing = set()
    cursor = None
    while True:
        url = f"{pds}/xrpc/com.atproto.repo.listRecords?repo={did}&collection={collection}&limit={limit}"
        if cursor:
            url += f"&cursor={cursor}"
        req = Request(url, headers={"Authorization": f"Bearer {token}"})
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        for rec in data.get("records", []):
            rkey = rec["uri"].split("/")[-1]
            existing.add(rkey)
        cursor = data.get("cursor")
        if not cursor or not data.get("records"):
            break
    return existing


def write_record(pds, did, token, rkey, record):
    """Write a single clade record to the PDS."""
    url = f"{pds}/xrpc/com.atproto.repo.createRecord"
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
    try:
        with urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        return result.get("uri")
    except HTTPError as exc:
        body = exc.read().decode()
        print(f"  Error writing clade {rkey}: {exc.code} {body}", file=sys.stderr)
        return None


def write_batch(pds, did, token, clade_records):
    """Write up to BATCH_SIZE clade records in a single applyWrites call.
    Returns (success_count, error_count)."""
    writes = []
    for clade in clade_records:
        writes.append({
            "$type": "com.atproto.repo.applyWrites#create",
            "collection": COLLECTION,
            "rkey": str(clade["rootOttId"]),
            "value": {
                "$type": COLLECTION,
                **build_record_value(clade),
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
        return len(clade_records), 0
    except HTTPError as exc:
        body = exc.read().decode()
        print(f"  Batch error ({len(clade_records)} clades): {exc.code} {body}", file=sys.stderr)
        print(f"  Falling back to individual writes...", file=sys.stderr)
        ok, err = 0, 0
        for clade in clade_records:
            rec_value = build_record_value(clade)
            uri = write_record(pds, did, token, str(clade["rootOttId"]), rec_value)
            if uri:
                ok += 1
            else:
                err += 1
            time.sleep(RATE_DELAY)
        return ok, err


def build_record_value(clade):
    """Build the ATProto record value dict from a clade partition."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "rootOttId": clade["rootOttId"],
        "nodes": clade["nodes"],
        "refs": clade["refs"] if clade["refs"] else [],
        "source": "otol-synthesis",
        "createdAt": now,
    }


# --- Main ---

def main():
    parser = argparse.ArgumentParser(
        description="Sync Open Tree of Life subtree to ATProto PDS using adaptive chunking"
    )
    parser.add_argument("--ott-id", type=int, required=True,
                        help="OTT ID of the root taxon (e.g., 244265 for Mammalia)")
    parser.add_argument("--max-depth", type=int, default=None,
                        help="Maximum tree depth to flatten (default: unlimited)")
    parser.add_argument("--height-limit", type=int, default=-1,
                        help="OToL API height_limit parameter (-1=unlimited). "
                             "Use 5-10 for large clades to stay under the 25k tip limit.")
    parser.add_argument("--chunk-size", type=int, default=MAX_CHUNK_NODES,
                        help=f"Max nodes per clade record (default: {MAX_CHUNK_NODES})")
    parser.add_argument("--account", choices=list(ACCOUNTS.keys()), default="main",
                        help="Which Bluesky account to write to (default: main)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Fetch, chunk, and report without writing to PDS")
    parser.add_argument("--dump-json", type=str, default=None,
                        help="Dump clade records to a JSON file")
    parser.add_argument("--no-batch", action="store_true",
                        help="Write one clade at a time instead of using applyWrites")
    args = parser.parse_args()

    # Fetch from OToL
    print(f"Fetching subtree rooted at ott{args.ott_id} from Open Tree of Life...")
    tree = fetch_subtree(args.ott_id, height_limit=args.height_limit)
    if not tree:
        print("Error: Could not fetch subtree. Check that the OTT ID is valid.", file=sys.stderr)
        sys.exit(1)

    root_taxon = tree.get("taxon", {}).get("name", "unknown")
    print(f"Root taxon: {root_taxon}")

    print("Flattening tree (collapsing unnamed nodes)...")
    nodes = flatten_arguson(tree, max_depth=args.max_depth)
    print(f"Found {len(nodes)} named nodes")

    # Rank breakdown
    rank_counts = {}
    for n in nodes:
        r = n.get("rank", "no rank")
        rank_counts[r] = rank_counts.get(r, 0) + 1
    print("Rank breakdown:")
    for rank, count in sorted(rank_counts.items(), key=lambda x: -x[1]):
        print(f"  {rank}: {count}")

    # Adaptive chunking
    print(f"\nPartitioning into adaptive clades (max {args.chunk_size} nodes/clade)...")
    clades = partition_into_clades(nodes, max_nodes=args.chunk_size)
    print(f"Result: {len(clades)} clade records for {len(nodes)} nodes")

    total_packed = sum(len(c["nodes"]) for c in clades)
    avg_pack = total_packed / len(clades) if clades else 0
    print(f"  Average: {avg_pack:.0f} nodes/clade")
    print(f"  Largest: {max(len(c['nodes']) for c in clades)} nodes")
    print(f"  Smallest: {min(len(c['nodes']) for c in clades)} nodes")

    # Show clade overview
    print(f"\nClade breakdown:")
    for c in sorted(clades, key=lambda x: -len(x["nodes"])):
        root_node = next((n for n in c["nodes"] if n["ottId"] == c["rootOttId"]), {})
        name = root_node.get("name", f"ott{c['rootOttId']}")
        rank = root_node.get("rank", "")
        refs_str = f", {len(c['refs'])} refs" if c["refs"] else ""
        est_kb = len(json.dumps(c).encode()) / 1024
        print(f"  {name} ({rank}): {len(c['nodes'])} nodes{refs_str} (~{est_kb:.1f} KB)")

    # Estimate record sizes
    total_bytes = sum(len(json.dumps(c).encode()) for c in clades)
    print(f"\nTotal payload: {total_bytes / 1024:.1f} KB across {len(clades)} records")
    print(f"Compression ratio: {len(nodes)} nodes → {len(clades)} records ({len(nodes)/len(clades):.0f}x)")

    # Dump JSON if requested
    if args.dump_json:
        with open(args.dump_json, "w") as f:
            json.dump(clades, f, indent=2)
        print(f"Wrote {len(clades)} clade records to {args.dump_json}")

    if args.dry_run:
        print(f"\nDry run complete. Would write {len(clades)} clade records.")
        return

    # Auth
    acct = ACCOUNTS[args.account]
    handle = os.environ.get(acct["handle_env"])
    password = os.environ.get(acct["password_env"])
    if not handle or not password:
        print(f"Error: Set {acct['handle_env']} and {acct['password_env']} "
              f"environment variables for --account {args.account}.", file=sys.stderr)
        sys.exit(1)

    print(f"\nAuthenticating as {handle} ({args.account})...")
    did = resolve_handle(handle)
    pds = resolve_pds(did)
    token, did = create_session(pds, handle, password)
    print(f"Authenticated. DID: {did}, PDS: {pds}")

    # Check existing clade records
    print("Checking for existing clade records...")
    existing = list_existing_records(pds, did, token, collection=COLLECTION)
    print(f"Found {len(existing)} existing records in {COLLECTION}")

    # Filter out clades that already exist
    to_write = [c for c in clades if str(c["rootOttId"]) not in existing]
    print(f"{len(to_write)} new clade records to write ({len(clades) - len(to_write)} already exist)")

    if not to_write:
        print("Nothing to do!")
        return

    written = 0
    errors = 0

    if args.no_batch or len(to_write) <= 3:
        # For very few records, individual writes are simpler
        print(f"Writing {len(to_write)} clade records individually...\n")
        for i, clade in enumerate(to_write):
            rkey = str(clade["rootOttId"])
            rec_value = build_record_value(clade)
            uri = write_record(pds, did, token, rkey, rec_value)
            if uri:
                written += 1
                root_node = next((n for n in clade["nodes"] if n["ottId"] == clade["rootOttId"]), {})
                print(f"  [{i+1}/{len(to_write)}] {root_node.get('name', rkey)}: {len(clade['nodes'])} nodes → {uri}")
            else:
                errors += 1
            if i < len(to_write) - 1:
                time.sleep(RATE_DELAY)
    else:
        num_batches = (len(to_write) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"Writing {len(to_write)} clade records in {num_batches} batches of up to {BATCH_SIZE}\n")

        for batch_num in range(num_batches):
            start = batch_num * BATCH_SIZE
            end = min(start + BATCH_SIZE, len(to_write))
            batch = to_write[start:end]

            ok, err = write_batch(pds, did, token, batch)
            written += ok
            errors += err

            pct = end / len(to_write) * 100
            print(f"  [{pct:5.1f}%] Batch {batch_num + 1}/{num_batches}: "
                  f"{ok} written, {err} errors (total: {written}/{len(to_write)})")

            if batch_num < num_batches - 1:
                time.sleep(BATCH_DELAY)

    new_nodes = sum(len(c["nodes"]) for c in to_write[:written])
    print(f"\nDone. Clades written: {written}, Errors: {errors}, "
          f"Skipped: {len(clades) - len(to_write)}")
    print(f"Nodes packed: {new_nodes} across {written} records")
    print(f"View at: https://bsky.app/profile/{handle}")
    print(f"Query records: {pds}/xrpc/com.atproto.repo.listRecords"
          f"?repo={did}&collection={COLLECTION}&limit=100")


if __name__ == "__main__":
    main()
