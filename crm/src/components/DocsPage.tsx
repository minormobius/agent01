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
              org key exchange.
            </dd>

            <dt>DEK (Data Encryption Key)</dt>
            <dd>
              Derived via ECDH key agreement + HKDF. For single-user vaults,
              this is a self-agreement (your private key + your public key).
              For orgs, each tier has a random DEK wrapped per-member via ECDH.
              The DEK exists only in browser memory — it is never stored or
              transmitted.
            </dd>
          </dl>
        </section>

        <section>
          <h2>Organizations & Tiers</h2>
          <p>
            Any ATProto user on any PDS can create an org. The org record
            lives on the founder's PDS. Members can be on different PDSes —
            discovery is DID-based, not server-based.
          </p>

          <div className="docs-diagram">
            <pre>{`
  ┌──────────────────────────────────────────────────────────┐
  │  ORGANIZATION (vault.org on founder's PDS)               │
  │                                                          │
  │  name: "Acme Corp"                                       │
  │  founderDid: "did:plc:alice"                             │
  │  tiers: [                                                │
  │    { name: "field",    level: 0 },  ◄─ lowest access     │
  │    { name: "manager",  level: 1 },                       │
  │    { name: "exec",     level: 2 },  ◄─ highest access    │
  │  ]                                                       │
  │  offices: [ "Legal", "Finance", "Engineering" ]          │
  │  workflow: { gates: [...] }                               │
  └──────────────────────────────────────────────────────────┘

  Tiers are PURE ENCRYPTION GATES.
  Can you decrypt it? Then you can read it. That's it.
  No fake client-side "permissions" — the math enforces access.
`}</pre>
          </div>

          <dl className="docs-definitions">
            <dt>Tier = Encryption Gate</dt>
            <dd>
              Each tier gets its own random AES-256-GCM DEK, wrapped individually
              for each member via ECDH. Members at tier N can decrypt tiers 0..N.
              There are no "read/write/admin" flags — if you have the key, you
              have access.
            </dd>

            <dt>Permissionless Formation</dt>
            <dd>
              Creating an org writes a <code>vault.org</code> record to your
              PDS. No approval, no central registry. The org exists because the
              record exists.
            </dd>
          </dl>
        </section>

        <section>
          <h2>Change Control Protocol</h2>
          <p>
            Here's the hard constraint: <strong>in ATProto, you can only write
            to your own PDS</strong>. Alice cannot edit a record on Bob's PDS.
            Period. So multi-user editing isn't "edit in place" — it's a
            protocol:
          </p>

          <div className="docs-diagram">
            <pre>{`
  ┌──────────────────────────────────────────────────────────────┐
  │  THE CHANGE CONTROL CHAIN                                    │
  │                                                              │
  │  1. Alice creates a deal ─────────────► Alice's PDS          │
  │     vault.sealed (rkey: abc123)         (author: Alice)      │
  │                                                              │
  │  2. Bob proposes a change ────────────► Bob's PDS            │
  │     vault.proposal {                    (proposer: Bob)      │
  │       target: alice:abc123,                                  │
  │       encrypted new content,                                 │
  │       requiredOffices: ["Legal"]                              │
  │     }                                                        │
  │                                                              │
  │  3. Carol (in Legal) approves ────────► Carol's PDS          │
  │     vault.approval {                    (approver: Carol)    │
  │       proposal: bob:xyz789,                                  │
  │       office: "Legal"                                        │
  │     }                                                        │
  │                                                              │
  │  4. Bob applies the change ───────────► Bob's PDS            │
  │     vault.sealed (rkey: def456) {       (new author: Bob)    │
  │       previousDid: alice,                                    │
  │       previousRkey: abc123  ◄── chain link                   │
  │     }                                                        │
  │     vault.decision {                    (audit trail)        │
  │       old: alice:abc123,                                     │
  │       new: bob:def456,                                       │
  │       outcome: "accepted"                                    │
  │     }                                                        │
  └──────────────────────────────────────────────────────────────┘

  The "current version" = follow the decision chain until you find
  a record with no successor. Records migrate between PDSes as
  different people edit them. Every hop is traceable.
`}</pre>
          </div>

          <dl className="docs-definitions">
            <dt>Proposal</dt>
            <dd>
              A proposed change to an existing record. Written to the proposer's
              PDS. Contains the encrypted new content and a list of offices that
              must approve. If no workflow gates apply, it auto-approves.
            </dd>

            <dt>Approval</dt>
            <dd>
              Written to the approver's PDS. Each approval is for one office on
              one proposal. Deterministic rkeys prevent double-signing. The
              record exists on the approver's PDS — it's cryptographically
              attributable to their DID.
            </dd>

            <dt>Decision</dt>
            <dd>
              The audit record linking old version → new version. Written by the
              proposer when all required approvals are gathered. Contains both
              the previous and new record locations so any client can
              reconstruct the full history.
            </dd>

            <dt>Supersession</dt>
            <dd>
              When loading deals, the client builds a supersession set from all
              decision records. Any record that has been superseded is excluded
              from the board. Only the latest version in each chain is shown.
            </dd>
          </dl>
        </section>

        <section>
          <h2>Offices & Workflow Gates</h2>
          <p>
            Offices are groups of members who can sign off on changes.
            Workflow gates define which offices must approve before a deal
            can move between specific pipeline stages.
          </p>

          <div className="docs-diagram">
            <pre>{`
  Offices:
    Legal     (2 members, 1 signature required)
    Finance   (3 members, 2 signatures required)

  Workflow Gates:
    Negotiation → Won   requires: Legal + Finance
    Negotiation → Lost  requires: Legal

  What happens:
    1. Deal is at "Negotiation"
    2. Someone proposes moving it to "Won"
    3. Proposal sits in "open" status
    4. One Legal member approves  → Legal ✓
    5. Two Finance members approve → Finance ✓
    6. All gates satisfied → proposer applies the change
    7. New version written to proposer's PDS with chain link
`}</pre>
          </div>

          <p>
            This is <strong>real enforcement</strong>, not UI courtesy.
            Approvals are ATProto records on each approver's PDS. Every client
            independently verifies: "Do enough approval records exist from
            members of the required offices?" If not, the change can't be
            applied.
          </p>
        </section>

        <section>
          <h2>What's Enforced by What</h2>
          <table className="docs-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th>Enforced by</th>
                <th>Bypassable?</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Read encrypted data</td>
                <td>AES-256-GCM encryption</td>
                <td>No (need the DEK)</td>
              </tr>
              <tr>
                <td>Tier-scoped access</td>
                <td>Per-tier DEKs + ECDH wrapping</td>
                <td>No (need your wrapped key)</td>
              </tr>
              <tr>
                <td>Edit own records</td>
                <td>ATProto (write to own PDS)</td>
                <td>No (PDS auth)</td>
              </tr>
              <tr>
                <td>Edit others' records</td>
                <td>Change control protocol</td>
                <td>No (must write new record)</td>
              </tr>
              <tr>
                <td>Stage transitions</td>
                <td>Workflow gates + office approvals</td>
                <td className="docs-no">No (approval records verifiable)</td>
              </tr>
              <tr>
                <td>Approval attribution</td>
                <td>ATProto (record on approver's PDS)</td>
                <td className="docs-no">No (DID-bound)</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>Where Records Live</h2>
          <table className="docs-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Lives on</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>vault.org</code></td>
                <td>Founder's PDS</td>
                <td>Org definition, tiers, offices, workflow</td>
              </tr>
              <tr>
                <td><code>vault.keyring</code></td>
                <td>Founder's PDS</td>
                <td>Per-tier DEKs wrapped for each member</td>
              </tr>
              <tr>
                <td><code>vault.membership</code></td>
                <td>Founder's PDS</td>
                <td>Member → org link with tier assignment</td>
              </tr>
              <tr>
                <td><code>vault.sealed</code></td>
                <td>Author's PDS</td>
                <td>Encrypted deal (migrates via chain)</td>
              </tr>
              <tr>
                <td><code>vault.proposal</code></td>
                <td>Proposer's PDS</td>
                <td>Encrypted proposed change</td>
              </tr>
              <tr>
                <td><code>vault.approval</code></td>
                <td>Approver's PDS</td>
                <td>Office sign-off on a proposal</td>
              </tr>
              <tr>
                <td><code>vault.decision</code></td>
                <td>Proposer's PDS</td>
                <td>Audit link: old record → new record</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>Security Properties</h2>
          <div className="docs-grid">
            <div className="docs-property">
              <h4>Zero-knowledge PDS</h4>
              <p>
                The PDS stores only ciphertext. The server operator, network
                intermediaries, and anyone with read access to your repo sees
                encrypted blobs.
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
              <h4>No fake permissions</h4>
              <p>
                There are no client-side "permission flags" that a modified
                client could bypass. Encryption enforces reads. The change
                control protocol enforces writes. Approvals are verifiable
                ATProto records.
              </p>
            </div>

            <div className="docs-property">
              <h4>Traceable change history</h4>
              <p>
                Every edit creates a decision record linking old → new. The full
                history of a deal is reconstructable by walking the chain
                backwards. Each hop identifies who proposed, who approved, when.
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
            <li>
              <strong>Proposal comments</strong> — Encrypted discussion threads
              on proposals, each comment on the commenter's PDS.
            </li>
          </ul>
        </section>

        <section className="docs-footer">
          <p>
            Built on <a href="https://atproto.com" target="_blank" rel="noopener noreferrer">ATProto</a>.
            Encrypted with <a href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API" target="_blank" rel="noopener noreferrer">WebCrypto</a>.
            Your data, your keys, your protocol.
          </p>
        </section>
      </article>
    </div>
  );
}
