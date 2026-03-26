/**
 * Wave org picker — select which org to open Wave for.
 */

import type { OrgRecord } from "../../types";

interface Props {
  orgs: OrgRecord[];
  myDid: string;
  loading: boolean;
  onSelectOrg: (org: OrgRecord) => void;
  onCreateOrg: (name: string, tierNames: string[]) => void;
  onBack: () => void;
}

export function OrgPicker({ orgs, loading, onSelectOrg, onCreateOrg, onBack }: Props) {
  return (
    <div className="wave-org-picker">
      <div className="wave-org-picker-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <button className="btn-icon" onClick={onBack} title="Back to hub">
            &larr;
          </button>
          <h1>Wave</h1>
        </div>
        <p className="wave-subtitle">Choose an organization</p>
        {loading ? (
          <p className="wave-empty">Loading orgs...</p>
        ) : orgs.length === 0 ? (
          <p className="wave-empty">No orgs yet. Create one from the hub.</p>
        ) : (
          <div className="wave-org-list">
            {orgs.map((o) => (
              <button key={o.rkey} className="wave-org-item" onClick={() => onSelectOrg(o)}>
                <span className="wave-org-name">{o.org.name}</span>
                <span className="wave-org-tiers">{o.org.tiers.map((t) => t.name).join(", ")}</span>
              </button>
            ))}
          </div>
        )}
        <button
          className="btn-secondary"
          style={{ width: "100%", marginTop: 16 }}
          onClick={() => {
            const name = prompt("Organization name:");
            if (!name) return;
            const tiersStr = prompt("Tier names (comma-separated, lowest to highest):", "member, admin");
            if (!tiersStr) return;
            const tierNames = tiersStr
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (tierNames.length > 0) onCreateOrg(name, tierNames);
          }}
        >
          + New Organization
        </button>
      </div>
    </div>
  );
}
