#!/usr/bin/env python3
"""
Mint signed Wiki Cards and write them to a player's PDS.

Each card is a com.minomobi.cards.card record containing:
- Card data (title, stats, rarity, category)
- issuedTo (player's DID)
- nonce (random, prevents replay)
- mintSig (Ed25519 signature proving minomobi minted it)

The signature covers the canonical JSON of all fields except mintSig.
Anyone with the public key can verify — no mint PDS required.

Usage:
    export CARDS_MINT_PRIVATE_KEY=<hex>
    export BLUESKY_HANDLE=minomobi.com
    export BLUESKY_APP_PASSWORD=xxxx

    # Mint a daily pack for a player
    python3 scripts/mint-cards.py --player did:plc:abc123 --source daily_pack

    # Mint specific cards
    python3 scripts/mint-cards.py --player did:plc:abc123 --titles "Tyrannosaurus,Penicillin"

    # Dry run — show signed cards without writing to PDS
    python3 scripts/mint-cards.py --player did:plc:abc123 --dry-run

Requires: pip install PyNaCl
"""

import argparse
import json
import os
import secrets
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen

try:
    import nacl.signing
    import nacl.encoding
except ImportError:
    print("Install PyNaCl: pip install PyNaCl", file=sys.stderr)
    sys.exit(1)

BSKY_PUBLIC_API = "https://public.api.bsky.app"
CATALOG_COLLECTION = "com.minomobi.cards.catalog"
CARD_COLLECTION = "com.minomobi.cards.card"
DAILY_PACK_SIZE = 5


# ── ATProto helpers ──────────────────────────────────────────────

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


def create_record(pds, did, token, collection, record):
    """Create a record using createRecord (auto-generates TID rkey)."""
    url = f"{pds}/xrpc/com.atproto.repo.createRecord"
    payload = {
        "repo": did,
        "collection": collection,
        "record": {"$type": collection, **record},
    }
    data = json.dumps(payload, ensure_ascii=False).encode()
    req = Request(url, data=data, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    })
    with urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
    return result.get("uri"), result.get("cid")


# ── Canonical JSON ───────────────────────────────────────────────

def canonical_json(obj):
    """Deterministic JSON: sorted keys, no whitespace, ensure_ascii=False.

    This is the payload that gets signed. Both the Python mint script and
    the JS verification library must produce identical output for the same
    input — sorted keys + compact encoding guarantees this.
    """
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


# ── Signing ──────────────────────────────────────────────────────

def load_signing_key():
    """Load Ed25519 signing key from CARDS_MINT_PRIVATE_KEY env var."""
    hex_key = os.environ.get("CARDS_MINT_PRIVATE_KEY")
    if not hex_key:
        print("ERROR: Set CARDS_MINT_PRIVATE_KEY (hex-encoded Ed25519 seed)",
              file=sys.stderr)
        sys.exit(1)
    return nacl.signing.SigningKey(bytes.fromhex(hex_key))


def sign_card(signing_key, card_data):
    """Sign a card and return the card data with mintSig attached.

    card_data must contain all fields EXCEPT mintSig.
    Returns a new dict with mintSig added.
    """
    # Canonical JSON of everything except mintSig
    payload = canonical_json(card_data)
    signed = signing_key.sign(payload.encode("utf-8"))

    return {
        **card_data,
        "mintSig": signed.signature.hex(),
    }


def build_card(title, category, stats, rarity, player_did, mint_did, source,
               embedding_idx=None):
    """Build unsigned card data."""
    card = {
        "title": title,
        "category": category,
        "stats": stats,
        "rarity": rarity,
        "issuedTo": player_did,
        "issuedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": source,
        "nonce": secrets.token_hex(16),
        "mintDid": mint_did,
    }
    if embedding_idx is not None:
        card["embeddingIdx"] = embedding_idx
    return card


# ── Catalog lookup ───────────────────────────────────────────────

def load_catalog_from_file(path="cards/data/deep-wikipedia.json"):
    """Load the local scored catalog for minting."""
    with open(path) as f:
        data = json.load(f)
    articles = data.get("articles", [])
    by_title = {}
    for a in articles:
        s = a.get("stats", {})
        by_title[a["title"]] = {
            "category": a.get("bin", "HISTORY"),
            "stats": {
                "atk": s.get("atk", 50),
                "def": s.get("def", 50),
                "spc": s.get("spc", 50),
                "spd": s.get("spd", 50),
                "hp": s.get("hp", 500),
            },
            "rarity": s.get("rarity", "common"),
        }
    return by_title, articles


def pick_daily_pack(articles, count=DAILY_PACK_SIZE):
    """Pick cards for a daily pack with rarity weighting."""
    import random
    # Weighted by inverse rarity for interesting distribution
    weights = {"common": 1, "uncommon": 2, "rare": 4, "legendary": 8}
    weighted = []
    for a in articles:
        r = a.get("stats", {}).get("rarity", "common")
        weighted.append((a, weights.get(r, 1)))

    titles_and_weights = [(a["title"], w) for a, w in weighted]
    titles = [t for t, _ in titles_and_weights]
    ws = [w for _, w in titles_and_weights]
    chosen = random.choices(titles, weights=ws, k=count)
    return list(set(chosen))[:count]  # deduplicate


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Mint signed Wiki Cards")
    parser.add_argument("--player", required=True,
                        help="Player DID (did:plc:...)")
    parser.add_argument("--source", default="daily_pack",
                        choices=["daily_pack", "lucky", "transmute"],
                        help="How the card was obtained")
    parser.add_argument("--titles", default=None,
                        help="Comma-separated card titles to mint (default: random pack)")
    parser.add_argument("--catalog", default="cards/data/deep-wikipedia.json",
                        help="Path to scored catalog JSON")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show signed cards without writing to PDS")
    parser.add_argument("--output-json", action="store_true",
                        help="Output signed cards as JSON array (for piping)")
    args = parser.parse_args()

    signing_key = load_signing_key()
    mint_did = resolve_handle(os.environ.get("BLUESKY_HANDLE", "minomobi.com"))

    # Load catalog
    by_title, articles = load_catalog_from_file(args.catalog)
    print(f"Catalog: {len(by_title)} cards loaded", file=sys.stderr)

    # Pick titles
    if args.titles:
        titles = [t.strip() for t in args.titles.split(",")]
        missing = [t for t in titles if t not in by_title]
        if missing:
            print(f"ERROR: Not in catalog: {missing}", file=sys.stderr)
            sys.exit(1)
    else:
        titles = pick_daily_pack(articles)

    # Build and sign cards
    signed_cards = []
    for title in titles:
        info = by_title[title]
        card = build_card(
            title=title,
            category=info["category"],
            stats=info["stats"],
            rarity=info["rarity"],
            player_did=args.player,
            mint_did=mint_did,
            source=args.source,
        )
        signed = sign_card(signing_key, card)
        signed_cards.append(signed)
        print(f"  Signed: {title} ({info['rarity']}, {info['category']})",
              file=sys.stderr)

    if args.output_json:
        print(json.dumps(signed_cards, indent=2))
        return

    if args.dry_run:
        print(f"\nDry run — {len(signed_cards)} cards signed:", file=sys.stderr)
        for c in signed_cards:
            print(json.dumps(c, indent=2))
        return

    # Write to mint PDS (cards are minted centrally, then the player
    # can copy them to their own PDS — or a future claim endpoint does it)
    handle = os.environ.get("BLUESKY_HANDLE")
    password = os.environ.get("BLUESKY_APP_PASSWORD")
    if not handle or not password:
        print("ERROR: Set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD", file=sys.stderr)
        sys.exit(1)

    did = resolve_handle(handle)
    pds = resolve_pds(did)
    token, _ = create_session(pds, handle, password)

    print(f"\nWriting {len(signed_cards)} cards to PDS...", file=sys.stderr)
    for card in signed_cards:
        uri, cid = create_record(pds, did, token, CARD_COLLECTION, card)
        print(f"  {card['title']}: {uri} (cid: {cid})", file=sys.stderr)
        time.sleep(0.5)

    print(f"\nDone: {len(signed_cards)} cards minted for {args.player}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
