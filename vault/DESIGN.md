# Vault — Encrypted Corporate Tools on ATProto

## Overview

End-to-end encrypted business suite (CRM, task management, mail) built on ATProto.
The relay sees only ciphertext. Decryption happens exclusively in the browser via
WebCrypto. A Rust→WASM codec handles DAG-CBOR serialization of inner records and
envelope construction for `vault.sealed` records.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    Browser                       │
│                                                  │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐ │
│  │ Key Store │   │ Decrypt   │   │ App Logic │ │
│  │ (IndexedDB│──►│ AES-GCM   │──►│ (React +  │ │
│  │  non-ext) │   │ in-memory │   │  DuckDB)  │ │
│  └───────────┘   └───────────┘   └───────────┘ │
│        ▲                                        │
│        │ unwrap via password/passkey             │
└────────┼────────────────────────────────────────┘
         │
┌────────┼────────────────────────────────────────┐
│   PDS  │                                         │
│        │                                         │
│  vault.wrappedIdentity  (user's wrapped privkey)│
│  vault.encryptionKey    (user's ECDH pubkey)    │
│  vault.keyring          (group wrapped keys)    │
│  vault.sealed           (encrypted records)     │
│  crm.deal / tasks.issue / mail.message  ← inner│
└─────────────────────────────────────────────────┘
         │
┌────────┼────────────────────────────────────────┐
│  Relay │  sees only vault.sealed ciphertext      │
│        │  indexes by collection, rkey, DID       │
│        │  CANNOT read content                    │
└─────────────────────────────────────────────────┘
```

## Threat Model

| Actor | Sees | Cannot |
|-------|------|--------|
| **PDS operator** | vault.sealed blobs, metadata (timestamps, rkeys, DIDs) | Read inner record content |
| **Relay** | Collection names, CIDs, rkeys | Read sealed payloads |
| **Other users** | Nothing (unless granted keyring access) | Decrypt without group key |
| **Browser (authorized)** | Everything after key unwrap | Persist plaintext (keys in IndexedDB are non-extractable) |

### What leaks

- Record count, approximate size, creation timestamps
- Which DIDs participate (vault.keyring reveals group membership)
- Collection names on sealed envelopes (if you tag them — see design choice below)

### What doesn't leak

- Record content (AES-GCM ciphertext)
- Field names, values, attachments
- Cross-record relationships (unless inferred from timing)

## Encryption Design

### Key Hierarchy

```
passphrase / passkey
       │
       ▼
   PBKDF2 / PRF
       │
       ▼
   KEK (Key Encryption Key) ── wraps ──► identity private key
       │                                  (stored as vault.wrappedIdentity)
       ▼
   identity keypair (ECDH P-256)
       │
       ├──► vault.encryptionKey  (public half, on PDS)
       │
       └──► ECDH with group keys
              │
              ▼
          DEK (Data Encryption Key) per group/workspace
              │  (wrapped per-member in vault.keyring)
              ▼
          AES-256-GCM encrypt/decrypt vault.sealed records
```

### Key Derivation

1. **Password path**: PBKDF2-SHA256 (600k iterations) → 256-bit KEK
2. **Passkey path**: PRF extension → 256-bit KEK
3. KEK wraps identity private key via AES-KW (Key Wrap)
4. Identity key does ECDH with each group member → shared secret
5. HKDF-SHA256(shared secret, "vault-dek-v1") → DEK
6. DEK wraps the workspace's symmetric key in vault.keyring

### Record Encryption

```
inner record (e.g., crm.deal)
    │
    ▼ DAG-CBOR serialize (Rust/WASM)
    │
    ▼ raw bytes
    │
    ▼ AES-256-GCM encrypt (WebCrypto, random 96-bit IV)
    │
    ▼ { iv, ciphertext, tag }
    │
    ▼ wrap into vault.sealed envelope (Rust/WASM)
    │
    ▼ putRecord to PDS
```

### Decryption (on open)

```
listRecords("vault.sealed") from PDS
    │
    ▼ for each sealed record:
    │
    ▼ parse envelope (Rust/WASM)
    │
    ▼ AES-256-GCM decrypt (WebCrypto, DEK from keyring)
    │
    ▼ DAG-CBOR deserialize (Rust/WASM) → inner record
    │
    ▼ insert into DuckDB in-memory table
    │
    ▼ React renders from DuckDB queries
```

## ATProto Lexicons

### Vault namespace (`com.minomobi.vault.*`)

These records live on the user's PDS and are visible to the relay — but only
`sealed` contains business data, and it's encrypted.

| Lexicon | Key | Purpose |
|---------|-----|---------|
| `vault.wrappedIdentity` | `self` (singleton) | User's ECDH private key, wrapped by KEK |
| `vault.encryptionKey` | `self` (singleton) | User's ECDH public key (so others can add you to groups) |
| `vault.keyring` | `tid` | Per-workspace/group: DEK wrapped for each member DID |
| `vault.sealed` | `tid` | Encrypted envelope containing one inner record |

### Inner record types (never written directly to PDS)

These are serialized to DAG-CBOR, encrypted, and stored inside `vault.sealed`.
They never appear as ATProto collections — they exist only as plaintext in the
browser after decryption.

| Inner Type | Purpose | Key Fields |
|------------|---------|------------|
| `crm.deal` | Sales pipeline deal | stage, value, currency, contact, company, notes |
| `crm.contact` | Contact/person | name, email, phone, company, tags |
| `crm.company` | Organization | name, domain, industry, size |
| `tasks.issue` | Task/ticket | title, status, priority, assignee, labels, due |
| `tasks.board` | Kanban board | name, columns, workspace |
| `mail.message` | Internal message | from, to[], subject, body, threadId |
| `mail.thread` | Message thread | subject, participants, lastActivity |

### Sealed Envelope Format

```json
{
  "$type": "com.minomobi.vault.sealed",
  "innerType": "com.minomobi.crm.deal",
  "keyringRkey": "3lf...",
  "iv": "<base64 96-bit>",
  "ciphertext": "<base64 AES-GCM output>",
  "createdAt": "2026-03-18T...",
  "updatedAt": "2026-03-18T..."
}
```

**Design choice**: `innerType` is cleartext metadata. This lets the client
filter by type before decrypting (e.g., "give me only deals") without
downloading and decrypting everything. The tradeoff is that the relay knows
*what kind* of record it is. If this is unacceptable, omit `innerType` and
decrypt-then-filter.

## Rust → WASM Crate: `sealed-record`

Located at `vault/crates/sealed-record/`.

### Responsibilities

1. **Serialize** inner records (Rust structs → DAG-CBOR bytes)
2. **Deserialize** inner records (DAG-CBOR bytes → Rust structs → JSON for JS)
3. **Construct** vault.sealed envelopes (combine ciphertext + metadata)
4. **Parse** vault.sealed envelopes (extract ciphertext + metadata for WebCrypto)
5. **Validate** inner record schemas against lexicon constraints

### What it does NOT do

- **No crypto** — AES-GCM, ECDH, PBKDF2, AES-KW all happen in WebCrypto
- **No key storage** — IndexedDB is JS-only
- **No network** — PDS calls are JS fetch
- **No React** — pure data layer

### WASM API

```rust
// Serialize an inner record (JS object → DAG-CBOR bytes)
#[wasm_bindgen]
pub fn serialize_record(inner_type: &str, record_json: &str) -> Result<Vec<u8>, String>;

// Deserialize an inner record (DAG-CBOR bytes → JSON string)
#[wasm_bindgen]
pub fn deserialize_record(inner_type: &str, cbor_bytes: &[u8]) -> Result<String, String>;

// Build a sealed envelope (after JS has encrypted)
#[wasm_bindgen]
pub fn build_envelope(
    inner_type: &str,
    keyring_rkey: &str,
    iv_base64: &str,
    ciphertext_base64: &str,
) -> Result<String, String>;  // Returns JSON for putRecord

// Parse a sealed envelope (before JS decrypts)
#[wasm_bindgen]
pub fn parse_envelope(envelope_json: &str) -> Result<JsValue, String>;
// Returns { innerType, keyringRkey, iv, ciphertext }

// Batch deserialize (for initial load → DuckDB)
#[wasm_bindgen]
pub fn deserialize_batch(envelopes_ndjson: &str) -> Result<String, String>;
// Returns NDJSON of decrypted inner records
```

### Inner Record Structs

Typed Rust structs with serde derive. Validated at serialize/deserialize time.
Maps 1:1 with the inner lexicon schemas.

### Build

```bash
cd vault/crates/sealed-record
wasm-pack build --target web --release
# Output: pkg/sealed_record.js + sealed_record_bg.wasm
```

## JS Integration Layer

Thin TypeScript module (`vault/src/crypto.ts`) that:

1. Manages IndexedDB key store (store/retrieve non-extractable CryptoKeys)
2. Derives KEK from password (PBKDF2) or passkey (PRF)
3. Unwraps identity key → ECDH → derives DEK
4. Calls `sealed-record` WASM for serialize/deserialize
5. Calls WebCrypto for encrypt/decrypt
6. Calls PDS XRPC for putRecord/listRecords

```typescript
// Pseudocode flow
async function sealRecord(innerType: string, record: object, dek: CryptoKey): Promise<VaultSealed> {
  const cbor = wasm.serialize_record(innerType, JSON.stringify(record));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dek, cbor);
  return JSON.parse(wasm.build_envelope(innerType, keyringRkey, b64(iv), b64(ciphertext)));
}

async function unsealRecord(envelope: VaultSealed, dek: CryptoKey): Promise<object> {
  const { innerType, iv, ciphertext } = wasm.parse_envelope(JSON.stringify(envelope));
  const cbor = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, dek, unb64(ciphertext));
  return JSON.parse(wasm.deserialize_record(innerType, new Uint8Array(cbor)));
}
```

## DuckDB Integration

After unsealing, records are inserted into in-memory DuckDB tables:

```sql
CREATE TABLE deals (rkey TEXT, stage TEXT, value DECIMAL, currency TEXT, ...);
CREATE TABLE issues (rkey TEXT, title TEXT, status TEXT, priority TEXT, ...);
CREATE TABLE messages (rkey TEXT, subject TEXT, body TEXT, threadId TEXT, ...);
```

All queries run locally. No data leaves the browser. DuckDB WASM handles
joins, aggregations, full-text search across the decrypted dataset.

## Group Key Management

### Adding a member

1. Fetch their `vault.encryptionKey` (ECDH public key) from their PDS
2. ECDH(your private key, their public key) → shared secret
3. HKDF(shared secret) → key-wrapping key
4. AES-KW wrap the workspace DEK with the wrapping key
5. Add entry to `vault.keyring` record: `{ did, wrappedDek }`

### Removing a member

1. Generate new DEK
2. Re-wrap for all remaining members
3. Re-encrypt all vault.sealed records with new DEK
4. Delete old keyring entry
5. (Revoked member retains access to old ciphertext — forward secrecy only)

### Key rotation

Same as removing + re-adding everyone. Expensive. Do periodically or on
membership change.

## File Structure

```
vault/
├── DESIGN.md                              ← this file
├── lexicons/
│   └── com/minomobi/
│       ├── vault/
│       │   ├── wrappedIdentity.json
│       │   ├── encryptionKey.json
│       │   ├── keyring.json
│       │   └── sealed.json
│       ├── crm/
│       │   ├── deal.json
│       │   ├── contact.json
│       │   └── company.json
│       ├── tasks/
│       │   ├── issue.json
│       │   └── board.json
│       └── mail/
│           ├── message.json
│           └── thread.json
├── crates/
│   └── sealed-record/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                     ← WASM exports
│           ├── envelope.rs                ← sealed envelope build/parse
│           ├── records/
│           │   ├── mod.rs
│           │   ├── crm.rs                 ← Deal, Contact, Company structs
│           │   ├── tasks.rs               ← Issue, Board structs
│           │   └── mail.rs                ← Message, Thread structs
│           └── validate.rs                ← schema constraint checks
└── src/                                   ← future: React app + crypto.ts
```

## Open Questions

1. **innerType visibility** — expose inner record type in cleartext on sealed
   envelope? Current design says yes for query efficiency. Revisit if threat
   model tightens.
2. **Blob attachments** — large files (PDFs, images) need chunked encryption
   and blob references. Not yet designed.
3. **Search** — DuckDB full-text search works on decrypted data. But you can't
   search without decrypting everything first. Acceptable for small-to-medium
   datasets. For large, consider encrypted indexes (not designed yet).
4. **Offline** — Service worker caches encrypted records. Decrypt on open.
   Need to handle conflict resolution for offline edits.
5. **Audit log** — should vault.sealed updates create new records (append-only)
   or overwrite (mutable)? Append-only is safer for audit but grows storage.
