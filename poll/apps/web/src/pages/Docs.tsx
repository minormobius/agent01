import React, { useState } from 'react';

type Section = 'overview' | 'protocol' | 'trust' | 'verification' | 'faq';

const sections: { key: Section; title: string }[] = [
  { key: 'overview', title: 'How it works' },
  { key: 'protocol', title: 'Protocol' },
  { key: 'trust', title: 'Trust model' },
  { key: 'verification', title: 'Verification' },
  { key: 'faq', title: 'FAQ' },
];

export function DocsPage() {
  const [active, setActive] = useState<Section>('overview');

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Documentation</h2>

      <div className="docs-tabs">
        {sections.map(s => (
          <button
            key={s.key}
            className={`docs-tab${active === s.key ? ' active' : ''}`}
            onClick={() => setActive(s.key)}
          >
            {s.title}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        {active === 'overview' && <Overview />}
        {active === 'protocol' && <Protocol />}
        {active === 'trust' && <TrustModel />}
        {active === 'verification' && <Verification />}
        {active === 'faq' && <FAQ />}
      </div>
    </div>
  );
}

function Overview() {
  return (
    <div className="docs-content">
      <h3>Anonymous polls on ATProto</h3>
      <p>
        This system lets any Bluesky user create and vote in polls where votes are
        <strong> anonymous</strong> and <strong>auditable</strong>. The system knows
        <em> who voted</em> but not <em>what they voted</em>, and it knows
        <em> what was voted</em> but not <em>by whom</em>. These two halves never
        meet in persistent storage.
      </p>

      <h3>The flow</h3>
      <ol>
        <li><strong>Create</strong> — Sign in with your Bluesky handle and create a poll with a question and options.</li>
        <li><strong>Open</strong> — Open the poll to accept votes.</li>
        <li><strong>Vote</strong> — Voters sign in, request an anonymous credential, and submit their ballot. The credential proves eligibility without revealing identity.</li>
        <li><strong>Close</strong> — The host closes the poll.</li>
        <li><strong>Publish</strong> — Ballots are published to ATProto in shuffled order, breaking any correlation between submission time and identity.</li>
        <li><strong>Audit</strong> — Anyone can verify the tally by counting the public ballot records.</li>
      </ol>

      <h3>Key properties</h3>
      <ul>
        <li><strong>Sybil-resistant</strong> — One vote per Bluesky DID.</li>
        <li><strong>Anonymous</strong> — Ballots contain no voter identity.</li>
        <li><strong>Auditable</strong> — All ballot records are public on ATProto.</li>
        <li><strong>Shuffled publication</strong> — Ballots publish in random order at poll close, not as they arrive.</li>
        <li><strong>Voter restrictions</strong> — Polls can be limited to followers, mutuals, ATProto list members, or a specific DID set.</li>
      </ul>

      <h3>Voter eligibility modes</h3>
      <table className="audit-table">
        <thead>
          <tr><th>Mode</th><th>Who can vote</th><th>How it works</th></tr>
        </thead>
        <tbody>
          <tr><td>Open</td><td>Any Bluesky user</td><td>Default. No whitelist check.</td></tr>
          <tr><td>Followers</td><td>Creator's followers</td><td>Follower list snapshotted at poll creation. Re-syncable before opening.</td></tr>
          <tr><td>Mutuals</td><td>Creator's mutuals</td><td>Intersection of followers and following, snapshotted at creation.</td></tr>
          <tr><td>ATProto list</td><td>List members</td><td>Members of a specified <code>app.bsky.graph.list</code>, snapshotted at creation.</td></tr>
          <tr><td>DID list</td><td>Specific DIDs</td><td>Creator provides exact DIDs at poll creation.</td></tr>
        </tbody>
      </table>
      <p>
        For graph-based modes (followers, mutuals, list), the eligible DID set is
        <strong> frozen at creation</strong>. The creator can re-sync before opening the poll,
        but once the poll is open the set is immutable. This ensures auditability — the
        eligibility rules don't change mid-vote.
      </p>
    </div>
  );
}

function Protocol() {
  return (
    <div className="docs-content">
      <h3>Credential issuance</h3>
      <p>
        When a voter requests eligibility, the server checks their DID hasn't already
        claimed a credential for this poll. If eligible, it generates:
      </p>
      <ul>
        <li><strong>Secret</strong> — A random value known only to the voter.</li>
        <li><strong>Token message</strong> — <code>H(version || pollId || secret || expiry)</code></li>
        <li><strong>HMAC signature</strong> — The server signs the token message with the poll's signing key.</li>
        <li><strong>Nullifier</strong> — <code>H("nullifier" || secret || pollId)</code> — a unique, deterministic value derived from the secret.</li>
      </ul>

      <h3>Ballot submission</h3>
      <p>
        The voter submits their choice along with the token message, HMAC signature,
        and nullifier. The server verifies:
      </p>
      <ol>
        <li>The HMAC signature is valid (proves the credential was issued by this poll).</li>
        <li>The nullifier hasn't been seen before (prevents double voting).</li>
        <li>The token hasn't expired.</li>
      </ol>
      <p>
        The ballot is stored with <strong>no voter DID</strong>. The credential is
        the authorization — not the session.
      </p>

      <h3>Batch publication</h3>
      <p>
        Ballots are <strong>not</strong> published to ATProto as they arrive. They're
        held in private storage until the poll closes, then published in a
        Fisher-Yates shuffled order. This prevents timing correlation — an observer
        cannot match "voter X authenticated at 3:01pm" to "ballot Y was the third
        one published."
      </p>

      <h3>Cryptographic details</h3>
      <table className="audit-table">
        <thead>
          <tr><th>Primitive</th><th>Construction</th></tr>
        </thead>
        <tbody>
          <tr><td>Token message</td><td>SHA-256 hash of version, poll ID, secret, expiry</td></tr>
          <tr><td>Credential</td><td>HMAC-SHA256 of token message with poll signing key</td></tr>
          <tr><td>Nullifier</td><td>SHA-256 hash of "nullifier" prefix, secret, poll ID</td></tr>
          <tr><td>Verification</td><td>Constant-time comparison (timing-safe)</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function TrustModel() {
  return (
    <div className="docs-content">
      <h3>What you're trusting</h3>
      <p>
        The system has a single trust assumption: <strong>the operator does not log
        the mapping between voter DID and ballot choice during the ~100ms credential
        issuance window.</strong>
      </p>

      <h3>What's verifiable without trust</h3>
      <ul>
        <li>Ballot records on ATProto contain no voter DID — anyone can check.</li>
        <li>Eligibility table stores who claimed a credential, but not what they voted.</li>
        <li>Nullifier uniqueness prevents double voting — verifiable from public ballot data.</li>
        <li>Ballot count matches credential count — verifiable from public data.</li>
        <li>Tally matches individual ballot records — recomputable by anyone.</li>
      </ul>

      <h3>What the operator could do (but shouldn't)</h3>
      <ul>
        <li>Log the DID-to-choice mapping during credential issuance (the ~100ms window).</li>
        <li>In <code>trusted_host_v1</code> mode, the host generates the secret, so they
        could theoretically reconstruct the DID-to-nullifier mapping. This is a known
        tradeoff of the current mode.</li>
      </ul>

      <h3>Mitigations</h3>
      <ul>
        <li>Receipt hashes are <strong>not stored</strong> alongside voter DIDs, preventing
        database-level correlation.</li>
        <li>Ballots publish in shuffled order, breaking timing analysis.</li>
        <li>The code is open source and auditable.</li>
        <li>Future <code>anon_credential_v2</code> mode will have the voter generate their
        own secret client-side, eliminating the host's ability to reconstruct the mapping.</li>
      </ul>

      <h3>Comparison</h3>
      <table className="audit-table">
        <thead>
          <tr><th>Property</th><th>trusted_host_v1</th><th>anon_credential_v2 (planned)</th></tr>
        </thead>
        <tbody>
          <tr><td>Secret generation</td><td>Server-side</td><td>Client-side</td></tr>
          <tr><td>Host can de-anonymize?</td><td>Theoretically, during issuance</td><td>No</td></tr>
          <tr><td>Requires blind signatures?</td><td>No</td><td>Yes</td></tr>
          <tr><td>Ballot anonymity</td><td>Operational trust</td><td>Cryptographic guarantee</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Verification() {
  return (
    <div className="docs-content">
      <h3>How to verify a poll</h3>
      <p>
        Every poll has an <strong>Audit</strong> page that shows raw ballot data and
        lets you recompute the tally independently.
      </p>

      <h3>What the audit page shows</h3>
      <ol>
        <li><strong>Raw ballots</strong> — Every accepted ballot with its nullifier,
        choice, and credential proof. No voter DIDs.</li>
        <li><strong>Tally recomputation</strong> — Click "Recompute" to count ballots
        client-side and compare against the server's tally.</li>
        <li><strong>Duplicate nullifier check</strong> — Flags if any nullifier appears
        more than once (should never happen).</li>
        <li><strong>Audit log</strong> — Timestamped events: poll creation, opens, closes,
        credential issuances, ballot acceptances.</li>
      </ol>

      <h3>ATProto verification</h3>
      <p>
        When ballots are published to ATProto, they become part of the public record.
        Anyone running a relay or using the ATProto API can independently fetch and
        count the <code>com.minomobi.poll.ballot</code> records for a given poll.
      </p>

      <h3>What to check</h3>
      <ul>
        <li>Ballot count matches the number of eligibility claims.</li>
        <li>No duplicate nullifiers exist.</li>
        <li>Tally sums match individual ballot choices.</li>
        <li>All ballots have valid HMAC signatures (proves they were issued by the poll).</li>
      </ul>
    </div>
  );
}

function FAQ() {
  return (
    <div className="docs-content">
      <h3>Frequently asked questions</h3>

      <h4>Can I vote twice?</h4>
      <p>
        No. Your DID is checked at credential issuance — each DID gets exactly one
        credential per poll. Even if you somehow obtained two credentials, the
        nullifier uniqueness check at ballot submission prevents double counting.
      </p>

      <h4>Can the poll creator see how I voted?</h4>
      <p>
        In <code>trusted_host_v1</code> mode, the poll host generates the credential
        secret server-side. They could theoretically log the mapping, but the system
        does not persist it. In the planned <code>anon_credential_v2</code> mode, the
        voter generates the secret client-side, making de-anonymization cryptographically
        impossible.
      </p>

      <h4>What happens if I close my browser mid-vote?</h4>
      <p>
        If you've already received a credential but haven't submitted a ballot, you
        can return and submit later — the credential is stored in your browser's
        session. If the credential has expired, you cannot get a new one (your DID
        was already marked as consumed).
      </p>

      <h4>Why are ballots published at close instead of immediately?</h4>
      <p>
        Immediate publication would let observers correlate "user X authenticated at
        3:01pm" with "a ballot appeared at 3:01pm." Publishing all ballots at once
        in shuffled order breaks this timing channel.
      </p>

      <h4>What is ATProto?</h4>
      <p>
        The Authenticated Transfer Protocol — the decentralized social networking
        protocol that Bluesky is built on. Poll definitions, ballot records, and
        tally records are stored as ATProto records, making them publicly
        verifiable and replicated across the relay network.
      </p>

      <h4>Can I restrict who votes in my poll?</h4>
      <p>
        Yes. When creating a poll, choose an eligibility mode: followers only, mutuals
        only, ATProto list members, or a specific set of DIDs. The eligible voter set
        is snapshotted at creation and frozen when the poll opens.
      </p>

      <h4>Is this open source?</h4>
      <p>
        Yes. The full codebase including the protocol design, cryptographic
        primitives, and this documentation is available for review.
      </p>
    </div>
  );
}
