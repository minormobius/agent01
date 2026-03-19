export function DocsPage() {
  return (
    <div className="docs-page">
      <article className="docs-content">
        <h1>Vault CRM</h1>
        <p className="docs-lead">
          An encrypted deals pipeline on ATProto. This page is the honest
          version — what works, what doesn't, what's enforced by math,
          and what's enforced by vibes.
        </p>

        <section>
          <h2>What Actually Works</h2>
          <p>
            The core encryption is real. Deal records are AES-256-GCM encrypted
            client-side. Your PDS stores ciphertext. A PDS operator who dumps
            your repo gets opaque blobs. That part is solid.
          </p>
          <p>
            Org tiers are real encryption gates. If you don't have the DEK for a
            tier, you can't read its records. No amount of client modification
            changes that — the math holds.
          </p>
          <p>
            The append-only model is real. Every edit creates a new record with a
            chain link to the old one. The full history is walkable. Decision
            records tie proposals to outcomes. This part is honest infrastructure.
          </p>
        </section>

        <section>
          <h2>The Attack Surface (Be Honest)</h2>

          <h3>1. Founder is a single point of failure</h3>
          <p>
            The org definition, keyrings, and memberships all live on the
            founder's PDS. The founder can:
          </p>
          <ul>
            <li>Silently rewrite workflow gates (remove approval requirements)</li>
            <li>Remove members from keyrings (revoke tier access)</li>
            <li>Add phantom members (grant access to outsiders)</li>
            <li>Change tier definitions</li>
          </ul>
          <p>
            If the founder's PDS goes down, the org is inaccessible. If the
            founder goes rogue, there's no recourse. <strong>The founder is a
            benevolent dictator by design.</strong> This is intentional — some
            orgs want a tyrant — but users should know it.
          </p>

          <h3>2. Workflow gates are client-enforced, not protocol-enforced</h3>
          <p>
            Here's the big one. The proposal → approval → decision flow is a
            <strong> social protocol</strong>, not a cryptographic one. A
            modified client can:
          </p>
          <ul>
            <li>Write a <code>vault.sealed</code> record with any content directly</li>
            <li>Write a <code>vault.decision</code> record claiming it supersedes
            anything</li>
            <li>Skip the proposal/approval flow entirely</li>
          </ul>
          <p>
            The records are <em>detectable</em> — other clients can see "this
            decision has no matching approvals" — but they're not
            <em> preventable</em>. An honest client rejects them. A malicious
            client writes them anyway.
          </p>
          <p>
            This means workflow gates enforce behavior among <strong>cooperating
            clients</strong>. They don't protect against a determined adversary
            with a DEK. The real protection against unauthorized changes is:
            other members can see the full audit trail and call BS.
          </p>

          <h3>3. Approval records aren't cryptographically signed</h3>
          <p>
            "Carol approved" means there's a <code>vault.approval</code> record
            on Carol's PDS. But ATProto repo signing is PDS-managed, not
            user-managed. So "Carol approved" really means <strong>"Carol's PDS
            says Carol approved."</strong>
          </p>
          <p>
            If Carol's PDS operator is malicious, they could fabricate approval
            records. This is an ATProto-level limitation, not specific to us, but
            it means approvals are as trustworthy as the PDS, not as trustworthy
            as the person.
          </p>

          <h3>4. No key rotation</h3>
          <p>
            When a member is removed from an org, they lose access to the
            keyring. But they may have already decrypted the tier DEK during
            their session. There is <strong>no re-encryption mechanism</strong>.
            A removed member who saved the DEK can still decrypt any records that
            were encrypted with it.
          </p>
          <p>
            Fixing this requires re-encrypting all records under a new DEK and
            re-wrapping for remaining members. It's on the roadmap but it's
            expensive and not built.
          </p>

          <h3>5. Metadata leaks</h3>
          <p>
            The PDS can't read record content, but it can see:
          </p>
          <ul>
            <li>Collection names (<code>vault.sealed</code>, <code>vault.proposal</code>, etc.)</li>
            <li>Record counts and sizes</li>
            <li>Timing of writes</li>
            <li>Which DIDs are referenced in proposals (target/proposer)</li>
          </ul>
          <p>
            Proposals are especially leaky: <code>summary</code>,{" "}
            <code>requiredOffices</code>, <code>status</code>, and{" "}
            <code>proposerHandle</code> are all plaintext. A PDS operator can
            infer org structure, activity patterns, and who's proposing changes
            to whom.
          </p>

          <h3>6. Decision chain can fork</h3>
          <p>
            Two people can propose changes to the same record. Both get approved.
            Both write new versions. Now there are two successors — a fork. The
            current client shows whichever it finds first. There is no merge
            mechanism.
          </p>

          <h3>7. Cross-PDS scanning doesn't scale</h3>
          <p>
            Loading org deals means scanning every member's PDS for sealed
            records, proposals, approvals, and decisions. For an org with 50
            members this is 200+ API calls at login. There's no index, no
            aggregation layer, no caching.
          </p>
        </section>

        <section>
          <h2>What's Enforced by What</h2>
          <table className="docs-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th>Enforced by</th>
                <th>Can be bypassed?</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Read encrypted data</td>
                <td>AES-256-GCM</td>
                <td><strong>No</strong> — need the DEK</td>
              </tr>
              <tr>
                <td>Tier-scoped access</td>
                <td>Per-tier DEKs + ECDH wrapping</td>
                <td><strong>No</strong> — need your wrapped key</td>
              </tr>
              <tr>
                <td>Write to own PDS</td>
                <td>ATProto auth</td>
                <td><strong>No</strong> — PDS enforces</td>
              </tr>
              <tr>
                <td>Edit others' records</td>
                <td>ATProto (impossible)</td>
                <td><strong>No</strong> — protocol constraint</td>
              </tr>
              <tr>
                <td>Workflow gates</td>
                <td>Client checking approval records</td>
                <td className="docs-yes"><strong>Yes</strong> — malicious client can skip</td>
              </tr>
              <tr>
                <td>Approval attribution</td>
                <td>Record on approver's PDS</td>
                <td className="docs-yes"><strong>Partially</strong> — PDS operator could fabricate</td>
              </tr>
              <tr>
                <td>Audit trail integrity</td>
                <td>Append-only chain links</td>
                <td className="docs-yes"><strong>Detectable</strong> — fakes leave evidence</td>
              </tr>
            </tbody>
          </table>
          <p>
            The top four rows are the real security model. The bottom three are
            social/reputational enforcement — they work among cooperating
            participants, not against adversaries.
          </p>
        </section>

        <section>
          <h2>Architecture</h2>

          <h3>Key Hierarchy</h3>
          <div className="docs-diagram">
            <pre>{`
  passphrase (never transmitted)
       │
       ▼ PBKDF2-SHA256 (600k iterations, salt = DID)
       │
       ▼
  KEK (AES-256-GCM) ──── wraps/unwraps ──── Identity Key (ECDH P-256)
                                              │
       ┌──────────────────────────────────────┘
       │
  Personal vault:                    Org tiers:
  ECDH(priv, pub) → HKDF → DEK      Random DEK per tier,
  (self-agreement)                    wrapped per-member via ECDH
`}</pre>
          </div>
          <p>
            The passphrase → KEK → Identity Key → DEK chain means losing the
            passphrase = losing everything. <strong>There is no recovery
            mechanism.</strong>
          </p>

          <h3>Record Flow</h3>
          <div className="docs-diagram">
            <pre>{`
  Deal object ─► JSON.stringify ─► AES-256-GCM encrypt ─► vault.sealed
                                   (random IV + DEK)      on your PDS

  vault.sealed ─► AES-256-GCM decrypt ─► JSON.parse ─► Deal object
  from any PDS    (IV from record + DEK)                in browser
`}</pre>
          </div>

          <h3>Unified View</h3>
          <p>
            On login, the client loads personal deals and all org deals into one
            board. Each deal is tagged with which org (or "personal") it belongs
            to. The org switcher is a filter, not a mode switch — you see your
            full record across all contexts. Date, stage, and org filters narrow
            the view.
          </p>

          <h3>Change Control</h3>
          <div className="docs-diagram">
            <pre>{`
  Alice (author)         Bob (proposer)        Carol (Legal office)
  ──────────────         ──────────────        ──────────────────
  vault.sealed           vault.proposal ◄───── target: alice:abc
  rkey: abc              rkey: xyz              (encrypted new content)
       │                      │
       │                      │                vault.approval
       │                      │                proposal: bob:xyz
       │                      │                office: "Legal"
       │                      │                      │
       │                      ▼                      │
       │               [all approvals gathered]      │
       │                      │                      │
       │                      ▼                      │
       │               vault.sealed (new)            │
       │               rkey: def                     │
       │               previousDid: alice            │
       │               previousRkey: abc             │
       │                      │                      │
       │               vault.decision                │
  (superseded) ◄─────  old: alice:abc                │
                        new: bob:def
                        outcome: accepted
`}</pre>
          </div>
        </section>

        <section>
          <h2>Where Records Live</h2>
          <table className="docs-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Whose PDS</th>
                <th>Mutable?</th>
                <th>Plaintext metadata?</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>vault.org</code></td>
                <td>Founder</td>
                <td>Yes (putRecord)</td>
                <td>Everything (name, tiers, offices, workflow)</td>
              </tr>
              <tr>
                <td><code>vault.keyring</code></td>
                <td>Founder</td>
                <td>Yes (putRecord)</td>
                <td>Tier name, member DIDs, wrapped keys</td>
              </tr>
              <tr>
                <td><code>vault.membership</code></td>
                <td>Founder</td>
                <td>Yes (putRecord)</td>
                <td>Everything (org link, tier, handle)</td>
              </tr>
              <tr>
                <td><code>vault.sealed</code></td>
                <td>Author</td>
                <td>No (createRecord)</td>
                <td>innerType, keyringRkey, timestamps</td>
              </tr>
              <tr>
                <td><code>vault.proposal</code></td>
                <td>Proposer</td>
                <td>Status only</td>
                <td>target, summary, offices, status, handle</td>
              </tr>
              <tr>
                <td><code>vault.approval</code></td>
                <td>Approver</td>
                <td>No (deterministic rkey)</td>
                <td>Everything (proposal ref, office, handle)</td>
              </tr>
              <tr>
                <td><code>vault.decision</code></td>
                <td>Proposer</td>
                <td>No (putRecord with deterministic rkey)</td>
                <td>Everything (old→new link, outcome)</td>
              </tr>
            </tbody>
          </table>
          <p>
            Notice: org config, memberships, keyrings, proposals, approvals, and
            decisions are <strong>all plaintext</strong>. Only the deal content
            inside <code>vault.sealed</code> is encrypted. The organizational
            structure itself is visible to anyone who can read the repos.
          </p>
        </section>

        <section>
          <h2>What's Useful, What's Extraneous</h2>

          <h3>Useful</h3>
          <ul>
            <li>
              <strong>Encryption layer</strong> — Genuinely prevents PDS operators
              and network observers from reading deal data. This is the core value.
            </li>
            <li>
              <strong>Tier DEKs</strong> — Real access control. Can't be bypassed
              by UI hacks. Math enforces the boundary.
            </li>
            <li>
              <strong>Append-only + decision chains</strong> — Provides real
              auditability. Who changed what, when, and who approved it. The
              chain is immutable once written.
            </li>
            <li>
              <strong>Cross-PDS orgs</strong> — Members on different PDSes can
              collaborate without a central server. Genuinely novel for ATProto.
            </li>
            <li>
              <strong>Unified view</strong> — All your deals across orgs in one
              place. Filters let you slice by org, stage, or date without
              reloading.
            </li>
          </ul>

          <h3>Extraneous / Oversold</h3>
          <ul>
            <li>
              <strong>Workflow gates as "real enforcement"</strong> — They're
              social enforcement, not cryptographic. Useful for cooperating teams.
              Not a security boundary. Previous docs oversold this.
            </li>
            <li>
              <strong>Office signatures as proof</strong> — Only as good as the
              PDS. Until ATProto has user-level record signing (independent of
              PDS), approvals are attestations, not proofs.
            </li>
            <li>
              <strong>Proposal encryption</strong> — The encrypted content is
              encrypted, but the metadata (who proposed what to whom, which
              offices need to approve) is plaintext. The encryption is real but
              the privacy is partial.
            </li>
          </ul>
        </section>

        <section>
          <h2>What's Missing</h2>
          <ul>
            <li>
              <strong>Key rotation</strong> — Can't re-encrypt when members leave.
              Removed members keep access to old data.
            </li>
            <li>
              <strong>Fork resolution</strong> — Concurrent proposals to the same
              record can create forks. No merge strategy.
            </li>
            <li>
              <strong>Scalable discovery</strong> — Cross-PDS scanning is O(members).
              Need a relay or index for orgs beyond ~10 members.
            </li>
            <li>
              <strong>User-level signatures</strong> — Approvals should be signed
              with the approver's identity key, not just located on their PDS.
              This would make approvals verifiable independent of PDS trust.
            </li>
            <li>
              <strong>Encrypted proposal metadata</strong> — Summary, office
              names, and handles should be encrypted to the org tier DEK.
            </li>
            <li>
              <strong>Passphrase recovery</strong> — Lose it, lose everything.
              Social key recovery (Shamir's secret sharing among trusted parties)
              would help.
            </li>
            <li>
              <strong>Decentralized org governance</strong> — Org config could use
              its own change control protocol (propose changes to tiers/offices,
              gather approvals). Currently the founder is an unaccountable
              dictator.
            </li>
          </ul>
        </section>

        <section>
          <h2>The Honest Model</h2>
          <p>
            Vault CRM is <strong>an encrypted data layer with a social governance
            protocol</strong>. The encryption is real and enforced by math. The
            governance (workflow gates, approvals, offices) is enforced by honest
            clients and social accountability, not by cryptography.
          </p>
          <p>
            This is fine for teams that trust each other but want structure. It's
            not fine for adversarial environments where participants actively try
            to cheat the system. For that you'd need on-chain enforcement or
            threshold cryptography for approvals.
          </p>
          <p>
            The founder-as-dictator model is a feature, not a bug, for orgs that
            want clear authority. It's a liability for orgs that want democratic
            governance. The protocol allows both — the governance layer is
            configurable, including "no gates at all."
          </p>
        </section>

        <section className="docs-footer">
          <p>
            Built on <a href="https://atproto.com" target="_blank" rel="noopener noreferrer">ATProto</a>.
            Encrypted with <a href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API" target="_blank" rel="noopener noreferrer">WebCrypto</a>.
            Your data, your keys, your protocol — your responsibility.
          </p>
        </section>
      </article>
    </div>
  );
}
