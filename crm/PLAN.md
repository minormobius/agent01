# Vault CRM — Multi-User Expansion Plan

## Design Thesis

Any ATProto user on any PDS can create an organization. Any org member can invite others. Access tiers (operator → manager → executive) control which deals and records a member can decrypt. No central server — org state lives as ATProto records on the **founder's** PDS, and members discover it via DID resolution.

---

## Architecture: How It Works

### The Org Record (lives on founder's PDS)

When someone creates an org, a public (unencrypted) record is written:

```
com.minomobi.vault.org/{org-rkey}
{
  name: "Acme Corp",
  founderDid: "did:plc:founder",
  createdAt: "..."
}
```

This is the anchor. The org-rkey becomes the namespace for everything below.

### Membership Records (on founder's PDS)

Each member gets a membership record written by the founder (or any member with `admin` role):

```
com.minomobi.vault.membership/{tid}
{
  orgRkey: "acme-123",
  memberDid: "did:plc:bob",
  role: "operator",           // operator | manager | executive
  memberPublicKey: { $bytes: "..." },   // Bob's ECDH public key
  invitedBy: "did:plc:founder",
  createdAt: "..."
}
```

### Keyring Per Role Tier (on founder's PDS)

Each role tier gets its own keyring. A keyring holds a **wrapped copy of the tier DEK** for each member who has access to that tier:

```
com.minomobi.vault.keyring/{org-rkey}:operator
com.minomobi.vault.keyring/{org-rkey}:manager
com.minomobi.vault.keyring/{org-rkey}:executive
```

Each keyring record contains an array of member-wrapped DEKs:

```json
{
  "orgRkey": "acme-123",
  "tier": "operator",
  "members": [
    {
      "did": "did:plc:alice",
      "wrappedDek": { "$bytes": "..." }
    },
    {
      "did": "did:plc:bob",
      "wrappedDek": { "$bytes": "..." }
    }
  ]
}
```

**Key insight**: The tier DEK is a random AES-256 key. It's wrapped individually for each member using ECDH(inviter_private, member_public) → HKDF → AES-KW. So each member can unwrap the DEK using their own private key + the inviter's public key.

### Tiered Visibility

| Role | Can decrypt | Can manage members |
|------|------------|--------------------|
| **Operator** | `operator`-tier sealed records | No |
| **Manager** | `operator` + `manager`-tier records | Can invite operators |
| **Executive** | All tiers | Can invite anyone, manage org |

Higher roles hold DEKs for all tiers at or below their level. When a manager is added, they receive wrapped DEKs for both `operator` and `manager` keyrings.

### Sealed Records Reference a Tier

The existing `keyringRkey` field on sealed envelopes now points to the tier keyring instead of `"self"`:

```json
{
  "$type": "com.minomobi.vault.sealed",
  "innerType": "com.minomobi.crm.deal",
  "keyringRkey": "acme-123:operator",
  "iv": { "$bytes": "..." },
  "ciphertext": { "$bytes": "..." }
}
```

When loading deals, the client checks which tier keyrings the current user can unwrap, then only attempts to unseal records whose `keyringRkey` matches an available DEK.

---

## Permissionless Org Formation

**No gatekeeper.** The flow:

1. Alice logs in from `alice.pds.example` (any PDS)
2. Clicks "Create Organization"
3. Enters org name → writes `vault.org` record to her PDS
4. Generates 3 random AES-256 DEKs (one per tier)
5. Wraps all 3 with her own identity key → writes 3 `vault.keyring` records
6. She's now the sole executive

**Inviting Bob (on a different PDS):**

1. Alice enters Bob's DID or handle
2. Client resolves Bob's DID → fetches his `vault.encryptionKey` from his PDS
3. Alice's client ECDH-agrees with Bob's public key → wraps the relevant tier DEK(s)
4. Writes/updates `vault.membership` and `vault.keyring` records on Alice's PDS
5. Bob logs in, sees the org invitation (discovers via `vault.membership` records where `memberDid` matches his DID)

**Discovery:** Bob's client queries Alice's PDS (or any PDS that hosts orgs he's a member of) by listing `vault.membership` records filtered by his DID. The org record tells him which PDS hosts the org's sealed records.

---

## Implementation Steps

### Phase 1: Crypto Layer Extensions

**File: `src/crypto.ts`**

New functions:

```typescript
// Generate a random tier DEK (extractable, so it can be wrapped for members)
async function generateTierDek(): Promise<CryptoKey>

// Wrap a tier DEK for a specific member using ECDH key agreement
async function wrapDekForMember(
  tierDek: CryptoKey,
  senderPrivateKey: CryptoKey,
  recipientPublicKey: CryptoKey
): Promise<Uint8Array>

// Unwrap a tier DEK received from another member
async function unwrapDekFromMember(
  wrappedDek: Uint8Array,
  recipientPrivateKey: CryptoKey,
  senderPublicKey: CryptoKey
): Promise<CryptoKey>
```

The ECDH agreement between sender and recipient produces a shared secret → HKDF → AES-KW key → wraps/unwraps the actual tier DEK. This means you need to know who wrapped it (the `invitedBy` field on the membership record) to unwrap it.

### Phase 2: New Types

**File: `src/types.ts`**

```typescript
type OrgRole = "operator" | "manager" | "executive";

const ROLE_HIERARCHY: OrgRole[] = ["operator", "manager", "executive"];

interface Org {
  name: string;
  founderDid: string;
  createdAt: string;
}

interface OrgRecord {
  rkey: string;
  org: Org;
}

interface Membership {
  orgRkey: string;
  memberDid: string;
  memberHandle?: string;
  role: OrgRole;
  memberPublicKey: string;    // base64
  invitedBy: string;          // DID of inviter
  inviterPublicKey: string;   // base64 — needed for ECDH unwrap
  createdAt: string;
}

interface KeyringEntry {
  did: string;
  wrappedDek: string;         // base64
}

interface Keyring {
  orgRkey: string;
  tier: OrgRole;
  members: KeyringEntry[];
}

// Extend VaultState
interface VaultState {
  session: Session | null;
  dek: CryptoKey | null;              // personal vault DEK (backward compat)
  initialized: boolean;
  keyringRkey: string | null;
  // New:
  activeOrg: OrgRecord | null;
  orgDeks: Map<string, CryptoKey>;    // keyringRkey → tier DEK
  memberships: Membership[];
  role: OrgRole | null;
}
```

### Phase 3: PDS Client — Cross-PDS Reads

**File: `src/pds.ts`**

The existing client is bound to a single PDS. For cross-PDS discovery, add:

```typescript
// Static method: read a public record from any PDS without auth
static async fetchPublicRecord(
  service: string,
  did: string,
  collection: string,
  rkey: string
): Promise<Record<string, unknown> | null>

// Resolve a handle/DID to their PDS service URL
static async resolvePds(handleOrDid: string): Promise<string>
```

These are unauthenticated reads — ATProto records are public by default. The sealed ciphertext is public too, but useless without the DEK.

### Phase 4: Org Management (New Component)

**File: `src/components/OrgManager.tsx`**

- Create org form (name only)
- Member list with roles
- Invite member form (handle or DID input, role selector)
- Remove member
- Shows which PDS hosts the org

### Phase 5: Org Switcher

**File: `src/components/OrgSwitcher.tsx`**

- Dropdown in header: "Personal Vault" / "Acme Corp" / "Other Org"
- Switching orgs changes which DEKs are active and which deals are visible
- Personal vault ("self") still works as before

### Phase 6: Login Flow Changes

**File: `src/App.tsx`**

After login:
1. Unlock personal vault (existing flow, unchanged)
2. Discover org memberships: scan founder PDSes for `vault.membership` records with user's DID
3. For each org: fetch keyring records, unwrap tier DEKs the user has access to
4. Populate `orgDeks` map
5. Default to personal vault, let user switch

### Phase 7: Deal Creation Changes

When creating a deal in an org context:
- `keyringRkey` = `{org-rkey}:{tier}` (e.g., `"acme-123:operator"`)
- DEK = `orgDeks.get(keyringRkey)`
- Sealed record written to the **founder's PDS** (not the creator's)
  - This requires the PDS client to write to a remote repo
  - ATProto supports this if the user has a valid session on that PDS
  - **Alternative**: Each member writes sealed records to their own PDS, and the org record lists all member DIDs so the client knows which PDSes to scan

**Decision: federated writes.** Each member writes deals to their **own** PDS. The org's membership list tells clients which PDSes to scan. Loading deals = iterate member DIDs, fetch sealed records from each member's PDS, filter by org keyringRkey, decrypt with tier DEK.

This is the ATProto-native approach — no single PDS is a bottleneck or point of control.

### Phase 8: Backward Compatibility

- `keyringRkey: "self"` continues to mean personal vault
- Existing sealed records with `keyringRkey: "self"` are untouched
- Personal vault DEK derivation unchanged (self-ECDH)
- Org DEKs are separate random keys, never derived from personal identity

---

## Collection Schema Summary

| Collection | Rkey Pattern | Encrypted? | Written By |
|-----------|-------------|-----------|------------|
| `vault.wrappedIdentity` | `"self"` | KEK-wrapped | Owner |
| `vault.encryptionKey` | `"self"` | No (public key) | Owner |
| `vault.org` | `{org-rkey}` | No | Founder |
| `vault.membership` | `{tid}` | No | Admin/Executive |
| `vault.keyring` | `{org-rkey}:{tier}` | ECDH-wrapped DEKs | Admin/Executive |
| `vault.sealed` | `{tid}` | AES-GCM | Any member |

---

## File Change Summary

| File | Changes |
|------|---------|
| `src/crypto.ts` | +3 functions: generateTierDek, wrapDekForMember, unwrapDekFromMember |
| `src/types.ts` | +5 interfaces: Org, OrgRecord, Membership, KeyringEntry, Keyring. Extend VaultState |
| `src/pds.ts` | +2 static methods: fetchPublicRecord, resolvePds |
| `src/App.tsx` | Org discovery on login, org-aware deal loading, org context for saves |
| `src/components/OrgManager.tsx` | New — create org, manage members |
| `src/components/OrgSwitcher.tsx` | New — switch between personal vault and orgs |
| `src/components/LoginScreen.tsx` | Minor — show org discovery status |
| `src/components/DealsBoard.tsx` | Minor — show current org context, tier badge on deals |
| `src/components/DealForm.tsx` | Add tier selector when in org mode |
| `src/components/DocsPage.tsx` | Update encryption docs with org/tier architecture |

---

## Security Properties

1. **Zero-knowledge per tier** — PDS sees ciphertext, never plaintext. An operator's DEK can't unseal manager-tier records.
2. **Forward secrecy on removal** — When a member is removed, rotate the tier DEK and re-wrap for remaining members. Old ciphertext remains sealed under the old DEK (which the removed member still has for old records). New records use the new DEK.
3. **No trusted server** — Org state is ATProto records. Any compliant client can read/write them. No proprietary API.
4. **Permissionless formation** — No registration, no approval. Create an org by writing a record. The org exists because the record exists.
5. **Cross-PDS by design** — Members on different PDSes write to their own repos. Discovery is DID-based, not server-based.
