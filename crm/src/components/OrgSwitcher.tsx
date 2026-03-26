import type { OrgRecord, OrgContext, OrgFilter } from "../types";

interface Props {
  orgs: OrgRecord[];
  filterOrg: OrgFilter;
  onFilterChange: (filter: OrgFilter) => void;
  onManageOrgs: () => void;
  activeOrg: OrgContext | null;
}

export function OrgSwitcher({
  orgs,
  filterOrg,
  onFilterChange,
  onManageOrgs,
  activeOrg,
}: Props) {
  return (
    <div className="org-switcher">
      <select
        className="org-select"
        value={filterOrg}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__manage__") onManageOrgs();
          else onFilterChange(v as OrgFilter);
        }}
      >
        <option value="all">All Deals</option>
        <option value="personal">Personal Vault</option>
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
