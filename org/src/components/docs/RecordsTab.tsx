export function RecordsTab() {
  return (
    <>
      <h2>Records</h2>
      <p className="docs-lead">
        Everything is an ATProto record. Records live on the author's PDS and
        are addressed by DID + collection + rkey. The system uses a sealed
        envelope pattern for encrypted data and plain records for structural
        metadata.
      </p>

      <section>
        <h3>The Sealed Envelope</h3>
        <p>
          All sensitive data (deals, tasks, contacts, calendar events) is stored
          in a uniform <code>vault.sealed</code> collection. Each record is an
          envelope containing:
        </p>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Encrypted?</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>innerType</code></td>
              <td>No</td>
              <td>What kind of record: <code>crm.deal</code>, <code>pm.task</code>, <code>cal.event</code>, <code>crm.contact</code></td>
            </tr>
            <tr>
              <td><code>keyringRkey</code></td>
              <td>No</td>
              <td>Which DEK to use: <code>"self"</code> for personal, <code>orgRkey:tierName[:epoch]</code> for org</td>
            </tr>
            <tr>
              <td><code>iv</code></td>
              <td>No</td>
              <td>12-byte initialization vector (random per record)</td>
            </tr>
            <tr>
              <td><code>ciphertext</code></td>
              <td>Yes</td>
              <td>AES-256-GCM encrypted JSON of the actual record</td>
            </tr>
            <tr>
              <td><code>createdAt</code></td>
              <td>No</td>
              <td>ISO timestamp</td>
            </tr>
            <tr>
              <td><code>previousDid/Rkey</code></td>
              <td>No</td>
              <td>Chain link to superseded version (for change control)</td>
            </tr>
          </tbody>
        </table>
        <p>
          The <code>innerType</code> discriminator lets the client filter records
          without decrypting — you can scan for "all deals" or "all tasks"
          by checking the envelope metadata. Only matching records get decrypted.
        </p>
      </section>

      <section>
        <h3>Collection Inventory</h3>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Collection</th>
              <th>Whose PDS</th>
              <th>Encrypted?</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>vault.sealed</code></td>
              <td>Author</td>
              <td>Content yes</td>
              <td>Deals, tasks, contacts, calendar events</td>
            </tr>
            <tr>
              <td><code>vault.org</code></td>
              <td>Founder</td>
              <td>No</td>
              <td>Org definition (name, tiers, offices, workflow)</td>
            </tr>
            <tr>
              <td><code>vault.membership</code></td>
              <td>Founder</td>
              <td>No</td>
              <td>Member ↔ org ↔ tier assignments</td>
            </tr>
            <tr>
              <td><code>vault.keyring</code></td>
              <td>Founder</td>
              <td>Wrapped DEKs</td>
              <td>Per-tier per-epoch key distribution</td>
            </tr>
            <tr>
              <td><code>vault.proposal</code></td>
              <td>Proposer</td>
              <td>Content yes</td>
              <td>Change control proposals</td>
            </tr>
            <tr>
              <td><code>vault.approval</code></td>
              <td>Approver</td>
              <td>No</td>
              <td>Office sign-off on proposals</td>
            </tr>
            <tr>
              <td><code>vault.decision</code></td>
              <td>Proposer</td>
              <td>No</td>
              <td>Audit link: old version → new version</td>
            </tr>
            <tr>
              <td><code>vault.notification</code></td>
              <td>Sender</td>
              <td>No</td>
              <td>Published notifications (discovered via Jetstream)</td>
            </tr>
            <tr>
              <td><code>vault.notificationDismissal</code></td>
              <td>Receiver</td>
              <td>No</td>
              <td>Tracks dismissed notifications</td>
            </tr>
            <tr>
              <td><code>vault.notificationPrefs</code></td>
              <td>User</td>
              <td>No</td>
              <td>Per-type notification enable/disable</td>
            </tr>
            <tr>
              <td><code>vault.orgBookmark</code></td>
              <td>Member</td>
              <td>No</td>
              <td>Persistent link to a joined org</td>
            </tr>
            <tr>
              <td><code>vault.orgRelationship</code></td>
              <td>Founder</td>
              <td>No</td>
              <td>Cross-org authority grants and tier bridges</td>
            </tr>
            <tr>
              <td><code>vault.workflowRule</code></td>
              <td>User</td>
              <td>No</td>
              <td>Automation rules (event → action mappings)</td>
            </tr>
            <tr>
              <td><code>vault.template</code></td>
              <td>User</td>
              <td>No</td>
              <td>Reusable templates for deals, tasks, events, docs</td>
            </tr>
            <tr>
              <td><code>vault.wrappedIdentity</code></td>
              <td>User</td>
              <td>Wrapped</td>
              <td>Identity private key wrapped with KEK</td>
            </tr>
            <tr>
              <td><code>vault.encryptionKey</code></td>
              <td>User</td>
              <td>No</td>
              <td>Public key (for others to wrap DEKs for you)</td>
            </tr>
            <tr>
              <td><code>wave.channel</code></td>
              <td>Founder</td>
              <td>No</td>
              <td>Channel definitions (name, tier, org)</td>
            </tr>
            <tr>
              <td><code>wave.thread</code></td>
              <td>Creator</td>
              <td>No</td>
              <td>Thread metadata (title, type, channel link)</td>
            </tr>
            <tr>
              <td><code>wave.op</code></td>
              <td>Author</td>
              <td>Content yes</td>
              <td>Messages, doc edits, reactions</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>Cross-PDS Scanning</h3>
        <p>
          Because each member writes to their own PDS, loading all data for an
          org requires scanning every member's PDS. The flow on login:
        </p>
        <ol>
          <li>
            Fetch the org definition + memberships from the founder's PDS
          </li>
          <li>
            Unwrap your tier DEKs from the keyrings
          </li>
          <li>
            For each member DID, call <code>listRecordsFrom</code> on their
            PDS filtering by collection (<code>vault.sealed</code>,{" "}
            <code>vault.proposal</code>, etc.)
          </li>
          <li>
            Attempt to decrypt each sealed record with the matching tier DEK
          </li>
        </ol>
        <p>
          This is O(members × collections) API calls. For an org with 50
          members and 4 collection types, that's 200+ requests at login. The
          client handles this gracefully — members whose PDS is unreachable
          are skipped with a warning, and their data appears when they come
          back online.
        </p>
      </section>

      <section>
        <h3>Record Addressing</h3>
        <p>
          Every record has a unique AT URI: <code>at://did/collection/rkey</code>.
          Records reference each other through these URIs:
        </p>
        <ul>
          <li>
            <strong>Thread → Channel:</strong> <code>channelUri</code> field
            points to the channel record on the founder's PDS
          </li>
          <li>
            <strong>Op → Thread:</strong> <code>threadUri</code> field
            points to the thread record on the creator's PDS
          </li>
          <li>
            <strong>Proposal → Target:</strong> <code>targetDid</code> +{" "}
            <code>targetRkey</code> identify the sealed record being changed
          </li>
          <li>
            <strong>Decision → Chain:</strong> <code>previousDid/Rkey</code>{" "}
            and <code>newDid/Rkey</code> link old and new versions
          </li>
        </ul>
      </section>

      <section>
        <h3>Real-Time Discovery</h3>
        <p>
          New records are discovered via <strong>Jetstream</strong> — a
          WebSocket stream from the ATProto relay that delivers repo events in
          real time. The client subscribes to events from all org member DIDs
          and filters by collection:
        </p>
        <ul>
          <li>
            <strong>Org Jetstream:</strong> Watches <code>wave.op</code>,{" "}
            <code>wave.thread</code>, and <code>wave.channel</code> for the
            current org — delivers new messages, threads, and channels instantly
          </li>
          <li>
            <strong>Hub Jetstream:</strong> Watches{" "}
            <code>vault.notification</code> across all org members — delivers
            notifications for deals, tasks, events, proposals, and messages
          </li>
        </ul>
        <p>
          Jetstream handlers use React refs to always see current state
          (active org, active channel, notification preferences) since the
          WebSocket callback closure is created once at connection time.
        </p>
      </section>
    </>
  );
}
