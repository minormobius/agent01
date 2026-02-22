#!/usr/bin/env python3
"""Sync phylogenetic tree data to ATProto PDS with Wikidata common name enrichment.

Reads existing clade records from the PDS, fetches common names from Wikidata
for any nodes missing them, and writes the enriched records back.

Usage:
    python3 phylo/sync.py                    # enrich existing records
    python3 phylo/sync.py --seed 244265      # seed from OToL then enrich
    python3 phylo/sync.py --dry-run          # preview without writing

Environment variables:
    BLUESKY_HANDLE          ATProto handle (e.g. minomobi.bsky.social)
    BLUESKY_APP_PASSWORD    App password for the account
    PDS_URL                 PDS endpoint (default: https://bsky.social)
"""

import json
import math
import os
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

# ── Config ──────────────────────────────────────────────────────────────────

CLADE_COLLECTION = "com.minomobi.phylo.clade"
OTOL_API = "https://api.opentreeoflife.org/v3"
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
MAX_NODES_PER_CLADE = 500  # ATProto record size limit (~64KB)
WIKIDATA_BATCH_SIZE = 200  # SPARQL VALUES clause limit
RATE_LIMIT_DELAY = 1.5     # seconds between Wikidata queries


# ── ATProto helpers ─────────────────────────────────────────────────────────

def xrpc_post(pds, endpoint, data, token=None):
    """POST to an XRPC endpoint. Returns parsed JSON."""
    url = f"{pds}/xrpc/{endpoint}"
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
            err = json.loads(exc.read())
        except Exception:
            err = {"status": exc.code}
        raise RuntimeError(f"XRPC {endpoint}: {err}") from exc


def xrpc_get(pds, endpoint, params, token=None):
    """GET from an XRPC endpoint. Returns parsed JSON."""
    url = f"{pds}/xrpc/{endpoint}?{urlencode(params)}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(url, headers=headers)
    try:
        with urlopen(req) as resp:
            return json.loads(resp.read())
    except HTTPError as exc:
        try:
            err = json.loads(exc.read())
        except Exception:
            err = {"status": exc.code}
        raise RuntimeError(f"XRPC {endpoint}: {err}") from exc


def authenticate(pds, handle, password):
    """Authenticate. Returns (did, accessJwt)."""
    resp = xrpc_post(pds, "com.atproto.server.createSession", {
        "identifier": handle,
        "password": password,
    })
    did = resp.get("did")
    token = resp.get("accessJwt")
    if not did or not token:
        raise RuntimeError(f"Auth failed: {resp}")
    return did, token


def list_records(pds, did, collection, token=None):
    """Paginate through all records in a collection. Returns [(rkey, value)]."""
    records = []
    cursor = None
    while True:
        params = {"repo": did, "collection": collection, "limit": "100"}
        if cursor:
            params["cursor"] = cursor
        page = xrpc_get(pds, "com.atproto.repo.listRecords", params, token)
        for rec in page.get("records", []):
            rkey = rec["uri"].split("/")[-1]
            records.append((rkey, rec["value"]))
        cursor = page.get("cursor")
        if not cursor or not page.get("records"):
            break
    return records


def put_record(pds, did, collection, rkey, record, token):
    """Create or update a record."""
    return xrpc_post(pds, "com.atproto.repo.putRecord", {
        "repo": did,
        "collection": collection,
        "rkey": rkey,
        "record": record,
    }, token)


def delete_record(pds, did, collection, rkey, token):
    """Delete a record."""
    return xrpc_post(pds, "com.atproto.repo.deleteRecord", {
        "repo": did,
        "collection": collection,
        "rkey": rkey,
    }, token)


# ── OToL API ────────────────────────────────────────────────────────────────

def fetch_otol_subtree(ott_id):
    """Fetch full subtree from Open Tree of Life in arguson format."""
    print(f"  Fetching OToL subtree for ott{ott_id}...")
    resp = xrpc_like_post(OTOL_API + "/tree_of_life/subtree", {
        "node_id": f"ott{ott_id}",
        "format": "arguson",
        "height_limit": -1,
    })
    return resp.get("arguson")


def xrpc_like_post(url, data):
    """Generic JSON POST (for OToL API)."""
    body = json.dumps(data).encode()
    req = Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def flatten_arguson(node, parent_ott=None):
    """Recursively flatten an arguson tree into flat node records."""
    records = []
    tax = node.get("taxon") or {}
    ott_id = tax.get("ott_id")
    if not ott_id:
        return records

    child_ott_ids = []
    for child in node.get("children") or []:
        child_tax = (child.get("taxon") or {})
        child_ott = child_tax.get("ott_id")
        if child_ott:
            child_ott_ids.append(child_ott)

    rec = {
        "ottId": ott_id,
        "name": tax.get("name", ""),
        "rank": tax.get("rank", "no rank"),
        "numTips": node.get("num_tips", 0),
    }
    if parent_ott:
        rec["parentOttId"] = parent_ott
    if child_ott_ids:
        rec["childOttIds"] = child_ott_ids
    # commonName left empty — will be filled by Wikidata enrichment
    records.append(rec)

    for child in node.get("children") or []:
        records.extend(flatten_arguson(child, ott_id))

    return records


# ── Wikidata enrichment ─────────────────────────────────────────────────────

def _wikidata_sparql(query):
    """Execute a Wikidata SPARQL query. Returns list of bindings."""
    params = urlencode({"query": query, "format": "json"})
    url = f"{WIKIDATA_SPARQL}?{params}"
    req = Request(url, headers={
        "User-Agent": "MinoTimesPhyloSync/1.0 (https://minomobi.com; tips@minomobi.com)",
        "Accept": "application/sparql-results+json",
    })
    with urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    return data.get("results", {}).get("bindings", [])


def fetch_common_names_wikidata(ott_ids, sci_names=None):
    """Batch-fetch English common names from Wikidata via SPARQL.

    Two-pass strategy:
      1. P1843 (taxon common name) — the gold-standard vernacular name property
      2. Fallback to rdfs:label@en for any remaining IDs — covers species where
         the Wikidata label IS the common name (e.g. "gray wolf" not "Canis lupus")
         Filters out labels that match the scientific name (no common name exists).

    Args:
        ott_ids: list of OTT IDs (int) to look up
        sci_names: optional dict { ott_id: scientific_name } to filter label fallbacks

    Returns dict: { ott_id (int): common_name (str) }
    """
    if not ott_ids:
        return {}

    result = {}
    batches = [ott_ids[i:i + WIKIDATA_BATCH_SIZE]
               for i in range(0, len(ott_ids), WIKIDATA_BATCH_SIZE)]

    # Pass 1: P1843 (taxon common name)
    print(f"  Pass 1: P1843 taxon common name ({len(batches)} batches)...")
    for batch_idx, batch in enumerate(batches):
        values = " ".join(f'"{ott}"' for ott in batch)
        query = f"""SELECT ?ottId ?commonName WHERE {{
  ?item wdt:P9157 ?ottId .
  ?item wdt:P1843 ?commonName .
  FILTER(LANG(?commonName) = "en")
  VALUES ?ottId {{ {values} }}
}}"""
        try:
            bindings = _wikidata_sparql(query)
            for b in bindings:
                ott = int(b["ottId"]["value"])
                name = b["commonName"]["value"]
                # Take shortest common name when multiple exist
                if ott not in result or len(name) < len(result[ott]):
                    result[ott] = name
        except Exception as e:
            print(f"  WARNING: P1843 batch {batch_idx + 1}/{len(batches)} failed: {e}",
                  file=sys.stderr)

        if batch_idx < len(batches) - 1:
            time.sleep(RATE_LIMIT_DELAY)
        if (batch_idx + 1) % 5 == 0 or batch_idx == len(batches) - 1:
            print(f"    [{batch_idx + 1}/{len(batches)}] {len(result)} names so far")

    # Pass 2: rdfs:label fallback for remaining IDs
    remaining = [ott for ott in ott_ids if ott not in result]
    if remaining:
        rem_batches = [remaining[i:i + WIKIDATA_BATCH_SIZE]
                       for i in range(0, len(remaining), WIKIDATA_BATCH_SIZE)]
        print(f"  Pass 2: rdfs:label fallback for {len(remaining)} remaining "
              f"({len(rem_batches)} batches)...")

        for batch_idx, batch in enumerate(rem_batches):
            values = " ".join(f'"{ott}"' for ott in batch)
            query = f"""SELECT ?ottId ?label WHERE {{
  ?item wdt:P9157 ?ottId .
  ?item rdfs:label ?label .
  FILTER(LANG(?label) = "en")
  VALUES ?ottId {{ {values} }}
}}"""
            try:
                bindings = _wikidata_sparql(query)
                for b in bindings:
                    ott = int(b["ottId"]["value"])
                    label = b["label"]["value"]
                    # Skip if label matches scientific name (no real common name)
                    if sci_names and ott in sci_names:
                        if label.lower() == sci_names[ott].lower():
                            continue
                    # Skip labels that look like scientific names (capitalized Latin)
                    if label[0].isupper() and " " in label:
                        words = label.split()
                        if len(words) == 2 and words[1][0].islower() and words[1].isalpha():
                            # Looks like "Genus species" binomial — skip
                            continue
                    if ott not in result:
                        result[ott] = label
            except Exception as e:
                print(f"  WARNING: label batch {batch_idx + 1}/{len(rem_batches)} failed: {e}",
                      file=sys.stderr)

            if batch_idx < len(rem_batches) - 1:
                time.sleep(RATE_LIMIT_DELAY)
            if (batch_idx + 1) % 5 == 0 or batch_idx == len(rem_batches) - 1:
                print(f"    [{batch_idx + 1}/{len(rem_batches)}] {len(result)} names total")

    return result


# ── Clade chunking ──────────────────────────────────────────────────────────

def chunk_nodes(flat_nodes, max_per_chunk=MAX_NODES_PER_CLADE):
    """Split flat node list into clade-sized chunks.

    Chunks by subtree: picks a root node and includes its descendants
    up to the size limit. This keeps related nodes together.
    """
    if len(flat_nodes) <= max_per_chunk:
        return [flat_nodes]

    # Simple approach: chunk in order (nodes are already in DFS order from flatten)
    chunks = []
    for i in range(0, len(flat_nodes), max_per_chunk):
        chunks.append(flat_nodes[i:i + max_per_chunk])
    return chunks


def make_clade_record(nodes, chunk_idx, root_ott):
    """Build a clade record for writing to ATProto."""
    return {
        "$type": CLADE_COLLECTION,
        "rootOttId": root_ott,
        "chunkIndex": chunk_idx,
        "nodeCount": len(nodes),
        "nodes": nodes,
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Sync phylo tree to ATProto with Wikidata enrichment")
    parser.add_argument("--seed", type=int, help="Seed from OToL subtree (OTT ID)")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing")
    parser.add_argument("--skip-wikidata", action="store_true", help="Skip Wikidata enrichment")
    parser.add_argument("--force", action="store_true", help="Re-enrich even nodes that already have common names")
    args = parser.parse_args()

    handle = os.environ.get("BLUESKY_HANDLE", "")
    password = os.environ.get("BLUESKY_APP_PASSWORD", "")
    pds = os.environ.get("PDS_URL", "https://bsky.social")

    if not handle or not password:
        print("ERROR: Set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD", file=sys.stderr)
        sys.exit(1)

    # Authenticate
    print(f"Authenticating as {handle}...")
    did, token = authenticate(pds, handle, password)
    print(f"  Authenticated: {did}")

    # Step 1: Get current nodes
    all_nodes = []
    existing_rkeys = []

    if args.seed:
        # Seed mode: fetch fresh from OToL
        print(f"\nSeeding from OToL subtree ott{args.seed}...")
        tree = fetch_otol_subtree(args.seed)
        if not tree:
            print("ERROR: Failed to fetch subtree", file=sys.stderr)
            sys.exit(1)
        all_nodes = flatten_arguson(tree)
        print(f"  Flattened: {len(all_nodes)} nodes")
    else:
        # Enrich mode: read existing records from PDS
        print(f"\nReading existing clade records from PDS...")
        records = list_records(pds, did, CLADE_COLLECTION, token)
        if not records:
            print("ERROR: No clade records found. Use --seed to create initial data.", file=sys.stderr)
            sys.exit(1)
        for rkey, value in records:
            existing_rkeys.append(rkey)
            for node in value.get("nodes", []):
                all_nodes.append(node)
        print(f"  Found {len(all_nodes)} nodes across {len(records)} clade records")

    # Step 2: Identify nodes needing common names
    if args.skip_wikidata:
        print("\nSkipping Wikidata enrichment (--skip-wikidata)")
        common_names = {}
    else:
        if args.force:
            need_names = [n["ottId"] for n in all_nodes if n.get("ottId")]
        else:
            need_names = [n["ottId"] for n in all_nodes
                          if n.get("ottId") and not n.get("commonName")]

        print(f"\nNodes needing common names: {len(need_names)} / {len(all_nodes)}")

        if need_names:
            # Build scientific name map for label-fallback filtering
            sci_names = {n["ottId"]: n["name"] for n in all_nodes
                         if n.get("ottId") and n.get("name")}
            print(f"Querying Wikidata SPARQL ({len(need_names)} OTT IDs in "
                  f"{math.ceil(len(need_names) / WIKIDATA_BATCH_SIZE)} batches)...")
            common_names = fetch_common_names_wikidata(need_names, sci_names)
            print(f"  Wikidata returned {len(common_names)} common names")
        else:
            common_names = {}
            print("  All nodes already have common names — nothing to enrich")

    # Step 3: Apply common names to nodes
    enriched_count = 0
    for node in all_nodes:
        ott = node.get("ottId")
        if ott and ott in common_names:
            old = node.get("commonName", "")
            new = common_names[ott]
            if new and new != old:
                node["commonName"] = new
                enriched_count += 1

    print(f"  Enriched {enriched_count} nodes with common names")

    if enriched_count == 0 and not args.seed:
        print("\nNo changes to write. Done.")
        return

    # Step 4: Re-chunk and determine root OTT
    root_ott = all_nodes[0]["ottId"] if all_nodes else 0
    chunks = chunk_nodes(all_nodes)
    print(f"\nChunked into {len(chunks)} clade records (max {MAX_NODES_PER_CLADE}/chunk)")

    # Preview
    sample_enriched = [(n["name"], n.get("commonName", ""))
                       for n in all_nodes if n.get("commonName")][:10]
    if sample_enriched:
        print("\n  Sample enriched names:")
        for sci, common in sample_enriched:
            print(f"    {sci} → {common}")

    if args.dry_run:
        print(f"\n[DRY RUN] Would write {len(chunks)} clade records "
              f"({len(all_nodes)} nodes, {enriched_count} enriched)")
        return

    # Step 5: Delete old records if they exist
    if existing_rkeys:
        print(f"\nDeleting {len(existing_rkeys)} old clade records...")
        for rkey in existing_rkeys:
            try:
                delete_record(pds, did, CLADE_COLLECTION, rkey, token)
            except Exception as e:
                print(f"  WARNING: Failed to delete {rkey}: {e}", file=sys.stderr)
            time.sleep(0.3)

    # Step 6: Write new clade records
    print(f"Writing {len(chunks)} clade records...")
    for i, chunk in enumerate(chunks):
        rkey = f"ott{root_ott}-{i:04d}"
        record = make_clade_record(chunk, i, root_ott)

        # Validate record size
        record_json = json.dumps(record)
        size_kb = len(record_json.encode()) / 1024
        if size_kb > 60:
            print(f"  WARNING: Record {rkey} is {size_kb:.1f}KB (limit ~64KB)", file=sys.stderr)

        try:
            put_record(pds, did, CLADE_COLLECTION, rkey, record, token)
            print(f"  [{i + 1}/{len(chunks)}] {rkey}: {len(chunk)} nodes ({size_kb:.1f}KB)")
        except Exception as e:
            print(f"  ERROR writing {rkey}: {e}", file=sys.stderr)
        time.sleep(0.5)

    print(f"\nDone. {len(all_nodes)} nodes across {len(chunks)} records. "
          f"{enriched_count} enriched with common names.")


if __name__ == "__main__":
    main()
