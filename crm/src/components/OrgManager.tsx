import { useState } from "react";
import { DEFAULT_TIERS } from "../types";
import type {
  TierDef,
  Org,
  OrgRecord,
  MembershipRecord,
  Keyring,
  KeyringMemberEntry,
} from "../types";
import { PdsClient, resolveHandle, resolvePds } from "../pds";
import {
  generateTierDek,
  wrapDekForMember,
  unwrapDekFromMember,
  exportPublicKey,
  importPublicKey,
  toBase64,
  fromBase64,
} from "../crypto";
import { HandleTypeahead } from "./HandleTypeahead";

const ORG_COLLECTION = "com.minomobi.vault.org";
const MEMBERSHIP_COLLECTION = "com.minomobi.vault.membership";
const KEYRING_COLLECTION = "com.minomobi.vault.keyring";
const PUBKEY_COLLECTION = "com.minomobi.vault.encryptionKey";

interface Props {
  pds: PdsClient;
  myDid: string;
  myPrivateKey: CryptoKey;
  myPublicKey: CryptoKey;
  orgs: OrgRecord[];
  memberships: MembershipRecord[];
  onOrgCreated: (org: OrgRecord) => void;
  onMemberInvited: (membership: MembershipRecord) => void;
  onClose: () => void;
}

type View = "list" | "create" | "manage";

export function OrgManager({
  pds,
  myDid,
  myPrivateKey,
  myPublicKey,
  orgs,
  memberships,
  onOrgCreated,
  onMemberInvited,
  onClose,
}: Props) {
  const [view, setView] = useState<View>("list");
  const [selectedOrg, setSelectedOrg] = useState<OrgRecord | null>(null);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal org-modal" onClick={(e) => e.stopPropagation()}>
        {view === "list" && (
          <OrgList
            orgs={orgs}
            memberships={memberships}
            myDid={myDid}
            onCreateNew={() => setView("create")}
            onManage={(org) => {
              setSelectedOrg(org);
              setView("manage");
            }}
            onClose={onClose}
          />
        )}
        {view === "create" && (
          <CreateOrg
            pds={pds}
            myDid={myDid}
            myPrivateKey={myPrivateKey}
            myPublicKey={myPublicKey}
            onCreated={(org) => {
              onOrgCreated(org);
              setView("list");
            }}
            onBack={() => setView("list")}
          />
        )}
        {view === "manage" && selectedOrg && (
          <ManageOrg
            pds={pds}
            org={selectedOrg}
            myDid={myDid}
            myPrivateKey={myPrivateKey}
            myPublicKey={myPublicKey}
            memberships={memberships.filter(
              (m) => m.membership.orgRkey === selectedOrg.rkey
            )}
            onMemberInvited={onMemberInvited}
            onBack={() => setView("list")}
          />
        )}
      </div>
    </div>
  );
}

// --- Org List ---

function OrgList({
  orgs,
  memberships,
  myDid,
  onCreateNew,
  onManage,
  onClose,
}: {
  orgs: OrgRecord[];
  memberships: MembershipRecord[];
  myDid: string;
  onCreateNew: () => void;
  onManage: (org: OrgRecord) => void;
  onClose: () => void;
}) {
  const myOrgs = orgs.filter((o) => o.org.founderDid === myDid);
  const memberOfOrgs = memberships.filter(
    (m) => m.membership.memberDid === myDid && m.membership.orgFounderDid !== myDid
  );

  return (
    <>
      <h2>Organizations</h2>
      {myOrgs.length === 0 && memberOfOrgs.length === 0 && (
        <p className="org-empty">
          No organizations yet. Create one to start collaborating with
          configurable access tiers.
        </p>
      )}
      {myOrgs.length > 0 && (
        <div className="org-section">
          <h3>Founded by you</h3>
          {myOrgs.map((org) => (
            <div key={org.rkey} className="org-item">
              <div className="org-item-info">
                <span className="org-item-name">{org.org.name}</span>
                <span className="org-item-tiers">
                  {org.org.tiers.map((t) => t.name).join(" / ")}
                </span>
              </div>
              <button className="btn-secondary" onClick={() => onManage(org)}>
                Manage
              </button>
            </div>
          ))}
        </div>
      )}
      {memberOfOrgs.length > 0 && (
        <div className="org-section">
          <h3>Member of</h3>
          {memberOfOrgs.map((m) => (
            <div key={m.rkey} className="org-item">
              <div className="org-item-info">
                <span className="org-item-name">{m.membership.orgRkey}</span>
                <span className="org-item-tiers">
                  Tier: {m.membership.tierName}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="form-actions">
        <button className="btn-secondary" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn-primary" onClick={onCreateNew}>
          + New Organization
        </button>
      </div>
    </>
  );
}

// --- Create Org ---

function CreateOrg({
  pds,
  myDid,
  myPrivateKey,
  myPublicKey,
  onCreated,
  onBack,
}: {
  pds: PdsClient;
  myDid: string;
  myPrivateKey: CryptoKey;
  myPublicKey: CryptoKey;
  onCreated: (org: OrgRecord) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [tiers, setTiers] = useState<TierDef[]>([...DEFAULT_TIERS]);
  const [newTierName, setNewTierName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addTier = () => {
    if (!newTierName.trim()) return;
    const maxLevel = tiers.reduce((m, t) => Math.max(m, t.level), -1);
    setTiers([...tiers, { name: newTierName.trim().toLowerCase(), level: maxLevel + 1 }]);
    setNewTierName("");
  };

  const removeTier = (idx: number) => {
    setTiers(tiers.filter((_, i) => i !== idx));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tiers.length === 0) {
      setError("At least one tier is required");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const org: Org = {
        name,
        founderDid: myDid,
        tiers: tiers.map((t, i) => ({ ...t, level: i })), // normalize levels to 0..n
        createdAt: new Date().toISOString(),
      };

      // Write org record
      const orgRes = await pds.createRecord(ORG_COLLECTION, {
        $type: ORG_COLLECTION,
        ...org,
      });
      const orgRkey = orgRes.uri.split("/").pop()!;

      // Generate a DEK for each tier and wrap for the founder
      const myPubRaw = await exportPublicKey(myPublicKey);
      const myPubB64 = toBase64(myPubRaw);

      for (const tier of org.tiers) {
        const tierDek = await generateTierDek();
        const wrapped = await wrapDekForMember(tierDek, myPrivateKey, myPublicKey);

        const keyring: Keyring & { $type: string } = {
          $type: KEYRING_COLLECTION,
          orgRkey,
          tierName: tier.name,
          writerDid: myDid,
          writerPublicKey: myPubB64,
          members: [{ did: myDid, wrappedDek: toBase64(wrapped) }],
        };

        await pds.putRecord(KEYRING_COLLECTION, `${orgRkey}:${tier.name}`, keyring);
      }

      // Write founder's membership at highest tier
      const highestTier = org.tiers[org.tiers.length - 1];
      const membershipRes = await pds.createRecord(MEMBERSHIP_COLLECTION, {
        $type: MEMBERSHIP_COLLECTION,
        orgRkey,
        orgService: pds.getService(),
        orgFounderDid: myDid,
        memberDid: myDid,
        tierName: highestTier.name,
        invitedBy: myDid,
        createdAt: new Date().toISOString(),
      });
      membershipRes.uri.split("/").pop()!; // membership rkey

      onCreated({ rkey: orgRkey, org });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create org");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2>Create Organization</h2>
      <form onSubmit={handleCreate}>
        <div className="field">
          <label htmlFor="org-name">Organization Name</label>
          <input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            placeholder="Acme Corp"
          />
        </div>

        <div className="field">
          <label>Access Tiers (lowest to highest)</label>
          <div className="tier-list">
            {tiers.map((tier, i) => (
              <div key={i} className="tier-item">
                <span className="tier-level">L{i}</span>
                <span className="tier-name">{tier.name}</span>
                <button
                  type="button"
                  className="tier-remove"
                  onClick={() => removeTier(i)}
                  title="Remove tier"
                >
                  x
                </button>
              </div>
            ))}
          </div>
          <div className="tier-add">
            <input
              value={newTierName}
              onChange={(e) => setNewTierName(e.target.value)}
              placeholder="New tier name"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTier();
                }
              }}
            />
            <button type="button" className="btn-secondary" onClick={addTier}>
              Add
            </button>
          </div>
          <small>
            Each tier gets its own encryption key. Higher tiers can read all
            lower-tier data. Add as many as you need.
          </small>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onBack}>
            Back
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </>
  );
}

// --- Manage Org ---

function ManageOrg({
  pds,
  org,
  myDid,
  myPrivateKey,
  myPublicKey,
  memberships,
  onMemberInvited,
  onBack,
}: {
  pds: PdsClient;
  org: OrgRecord;
  myDid: string;
  myPrivateKey: CryptoKey;
  myPublicKey: CryptoKey;
  memberships: MembershipRecord[];
  onMemberInvited: (membership: MembershipRecord) => void;
  onBack: () => void;
}) {
  const [inviteHandle, setInviteHandle] = useState("");
  const [inviteTier, setInviteTier] = useState(org.org.tiers[0]?.name ?? "");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setInviting(true);

    try {
      // Resolve handle → DID → PDS → public key
      let inviteeDid: string;
      const input = inviteHandle.trim().replace(/^@/, "");
      if (input.startsWith("did:")) {
        inviteeDid = input;
      } else {
        inviteeDid = await resolveHandle(input);
      }

      // Resolve the invitee's PDS to fetch their public key
      const inviteePds = await resolvePds(inviteeDid);
      const inviteeClient = new PdsClient(inviteePds);
      const pubRecord = await inviteeClient.getRecordFrom(
        inviteeDid,
        PUBKEY_COLLECTION,
        "self"
      );
      if (!pubRecord) {
        throw new Error(
          "Could not find encryption key for that user. They must log into Vault CRM first."
        );
      }

      const pubVal = (pubRecord as Record<string, unknown>).value as Record<string, unknown>;
      const pubField = pubVal.publicKey as { $bytes: string };
      const inviteePublicKey = await importPublicKey(fromBase64(pubField.$bytes));

      // Find the tier level for the invited tier
      const tierDef = org.org.tiers.find((t) => t.name === inviteTier);
      if (!tierDef) throw new Error("Invalid tier");

      // For each tier at or below the invited tier, wrap the DEK for the new member
      const tiersToGrant = org.org.tiers.filter((t) => t.level <= tierDef.level);

      for (const tier of tiersToGrant) {
        // Fetch the existing keyring to get the tier DEK
        const keyringRecord = await pds.getRecord(
          KEYRING_COLLECTION,
          `${org.rkey}:${tier.name}`
        );
        if (!keyringRecord) continue;

        const keyringVal = (keyringRecord as Record<string, unknown>).value as Keyring & { $type: string };

        // Unwrap the tier DEK using my own wrapped copy
        const myEntry = keyringVal.members.find((m: KeyringMemberEntry) => m.did === myDid);
        if (!myEntry) continue;

        const writerPublicKey = await importPublicKey(fromBase64(keyringVal.writerPublicKey));
        const tierDek = await unwrapDekFromMember(
          fromBase64(myEntry.wrappedDek),
          myPrivateKey,
          writerPublicKey
        );

        // Wrap for the new member (tierDek is already extractable)
        const wrappedForInvitee = await wrapDekForMember(
          tierDek,
          myPrivateKey,
          inviteePublicKey
        );

        // Update keyring with new member
        const myPubRaw = await exportPublicKey(myPublicKey);
        const updatedMembers = [
          ...keyringVal.members.filter((m: KeyringMemberEntry) => m.did !== inviteeDid),
          { did: inviteeDid, wrappedDek: toBase64(wrappedForInvitee) },
        ];

        await pds.putRecord(KEYRING_COLLECTION, `${org.rkey}:${tier.name}`, {
          $type: KEYRING_COLLECTION,
          orgRkey: org.rkey,
          tierName: tier.name,
          writerDid: myDid,
          writerPublicKey: toBase64(myPubRaw),
          members: updatedMembers,
        });
      }

      // Write membership record (store handle for display)
      const membershipRes = await pds.createRecord(MEMBERSHIP_COLLECTION, {
        $type: MEMBERSHIP_COLLECTION,
        orgRkey: org.rkey,
        orgService: pds.getService(),
        orgFounderDid: org.org.founderDid,
        memberDid: inviteeDid,
        memberHandle: input.startsWith("did:") ? undefined : input,
        tierName: inviteTier,
        invitedBy: myDid,
        createdAt: new Date().toISOString(),
      });
      const membershipRkey = membershipRes.uri.split("/").pop()!;

      const displayName = input.startsWith("did:") ? inviteeDid : `@${input}`;
      onMemberInvited({
        rkey: membershipRkey,
        membership: {
          orgRkey: org.rkey,
          orgService: pds.getService(),
          orgFounderDid: org.org.founderDid,
          memberDid: inviteeDid,
          memberHandle: input.startsWith("did:") ? undefined : input,
          tierName: inviteTier,
          invitedBy: myDid,
          createdAt: new Date().toISOString(),
        },
      });

      setSuccess(`Invited ${displayName} as ${inviteTier}`);
      setInviteHandle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  };

  return (
    <>
      <h2>{org.org.name}</h2>

      <div className="org-section">
        <h3>Tiers</h3>
        <div className="tier-list">
          {org.org.tiers.map((tier, i) => (
            <div key={i} className="tier-item">
              <span className="tier-level">L{tier.level}</span>
              <span className="tier-name">{tier.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="org-section">
        <h3>Members</h3>
        {memberships.length === 0 ? (
          <p className="org-empty">No members yet.</p>
        ) : (
          <div className="member-list">
            {memberships.map((m) => (
              <div key={m.rkey} className="member-item">
                <span className="member-did">
                  {m.membership.memberHandle
                    ? `@${m.membership.memberHandle}`
                    : m.membership.memberDid}
                </span>
                <span className="member-tier">{m.membership.tierName}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="org-section">
        <h3>Invite Member</h3>
        <form onSubmit={handleInvite}>
          <div className="field">
            <label htmlFor="invite-handle">Username</label>
            <HandleTypeahead
              id="invite-handle"
              value={inviteHandle}
              onChange={setInviteHandle}
              placeholder="handle.bsky.social"
            />
          </div>
          <div className="field">
            <label htmlFor="invite-tier">Tier</label>
            <select
              id="invite-tier"
              value={inviteTier}
              onChange={(e) => setInviteTier(e.target.value)}
            >
              {org.org.tiers.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} (L{t.level})
                </option>
              ))}
            </select>
          </div>

          {error && <div className="error">{error}</div>}
          {success && <div className="success">{success}</div>}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onBack}>
              Back
            </button>
            <button type="submit" disabled={inviting}>
              {inviting ? "Inviting..." : "Invite"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
