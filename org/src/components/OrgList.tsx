import type { OrgRecord } from "../types";

interface Props {
  orgs: OrgRecord[];
  myDid: string;
  onSelect: (org: OrgRecord) => void;
  onCreate: () => void;
}

export function OrgList({ orgs, myDid, onSelect, onCreate }: Props) {
  const myOrgs = orgs.filter((o) => o.org.founderDid === myDid);
  const memberOrgs = orgs.filter((o) => o.org.founderDid !== myDid);

  return (
    <div className="org-selector">
      <h2>Organizations</h2>

      {orgs.length === 0 && (
        <p style={{ color: "var(--text-dim)", marginBottom: 12 }}>
          No organizations yet. Create one to get started.
        </p>
      )}

      <div className="org-list">
        {myOrgs.map((o) => (
          <div key={o.rkey} className="org-item" onClick={() => onSelect(o)}>
            <div>
              <div className="org-name">{o.org.name}</div>
              <div className="org-meta">Founded by you &middot; {o.org.tiers.length} tiers</div>
            </div>
            <span className="tier-badge">founder</span>
          </div>
        ))}
        {memberOrgs.map((o) => (
          <div key={o.rkey} className="org-item" onClick={() => onSelect(o)}>
            <div>
              <div className="org-name">{o.org.name}</div>
              <div className="org-meta">Member</div>
            </div>
            <span className="tier-badge">member</span>
          </div>
        ))}
      </div>

      <div className="org-actions">
        <button className="btn-primary" style={{ width: "auto" }} onClick={onCreate}>
          Create Organization
        </button>
      </div>
    </div>
  );
}
