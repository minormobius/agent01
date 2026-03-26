import { useState } from "react";
import type { PdsClient } from "../pds";
import {
  generateTierDek,
  wrapDekForMember,
  exportPublicKey,
  toBase64,
} from "../crypto";
import type { OrgRecord, Org, TierDef, Keyring } from "../types";

const ORG_COLLECTION = "com.minomobi.vault.org";
const MEMBERSHIP_COLLECTION = "com.minomobi.vault.membership";
const KEYRING_COLLECTION = "com.minomobi.vault.keyring";

interface Props {
  pds: PdsClient;
  myDid: string;
  myPrivateKey: CryptoKey;
  myPublicKey: CryptoKey;
  onCreated: (org: OrgRecord) => void;
  onCancel: () => void;
}

export function CreateOrg({ pds, myDid, myPrivateKey, myPublicKey, onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [tiers, setTiers] = useState<TierDef[]>([
    { name: "member", level: 0 },
    { name: "manager", level: 1 },
    { name: "admin", level: 2 },
  ]);
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
    if (!name.trim()) return;
    if (tiers.length === 0) {
      setError("At least one tier is required");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const org: Org = {
        name: name.trim(),
        founderDid: myDid,
        tiers: tiers.map((t, i) => ({ ...t, level: i })),
        createdAt: new Date().toISOString(),
      };

      const orgRes = await pds.createRecord(ORG_COLLECTION, { $type: ORG_COLLECTION, ...org });
      const orgRkey = orgRes.uri.split("/").pop()!;

      // Generate a DEK for each tier, wrap for founder
      const myPubRaw = await exportPublicKey(myPublicKey);
      const myPubB64 = toBase64(myPubRaw);

      for (const tier of org.tiers) {
        const tierDek = await generateTierDek();
        const wrapped = await wrapDekForMember(tierDek, myPrivateKey, myPublicKey);

        const keyring: Keyring & { $type: string } = {
          $type: KEYRING_COLLECTION,
          orgRkey,
          tierName: tier.name,
          epoch: 0,
          writerDid: myDid,
          writerPublicKey: myPubB64,
          members: [{ did: myDid, wrappedDek: toBase64(wrapped) }],
        };

        await pds.putRecord(KEYRING_COLLECTION, `${orgRkey}:${tier.name}`, keyring);
      }

      // Founder membership at highest tier
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
    <div className="form-panel">
      <h2>Create Organization</h2>
      <form onSubmit={handleCreate}>
        <div className="field">
          <label htmlFor="org-name">Organization Name</label>
          <input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Org"
            required
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: 8 }}>
            Tiers (lowest → highest access)
          </label>
          <div className="tier-list">
            {tiers.map((t, i) => (
              <div key={i} className="tier-row">
                <input value={t.name} readOnly style={{ flex: 1 }} />
                <span className="tier-level" style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
                  L{t.level}
                </span>
                <button type="button" className="btn-danger btn-sm" onClick={() => removeTier(i)}>
                  &times;
                </button>
              </div>
            ))}
          </div>
          <div className="tier-row" style={{ marginTop: 8 }}>
            <input
              placeholder="New tier name"
              value={newTierName}
              onChange={(e) => setNewTierName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn-secondary btn-sm" onClick={addTier}>
              Add
            </button>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="form-actions">
          <button className="btn-primary" type="submit" disabled={saving} style={{ flex: 1 }}>
            {saving ? "Creating..." : "Create"}
          </button>
          <button className="btn-secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
