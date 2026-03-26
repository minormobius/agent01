import { useState } from "react";
import type { PdsClient } from "../pds";
import { resolveHandle, resolvePds } from "../pds";
import {
  importPublicKey,
  exportPublicKey,
  unwrapDekFromMember,
  wrapDekForMember,
  fromBase64,
  toBase64,
} from "../crypto";
import type { OrgRecord, MembershipRecord, Keyring, KeyringMemberEntry } from "../types";
import type { VaultState } from "../App";

const MEMBERSHIP_COLLECTION = "com.minomobi.vault.membership";
const KEYRING_COLLECTION = "com.minomobi.vault.keyring";
const PUBKEY_COLLECTION = "com.minomobi.vault.encryptionKey";

interface Props {
  pds: PdsClient;
  vault: VaultState;
  org: OrgRecord;
  memberships: MembershipRecord[];
  onMembershipsChanged: (updated: MembershipRecord[]) => void;
  onBack: () => void;
}

export function OrgDetail({ pds, vault, org, memberships, onMembershipsChanged, onBack }: Props) {
  const [inviteHandle, setInviteHandle] = useState("");
  const [inviteTier, setInviteTier] = useState(org.org.tiers[0]?.name ?? "member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isFounder = org.org.founderDid === vault.session.did;
  const sortedTiers = [...org.org.tiers].sort((a, b) => a.level - b.level);

  const inviteLink = `${window.location.origin}/invite/${org.rkey}?founder=${encodeURIComponent(org.org.founderDid)}&service=${encodeURIComponent(pds.getService())}`;

  const handleInvite = async () => {
    if (!inviteHandle.trim()) return;
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const input = inviteHandle.trim();
      // Resolve DID
      let inviteeDid: string;
      if (input.startsWith("did:")) {
        inviteeDid = input;
      } else {
        inviteeDid = await resolveHandle(input);
      }

      // Check not already a member
      if (memberships.some((m) => m.membership.memberDid === inviteeDid)) {
        throw new Error("Already a member of this org");
      }

      // Fetch invitee's public key from their PDS
      let inviteeService: string;
      try {
        inviteeService = await resolvePds(inviteeDid);
      } catch {
        throw new Error("Could not resolve invitee's PDS. They must set up their vault first.");
      }

      const inviteePds = new (pds.constructor as typeof PdsClient)(inviteeService);
      const pubRecord = await inviteePds.getRecordFrom(inviteeDid, PUBKEY_COLLECTION, "self");
      if (!pubRecord) {
        throw new Error("Invitee has no vault encryption key. They must set up their vault first.");
      }

      const pubVal = (pubRecord as Record<string, unknown>).value as Record<string, unknown>;
      const pubField = pubVal.publicKey as { $bytes: string };
      const inviteePublicKey = await importPublicKey(fromBase64(pubField.$bytes));

      // Find the tier definition
      const tierDef = org.org.tiers.find((t) => t.name === inviteTier);
      if (!tierDef) throw new Error("Invalid tier");

      // Grant access to all tiers at or below the invited tier
      const tiersToGrant = org.org.tiers.filter((t) => t.level <= tierDef.level);

      for (const tier of tiersToGrant) {
        const currentEpoch = tier.currentEpoch ?? 0;

        for (let epoch = 0; epoch <= currentEpoch; epoch++) {
          const rkey =
            epoch === 0
              ? `${org.rkey}:${tier.name}`
              : `${org.rkey}:${tier.name}:${epoch}`;

          const keyringRecord = await pds.getRecord(KEYRING_COLLECTION, rkey);
          if (!keyringRecord) continue;

          const keyringVal = (keyringRecord as Record<string, unknown>).value as Keyring & {
            $type: string;
          };
          const myEntry = keyringVal.members.find(
            (m: KeyringMemberEntry) => m.did === vault.session.did,
          );
          if (!myEntry) continue;

          const writerPubB64 =
            typeof keyringVal.writerPublicKey === "string"
              ? keyringVal.writerPublicKey
              : (keyringVal.writerPublicKey as { $bytes: string }).$bytes;

          const writerPublicKey = await importPublicKey(fromBase64(writerPubB64));
          const tierDek = await unwrapDekFromMember(
            fromBase64(typeof myEntry.wrappedDek === "string" ? myEntry.wrappedDek : (myEntry.wrappedDek as { $bytes: string }).$bytes),
            vault.privateKey,
            writerPublicKey,
          );

          const wrappedForInvitee = await wrapDekForMember(
            tierDek,
            vault.privateKey,
            inviteePublicKey,
          );

          const myPubRaw = await exportPublicKey(vault.publicKey);
          const updatedMembers = [
            ...keyringVal.members.filter(
              (m: KeyringMemberEntry) => m.did !== inviteeDid,
            ),
            { did: inviteeDid, wrappedDek: toBase64(wrappedForInvitee) },
          ];

          await pds.putRecord(KEYRING_COLLECTION, rkey, {
            $type: KEYRING_COLLECTION,
            orgRkey: org.rkey,
            tierName: tier.name,
            epoch,
            writerDid: vault.session.did,
            writerPublicKey: toBase64(myPubRaw),
            members: updatedMembers,
          });
        }
      }

      // Create membership record
      const membershipRes = await pds.createRecord(MEMBERSHIP_COLLECTION, {
        $type: MEMBERSHIP_COLLECTION,
        orgRkey: org.rkey,
        orgService: pds.getService(),
        orgFounderDid: org.org.founderDid,
        memberDid: inviteeDid,
        memberHandle: input.startsWith("did:") ? undefined : input,
        tierName: inviteTier,
        invitedBy: vault.session.did,
        createdAt: new Date().toISOString(),
      });

      const rkey = membershipRes.uri.split("/").pop()!;
      const newMembership: MembershipRecord = {
        rkey,
        membership: {
          orgRkey: org.rkey,
          orgService: pds.getService(),
          orgFounderDid: org.org.founderDid,
          memberDid: inviteeDid,
          memberHandle: input.startsWith("did:") ? undefined : input,
          tierName: inviteTier,
          invitedBy: vault.session.did,
          createdAt: new Date().toISOString(),
        },
      };

      onMembershipsChanged([...memberships, newMembership]);
      setSuccess(`Invited ${input.startsWith("did:") ? inviteeDid : `@${input}`} as ${inviteTier}`);
      setInviteHandle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (m: MembershipRecord) => {
    if (m.membership.memberDid === org.org.founderDid) return; // can't remove founder
    if (!confirm(`Remove ${m.membership.memberHandle ?? m.membership.memberDid}?`)) return;
    setLoading(true);
    try {
      await pds.deleteRecord(MEMBERSHIP_COLLECTION, m.rkey);
      onMembershipsChanged(memberships.filter((x) => x.rkey !== m.rkey));
      setSuccess("Member removed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setSuccess("Invite link copied!");
      setTimeout(() => setSuccess(""), 2000);
    });
  };

  return (
    <div className="org-detail">
      <h2>
        <button className="back-btn" onClick={onBack}>&larr;</button>
        {org.org.name}
      </h2>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="status-msg success">{success}</div>}

      {/* Tiers */}
      <div className="section">
        <h3>Tiers</h3>
        <div className="tier-list">
          {sortedTiers.map((t) => (
            <div key={t.name} className="tier-row">
              <span className="tier-badge">{t.name}</span>
              <span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>Level {t.level}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Members */}
      <div className="section">
        <h3>Members ({memberships.length})</h3>
        {memberships.map((m) => (
          <div key={m.rkey} className="member-row">
            <div>
              <div>{m.membership.memberHandle ? `@${m.membership.memberHandle}` : m.membership.memberDid}</div>
              <div className="member-did">
                {m.membership.memberDid === org.org.founderDid ? "Founder" : m.membership.memberDid}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="tier-badge">{m.membership.tierName}</span>
              {isFounder && m.membership.memberDid !== org.org.founderDid && (
                <button
                  className="btn-danger btn-sm"
                  onClick={() => handleRemoveMember(m)}
                  disabled={loading}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Invite */}
      {isFounder && (
        <div className="section">
          <h3>Invite Member</h3>
          <div className="invite-form">
            <input
              placeholder="handle or DID"
              value={inviteHandle}
              onChange={(e) => setInviteHandle(e.target.value)}
            />
            <select value={inviteTier} onChange={(e) => setInviteTier(e.target.value)}>
              {sortedTiers.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <button className="btn-primary" style={{ width: "auto" }} onClick={handleInvite} disabled={loading}>
              {loading ? "Inviting..." : "Invite"}
            </button>
          </div>

          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Invite Link</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: 8 }}>
              Share this link with new users. They'll be guided through vault setup and org joining.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                readOnly
                value={inviteLink}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  color: "var(--text-dim)",
                  fontSize: "0.8rem",
                }}
              />
              <button className="btn-secondary btn-sm" onClick={copyInviteLink}>
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
