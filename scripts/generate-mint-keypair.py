#!/usr/bin/env python3
"""
Generate an Ed25519 key pair for Wiki Cards mint signatures.

Usage:
    pip install PyNaCl
    python3 scripts/generate-mint-keypair.py

Output:
    - CARDS_MINT_PRIVATE_KEY: hex-encoded 64-byte seed+key — store as GitHub/Cloudflare secret
    - CARDS_MINT_PUBLIC_KEY: hex-encoded 32-byte public key — publish everywhere
    - Public key JSON: paste into cards/mint-public-key.json (committed to git)
    - PDS record JSON: publish as com.minomobi.cards.mintkey on the mint PDS

The private key signs cards. The public key verifies them.
Anyone with the public key can verify — no PDS required.
"""

import json
import sys
from datetime import datetime, timezone

try:
    import nacl.signing
    import nacl.encoding
except ImportError:
    print("Install PyNaCl: pip install PyNaCl", file=sys.stderr)
    sys.exit(1)


def main():
    # Generate Ed25519 keypair
    signing_key = nacl.signing.SigningKey.generate()
    verify_key = signing_key.verify_key

    private_hex = signing_key.encode(encoder=nacl.encoding.HexEncoder).decode("ascii")
    public_hex = verify_key.encode(encoder=nacl.encoding.HexEncoder).decode("ascii")

    # Multibase encoding: 'z' prefix + base58btc (DID doc convention)
    public_raw = verify_key.encode()
    public_multibase = "z" + nacl.encoding.Base64Encoder.encode(public_raw).decode("ascii")
    # Proper base58btc would need a library; for now use hex which is unambiguous
    # The hex form is what the JS verification code uses directly

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Test roundtrip
    test_msg = b"wiki-cards-mint-key-test"
    signed = signing_key.sign(test_msg)
    verify_key.verify(signed.message, signed.signature)

    print("=== Ed25519 Mint Key Pair for Wiki Cards ===\n")
    print("Algorithm: Ed25519")
    print(f"Generated: {now}")
    print(f"Public key (hex, 32 bytes): {public_hex}")
    print(f"Private key (hex, 32 bytes seed): {private_hex}")
    print("Roundtrip test: PASSED\n")

    print("--- CARDS_MINT_PRIVATE_KEY (KEEP SECRET — GitHub/Cloudflare secret) ---")
    print(private_hex)
    print()

    print("--- CARDS_MINT_PUBLIC_KEY (public — embed everywhere) ---")
    print(public_hex)
    print()

    # Git-committed public key file
    pub_json = {
        "algorithm": "Ed25519",
        "publicKeyHex": public_hex,
        "createdAt": now,
        "note": "Wiki Cards mint key v1 — verify with cards/js/mint-verify.js",
    }
    print("--- cards/mint-public-key.json (commit to git) ---")
    print(json.dumps(pub_json, indent=2))
    print()

    # PDS record
    pds_record = {
        "$type": "com.minomobi.cards.mintkey",
        "algorithm": "Ed25519",
        "publicKeyHex": public_hex,
        "createdAt": now,
        "note": "Wiki Cards mint key v1",
    }
    print("--- PDS record (publish as com.minomobi.cards.mintkey, rkey='current') ---")
    print(json.dumps(pds_record, indent=2))
    print()

    print("=== What To Do ===\n")
    print("1. PRIVATE KEY → store as secret:")
    print("   GitHub:     Settings > Secrets > CARDS_MINT_PRIVATE_KEY")
    print("   Cloudflare: npx wrangler secret put CARDS_MINT_PRIVATE_KEY")
    print()
    print("2. PUBLIC KEY → publish in three places:")
    print("   a) Git:  save to cards/mint-public-key.json and commit")
    print("   b) PDS:  publish the PDS record JSON above")
    print("   c) Code: the hex string is hardcoded in cards/js/mint-verify.js")
    print()
    print("After generating, update MINT_PUBLIC_KEY_HEX in cards/js/mint-verify.js")
    print("with the public key hex string printed above.")


if __name__ == "__main__":
    main()
