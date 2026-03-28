export function OrgsTab() {
  return (
    <>
      <h2>Orgs & Membership</h2>
      <p className="docs-lead">
        Organizations are cross-PDS collaborative spaces. Members can be on
        different PDS instances and still share encrypted data through a
        common keyring structure hosted on the founder's PDS.
      </p>

      <section>
        <h3>Org Creation</h3>
        <p>
          When you create an org, several things happen on your PDS:
        </p>
        <ol>
          <li>
            A <code>vault.org</code> record is written with the org name,
            your DID as founder, and the tier definitions (name + level for each).
          </li>
          <li>
            A <code>vault.membership</code> record is created linking you to the
            org at the highest tier.
          </li>
          <li>
            For each tier, a random AES-256 DEK is generated, wrapped for your
            public key via ECDH, and stored in a <code>vault.keyring</code> record.
          </li>
        </ol>
        <p>
          The default tiers are <strong>member</strong> (level 0),{" "}
          <strong>manager</strong> (level 1), and <strong>admin</strong> (level 2).
          Higher levels can decrypt all tiers at or below their level. You can
          customize the tier names and count during creation.
        </p>
      </section>

      <section>
        <h3>The Founder Role</h3>
        <p>
          The founder's PDS is the canonical source for org configuration:
        </p>
        <ul>
          <li>Org definition (name, tiers, offices, workflow gates)</li>
          <li>All keyrings (one per tier per epoch)</li>
          <li>All membership records (who belongs and at what tier)</li>
          <li>Channel records in Wave (channels live on founder's PDS)</li>
        </ul>
        <p>
          <strong>The founder is a benevolent dictator by design.</strong> They
          can modify tiers, rewrite workflow gates, add or remove members, and
          restructure offices. If the founder's PDS goes down, the org config
          is inaccessible (though members still have their own encrypted records
          and cached DEKs from the last session).
        </p>
        <p>
          This is intentional for orgs that want clear authority. For orgs
          that need democratic governance, the org relationship system allows
          authority to be split across multiple parties.
        </p>
      </section>

      <section>
        <h3>Inviting Members</h3>
        <p>
          To invite someone, the founder (or authorized member) does:
        </p>
        <ol>
          <li>
            Resolves the invitee's PDS and fetches their{" "}
            <code>vault.encryptionKey</code> (public key). The invitee must
            have logged into the hub at least once to publish this key.
          </li>
          <li>
            Creates a <code>vault.membership</code> record on the founder's
            PDS linking the invitee's DID to a specific tier.
          </li>
          <li>
            For each accessible tier, wraps the tier DEK for the invitee's
            public key and adds their entry to the keyring.
          </li>
        </ol>
        <p>
          The invitee discovers the invitation through the notification system —
          either via Jetstream real-time events or by scanning known founders'
          PDS for membership records targeting their DID.
        </p>
      </section>

      <section>
        <h3>Joining an Org</h3>
        <p>
          When you accept an invite:
        </p>
        <ol>
          <li>
            A <code>vault.orgBookmark</code> is written to your own PDS
            recording the founder's DID, their PDS service URL, the org rkey,
            and the org name.
          </li>
          <li>
            On next login (or immediately), the hub fetches the org definition
            from the founder's PDS, unwraps your tier DEKs from the keyrings,
            and builds the org context.
          </li>
        </ol>
        <p>
          The bookmark is your persistent link to the org. Without it, the
          hub wouldn't know to check the founder's PDS for your membership.
        </p>
      </section>

      <section>
        <h3>Tier Structure</h3>
        <div className="docs-diagram">
          <pre>{`  Level 2 ─── admin ──── Can decrypt: admin + manager + member
       │
  Level 1 ─── manager ── Can decrypt: manager + member
       │
  Level 0 ─── member ─── Can decrypt: member only

  Each tier has its own DEK. Higher tiers get wrapped copies
  of all DEKs at or below their level.`}</pre>
        </div>
        <p>
          Tiers are pure encryption gates. There are no client-side permission
          flags — if you have the DEK, you can read the data. If you don't,
          you can't. The math enforces the boundary.
        </p>
      </section>

      <section>
        <h3>Offices & Workflow</h3>
        <p>
          Orgs can optionally define <strong>offices</strong> (departments
          like Legal, Finance, Engineering) and <strong>workflow gates</strong>{" "}
          (rules like "deals moving from Proposal to Negotiation require Legal
          sign-off").
        </p>
        <p>
          Offices are groups of member DIDs. Workflow gates specify which
          offices must approve a stage transition. This feeds into the change
          control protocol used by the CRM — see the Permissions tab for
          enforcement details.
        </p>
      </section>

      <section>
        <h3>Org Relationships</h3>
        <p>
          Orgs can be linked through <code>vault.orgRelationship</code>{" "}
          records that define parent/child/peer relationships with authority
          grants and tier bridges:
        </p>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Pattern</th>
              <th>Origin</th>
              <th>What it means</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Co-founder</td>
              <td>founded</td>
              <td>Multiple parties share authority over one org</td>
            </tr>
            <tr>
              <td>Acquisition</td>
              <td>acquired</td>
              <td>Parent holds all authorities over child</td>
            </tr>
            <tr>
              <td>Skunkworks</td>
              <td>spawned</td>
              <td>Parent has limited visibility + dissolve, child retains autonomy</td>
            </tr>
            <tr>
              <td>Peer</td>
              <td>peer</td>
              <td>Mutual visibility bridges, no authority</td>
            </tr>
          </tbody>
        </table>
        <p>
          Tier bridges allow cross-org encrypted data visibility — a parent
          org's admin tier can read a child org's manager tier, for example.
        </p>
      </section>
    </>
  );
}
