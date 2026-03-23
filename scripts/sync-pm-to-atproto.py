#!/usr/bin/env python3
"""
Sync PM project data to/from ATProto PDS — with vault encryption.

All records are sealed in vault.sealed envelopes using AES-256-GCM.
The key hierarchy matches wave/src/crypto.ts:
  passphrase → PBKDF2(600k) → KEK
  KEK unwraps ECDH P-256 identity key
  Self-ECDH → HKDF → DEK (for personal vault)
  Or: org keyring DEK (for team vault)

Env vars:
    BLUESKY_HANDLE, BLUESKY_APP_PASSWORD — PDS auth
    VAULT_PASSPHRASE — vault encryption passphrase
    SYNC_MODE — "push" or "pull"
    PROJECT_FILE — path to project JSON (push mode)
"""

import base64
import hashlib
import json
import os
import re
import struct
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen

# Optional: use cryptography lib for ECDH + AES-GCM
try:
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes, serialization
    HAS_CRYPTO = True
except ImportError:
    HAS_CRYPTO = False

PDS = "https://bsky.social"
BATCH_SIZE = 200
MAX_RETRIES = 4
RETRY_BASE_DELAY = 3
PBKDF2_ITERATIONS = 600_000
HKDF_INFO = b"vault-dek-v1"


def create_session(handle, password):
    url = f"{PDS}/xrpc/com.atproto.server.createSession"
    data = json.dumps({"identifier": handle, "password": password}).encode()
    req = Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=15) as resp:
        session = json.loads(resp.read())
    print(f"Authenticated as {session['handle']} ({session['did']})")
    return session["accessJwt"], session["did"]


def xrpc_post(token, nsid, payload):
    url = f"{PDS}/xrpc/{nsid}"
    data = json.dumps(payload).encode()
    for attempt in range(MAX_RETRIES + 1):
        req = Request(url, data=data, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        })
        try:
            with urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except HTTPError as exc:
            body = exc.read().decode()
            if exc.code == 429 and attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                print(f"  Rate limited, retrying in {delay}s...")
                time.sleep(delay)
                continue
            print(f"  HTTP {exc.code}: {body}")
            raise
    return None


def xrpc_get(token, nsid, params):
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{PDS}/xrpc/{nsid}?{qs}"
    req = Request(url, headers={"Authorization": f"Bearer {token}"})
    with urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


# ── Vault Crypto ──

def derive_kek(passphrase: str, salt: bytes) -> bytes:
    """Derive a 256-bit KEK from passphrase via PBKDF2-SHA256."""
    if HAS_CRYPTO:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=PBKDF2_ITERATIONS,
        )
        return kdf.derive(passphrase.encode())
    else:
        return hashlib.pbkdf2_hmac("sha256", passphrase.encode(), salt, PBKDF2_ITERATIONS)


def aes_gcm_encrypt(key: bytes, plaintext: bytes) -> tuple:
    """Encrypt with AES-256-GCM. Returns (iv, ciphertext)."""
    iv = os.urandom(12)
    if HAS_CRYPTO:
        aesgcm = AESGCM(key)
        ct = aesgcm.encrypt(iv, plaintext, None)
    else:
        raise RuntimeError("cryptography library required for AES-GCM")
    return iv, ct


def aes_gcm_decrypt(key: bytes, iv: bytes, ciphertext: bytes) -> bytes:
    """Decrypt AES-256-GCM."""
    if HAS_CRYPTO:
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(iv, ciphertext, None)
    else:
        raise RuntimeError("cryptography library required for AES-GCM")


def unwrap_private_key(wrapped: bytes, kek: bytes):
    """Unwrap ECDH private key encrypted with KEK (AES-GCM: 12-byte IV + ciphertext)."""
    iv = wrapped[:12]
    ct = wrapped[12:]
    pkcs8 = aes_gcm_decrypt(kek, iv, ct)
    return serialization.load_der_private_key(pkcs8, password=None)


def derive_dek_self(private_key, public_key) -> bytes:
    """Derive personal DEK via self-ECDH → HKDF-SHA256."""
    shared = private_key.exchange(ec.ECDH(), public_key)
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"\x00" * 32,
        info=HKDF_INFO,
    )
    return hkdf.derive(shared)


def seal_record(inner_type: str, record: dict, keyring_rkey: str, dek: bytes) -> dict:
    """Seal an inner record into a vault.sealed envelope."""
    plaintext = json.dumps(record).encode()
    iv, ct = aes_gcm_encrypt(dek, plaintext)
    return {
        "$type": "com.minomobi.vault.sealed",
        "innerType": inner_type,
        "keyringRkey": keyring_rkey,
        "iv": {"$bytes": base64.b64encode(iv).decode()},
        "ciphertext": {"$bytes": base64.b64encode(ct).decode()},
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }


def unseal_record(envelope: dict, dek: bytes) -> dict:
    """Unseal a vault.sealed envelope."""
    iv = base64.b64decode(envelope["iv"]["$bytes"])
    ct = base64.b64decode(envelope["ciphertext"]["$bytes"])
    plaintext = aes_gcm_decrypt(dek, iv, ct)
    return {
        "innerType": envelope["innerType"],
        "record": json.loads(plaintext),
    }


def setup_vault(token, did, passphrase):
    """Bootstrap or unlock vault identity key, derive DEK."""
    salt = (did + ":vault-kek").encode()  # must match wave/src/App.tsx:114
    kek = derive_kek(passphrase, salt)
    print(f"KEK derived (PBKDF2, {PBKDF2_ITERATIONS} iterations)")

    # Check for existing identity key
    try:
        identity_rec = xrpc_get(token, "com.atproto.repo.getRecord", {
            "repo": did,
            "collection": "com.minomobi.vault.wrappedIdentity",
            "rkey": "self",
        })
        wrapped = base64.b64decode(identity_rec["value"]["wrappedKey"]["$bytes"])
        private_key = unwrap_private_key(wrapped, kek)
        print("Identity key unlocked from PDS")

        pub_rec = xrpc_get(token, "com.atproto.repo.getRecord", {
            "repo": did,
            "collection": "com.minomobi.vault.encryptionKey",
            "rkey": "self",
        })
        pub_bytes = base64.b64decode(pub_rec["value"]["publicKey"]["$bytes"])
        public_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), pub_bytes)
    except Exception:
        print("No identity key found — generating new ECDH P-256 keypair...")
        private_key = ec.generate_private_key(ec.SECP256R1())
        public_key = private_key.public_key()

        # Wrap and store
        pkcs8 = private_key.private_bytes(
            serialization.Encoding.DER,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        iv = os.urandom(12)
        wrapped = iv + aes_gcm_encrypt(kek, pkcs8)[1]
        # Actually use the proper iv
        wrapped_iv, wrapped_ct = aes_gcm_encrypt(kek, pkcs8)
        wrapped = wrapped_iv + wrapped_ct

        pub_bytes = public_key.public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint,
        )

        now = datetime.now(timezone.utc).isoformat()
        xrpc_post(token, "com.atproto.repo.putRecord", {
            "repo": did,
            "collection": "com.minomobi.vault.wrappedIdentity",
            "rkey": "self",
            "record": {
                "$type": "com.minomobi.vault.wrappedIdentity",
                "wrappedKey": {"$bytes": base64.b64encode(wrapped).decode()},
                "algorithm": "PBKDF2-SHA256",
                "salt": {"$bytes": base64.b64encode(salt).decode()},
                "iterations": PBKDF2_ITERATIONS,
                "createdAt": now,
            },
        })
        xrpc_post(token, "com.atproto.repo.putRecord", {
            "repo": did,
            "collection": "com.minomobi.vault.encryptionKey",
            "rkey": "self",
            "record": {
                "$type": "com.minomobi.vault.encryptionKey",
                "publicKey": {"$bytes": base64.b64encode(pub_bytes).decode()},
                "algorithm": "ECDH-P256",
                "createdAt": now,
            },
        })
        print("Identity keypair stored on PDS")

    dek = derive_dek_self(private_key, public_key)
    print("Personal DEK derived (self-ECDH → HKDF)")
    return dek, "personal"


def push_project(token, did, project, dek, keyring_rkey):
    now = datetime.now(timezone.utc).isoformat()
    name = project.get("projectName", "Project")
    rkey = re.sub(r"[^a-z0-9]+", "-", name.lower())[:50] or "project"

    tasks = project.get("tasks", [])
    members = project.get("members", [])

    leaves = [t for t in tasks if not any(c.get("parentId") == t["id"] for c in tasks)]
    bac = sum(t.get("plannedCost", 0) for t in leaves)
    starts = [t["plannedStart"] for t in tasks if t.get("plannedStart")]
    ends = [t["plannedEnd"] for t in tasks if t.get("plannedEnd")]

    # Seal the project record
    project_inner = {
        "$type": "com.minomobi.pm.project",
        "name": name,
        "status": "active",
        "budgetAtCompletion": bac,
        "scheduledStart": min(starts) if starts else now,
        "scheduledEnd": max(ends) if ends else now,
        "keyringRkey": keyring_rkey,
        "createdAt": now,
        "updatedAt": now,
        "_pmState": {
            "tasks": tasks,
            "deps": project.get("deps", []),
            "baselines": project.get("baselines", []),
            "members": members,
            "collapsed": project.get("collapsed", []),
        },
    }

    sealed = seal_record("com.minomobi.pm.project", project_inner, keyring_rkey, dek)
    print(f"Pushing sealed project '{name}' → vault.sealed/pm-{rkey}")
    xrpc_post(token, "com.atproto.repo.putRecord", {
        "repo": did,
        "collection": "com.minomobi.vault.sealed",
        "rkey": f"pm-{rkey}",
        "record": sealed,
    })

    # Seal individual schedule records
    writes = []
    for t in tasks:
        sched_inner = {
            "$type": "com.minomobi.pm.schedule",
            "projectRkey": rkey,
            "issueRkey": t["id"][:15],
            "plannedStart": t.get("plannedStart", now),
            "plannedEnd": t.get("plannedEnd", now),
            "plannedCost": t.get("plannedCost", 0),
            "actualCost": t.get("actualCost", 0),
            "percentComplete": t.get("percentComplete", 0),
            "createdAt": now,
        }
        s = seal_record("com.minomobi.pm.schedule", sched_inner, keyring_rkey, dek)
        writes.append({
            "$type": "com.atproto.repo.applyWrites#create",
            "collection": "com.minomobi.vault.sealed",
            "rkey": f"pm-sched-{t['id'][:10]}",
            "value": s,
        })

    for i in range(0, len(writes), BATCH_SIZE):
        batch = writes[i:i + BATCH_SIZE]
        xrpc_post(token, "com.atproto.repo.applyWrites", {
            "repo": did,
            "writes": batch,
        })
        print(f"  Sealed {min(i + BATCH_SIZE, len(writes))}/{len(writes)} schedule records")

    # Seal team roster
    if members:
        team_inner = {
            "$type": "com.minomobi.pm.team",
            "projectRkey": rkey,
            "members": [{
                "id": m["id"],
                "displayName": m["displayName"],
                "role": m["role"],
                "handle": m.get("handle"),
                "did": m.get("did"),
                "costRate": m.get("costRate", 0),
                "maxHoursPerWeek": m.get("maxHoursPerWeek", 40),
                "color": m.get("color"),
            } for m in members],
            "createdAt": now,
        }
        sealed_team = seal_record("com.minomobi.pm.team", team_inner, keyring_rkey, dek)
        xrpc_post(token, "com.atproto.repo.putRecord", {
            "repo": did,
            "collection": "com.minomobi.vault.sealed",
            "rkey": f"pm-team-{rkey}",
            "record": sealed_team,
        })
        print(f"  Sealed team roster ({len(members)} members)")

    print(f"Push complete: {len(tasks)} tasks, {len(members)} members — all encrypted")


def pull_project(token, did, dek):
    print("Pulling sealed records from PDS...")
    records = []
    cursor = None
    while True:
        params = {
            "repo": did,
            "collection": "com.minomobi.vault.sealed",
            "limit": "100",
        }
        if cursor:
            params["cursor"] = cursor
        page = xrpc_get(token, "com.atproto.repo.listRecords", params)
        records.extend(page.get("records", []))
        cursor = page.get("cursor")
        if not cursor or not page.get("records"):
            break

    if not records:
        print("No sealed records found on PDS.")
        return None

    pm_records = [r for r in records if r["value"].get("innerType", "").startswith("com.minomobi.pm.")]
    print(f"Found {len(pm_records)} PM sealed records out of {len(records)} total")

    project_recs = [r for r in pm_records if r["value"]["innerType"] == "com.minomobi.pm.project"]
    if not project_recs:
        print("No sealed PM project found.")
        return None

    result = unseal_record(project_recs[-1]["value"], dek)
    inner = result["record"]
    print(f"Decrypted project: {inner.get('name', 'unnamed')}")

    if inner.get("_pmState"):
        state = inner["_pmState"]
        state["projectName"] = inner.get("name", "Project")
        print(f"  Full state: {len(state.get('tasks', []))} tasks, {len(state.get('members', []))} members")
        return state

    # Fallback: decrypt individual schedule records
    sched_recs = [r for r in pm_records if r["value"]["innerType"] == "com.minomobi.pm.schedule"]
    print(f"  Decrypting {len(sched_recs)} schedule records...")
    tasks = []
    for sr in sched_recs:
        try:
            s = unseal_record(sr["value"], dek)["record"]
            tasks.append({
                "id": s.get("issueRkey", ""),
                "parentId": None,
                "name": s.get("issueRkey", "Task"),
                "plannedStart": s.get("plannedStart", "")[:10],
                "plannedEnd": s.get("plannedEnd", "")[:10],
                "plannedCost": s.get("plannedCost", 0),
                "actualCost": s.get("actualCost", 0),
                "percentComplete": s.get("percentComplete", 0),
                "duration": 8,
            })
        except Exception as e:
            print(f"  Skip record: {e}")

    return {
        "projectName": inner.get("name", "Project"),
        "tasks": tasks,
        "deps": [],
        "baselines": [],
        "members": [],
        "collapsed": [],
    }


def main():
    handle = os.environ.get("BLUESKY_HANDLE")
    password = os.environ.get("BLUESKY_APP_PASSWORD")
    passphrase = os.environ.get("VAULT_PASSPHRASE")
    mode = os.environ.get("SYNC_MODE", "push")
    project_file = os.environ.get("PROJECT_FILE", "pm/exports/latest.json")

    if not handle or not password:
        print("Error: BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set")
        sys.exit(1)

    if not passphrase:
        print("Error: VAULT_PASSPHRASE must be set for encrypted sync")
        sys.exit(1)

    if not HAS_CRYPTO:
        print("Error: 'cryptography' package required (pip install cryptography)")
        sys.exit(1)

    token, did = create_session(handle, password)
    dek, keyring_rkey = setup_vault(token, did, passphrase)

    if mode == "push":
        if not os.path.exists(project_file):
            print(f"Error: Project file not found: {project_file}")
            sys.exit(1)
        with open(project_file) as f:
            project = json.load(f)
        push_project(token, did, project, dek, keyring_rkey)

    elif mode == "pull":
        state = pull_project(token, did, dek)
        if state:
            os.makedirs("pm/exports", exist_ok=True)
            out = "pm/exports/pulled.json"
            with open(out, "w") as f:
                json.dump(state, f, indent=2)
            print(f"Saved to {out}")
    else:
        print(f"Unknown mode: {mode}")
        sys.exit(1)


if __name__ == "__main__":
    main()
