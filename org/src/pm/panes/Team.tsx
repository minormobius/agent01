/**
 * Team pane — member roster with CRUD, roles, cost rates, capacity.
 * When an org is selected, shows org members and lets you import them.
 */

import { useState } from "react";
import type { ProjectActions } from "../useProject";
import type { MembershipRecord, OrgRecord } from "../../types";

interface Props {
  project: ProjectActions;
  orgMembers?: MembershipRecord[];
  selectedOrg?: OrgRecord | null;
}

export function Team({ project, orgMembers = [], selectedOrg }: Props) {
  const { state, addMember, removeMember, updateMember } = project;

  // Org members not yet in the project team (matched by DID)
  const existingDids = new Set(state.members.filter((m) => m.did).map((m) => m.did));
  const unimported = orgMembers.filter(
    (m) => !existingDids.has(m.membership.memberDid),
  );

  const importOrgMember = (m: MembershipRecord) => {
    addMember({
      displayName: m.membership.memberHandle ?? m.membership.memberDid.slice(0, 20),
      role: m.membership.tierName,
      costRate: 0,
      maxHoursPerWeek: 40,
      handle: m.membership.memberHandle ?? null,
      did: m.membership.memberDid,
    });
  };

  const importAll = () => {
    for (const m of unimported) {
      importOrgMember(m);
    }
  };

  return (
    <div className="pm-team">
      {/* Org member import section */}
      {selectedOrg && orgMembers.length > 0 && (
        <div className="team-org-import">
          <div className="team-org-import-header">
            <h3>{selectedOrg.org.name} Members</h3>
            {unimported.length > 0 && (
              <button className="btn-primary btn-sm" onClick={importAll}>
                Import All ({unimported.length})
              </button>
            )}
          </div>
          {unimported.length === 0 ? (
            <p className="pm-empty" style={{ marginBottom: 0 }}>
              All org members are on the project team.
            </p>
          ) : (
            <div className="team-org-members">
              {unimported.map((m) => (
                <div key={m.rkey} className="team-org-member">
                  <div className="team-org-member-info">
                    <span className="team-org-member-name">
                      {m.membership.memberHandle
                        ? `@${m.membership.memberHandle}`
                        : m.membership.memberDid.slice(0, 24) + "..."}
                    </span>
                    <span className="tier-badge">{m.membership.tierName}</span>
                  </div>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => importOrgMember(m)}
                  >
                    Import
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AddMemberForm
        onAdd={addMember}
        orgTierNames={selectedOrg?.org.tiers.map((t) => t.name)}
      />

      <div className="team-roster">
        {state.members.length === 0 && (
          <div className="pm-empty">No team members yet.</div>
        )}
        {state.members.map((m) => {
          const assigned = state.tasks.filter((t) => t.assigneeId === m.id);
          const totalCost = assigned.reduce((s, t) => s + t.plannedCost, 0);

          return (
            <div key={m.id} className="team-card">
              <div className="team-card-header">
                <div
                  className="team-color-dot"
                  style={{ background: m.color }}
                />
                <div className="team-card-name">{m.displayName}</div>
                <input
                  className="task-inline-input team-role-input"
                  value={m.role}
                  onChange={(e) => updateMember(m.id, { role: e.target.value })}
                  title="Role"
                />
              </div>
              <div className="team-card-body">
                <div className="team-stat">
                  <span className="team-stat-label">Cost rate</span>
                  <input
                    type="number"
                    className="task-inline-input"
                    value={m.costRate}
                    min={0}
                    onChange={(e) =>
                      updateMember(m.id, { costRate: parseFloat(e.target.value) || 0 })
                    }
                  />
                  <span className="team-stat-unit">/hr</span>
                </div>
                <div className="team-stat">
                  <span className="team-stat-label">Capacity</span>
                  <input
                    type="number"
                    className="task-inline-input"
                    value={m.maxHoursPerWeek}
                    min={0}
                    onChange={(e) =>
                      updateMember(m.id, { maxHoursPerWeek: parseFloat(e.target.value) || 0 })
                    }
                  />
                  <span className="team-stat-unit">hr/wk</span>
                </div>
                <div className="team-stat">
                  <span className="team-stat-label">Tasks</span>
                  <span>{assigned.length}</span>
                </div>
                <div className="team-stat">
                  <span className="team-stat-label">Budget</span>
                  <span>{totalCost.toLocaleString()}</span>
                </div>
                {m.handle && (
                  <div className="team-stat">
                    <span className="team-stat-label">Handle</span>
                    <span style={{ color: "var(--accent)" }}>@{m.handle}</span>
                  </div>
                )}
                {m.did && (
                  <div className="team-stat">
                    <span className="team-stat-label">DID</span>
                    <span className="member-did">{m.did}</span>
                  </div>
                )}
              </div>
              <div className="team-card-actions">
                <button className="btn-danger btn-sm" onClick={() => removeMember(m.id)}>
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddMemberForm({
  onAdd,
  orgTierNames,
}: {
  onAdd: (opts: {
    displayName: string;
    role: string;
    costRate: number;
    maxHoursPerWeek: number;
  }) => void;
  orgTierNames?: string[];
}) {
  const roles = orgTierNames && orgTierNames.length > 0
    ? orgTierNames
    : ["Engineer", "Designer", "Manager", "Analyst", "QA", "Contractor"];

  const [name, setName] = useState("");
  const [role, setRole] = useState(roles[0]);
  const [rate, setRate] = useState("");
  const [hours, setHours] = useState("40");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      displayName: name.trim(),
      role,
      costRate: parseFloat(rate) || 0,
      maxHoursPerWeek: parseFloat(hours) || 40,
    });
    setName("");
    setRate("");
  };

  return (
    <form className="task-add-form" onSubmit={handleSubmit}>
      <input
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="task-input task-input-name"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="task-input task-input-sm"
      >
        {roles.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <input
        placeholder="$/hr"
        type="number"
        min="0"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        className="task-input task-input-sm"
      />
      <input
        placeholder="hr/wk"
        type="number"
        min="0"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        className="task-input task-input-sm"
      />
      <button type="submit" className="btn-primary btn-sm">
        Add
      </button>
    </form>
  );
}
