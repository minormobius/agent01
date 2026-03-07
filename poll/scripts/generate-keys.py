#!/usr/bin/env python3
"""
Generate all ATPolls key pairs.

Usage:
    python3 scripts/generate-keys.py            # generates both RSA + OAuth keys
    python3 scripts/generate-keys.py --rsa       # RSA blind signature keys only
    python3 scripts/generate-keys.py --oauth     # OAuth client keys only

Output:
    - RSA_PRIVATE_KEY_JWK / RSA_PUBLIC_KEY_JWK: blind signatures (RSA-PSS SHA-384)
    - OAUTH_CLIENT_PRIVATE_KEY_JWK / OAUTH_CLIENT_PUBLIC_KEY_JWK: OAuth client auth (ES256)

No pip dependencies — uses openssl CLI (available on macOS/Linux).
"""

import argparse
import base64
import hashlib
import json
import subprocess
import struct
import sys
import tempfile
import os


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def openssl(*args: str, stdin: bytes | None = None) -> bytes:
    result = subprocess.run(
        ["openssl", *args],
        input=stdin,
        capture_output=True,
    )
    if result.returncode != 0:
        print(f"openssl error: {result.stderr.decode()}", file=sys.stderr)
        sys.exit(1)
    return result.stdout


def pem_to_der(pem: bytes) -> bytes:
    """Strip PEM headers and base64-decode to DER."""
    lines = pem.decode().strip().splitlines()
    b64 = "".join(l for l in lines if not l.startswith("-----"))
    return base64.b64decode(b64)


def parse_asn1_integer(data: bytes, offset: int) -> tuple[int, int]:
    """Parse a DER INTEGER and return (value, new_offset)."""
    assert data[offset] == 0x02, f"Expected INTEGER tag at offset {offset}"
    offset += 1
    length = data[offset]
    offset += 1
    if length & 0x80:
        n_bytes = length & 0x7F
        length = int.from_bytes(data[offset:offset + n_bytes], "big")
        offset += n_bytes
    value = int.from_bytes(data[offset:offset + length], "big")
    return value, offset + length


def parse_asn1_sequence(data: bytes, offset: int) -> tuple[int, int]:
    """Skip a SEQUENCE header, return (content_length, new_offset)."""
    assert data[offset] == 0x30, f"Expected SEQUENCE tag at offset {offset}"
    offset += 1
    length = data[offset]
    offset += 1
    if length & 0x80:
        n_bytes = length & 0x7F
        length = int.from_bytes(data[offset:offset + n_bytes], "big")
        offset += n_bytes
    return length, offset


def int_to_b64url(n: int, length: int) -> str:
    return b64url(n.to_bytes(length, "big"))


def rsa_int_to_b64url(n: int) -> str:
    byte_len = (n.bit_length() + 7) // 8
    return b64url(n.to_bytes(byte_len, "big"))


def generate_rsa_keys():
    # Generate 2048-bit RSA key (PKCS#1 traditional format for easy DER parsing)
    pem_pkcs8 = openssl("genrsa", "2048")
    pem_private = openssl("rsa", "-traditional", stdin=pem_pkcs8)
    der = pem_to_der(pem_private)

    # Parse RSA private key DER (PKCS#1 RSAPrivateKey)
    # SEQUENCE { version, n, e, d, p, q, dp, dq, qi }
    _, offset = parse_asn1_sequence(der, 0)
    _version, offset = parse_asn1_integer(der, offset)
    n, offset = parse_asn1_integer(der, offset)
    e, offset = parse_asn1_integer(der, offset)
    d, offset = parse_asn1_integer(der, offset)
    p, offset = parse_asn1_integer(der, offset)
    q, offset = parse_asn1_integer(der, offset)
    dp, offset = parse_asn1_integer(der, offset)
    dq, offset = parse_asn1_integer(der, offset)
    qi, offset = parse_asn1_integer(der, offset)

    public_jwk = {
        "kty": "RSA",
        "alg": "PS384",
        "n": rsa_int_to_b64url(n),
        "e": rsa_int_to_b64url(e),
        "key_ops": ["verify"],
        "ext": True,
    }

    private_jwk = {
        **public_jwk,
        "d": rsa_int_to_b64url(d),
        "p": rsa_int_to_b64url(p),
        "q": rsa_int_to_b64url(q),
        "dp": rsa_int_to_b64url(dp),
        "dq": rsa_int_to_b64url(dq),
        "qi": rsa_int_to_b64url(qi),
        "key_ops": ["sign"],
    }

    print("=== RSA-PSS Key Pair for Blind Signatures ===\n")
    print("Modulus length: 2048 bits")
    print("Hash: SHA-384")
    print("Algorithm: RSA-PSS (RFC 9474 / RSABSSA-SHA384-PSS-Randomized)\n")

    print("--- RSA_PRIVATE_KEY_JWK (Cloudflare Worker secret — KEEP SECRET) ---")
    print(json.dumps(private_jwk))
    print()

    print("--- RSA_PUBLIC_KEY_JWK (Cloudflare Worker secret — public, stored per-poll) ---")
    print(json.dumps(public_jwk))
    print()

    print("To set as Cloudflare secrets:")
    print("  npx wrangler secret put RSA_PRIVATE_KEY_JWK")
    print("  npx wrangler secret put RSA_PUBLIC_KEY_JWK")
    print("Then paste the JSON when prompted.\n")


def generate_oauth_keys():
    # Generate EC P-256 key
    pem_private = openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout")

    # Get DER directly (binary, not PEM)
    der_private = openssl("ec", "-outform", "DER", stdin=pem_private)

    # ECPrivateKey DER: SEQUENCE { version(1), privateKey OCTET STRING, [0] oid, [1] publicKey BIT STRING }
    _, offset = parse_asn1_sequence(der_private, 0)
    _version, offset = parse_asn1_integer(der_private, offset)

    # Private key octet string
    assert der_private[offset] == 0x04  # OCTET STRING
    offset += 1
    d_len = der_private[offset]
    offset += 1
    d_bytes = der_private[offset:offset + d_len]
    offset += d_len

    # Skip [0] OID if present
    if offset < len(der_private) and der_private[offset] == 0xA0:
        offset += 1
        tag_len = der_private[offset]
        offset += 1 + tag_len

    # [1] Public key BIT STRING
    assert der_private[offset] == 0xA1
    offset += 1
    ctx_len = der_private[offset]
    offset += 1
    # BIT STRING
    assert der_private[offset] == 0x03
    offset += 1
    bs_len = der_private[offset]
    offset += 1
    _unused_bits = der_private[offset]
    offset += 1
    # Uncompressed point: 0x04 || x || y
    assert der_private[offset] == 0x04
    offset += 1
    x_bytes = der_private[offset:offset + 32]
    y_bytes = der_private[offset + 32:offset + 64]

    public_jwk = {
        "kty": "EC",
        "crv": "P-256",
        "x": b64url(x_bytes),
        "y": b64url(y_bytes),
        "key_ops": ["verify"],
        "ext": True,
    }

    private_jwk = {
        **public_jwk,
        "d": b64url(d_bytes),
        "key_ops": ["sign"],
    }

    # Compute JWK thumbprint (RFC 7638) for kid
    canonical = json.dumps(
        {"crv": "P-256", "kty": "EC", "x": public_jwk["x"], "y": public_jwk["y"]},
        separators=(",", ":"),
    )
    kid = b64url(hashlib.sha256(canonical.encode()).digest())
    public_jwk["kid"] = kid
    private_jwk["kid"] = kid

    print("=== OAuth Client Key Pair (ES256, private_key_jwt) ===\n")

    print("--- OAUTH_CLIENT_PRIVATE_KEY_JWK (Cloudflare Worker secret — KEEP SECRET) ---")
    print(json.dumps(private_jwk))
    print()

    print("--- OAUTH_CLIENT_PUBLIC_KEY_JWK (Cloudflare Worker secret + client-metadata.json jwks) ---")
    print(json.dumps(public_jwk))
    print()

    print("Add the public key to client-metadata.json:")
    print(json.dumps({"jwks": {"keys": [public_jwk]}}, indent=2))
    print()

    print("To set as Cloudflare secrets:")
    print("  npx wrangler secret put OAUTH_CLIENT_PRIVATE_KEY_JWK")
    print("  npx wrangler secret put OAUTH_CLIENT_PUBLIC_KEY_JWK")
    print("Then paste the JSON when prompted.\n")


def main():
    parser = argparse.ArgumentParser(description="Generate ATPolls key pairs")
    parser.add_argument("--rsa", action="store_true", help="RSA blind signature keys only")
    parser.add_argument("--oauth", action="store_true", help="OAuth client keys only")
    args = parser.parse_args()

    # Check openssl is available
    try:
        subprocess.run(["openssl", "version"], capture_output=True, check=True)
    except FileNotFoundError:
        print("Error: openssl CLI not found. Install OpenSSL and try again.", file=sys.stderr)
        sys.exit(1)

    generate_both = not args.rsa and not args.oauth

    if generate_both or args.rsa:
        generate_rsa_keys()

    if generate_both or args.oauth:
        generate_oauth_keys()

    if generate_both:
        print("=== Summary: 5 secrets to set ===")
        print("  npx wrangler secret put RSA_PRIVATE_KEY_JWK")
        print("  npx wrangler secret put RSA_PUBLIC_KEY_JWK")
        print("  npx wrangler secret put OAUTH_CLIENT_PRIVATE_KEY_JWK")
        print("  npx wrangler secret put OAUTH_CLIENT_PUBLIC_KEY_JWK")
        print("  npx wrangler secret put OAUTH_CLIENT_ID")
        print("    (value: https://poll.mino.mobi/client-metadata.json)")


if __name__ == "__main__":
    main()
