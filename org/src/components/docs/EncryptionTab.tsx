export function EncryptionTab() {
  return (
    <>
      <h2>Encryption Scheme</h2>
      <p className="docs-lead">
        All sensitive data is encrypted client-side before it reaches the PDS.
        Your PDS stores ciphertext. A PDS operator who dumps your repo gets
        opaque blobs. The math holds.
      </p>

      <section>
        <h3>Passphrase Derivation</h3>
        <p>
          Your passphrase never leaves the browser. It's fed into PBKDF2-SHA256
          with 600,000 iterations and a salt derived from your DID to produce
          a <strong>Key Encryption Key (KEK)</strong>. The KEK is AES-256-GCM
          and exists only to wrap/unwrap your identity key pair.
        </p>
        <p>
          Losing the passphrase means losing everything. There is no recovery
          mechanism — no admin reset, no backup key, no escrow. This is
          intentional: nobody but you can unlock your vault.
        </p>
      </section>

      <section>
        <h3>Identity Key</h3>
        <p>
          On first login, a P-256 ECDH key pair is generated. The private key
          is wrapped with the KEK (AES-KW) and stored on your PDS as{" "}
          <code>vault.wrappedIdentity</code>. The public key is published
          as <code>vault.encryptionKey</code> so other users can wrap DEKs for
          you.
        </p>
        <p>
          The identity key serves two purposes: deriving your personal vault
          DEK (via ECDH self-agreement + HKDF) and participating in org tier
          key wrapping.
        </p>
      </section>

      <section>
        <h3>Data Encryption Keys (DEKs)</h3>
        <p>
          Every encrypted record uses AES-256-GCM with a random 12-byte IV.
          Which DEK is used depends on context:
        </p>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Context</th>
              <th>DEK Source</th>
              <th>Who can decrypt</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Personal vault</td>
              <td>ECDH(priv, pub) → HKDF</td>
              <td>Only you</td>
            </tr>
            <tr>
              <td>Org tier</td>
              <td>Random AES-256 key per tier</td>
              <td>All members at or above that tier level</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>Key Hierarchy</h3>
        <div className="docs-diagram">
          <pre>{`  passphrase (never transmitted)
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
  (self-agreement)                    wrapped per-member via ECDH`}</pre>
        </div>
      </section>

      <section>
        <h3>Org Tier Key Wrapping</h3>
        <p>
          When an org is created, a random AES-256 DEK is generated for each
          tier. These DEKs are wrapped per-member using ECDH key agreement:
        </p>
        <ol>
          <li>The founder's private key + the member's public key → shared secret via ECDH</li>
          <li>The shared secret is fed into HKDF → wrapping key</li>
          <li>The tier DEK is wrapped with AES-KW and stored in the keyring</li>
        </ol>
        <p>
          Each member's keyring entry contains their DID and the wrapped DEK.
          To decrypt a tier's records, you unwrap the DEK using your private key
          and the writer's public key (stored in the keyring record).
        </p>
      </section>

      <section>
        <h3>Epoch-Based Key Rotation</h3>
        <p>
          Each tier has a <code>currentEpoch</code> counter. When keys are
          rotated (e.g., after a member is removed), a new DEK is generated at
          epoch N+1. Old keyrings are frozen — they keep the original member
          list so remaining members can still decrypt records sealed under
          previous epochs. New records use the current epoch's DEK.
        </p>
        <p>
          Keyring rkeys encode the epoch:{" "}
          <code>orgRkey:tierName</code> for epoch 0,{" "}
          <code>orgRkey:tierName:N</code> for epoch N.
        </p>
      </section>

      <section>
        <h3>Record Encryption Flow</h3>
        <div className="docs-diagram">
          <pre>{`  Record object ─► JSON.stringify ─► AES-256-GCM encrypt ─► vault.sealed
                                      (random IV + DEK)      on your PDS

  vault.sealed ─► AES-256-GCM decrypt ─► JSON.parse ─► Record object
  from any PDS    (IV from record + DEK)                in browser`}</pre>
        </div>
        <p>
          The sealed envelope stores: <code>innerType</code> (what kind of
          record), <code>keyringRkey</code> (which DEK to use),{" "}
          <code>iv</code>, and <code>ciphertext</code>. The innerType and
          keyringRkey are plaintext metadata — the PDS can see <em>what type</em>{" "}
          of record it is and <em>which tier</em> it belongs to, but not the content.
        </p>
      </section>
    </>
  );
}
