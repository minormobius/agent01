import { useState } from "react";
import { DEFAULT_TIERS, STAGES, STAGE_LABELS } from "../types";
import type {
  TierDef,
  Org,
  OrgRecord,
  Membership,
  MembershipRecord,
  Keyring,
  KeyringMemberEntry,
  Office,
  WorkflowGate,
  Stage,
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
const BOOKMARK_COLLECTION = "com.minomobi.vault.orgBookmark";

interface Props {
  pds: PdsClient;
  myDid: string;
  myHandle: string;
  myPrivateKey: CryptoKey;
  myPublicKey: CryptoKey;
  orgs: OrgRecord[];
  memberships: MembershipRecord[];
  onOrgCreated: (org: OrgRecord) => void;
  onMemberInvited: (membership: MembershipRecord) => void;
  onOrgUpdated: (org: Org) => void;
  onOrgJoined: (org: OrgRecord, founderService: string, memberships: MembershipRecord[]) => void;
  onMemberRemoved: (membershipRkey: string, updatedOrg: Org) => void;
  onClose: () => void;
}

type View = "list" | "create" | "join" | "manage";

export function OrgManager({
  pds,
  myDid,
  myHandle,
  myPrivateKey,
  myPublicKey,
  orgs,
  memberships,
  onOrgCreated,
  onMemberInvited,
  onOrgUpdated,
  onOrgJoined,
  onMemberRemoved,
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
            onJoinOrg={() => setView("join")}
            onManage={(org) => {
              setSelectedOrg(org);
              setView("manage");
            }}
            onClose={onClose}
          />
        )}
        {view === "join" && (
          <JoinOrg
            pds={pds}
            myDid={myDid}
            onJoined={(org, founderService, joinedMemberships) => {
              onOrgJoined(org, founderService, joinedMemberships);
              setView("list");
            }}
            onBack={() => setView("list")}
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
            myHandle={myHandle}
            myPrivateKey={myPrivateKey}
            myPublicKey={myPublicKey}
            memberships={memberships.filter(
              (m) => m.membership.orgRkey === selectedOrg.rkey
            )}
            onMemberInvited={onMemberInvited}
            onMemberRemoved={(membershipRkey, updatedOrg) => {
              onMemberRemoved(membershipRkey, updatedOrg);
              setSelectedOrg({ ...selectedOrg, org: updatedOrg });
            }}
            onOrgUpdated={(updatedOrg) => {
              onOrgUpdated(updatedOrg);
              setSelectedOrg({ ...selectedOrg, org: updatedOrg });
            }}
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
  onJoinOrg,
  onManage,
  onClose,
}: {
  orgs: OrgRecord[];
  memberships: MembershipRecord[];
  myDid: string;
  onCreateNew: () => void;
  onJoinOrg: () => void;
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
        <button type="button" className="btn-secondary" onClick={onJoinOrg}>
          Join Org
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
    setTiers([
      ...tiers,
      { name: newTierName.trim().toLowerCase(), level: maxLevel + 1 },
    ]);
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
        tiers: tiers.map((t, i) => ({ ...t, level: i })),
        offices: [],
        workflow: { gates: [] },
        createdAt: new Date().toISOString(),
      };

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
      await pds.createRecord(MEMBERSHIP_COLLECTION, {
        $type: MEMBERSHIP_COLLECTION,
        orgRkey,
        orgService: pds.getService(),
        orgFounderDid: myDid,
        memberDid: myDid,
        tierName: highestTier.name,
        invitedBy: myDid,
        createdAt: new Date().toISOString(),
      });

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
            Each tier gets its own encryption key. Higher tiers can decrypt
            all lower-tier data. Offices and workflow gates control who can
            approve changes.
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

type ManageTab = "members" | "offices" | "workflow";

function ManageOrg({
  pds,
  org,
  myDid,
  myHandle,
  myPrivateKey,
  myPublicKey,
  memberships,
  onMemberInvited,
  onMemberRemoved,
  onOrgUpdated,
  onBack,
}: {
  pds: PdsClient;
  org: OrgRecord;
  myDid: string;
  myHandle: string;
  myPrivateKey: CryptoKey;
  myPublicKey: CryptoKey;
  memberships: MembershipRecord[];
  onMemberInvited: (membership: MembershipRecord) => void;
  onMemberRemoved: (membershipRkey: string, updatedOrg: Org) => void;
  onOrgUpdated: (org: Org) => void;
  onBack: () => void;
}) {
  const [manageTab, setManageTab] = useState<ManageTab>("members");
  const [inviteHandle, setInviteHandle] = useState("");
  const [inviteTier, setInviteTier] = useState(org.org.tiers[0]?.name ?? "");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null); // DID of member being removed
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Office state
  const [offices, setOffices] = useState<Office[]>(org.org.offices ?? []);
  const [newOfficeName, setNewOfficeName] = useState("");
  const [newOfficeDesc, setNewOfficeDesc] = useState("");
  const [newOfficeSigs, setNewOfficeSigs] = useState("1");
  const [officeSaving, setOfficeSaving] = useState(false);

  // Workflow state
  const [gates, setGates] = useState<WorkflowGate[]>(org.org.workflow?.gates ?? []);
  const [newGateFrom, setNewGateFrom] = useState<Stage>("lead");
  const [newGateTo, setNewGateTo] = useState<Stage>("qualified");
  const [newGateOffices, setNewGateOffices] = useState<string[]>([]);
  const [workflowSaving] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setInviting(true);

    try {
      let inviteeDid: string;
      const input = inviteHandle.trim().replace(/^@/, "");
      if (input.startsWith("did:")) {
        inviteeDid = input;
      } else {
        inviteeDid = await resolveHandle(input);
      }

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

      const tierDef = org.org.tiers.find((t) => t.name === inviteTier);
      if (!tierDef) throw new Error("Invalid tier");

      const tiersToGrant = org.org.tiers.filter((t) => t.level <= tierDef.level);

      for (const tier of tiersToGrant) {
        const keyringRecord = await pds.getRecord(
          KEYRING_COLLECTION,
          `${org.rkey}:${tier.name}`
        );
        if (!keyringRecord) continue;

        const keyringVal = (keyringRecord as Record<string, unknown>).value as Keyring & { $type: string };
        const myEntry = keyringVal.members.find((m: KeyringMemberEntry) => m.did === myDid);
        if (!myEntry) continue;

        const writerPublicKey = await importPublicKey(fromBase64(keyringVal.writerPublicKey));
        const tierDek = await unwrapDekFromMember(
          fromBase64(myEntry.wrappedDek),
          myPrivateKey,
          writerPublicKey
        );

        const wrappedForInvitee = await wrapDekForMember(
          tierDek,
          myPrivateKey,
          inviteePublicKey
        );

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

  // --- Remove member + rotate affected tier DEKs ---

  const handleRemoveMember = async (membership: MembershipRecord) => {
    const memberDid = membership.membership.memberDid;
    if (memberDid === myDid) return; // Can't remove yourself
    if (memberDid === org.org.founderDid) return; // Can't remove founder

    setRemoving(memberDid);
    setError("");
    setSuccess("");

    try {
      // Determine which tiers the removed member had access to
      const memberTierDef = org.org.tiers.find(
        (t) => t.name === membership.membership.tierName
      );
      if (!memberTierDef) throw new Error("Member tier not found");

      const affectedTiers = org.org.tiers.filter(
        (t) => t.level <= memberTierDef.level
      );

      // Collect remaining members (everyone except the removed member)
      const remainingMemberships = memberships.filter(
        (m) => m.membership.memberDid !== memberDid
      );

      // Fetch public keys for all remaining members
      const memberPublicKeys = new Map<string, CryptoKey>();
      for (const m of remainingMemberships) {
        const did = m.membership.memberDid;
        if (did === myDid) {
          memberPublicKeys.set(did, myPublicKey);
          continue;
        }
        try {
          const memberPds = await resolvePds(did);
          const memberClient = new PdsClient(memberPds);
          const pubRecord = await memberClient.getRecordFrom(
            did, PUBKEY_COLLECTION, "self"
          );
          if (!pubRecord) continue;
          const pubVal = (pubRecord as Record<string, unknown>).value as Record<string, unknown>;
          const pubField = pubVal.publicKey as { $bytes: string };
          memberPublicKeys.set(did, await importPublicKey(fromBase64(pubField.$bytes)));
        } catch {
          console.warn(`Could not fetch public key for ${did}`);
        }
      }

      const myPubRaw = await exportPublicKey(myPublicKey);
      const myPubB64 = toBase64(myPubRaw);

      // Rotate each affected tier
      const updatedTiers = [...org.org.tiers];
      for (const tier of affectedTiers) {
        const tierIdx = updatedTiers.findIndex((t) => t.name === tier.name);
        const currentEpoch = tier.currentEpoch ?? 0;
        const newEpoch = currentEpoch + 1;

        // Generate fresh DEK
        const newDek = await generateTierDek();

        // Wrap for each remaining member who has access to this tier
        const newMembers: KeyringMemberEntry[] = [];
        for (const m of remainingMemberships) {
          const mTierDef = org.org.tiers.find(
            (t) => t.name === m.membership.tierName
          );
          if (!mTierDef || mTierDef.level < tier.level) continue;

          const pubKey = memberPublicKeys.get(m.membership.memberDid);
          if (!pubKey) continue;

          const wrapped = await wrapDekForMember(newDek, myPrivateKey, pubKey);
          newMembers.push({
            did: m.membership.memberDid,
            wrappedDek: toBase64(wrapped),
          });
        }

        // Write new keyring at new epoch
        const newRkey =
          newEpoch === 0
            ? `${org.rkey}:${tier.name}`
            : `${org.rkey}:${tier.name}:${newEpoch}`;

        await pds.putRecord(KEYRING_COLLECTION, newRkey, {
          $type: KEYRING_COLLECTION,
          orgRkey: org.rkey,
          tierName: tier.name,
          epoch: newEpoch,
          writerDid: myDid,
          writerPublicKey: myPubB64,
          members: newMembers,
          rotatedAt: new Date().toISOString(),
          reason: `member-removal:${memberDid}`,
        });

        // Update tier epoch
        updatedTiers[tierIdx] = { ...updatedTiers[tierIdx], currentEpoch: newEpoch };
      }

      // Remove member from any offices
      const updatedOffices = (org.org.offices ?? []).map((office) => ({
        ...office,
        memberDids: office.memberDids.filter((d) => d !== memberDid),
      }));

      // Update org record with new epochs + cleaned offices
      const updatedOrg: Org = {
        ...org.org,
        tiers: updatedTiers,
        offices: updatedOffices,
      };

      await pds.putRecord(ORG_COLLECTION, org.rkey, {
        $type: ORG_COLLECTION,
        ...updatedOrg,
      });

      // Delete the membership record
      await pds.deleteRecord(MEMBERSHIP_COLLECTION, membership.rkey);

      const displayName = membership.membership.memberHandle
        ? `@${membership.membership.memberHandle}`
        : memberDid.slice(0, 20) + "...";

      onMemberRemoved(membership.rkey, updatedOrg);
      setSuccess(`Removed ${displayName} and rotated ${affectedTiers.length} tier key(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setRemoving(null);
    }
  };

  // --- Office management ---

  const addOffice = async () => {
    if (!newOfficeName.trim()) return;
    setOfficeSaving(true);
    setError("");
    try {
      const office: Office = {
        name: newOfficeName.trim(),
        description: newOfficeDesc.trim() || undefined,
        memberDids: [],
        requiredSignatures: Math.max(1, parseInt(newOfficeSigs) || 1),
      };
      const updated = [...offices, office];
      const updatedOrg = { ...org.org, offices: updated };
      onOrgUpdated(updatedOrg);
      setOffices(updated);
      setNewOfficeName("");
      setNewOfficeDesc("");
      setNewOfficeSigs("1");
      setSuccess(`Office "${office.name}" created`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add office");
    } finally {
      setOfficeSaving(false);
    }
  };

  const removeOffice = (idx: number) => {
    const updated = offices.filter((_, i) => i !== idx);
    setOffices(updated);
    // Also remove this office from any workflow gates
    const officeName = offices[idx].name;
    const updatedGates = gates.map((g) => ({
      ...g,
      requiredOffices: g.requiredOffices.filter((o) => o !== officeName),
    })).filter((g) => g.requiredOffices.length > 0);
    setGates(updatedGates);
    onOrgUpdated({ ...org.org, offices: updated, workflow: { gates: updatedGates } });
  };

  const toggleMemberInOffice = (officeIdx: number, memberDid: string) => {
    const updated = offices.map((office, i) => {
      if (i !== officeIdx) return office;
      const hasMember = office.memberDids.includes(memberDid);
      return {
        ...office,
        memberDids: hasMember
          ? office.memberDids.filter((d) => d !== memberDid)
          : [...office.memberDids, memberDid],
      };
    });
    setOffices(updated);
    onOrgUpdated({ ...org.org, offices: updated });
  };

  // --- Workflow management ---

  const addGate = () => {
    if (newGateOffices.length === 0) return;
    const gate: WorkflowGate = {
      fromStage: newGateFrom,
      toStage: newGateTo,
      requiredOffices: [...newGateOffices],
    };
    const updated = [...gates, gate];
    setGates(updated);
    setNewGateOffices([]);
    onOrgUpdated({ ...org.org, offices, workflow: { gates: updated } });
  };

  const removeGate = (idx: number) => {
    const updated = gates.filter((_, i) => i !== idx);
    setGates(updated);
    onOrgUpdated({ ...org.org, offices, workflow: { gates: updated } });
  };

  const toggleGateOffice = (officeName: string) => {
    setNewGateOffices((prev) =>
      prev.includes(officeName)
        ? prev.filter((o) => o !== officeName)
        : [...prev, officeName]
    );
  };

  // Helper: get handle or truncated DID for display
  const memberLabel = (did: string) => {
    if (did === myDid) return `@${myHandle}`;
    const m = memberships.find((m) => m.membership.memberDid === did);
    return m?.membership.memberHandle ? `@${m.membership.memberHandle}` : did.slice(0, 20) + "...";
  };

  return (
    <>
      <h2>{org.org.name}</h2>

      <div className="manage-tabs">
        <button
          className={`manage-tab ${manageTab === "members" ? "manage-tab-active" : ""}`}
          onClick={() => setManageTab("members")}
        >
          Members
        </button>
        <button
          className={`manage-tab ${manageTab === "offices" ? "manage-tab-active" : ""}`}
          onClick={() => setManageTab("offices")}
        >
          Offices
        </button>
        <button
          className={`manage-tab ${manageTab === "workflow" ? "manage-tab-active" : ""}`}
          onClick={() => setManageTab("workflow")}
        >
          Workflow
        </button>
      </div>

      {manageTab === "members" && (
        <>
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
                {memberships.map((m) => {
                  const isFounder = m.membership.memberDid === org.org.founderDid;
                  const isMe = m.membership.memberDid === myDid;
                  const isRemoving = removing === m.membership.memberDid;
                  return (
                    <div key={m.rkey} className="member-item">
                      <span className="member-did">
                        {m.membership.memberHandle
                          ? `@${m.membership.memberHandle}`
                          : m.membership.memberDid}
                        {isFounder && <span className="member-badge"> (founder)</span>}
                      </span>
                      <span className="member-tier">{m.membership.tierName}</span>
                      {!isFounder && !isMe && (
                        <button
                          className="tier-remove"
                          onClick={() => handleRemoveMember(m)}
                          disabled={isRemoving || removing !== null}
                          title="Remove member and rotate keys"
                        >
                          {isRemoving ? "..." : "x"}
                        </button>
                      )}
                    </div>
                  );
                })}
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
      )}

      {manageTab === "offices" && (
        <>
          <div className="org-section">
            <h3>Offices / Departments</h3>
            <p className="org-hint">
              Offices group members who must sign off on deal stage transitions.
            </p>
            {offices.length === 0 ? (
              <p className="org-empty">No offices yet.</p>
            ) : (
              <div className="office-list">
                {offices.map((office, oi) => (
                  <div key={oi} className="office-card">
                    <div className="office-header">
                      <span className="office-name">{office.name}</span>
                      <span className="office-sigs">
                        {office.requiredSignatures} sig{office.requiredSignatures !== 1 ? "s" : ""} required
                      </span>
                      <button
                        className="tier-remove"
                        onClick={() => removeOffice(oi)}
                        title="Remove office"
                      >
                        x
                      </button>
                    </div>
                    {office.description && (
                      <div className="office-desc">{office.description}</div>
                    )}
                    <div className="office-members">
                      <span className="office-members-label">Assigned:</span>
                      {memberships.map((m) => {
                        const inOffice = office.memberDids.includes(m.membership.memberDid);
                        return (
                          <label
                            key={m.rkey}
                            className={`office-member-toggle ${inOffice ? "active" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={inOffice}
                              onChange={() =>
                                toggleMemberInOffice(oi, m.membership.memberDid)
                              }
                            />
                            {memberLabel(m.membership.memberDid)}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="org-section">
            <h3>Add Office</h3>
            <div className="field">
              <label>Office Name</label>
              <input
                value={newOfficeName}
                onChange={(e) => setNewOfficeName(e.target.value)}
                placeholder="Legal, Finance, Engineering..."
              />
            </div>
            <div className="field">
              <label>Description (optional)</label>
              <input
                value={newOfficeDesc}
                onChange={(e) => setNewOfficeDesc(e.target.value)}
                placeholder="Reviews contracts before closing"
              />
            </div>
            <div className="field">
              <label>Required Signatures</label>
              <input
                type="number"
                min="1"
                value={newOfficeSigs}
                onChange={(e) => setNewOfficeSigs(e.target.value)}
              />
              <small>How many members of this office must sign off (1 = any one member)</small>
            </div>

            {error && manageTab === "offices" && <div className="error">{error}</div>}
            {success && manageTab === "offices" && <div className="success">{success}</div>}

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={onBack}>
                Back
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={addOffice}
                disabled={officeSaving || !newOfficeName.trim()}
              >
                {officeSaving ? "Saving..." : "Add Office"}
              </button>
            </div>
          </div>
        </>
      )}

      {manageTab === "workflow" && (
        <>
          <div className="org-section">
            <h3>Approval Gates</h3>
            <p className="org-hint">
              Gates require offices to sign off before a deal can move between stages.
            </p>
            {gates.length === 0 ? (
              <p className="org-empty">No gates defined. Deals can move freely.</p>
            ) : (
              <div className="gate-list">
                {gates.map((gate, gi) => (
                  <div key={gi} className="gate-item">
                    <div className="gate-flow">
                      <span className="gate-stage">{STAGE_LABELS[gate.fromStage]}</span>
                      <span className="gate-arrow">&rarr;</span>
                      <span className="gate-stage">{STAGE_LABELS[gate.toStage]}</span>
                    </div>
                    <div className="gate-offices">
                      {gate.requiredOffices.map((o) => (
                        <span key={o} className="gate-office-badge">{o}</span>
                      ))}
                    </div>
                    <button
                      className="tier-remove"
                      onClick={() => removeGate(gi)}
                      title="Remove gate"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="org-section">
            <h3>Add Gate</h3>
            <div className="field-row">
              <div className="field">
                <label>From Stage</label>
                <select
                  value={newGateFrom}
                  onChange={(e) => setNewGateFrom(e.target.value as Stage)}
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>To Stage</label>
                <select
                  value={newGateTo}
                  onChange={(e) => setNewGateTo(e.target.value as Stage)}
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </div>

            {offices.length === 0 ? (
              <p className="org-hint">Create offices first to add approval gates.</p>
            ) : (
              <div className="field">
                <label>Required Offices</label>
                <div className="gate-office-selector">
                  {offices.map((office) => (
                    <label
                      key={office.name}
                      className={`office-member-toggle ${newGateOffices.includes(office.name) ? "active" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={newGateOffices.includes(office.name)}
                        onChange={() => toggleGateOffice(office.name)}
                      />
                      {office.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={onBack}>
                Back
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={addGate}
                disabled={workflowSaving || newGateOffices.length === 0}
              >
                {workflowSaving ? "Saving..." : "Add Gate"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// --- Join Org ---
//
// The member enters the founder's handle. We resolve it to a DID + PDS,
// scan the founder's membership records for the current user's DID,
// and if found, write a vault.orgBookmark to the member's own PDS.
// On subsequent logins, discoverOrgs reads these bookmarks and fetches
// the org + keyrings from the founder's PDS.

function JoinOrg({
  pds,
  myDid,
  onJoined,
  onBack,
}: {
  pds: PdsClient;
  myDid: string;
  onJoined: (org: OrgRecord, founderService: string, memberships: MembershipRecord[]) => void;
  onBack: () => void;
}) {
  const [founderHandle, setFounderHandle] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    setError("");

    try {
      const input = founderHandle.trim().replace(/^@/, "");
      if (!input) throw new Error("Enter a handle or DID");

      // Resolve founder
      const founderDid = input.startsWith("did:") ? input : await resolveHandle(input);
      const founderService = await resolvePds(founderDid);
      const founderClient = new PdsClient(founderService);

      // Scan founder's memberships for our DID
      const myMemberships: MembershipRecord[] = [];
      let cursor: string | undefined;
      do {
        const page = await founderClient.listRecordsFrom(
          founderDid, MEMBERSHIP_COLLECTION, 100, cursor
        );
        for (const rec of page.records) {
          const val = rec.value as Record<string, unknown>;
          if ((val as { memberDid?: string }).memberDid === myDid) {
            const rkey = rec.uri.split("/").pop()!;
            myMemberships.push({ rkey, membership: val as unknown as Membership });
          }
        }
        cursor = page.cursor;
      } while (cursor);

      if (myMemberships.length === 0) {
        throw new Error(
          "No invitations found from this user. Ask them to invite you first."
        );
      }

      // For each membership, fetch the org and write a bookmark
      let joinedCount = 0;
      for (const m of myMemberships) {
        const orgRkey = m.membership.orgRkey;

        const orgRec = await founderClient.getRecordFrom(
          founderDid, ORG_COLLECTION, orgRkey
        );
        if (!orgRec) continue;

        const orgVal = (orgRec as Record<string, unknown>).value as unknown as Org;

        // Write bookmark to our PDS (idempotent via putRecord)
        await pds.putRecord(BOOKMARK_COLLECTION, orgRkey, {
          $type: BOOKMARK_COLLECTION,
          founderDid,
          founderService,
          orgRkey,
          orgName: orgVal.name,
          createdAt: new Date().toISOString(),
        });

        // Fetch all memberships for this org (not just mine)
        const allOrgMemberships: MembershipRecord[] = [];
        let memberCursor: string | undefined;
        do {
          const page = await founderClient.listRecordsFrom(
            founderDid, MEMBERSHIP_COLLECTION, 100, memberCursor
          );
          for (const rec of page.records) {
            const val = rec.value as Record<string, unknown>;
            if ((val as { orgRkey?: string }).orgRkey === orgRkey) {
              const rkey = rec.uri.split("/").pop()!;
              allOrgMemberships.push({ rkey, membership: val as unknown as Membership });
            }
          }
          memberCursor = page.cursor;
        } while (memberCursor);

        onJoined(
          { rkey: orgRkey, org: orgVal },
          founderService,
          allOrgMemberships
        );
        joinedCount++;
      }

      if (joinedCount === 0) {
        throw new Error("Found memberships but could not load org records.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <h2>Join Organization</h2>
      <p className="org-hint">
        Enter the handle of the person who invited you. We'll scan their
        PDS for your invitation and set up a bookmark so you can find the
        org on future logins.
      </p>
      <form onSubmit={handleJoin}>
        <div className="field">
          <label htmlFor="founder-handle">Founder's Handle</label>
          <HandleTypeahead
            id="founder-handle"
            value={founderHandle}
            onChange={setFounderHandle}
            placeholder="alice.bsky.social"
          />
        </div>

        {error && <div className="error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onBack}>
            Back
          </button>
          <button type="submit" disabled={searching}>
            {searching ? "Searching..." : "Find My Invitations"}
          </button>
        </div>
      </form>
    </>
  );
}
