import type { OrgRecord, OrgContext } from "../types";

interface Props {
  orgs: OrgRecord[];
  activeOrg: OrgContext | null;
  onSwitchToPersonal: () => void;
  onSwitchToOrg: (orgRkey: string) => void;
  onManageOrgs: () => void;
}

export function OrgSwitcher({
  orgs,
  activeOrg,
  onSwitchToPersonal,
  onSwitchToOrg,
  onManageOrgs,
}: Props) {
  const currentLabel = activeOrg
    ? activeOrg.org.org.name
    : "Personal Vault";

  return (
    <div className="org-switcher">
      <select
        className="org-select"
        value={activeOrg ? activeOrg.org.rkey : "__personal__"}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__personal__") onSwitchToPersonal();
          else if (v === "__manage__") onManageOrgs();
          else onSwitchToOrg(v);
        }}
        title={currentLabel}
      >
        <option value="__personal__">Personal Vault</option>
        {orgs.map((org) => (
          <option key={org.rkey} value={org.rkey}>
            {org.org.name}
          </option>
        ))}
        <option value="__manage__">Manage orgs...</option>
      </select>
      {activeOrg && (
        <span className="org-tier-badge">{activeOrg.myTierName}</span>
      )}
    </div>
  );
}
