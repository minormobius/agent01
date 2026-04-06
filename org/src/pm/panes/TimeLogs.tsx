/**
 * TimeLogs pane — log hours against tasks, view summaries.
 */

import { useState, useMemo } from "react";
import type { ProjectActions } from "../useProject";

interface Props {
  project: ProjectActions;
}

export function TimeLogs({ project }: Props) {
  const { state, addTimeEntry, deleteTimeEntry } = project;
  const entries = state.timeEntries || [];

  const [taskId, setTaskId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [groupBy, setGroupBy] = useState<"task" | "member" | "date">("task");

  const taskMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of state.tasks) m.set(t.id, t.name);
    return m;
  }, [state.tasks]);

  const memberMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of state.members) m.set(mem.id, mem.displayName);
    return m;
  }, [state.members]);

  // Grouped summaries
  const grouped = useMemo(() => {
    const groups = new Map<string, { label: string; totalHours: number; entries: typeof entries }>();

    for (const e of entries) {
      let key: string;
      let label: string;
      if (groupBy === "task") {
        key = e.taskId;
        label = taskMap.get(e.taskId) || e.taskId;
      } else if (groupBy === "member") {
        key = e.memberId;
        label = memberMap.get(e.memberId) || e.memberId;
      } else {
        key = e.date;
        label = e.date;
      }

      const existing = groups.get(key);
      if (existing) {
        existing.totalHours += e.hours;
        existing.entries.push(e);
      } else {
        groups.set(key, { label, totalHours: e.hours, entries: [e] });
      }
    }

    return Array.from(groups.values()).sort((a, b) => b.totalHours - a.totalHours);
  }, [entries, groupBy, taskMap, memberMap]);

  const totalHours = entries.reduce((s, e) => s + e.hours, 0);

  const handleAdd = () => {
    if (!taskId || !memberId || !hours) return;
    addTimeEntry({
      taskId,
      memberId,
      date,
      hours: parseFloat(hours),
      notes: notes.trim() || undefined,
    });
    setHours("");
    setNotes("");
  };

  if (state.tasks.length === 0) {
    return (
      <div className="pm-timelog">
        <p style={{ color: "var(--text-dim)", padding: "2rem", textAlign: "center" }}>
          Add tasks first to start logging time.
        </p>
      </div>
    );
  }

  return (
    <div className="pm-timelog">
      <div className="pm-timelog-form">
        <h3>Log Time</h3>
        <div className="pm-timelog-row">
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">Select task...</option>
            {state.tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Who...</option>
            {state.members.map((m) => (
              <option key={m.id} value={m.id}>{m.displayName}</option>
            ))}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input
            type="number"
            step="0.25"
            min="0"
            placeholder="Hours"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            style={{ width: 80 }}
          />
          <input
            type="text"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn-primary btn-sm" onClick={handleAdd} disabled={!taskId || !memberId || !hours}>
            + Log
          </button>
        </div>
      </div>

      <div className="pm-timelog-summary">
        <div className="pm-timelog-stat">
          <span className="pm-timelog-stat-value">{totalHours.toFixed(1)}h</span>
          <span className="pm-timelog-stat-label">Total logged</span>
        </div>
        <div className="pm-timelog-stat">
          <span className="pm-timelog-stat-value">{entries.length}</span>
          <span className="pm-timelog-stat-label">Entries</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Group by:</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as "task" | "member" | "date")}>
            <option value="task">Task</option>
            <option value="member">Member</option>
            <option value="date">Date</option>
          </select>
        </div>
      </div>

      {grouped.length === 0 && (
        <p style={{ color: "var(--text-dim)", padding: "1rem", textAlign: "center" }}>
          No time entries yet. Use the form above to log hours.
        </p>
      )}

      {grouped.map((group, gi) => (
        <div key={gi} className="pm-timelog-group">
          <div className="pm-timelog-group-header">
            <span className="pm-timelog-group-label">{group.label}</span>
            <span className="pm-timelog-group-total">{group.totalHours.toFixed(1)}h</span>
          </div>
          {group.entries.map((e) => (
            <div key={e.id} className="pm-timelog-entry">
              <span className="pm-timelog-entry-date">{e.date}</span>
              {groupBy !== "task" && (
                <span className="pm-timelog-entry-task">{taskMap.get(e.taskId) || "?"}</span>
              )}
              {groupBy !== "member" && (
                <span className="pm-timelog-entry-member">{memberMap.get(e.memberId) || "?"}</span>
              )}
              <span className="pm-timelog-entry-hours">{e.hours}h</span>
              {e.notes && <span className="pm-timelog-entry-notes">{e.notes}</span>}
              <button
                className="pm-timelog-delete"
                onClick={() => deleteTimeEntry(e.id)}
                title="Delete"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
