#!/usr/bin/env python3
"""
Sync Correlates of War interstate war data to ATProto PDS.

Reads Inter-StateWarData_v4.0.csv, aggregates per-war features
(duration, deaths, participants, coalition size, death asymmetry,
decisiveness, region), and writes each war as a com.minomobi.wars.war
record. The dashboard then fetches from PDS and runs PCA in-browser.

Usage:
    export BLUESKY_HANDLE=minomobi.com
    export BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

    # Sync all wars
    python3 scripts/sync-wars-to-atproto.py

    # Dry run
    python3 scripts/sync-wars-to-atproto.py --dry-run

    # Replace existing records
    python3 scripts/sync-wars-to-atproto.py --replace
"""

import argparse
import csv
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BSKY_PUBLIC_API = "https://public.api.bsky.app"
COLLECTION = "com.minomobi.wars.war"
BATCH_SIZE = 10
BATCH_DELAY = 3
RATE_DELAY = 2.2
MAX_RETRIES = 4
RETRY_BASE_DELAY = 3

# COW WhereFought codes → region names
REGION_MAP = {
    1: "W Hemisphere",
    2: "Europe",
    4: "Africa",
    6: "Middle East",
    7: "Asia",
    11: "Europe & Middle East",
    12: "Europe & Asia",
    13: "W Hemisphere & Asia",
    14: "Europe & Africa",
    15: "Europe & Asia & Africa",
    16: "Asia & Oceania",
    17: "Asia & W Hemisphere",
    18: "Africa & Middle East",
    19: "Asia & Africa & W Hemisphere",
}

# COW Outcome codes
OUTCOME_LABELS = {
    1: "winner",
    2: "loser",
    3: "compromise",
    4: "transformed",
    5: "ongoing",
    6: "stalemate",
    7: "continuing",
    8: "changed sides",
}

ACCOUNTS = {
    "main": ("BLUESKY_HANDLE", "BLUESKY_APP_PASSWORD"),
    "modulo": ("BLUESKY_MODULO_HANDLE", "BLUESKY_MODULO_APP_PASSWORD"),
    "morphyx": ("BLUESKY_MORPHYX_HANDLE", "BLUESKY_MORPHYX_APP_PASSWORD"),
}


def parse_csv(csv_path):
    """Parse COW CSV into war-level records with computed features."""
    raw = defaultdict(lambda: {"participants": [], "sides": set()})
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            wn = int(row["WarNum"])
            w = raw[wn]
            if "warName" not in w:
                w["warNum"] = wn
                w["warName"] = row["WarName"]
                w["warType"] = int(row["WarType"])
                w["startMonth"] = int(row["StartMonth1"])
                w["startDay"] = int(row["StartDay1"])
                w["startYear"] = int(row["StartYear1"])
                w["endMonth"] = int(row["EndMonth1"])
                w["endDay"] = int(row["EndDay1"])
                w["endYear"] = int(row["EndYear1"])
                w["whereFought"] = int(row["WhereFought"])

            deaths = int(row["BatDeath"]) if row["BatDeath"] not in ("-8", "-9", "") else 0
            side = int(row["Side"])
            w["participants"].append({
                "stateName": row["StateName"],
                "ccode": int(row["ccode"]),
                "side": side,
                "initiator": int(row["Initiator"]),
                "batDeath": deaths,
                "outcome": int(row["Outcome"]),
            })
            w["sides"].add(side)

    wars = []
    for wn in sorted(raw):
        w = raw[wn]
        # Duration in days (approximate from month/day/year)
        try:
            start = datetime(w["startYear"], max(1, w["startMonth"]), max(1, w["startDay"]))
            end = datetime(w["endYear"], max(1, w["endMonth"]), max(1, w["endDay"]))
            duration_days = max(1, (end - start).days)
        except (ValueError, OverflowError):
            duration_days = (w["endYear"] - w["startYear"]) * 365 + 1

        total_deaths = sum(p["batDeath"] for p in w["participants"])
        num_participants = len(w["participants"])
        num_sides = len(w["sides"])

        # Coalition size
        side_count = defaultdict(int)
        side_deaths = defaultdict(int)
        for p in w["participants"]:
            side_count[p["side"]] += 1
            side_deaths[p["side"]] += p["batDeath"]

        max_coalition = max(side_count.values()) if side_count else 1

        # Death asymmetry: min(side_deaths) / max(side_deaths)
        # 0 = completely lopsided, 1 = balanced
        if len(side_deaths) >= 2:
            vals = list(side_deaths.values())
            max_d = max(vals) if max(vals) > 0 else 1
            min_d = min(vals)
            death_asymmetry = round(min_d / max_d, 3)
        else:
            death_asymmetry = 1.0

        # Decisiveness
        outcomes = set(p["outcome"] for p in w["participants"])
        decisive = 1 in outcomes and 2 in outcomes

        region = REGION_MAP.get(w["whereFought"], f"Unknown ({w['whereFought']})")

        wars.append({
            "warNum": wn,
            "warName": w["warName"],
            "startYear": w["startYear"],
            "endYear": w["endYear"],
            "durationDays": duration_days,
            "totalDeaths": total_deaths,
            "numParticipants": num_participants,
            "numSides": num_sides,
            "maxCoalitionSize": max_coalition,
            "deathAsymmetry": death_asymmetry,
            "decisive": decisive,
            "region": region,
            "participants": w["participants"],
        })

    return wars


def build_record(war):
    """Build an ATProto record value from a war dict."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "warNum": war["warNum"],
        "warName": war["warName"],
        "startYear": war["startYear"],
        "endYear": war["endYear"],
        "durationDays": war["durationDays"],
        "totalDeaths": war["totalDeaths"],
        "numParticipants": war["numParticipants"],
        "numSides": war["numSides"],
        "maxCoalitionSize": war["maxCoalitionSize"],
        "deathAsymmetry": war["deathAsymmetry"],
        "decisive": war["decisive"],
        "region": war["region"],
        "participants": war["participants"],
        "source": "correlatesofwar.org/v4.0",
        "createdAt": now,
    }


# --- ATProto API (same pattern as sync-otol-to-atproto.py) ---

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
    raise ValueError(f"No PDS endpoint found for {did}")


def create_session(pds, handle, password):
    url = f"{pds}/xrpc/com.atproto.server.createSession"
    data = json.dumps({"identifier": handle, "password": password}).encode()
    req = Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=15) as resp:
        session = json.loads(resp.read())
    return session["accessJwt"], session["did"]


def list_existing_records(pds, did, token, limit=100):
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
            rkey = rec["uri"].split("/")[-1]
            existing.add(rkey)
        cursor = data.get("cursor")
        if not cursor or not data.get("records"):
            break
    return existing


def write_record(pds, did, token, rkey, record):
    url = f"{pds}/xrpc/com.atproto.repo.createRecord"
    payload = {
        "repo": did,
        "collection": COLLECTION,
        "rkey": rkey,
        "record": {"$type": COLLECTION, **record},
    }
    data = json.dumps(payload).encode()

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
                print(f"  Rate limited on {rkey}, retry {attempt+1}/{MAX_RETRIES} in {delay}s", file=sys.stderr)
                time.sleep(delay)
                continue
            print(f"  Error writing {rkey}: {exc.code} {body}", file=sys.stderr)
            return None


def write_batch(pds, did, token, wars_batch):
    writes = []
    for war in wars_batch:
        rkey = str(war["warNum"])
        writes.append({
            "$type": "com.atproto.repo.applyWrites#create",
            "collection": COLLECTION,
            "rkey": rkey,
            "value": {"$type": COLLECTION, **build_record(war)},
        })
    payload = {"repo": did, "writes": writes}
    data = json.dumps(payload).encode()

    for attempt in range(MAX_RETRIES + 1):
        req = Request(f"{pds}/xrpc/com.atproto.repo.applyWrites", data=data, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        })
        try:
            with urlopen(req, timeout=60) as resp:
                json.loads(resp.read())
            return len(wars_batch), 0
        except HTTPError as exc:
            body = exc.read().decode()
            if exc.code == 429 and attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                print(f"  Rate limited (batch), retry {attempt+1}/{MAX_RETRIES} in {delay}s", file=sys.stderr)
                time.sleep(delay)
                continue
            print(f"  Batch error: {exc.code} {body}", file=sys.stderr)
            break

    # Fallback to individual writes
    print("  Falling back to individual writes...", file=sys.stderr)
    ok, err = 0, 0
    for war in wars_batch:
        uri = write_record(pds, did, token, str(war["warNum"]), build_record(war))
        if uri:
            ok += 1
        else:
            err += 1
        time.sleep(RATE_DELAY)
    return ok, err


def delete_batch(pds, did, token, rkeys):
    writes = [{
        "$type": "com.atproto.repo.applyWrites#delete",
        "collection": COLLECTION,
        "rkey": rkey,
    } for rkey in rkeys]

    for i in range(0, len(writes), BATCH_SIZE):
        batch = writes[i:i + BATCH_SIZE]
        payload = {"repo": did, "writes": batch}
        data = json.dumps(payload).encode()
        req = Request(f"{pds}/xrpc/com.atproto.repo.applyWrites", data=data, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        })
        try:
            with urlopen(req, timeout=30) as resp:
                json.loads(resp.read())
            print(f"  Deleted {len(batch)} records")
        except HTTPError as exc:
            body = exc.read().decode()
            print(f"  Delete error: {exc.code} {body}", file=sys.stderr)
        time.sleep(BATCH_DELAY)


def main():
    parser = argparse.ArgumentParser(description="Sync COW war data to ATProto PDS")
    parser.add_argument("--csv", default="wars/data/Inter-StateWarData_v4.0.csv", help="Path to COW CSV")
    parser.add_argument("--dry-run", action="store_true", help="Parse and print without writing")
    parser.add_argument("--replace", action="store_true", help="Delete existing records before writing")
    parser.add_argument("--account", choices=list(ACCOUNTS.keys()), default="main")
    args = parser.parse_args()

    print(f"Parsing {args.csv}...")
    wars = parse_csv(args.csv)
    print(f"  {len(wars)} wars parsed")
    print(f"  Date range: {wars[0]['startYear']}-{wars[-1]['endYear']}")
    print(f"  Total deaths: {sum(w['totalDeaths'] for w in wars):,}")
    print()

    if args.dry_run:
        print("=== DRY RUN ===")
        for w in wars:
            print(f"  [{w['warNum']}] {w['warName']} ({w['startYear']}-{w['endYear']})")
            print(f"    Deaths: {w['totalDeaths']:,} | Participants: {w['numParticipants']} | "
                  f"Coalition: {w['maxCoalitionSize']} | Asymmetry: {w['deathAsymmetry']:.2f} | "
                  f"Decisive: {w['decisive']} | Region: {w['region']}")
        return

    # Authenticate
    handle_env, pass_env = ACCOUNTS[args.account]
    handle = os.environ.get(handle_env)
    password = os.environ.get(pass_env)
    if not handle or not password:
        print(f"Error: Set {handle_env} and {pass_env} environment variables", file=sys.stderr)
        sys.exit(1)

    print(f"Authenticating as {handle}...")
    did = resolve_handle(handle)
    pds = resolve_pds(did)
    token, _ = create_session(pds, handle, password)
    print(f"  DID: {did}")
    print(f"  PDS: {pds}")

    # Check existing
    existing = list_existing_records(pds, did, token)
    print(f"  Existing records: {len(existing)}")

    new_rkeys = {str(w["warNum"]) for w in wars}
    conflicting = existing & new_rkeys

    if args.replace and conflicting:
        print(f"  Deleting {len(conflicting)} conflicting records...")
        delete_batch(pds, did, token, list(conflicting))

    # Write in batches
    to_write = [w for w in wars if str(w["warNum"]) not in existing or args.replace]
    print(f"\nWriting {len(to_write)} war records...")

    total_ok, total_err = 0, 0
    for i in range(0, len(to_write), BATCH_SIZE):
        batch = to_write[i:i + BATCH_SIZE]
        ok, err = write_batch(pds, did, token, batch)
        total_ok += ok
        total_err += err
        print(f"  Batch {i // BATCH_SIZE + 1}: {ok} ok, {err} errors")
        if i + BATCH_SIZE < len(to_write):
            time.sleep(BATCH_DELAY)

    print(f"\nDone: {total_ok} written, {total_err} errors")


if __name__ == "__main__":
    main()
