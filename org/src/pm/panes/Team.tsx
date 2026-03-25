/**
 * Team pane — member roster with CRUD, roles, cost rates, capacity.
 */

import { useState } from "react";
import type { ProjectActions } from "../useProject";

interface Props {
  project: ProjectActions;
}

export function Team({ project }: Props) {
  const { state, addMember, removeMember, updateMember } = project;

  return (
    <div className="pm-team">
      <AddMemberForm onAdd={addMember} />
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
                <span className="tier-badge">{m.role}</span>
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
}: {
  onAdd: (opts: {
    displayName: string;
    role: string;
    costRate: number;
    maxHoursPerWeek: number;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("Engineer");
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
        <option>Engineer</option>
        <option>Designer</option>
        <option>Manager</option>
        <option>Analyst</option>
        <option>QA</option>
        <option>Contractor</option>
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
