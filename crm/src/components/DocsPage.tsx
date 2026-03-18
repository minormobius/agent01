export function DocsPage() {
  return (
    <div className="docs-page">
      <article className="docs-content">
        <h1>Vault CRM</h1>
        <p className="docs-lead">
          A deals pipeline where every record is end-to-end encrypted before it
          leaves your browser. Your PDS stores ciphertext. Only you hold the keys.
        </p>

        <section>
          <h2>The Problem</h2>
          <p>
            CRM data is sensitive — deal values, client names, negotiation notes.
            Traditional SaaS CRMs store this in plaintext on servers you don't
            control. Even self-hosted solutions leave data readable on disk.
          </p>
          <p>
            ATProto gives us portable, user-owned data repositories. But PDS
            records are public by default — great for social posts, bad for
            business data. Vault CRM solves this by encrypting records
            client-side before they reach the PDS.
          </p>
        </section>

        <section>
          <h2>How It Works</h2>
          <p>
            Every deal you create goes through a three-step pipeline:
            <strong> serialize → encrypt → store</strong>. Reading reverses it:
            <strong> fetch → decrypt → render</strong>. The PDS never sees
            plaintext.
          </p>

          <div className="docs-diagram">
            <pre>{`
┌─────────────────────────────────────────────────────────┐
│  YOUR BROWSER                                           │
│                                                         │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ Deal     │───▶│ JSON.stringify│───▶│ AES-256-GCM   │  │
│  │ {title,  │    │              │    │ encrypt       │  │
│  │  stage,  │    └──────────────┘    │ (iv + DEK)    │  │
│  │  value}  │                        └──────┬────────┘  │
│  └──────────┘                               │           │
│                                             ▼           │
│                                    ┌────────────────┐   │
│                                    │ vault.sealed   │   │
│                                    │ {iv, ciphertext│   │
│                                    │  innerType,    │   │
│                                    │  keyringRkey}  │   │
│                                    └───────┬────────┘   │
└────────────────────────────────────────────┬────────────┘
                                             │ XRPC
                                             ▼
┌─────────────────────────────────────────────────────────┐
│  PDS (e.g. bsky.social)                                 │
│                                                         │
│  Stores opaque vault.sealed records.                    │
│  Cannot read innerType content.                         │
│  Cannot decrypt without your passphrase.                │
└─────────────────────────────────────────────────────────┘
`}</pre>
          </div>
        </section>

        <section>
          <h2>Key Hierarchy</h2>
          <p>
            The encryption uses a layered key system. Each layer has a single
            job, and keys are scoped to minimize blast radius.
          </p>

          <div className="docs-diagram">
            <pre>{`
  passphrase (you type this)
       │
       ▼
  ┌─────────────────────────────────┐
  │ PBKDF2-SHA256 (600k iterations) │
  │ salt = DID + ":vault-kek"       │
  └───────────────┬─────────────────┘
                  │
                  ▼
            KEK (AES-256-GCM)
          encrypts/decrypts only
                  │
                  ▼
     ┌────────────────────────┐
     │ Identity Key (ECDH P-256) │
     │ private: wrapped on PDS   │
     │ public: stored on PDS     │
     └────────────┬──────────────┘
                  │
                  ▼ ECDH(private, public) → HKDF
                  │
                  ▼
            DEK (AES-256-GCM)
         encrypts/decrypts records
         lives in memory only
`}</pre>
          </div>

          <dl className="docs-definitions">
            <dt>Passphrase</dt>
            <dd>
              The only secret you need to remember. Never transmitted. Used
              locally to derive the KEK via PBKDF2 with 600,000 iterations.
            </dd>

            <dt>KEK (Key Encryption Key)</dt>
            <dd>
              An AES-256-GCM key derived from your passphrase. Its only purpose
              is to encrypt and decrypt your identity private key. It cannot be
              used for vault records directly.
            </dd>

            <dt>Identity Key</dt>
            <dd>
              An ECDH P-256 key pair. The private key is wrapped with the KEK
              and stored on your PDS as a <code>vault.wrappedIdentity</code>{" "}
              record. The public key is stored separately as{" "}
              <code>vault.encryptionKey</code> so other users can find it for
              future group key exchange.
            </dd>

            <dt>DEK (Data Encryption Key)</dt>
            <dd>
              Derived via ECDH key agreement + HKDF. For single-user vaults,
              this is a self-agreement (your private key + your public key).
              For future group workspaces, each member's public key would
              produce a shared DEK. The DEK exists only in browser memory —
              it is never stored or transmitted.
            </dd>
          </dl>
        </section>

        <section>
          <h2>What Gets Stored on the PDS</h2>
          <p>Three record types are written to your ATProto repository:</p>

          <div className="docs-records">
            <div className="docs-record">
              <h4>vault.wrappedIdentity</h4>
              <p className="docs-record-rkey">rkey: "self"</p>
              <pre>{`{
  "$type": "com.minomobi.vault.wrappedIdentity",
  "wrappedKey": { "$bytes": "<base64>" },
  "algorithm": "PBKDF2-SHA256",
  "salt": { "$bytes": "<base64>" },
  "iterations": 600000
}`}</pre>
              <p>
                Your ECDH private key, wrapped with the KEK. Useless without
                your passphrase.
              </p>
            </div>

            <div className="docs-record">
              <h4>vault.encryptionKey</h4>
              <p className="docs-record-rkey">rkey: "self"</p>
              <pre>{`{
  "$type": "com.minomobi.vault.encryptionKey",
  "publicKey": { "$bytes": "<65 bytes, SEC1>" },
  "algorithm": "ECDH-P256"
}`}</pre>
              <p>
                Your ECDH public key. Readable by anyone. This is how future
                collaborators will establish shared DEKs with you.
              </p>
            </div>

            <div className="docs-record">
              <h4>vault.sealed</h4>
              <p className="docs-record-rkey">rkey: TID (one per record)</p>
              <pre>{`{
  "$type": "com.minomobi.vault.sealed",
  "innerType": "com.minomobi.crm.deal",
  "keyringRkey": "self",
  "iv": { "$bytes": "<12 bytes>" },
  "ciphertext": { "$bytes": "<encrypted>" }
}`}</pre>
              <p>
                Each deal, contact, or company is serialized, encrypted with
                AES-256-GCM, and stored as a sealed envelope. The{" "}
                <code>innerType</code> field is visible (so the app knows what
                to decrypt into), but the actual content is opaque ciphertext.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2>The Unlock Flow</h2>
          <ol className="docs-steps">
            <li>
              <strong>Authenticate with PDS</strong> — Handle + app password →
              XRPC <code>createSession</code> → access token. Standard ATProto
              auth.
            </li>
            <li>
              <strong>Derive KEK</strong> — Your passphrase + DID-based salt →
              PBKDF2 (600k rounds) → AES-256-GCM key. This happens entirely in your
              browser via the WebCrypto API.
            </li>
            <li>
              <strong>Unwrap identity key</strong> — Fetch{" "}
              <code>vault.wrappedIdentity/self</code> from PDS → unwrap with
              KEK → ECDH private key in memory.
            </li>
            <li>
              <strong>Derive DEK</strong> — ECDH(private, public) → HKDF →
              AES-256-GCM key. Held in memory as a non-extractable CryptoKey.
            </li>
            <li>
              <strong>Decrypt records</strong> — List all{" "}
              <code>vault.sealed</code> records → filter by innerType → decrypt
              each with DEK → render in the kanban board.
            </li>
          </ol>

          <p>
            On first run (no <code>wrappedIdentity</code> record exists), step 3
            generates a fresh ECDH key pair instead and stores both the wrapped
            private key and the public key on the PDS.
          </p>
        </section>

        <section>
          <h2>Security Properties</h2>
          <div className="docs-grid">
            <div className="docs-property">
              <h4>Zero-knowledge PDS</h4>
              <p>
                The PDS stores only ciphertext. The server operator, network
                intermediaries, and anyone with read access to your repo sees
                encrypted blobs. The <code>innerType</code> field reveals that
                you have "deals" but not their content.
              </p>
            </div>

            <div className="docs-property">
              <h4>Passphrase never transmitted</h4>
              <p>
                The passphrase is used locally for PBKDF2 derivation. It is not
                sent to the PDS, not stored in localStorage, and not included in
                any record.
              </p>
            </div>

            <div className="docs-property">
              <h4>Forward secrecy (per-record IVs)</h4>
              <p>
                Each record gets a fresh 12-byte random IV. Compromising one
                record's IV doesn't help decrypt another, even though they share
                the same DEK.
              </p>
            </div>

            <div className="docs-property">
              <h4>Non-extractable runtime keys</h4>
              <p>
                After unwrapping, the DEK is imported as a non-extractable
                CryptoKey. Browser JS cannot read the raw key bytes — only the
                WebCrypto API can use it for encrypt/decrypt operations.
              </p>
            </div>

            <div className="docs-property">
              <h4>Portable</h4>
              <p>
                Because data lives on ATProto, you can migrate your PDS, back up
                your repo, or switch clients. Any app that implements the vault
                lexicon can decrypt your records with your passphrase.
              </p>
            </div>

            <div className="docs-property">
              <h4>Brute-force resistant</h4>
              <p>
                600,000 PBKDF2 iterations means even with the wrapped key in
                hand, offline brute-force attacks on the passphrase are
                computationally expensive.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2>What's Visible, What's Not</h2>
          <table className="docs-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Visible to PDS</th>
                <th>Visible to you</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Your DID / handle</td>
                <td>Yes</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Public key (ECDH P-256)</td>
                <td>Yes</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Wrapped private key</td>
                <td>Yes (encrypted blob)</td>
                <td>Yes (after passphrase)</td>
              </tr>
              <tr>
                <td>Number of deals</td>
                <td>Yes (record count)</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>innerType of each record</td>
                <td>Yes</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Deal title, value, stage, notes</td>
                <td className="docs-no">No</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Passphrase</td>
                <td className="docs-no">No</td>
                <td>Yes (in your head)</td>
              </tr>
              <tr>
                <td>DEK</td>
                <td className="docs-no">No</td>
                <td>In memory only</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>ATProto Lexicons</h2>
          <p>
            Vault CRM defines its schema as ATProto lexicons under the{" "}
            <code>com.minomobi</code> namespace:
          </p>
          <ul>
            <li>
              <code>com.minomobi.vault.sealed</code> — The encrypted envelope.
              Carries ciphertext, IV, innerType, and keyringRkey.
            </li>
            <li>
              <code>com.minomobi.vault.wrappedIdentity</code> — KEK-wrapped
              ECDH private key with PBKDF2 parameters.
            </li>
            <li>
              <code>com.minomobi.vault.encryptionKey</code> — Public ECDH key
              for key exchange.
            </li>
            <li>
              <code>com.minomobi.crm.deal</code> — The inner record type for
              deals (title, stage, value, notes, tags, etc.).
            </li>
          </ul>
          <p>
            Any ATProto client can read the sealed envelopes. Only clients with
            the matching passphrase and vault implementation can decrypt them.
          </p>
        </section>

        <section>
          <h2>Organizations & Access Tiers</h2>
          <p>
            Vault CRM supports <strong>permissionless organizations</strong>.
            Any ATProto user on any PDS can create an org — no central server
            needed. The org record lives on the founder's PDS as a standard
            ATProto record.
          </p>

          <div className="docs-diagram">
            <pre>{`
  ┌──────────────────────────────────────────────────────────┐
  │  ORGANIZATION (vault.org)                                │
  │                                                          │
  │  name: "Acme Corp"                                       │
  │  founderDid: "did:plc:alice"                             │
  │  tiers: [                                                │
  │    { name: "field",    level: 0 },  ◄─ lowest access     │
  │    { name: "manager",  level: 1 },                       │
  │    { name: "director", level: 2 },                       │
  │    { name: "exec",     level: 3 },  ◄─ highest access    │
  │  ]                                                       │
  └──────────────────────────────────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────────┐
  │  KEYRINGS (vault.keyring — one per tier)                 │
  │                                                          │
  │  Each tier has its own random AES-256 DEK.               │
  │  The DEK is wrapped individually for each member         │
  │  via ECDH(inviter_private, member_public) → AES-KW.      │
  │                                                          │
  │  keyring "acme:field"    → DEK₀ (wrapped per member)     │
  │  keyring "acme:manager"  → DEK₁ (wrapped per member)     │
  │  keyring "acme:director" → DEK₂ (wrapped per member)     │
  │  keyring "acme:exec"     → DEK₃ (wrapped per member)     │
  └──────────────────────────────────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────────┐
  │  SEALED RECORDS (vault.sealed)                           │
  │                                                          │
  │  Each deal is encrypted with a tier-specific DEK.        │
  │  keyringRkey: "acme:field" → encrypted with DEK₀         │
  │  keyringRkey: "acme:exec"  → encrypted with DEK₃         │
  │                                                          │
  │  Members at tier N can decrypt tiers 0..N.               │
  │  A "field" agent sees only field-tier deals.             │
  │  A "director" sees field + manager + director deals.     │
  │  An "exec" sees everything.                              │
  └──────────────────────────────────────────────────────────┘
`}</pre>
          </div>

          <dl className="docs-definitions">
            <dt>Configurable Tiers</dt>
            <dd>
              Tiers are defined at org creation time. You can use the defaults
              (member / manager / admin) or create any hierarchy you need:
              "intern / analyst / vp / ceo" or "read / write / admin" —
              whatever fits your org. Each tier gets its own encryption key.
            </dd>

            <dt>Permissionless Formation</dt>
            <dd>
              Creating an org writes a <code>vault.org</code> record to your
              PDS. No approval, no central registry. The org exists because the
              record exists. Anyone on any PDS can do this.
            </dd>

            <dt>Cross-PDS Membership</dt>
            <dd>
              Members can be on different PDSes. When loading deals, the client
              iterates all member DIDs and fetches their sealed records.
              Discovery is DID-based, not server-based.
            </dd>

            <dt>Tier-Scoped Encryption</dt>
            <dd>
              When creating a deal in an org, you choose which tier to encrypt
              it at. Only members at that tier or higher can decrypt it.
              Lower-tier members see it exists (the sealed envelope is public)
              but cannot read the contents.
            </dd>
          </dl>
        </section>

        <section>
          <h2>Roadmap</h2>
          <ul className="docs-roadmap">
            <li>
              <strong>DAG-CBOR via WASM</strong> — Replace JSON serialization
              inside envelopes with DAG-CBOR using a Rust/WASM codec for
              deterministic, content-addressed inner records.
            </li>
            <li>
              <strong>Contacts & Companies</strong> — Additional inner types
              flowing through the same encrypt/store pipe, with cross-references
              between deals, contacts, and companies.
            </li>
            <li>
              <strong>DuckDB analytics</strong> — Load decrypted records into
              DuckDB-WASM for SQL queries, aggregations, and pipeline reporting.
            </li>
            <li>
              <strong>Key rotation</strong> — Re-encrypt all records under a new
              DEK when a team member is removed or a passphrase is changed.
            </li>
          </ul>
        </section>

        <section className="docs-footer">
          <p>
            Built on <a href="https://atproto.com" target="_blank" rel="noopener noreferrer">ATProto</a>.
            Encrypted with <a href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API" target="_blank" rel="noopener noreferrer">WebCrypto</a>.
            Your data, your keys.
          </p>
        </section>
      </article>
    </div>
  );
}
