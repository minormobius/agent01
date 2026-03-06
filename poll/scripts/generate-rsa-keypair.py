#!/usr/bin/env python3
"""
Generate an RSA-PSS key pair for blind signature polls (v2).

Usage:
    python3 scripts/generate-rsa-keypair.py

Output:
    - RSA_PRIVATE_KEY_JWK: paste into Cloudflare Worker secret
    - RSA_PUBLIC_KEY_JWK: paste into Cloudflare Worker secret

The key pair uses RSA-PSS with SHA-384 (matching @cloudflare/blindrsa-ts RSABSSA.SHA384).
Requires Python 3.6+ with cryptography library:
    pip install cryptography
"""

import json
import base64
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend

MODULUS_LENGTH = 2048


def int_to_base64url(n: int) -> str:
    """Convert a positive integer to base64url-encoded bytes (no padding)."""
    byte_length = (n.bit_length() + 7) // 8
    raw = n.to_bytes(byte_length, byteorder="big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def main():
    # Generate RSA key pair
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=MODULUS_LENGTH,
        backend=default_backend(),
    )
    public_key = private_key.public_key()

    priv_numbers = private_key.private_numbers()
    pub_numbers = public_key.public_numbers()

    # Build JWK for public key
    public_jwk = {
        "kty": "RSA",
        "alg": "PS384",
        "n": int_to_base64url(pub_numbers.n),
        "e": int_to_base64url(pub_numbers.e),
        "key_ops": ["verify"],
        "ext": True,
    }

    # Build JWK for private key (includes all CRT parameters)
    private_jwk = {
        "kty": "RSA",
        "alg": "PS384",
        "n": int_to_base64url(pub_numbers.n),
        "e": int_to_base64url(pub_numbers.e),
        "d": int_to_base64url(priv_numbers.d),
        "p": int_to_base64url(priv_numbers.p),
        "q": int_to_base64url(priv_numbers.q),
        "dp": int_to_base64url(priv_numbers.dmp1),
        "dq": int_to_base64url(priv_numbers.dmq1),
        "qi": int_to_base64url(priv_numbers.iqmp),
        "key_ops": ["sign"],
        "ext": True,
    }

    print("=== RSA-PSS Key Pair for Blind Signatures ===\n")
    print(f"Modulus length: {MODULUS_LENGTH} bits")
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


if __name__ == "__main__":
    main()
