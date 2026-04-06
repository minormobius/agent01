export function PermissionsTab() {
  return (
    <>
      <h2>Permission Flow</h2>
      <p className="docs-lead">
        The honest version — what's enforced by math, what's enforced by
        honest clients, and where the gaps are.
      </p>

      <section>
        <h3>What's Enforced by What</h3>
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
        <h3>ATProto Write Constraint</h3>
        <p>
          The most important permission in the system is one we didn't build:
          <strong> ATProto only lets you write to your own PDS.</strong> Nobody
          can modify your records. This is a protocol-level guarantee that
          eliminates an entire class of attacks.
        </p>
        <p>
          This means "editing" another member's deal requires a multi-step
          protocol: you propose a change (on your PDS), they or the required
          offices approve it (on their PDSes), and then the new version is
          written (on the proposer's PDS) with a chain link to the old version.
        </p>
      </section>

      <section>
        <h3>Change Control Protocol</h3>
        <div className="docs-diagram">
          <pre>{`  Alice (author)         Bob (proposer)        Carol (Legal office)
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
  (superseded) ◄─────  old: alice:abc
                        new: bob:def
                        outcome: accepted`}</pre>
        </div>
        <p>
          This protocol is <em>social</em>, not cryptographic. An honest client
          enforces it. A modified client could write a{" "}
          <code>vault.sealed</code> record directly, skipping the approval
          flow. The safeguard is that other members can see the full audit trail
          and detect records without matching approvals.
        </p>
      </section>

      <section>
        <h3>Attack Surface</h3>

        <h4>Founder as single point of failure</h4>
        <p>
          The org definition, keyrings, and memberships all live on the
          founder's PDS. The founder can silently rewrite workflow gates,
          remove members from keyrings, add phantom members, or change tier
          definitions. If the founder's PDS goes down, the org is
          inaccessible.
        </p>

        <h4>Approval records aren't cryptographically signed</h4>
        <p>
          "Carol approved" means there's a <code>vault.approval</code> record
          on Carol's PDS. But ATProto repo signing is PDS-managed, not
          user-managed. So "Carol approved" really means <strong>"Carol's PDS
          says Carol approved."</strong> If Carol's PDS operator is malicious,
          they could fabricate approval records. This is an ATProto-level
          limitation, not specific to us.
        </p>

        <h4>No automatic re-encryption on member removal</h4>
        <p>
          When a member is removed from an org, they lose access to the
          keyring. But they may have already decrypted the tier DEK during
          their session. Key rotation (re-encrypting all records under a new
          DEK) requires the epoch system — new records use the new epoch's
          DEK, but old records remain readable with old keys.
        </p>

        <h4>Metadata leaks</h4>
        <p>
          The PDS can't read record content, but it can see: collection names,
          record counts and sizes, timing of writes, and which DIDs are
          referenced in proposals. Proposals are especially leaky — summary,
          required offices, status, and proposer handle are all plaintext.
        </p>

        <h4>Decision chain can fork</h4>
        <p>
          Two people can propose changes to the same record. Both get approved.
          Both write new versions. Now there are two successors — a fork. The
          current client shows whichever it finds first. There is no merge
          mechanism.
        </p>
      </section>

      <section>
        <h3>Notification Permissions</h3>
        <p>
          Notifications use a pull model — the sender publishes a{" "}
          <code>vault.notification</code> record on their own PDS. The
          receiver's client discovers it via Jetstream. Broadcast notifications
          use <code>targetDid: "*"</code> and the receiver filters by org
          membership.
        </p>
        <p>
          Users configure per-type notification preferences stored on their
          own PDS as <code>vault.notificationPrefs</code>. The opt-out model
          means everything is enabled by default — users disable what they
          don't want.
        </p>
      </section>
    </>
  );
}
