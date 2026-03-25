/**
 * Tasks pane — tree list with inline editing, deps, assignment, add form.
 */

import { useState } from "react";
import type { ProjectActions } from "../useProject";
import type { Task } from "../types";
import {
  fmtDuration,
  getTreeOrder,
  getDepth,
  isParentTask,
  isHiddenByCollapse,
} from "../engine";

interface Props {
  project: ProjectActions;
}

export function Tasks({ project }: Props) {
  const { state, deleteTask, updateTask, assignTask, addDep, removeDep, toggleCollapse } =
    project;

  return (
    <div className="pm-tasks">
      <AddTaskForm project={project} />
      <TaskList
        state={state}
        onUpdate={updateTask}
        onDelete={deleteTask}
        onAssign={assignTask}
        onAddDep={addDep}
        onRemoveDep={removeDep}
        onToggleCollapse={toggleCollapse}
      />
    </div>
  );
}

// ── Add Task Form ──

function AddTaskForm({ project }: { project: ProjectActions }) {
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [duration, setDuration] = useState("");
  const [startDate, setStartDate] = useState("");
  const [parentId, setParentId] = useState("");
  const [predIds, setPredIds] = useState<string[]>([]);

  const { state, addTask } = project;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addTask({
      name: name.trim(),
      plannedCost: parseFloat(cost) || 0,
      durationStr: duration || "5d",
      startDate: startDate || undefined,
      parentId: parentId || null,
      predecessorIds: predIds.length ? predIds : undefined,
    });
    setName("");
    setCost("");
    setDuration("");
    setStartDate("");
    setPredIds([]);
  };

  return (
    <form className="task-add-form" onSubmit={handleSubmit}>
      <input
        placeholder="Task name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="task-input task-input-name"
      />
      <input
        placeholder="Cost"
        type="number"
        min="0"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        className="task-input task-input-sm"
      />
      <input
        placeholder="Duration (e.g. 2w3d)"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        className="task-input task-input-sm"
      />
      <input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        className="task-input task-input-sm"
      />
      <select
        value={parentId}
        onChange={(e) => setParentId(e.target.value)}
        className="task-input task-input-sm"
      >
        <option value="">No parent</option>
        {state.tasks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <select
        multiple
        value={predIds}
        onChange={(e) => setPredIds(Array.from(e.target.selectedOptions, (o) => o.value))}
        className="task-input task-input-sm"
        title="Predecessors (ctrl-click)"
      >
        {state.tasks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button type="submit" className="btn-primary btn-sm">
        Add
      </button>
    </form>
  );
}

// ── Task List (tree) ──

function TaskList({
  state,
  onUpdate,
  onDelete,
  onAssign,
  onAddDep,
  onRemoveDep,
  onToggleCollapse,
}: {
  state: ProjectActions["state"];
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onAssign: (taskId: string, memberId: string | null) => void;
  onAddDep: (from: string, to: string) => void;
  onRemoveDep: (from: string, to: string) => void;
  onToggleCollapse: (id: string) => void;
}) {
  const { tasks, deps, collapsed, members } = state;

  if (tasks.length === 0) {
    return <div className="pm-empty">No tasks yet. Add one above.</div>;
  }

  const treeOrder = getTreeOrder(tasks);
  const visible = treeOrder.filter((t) => !isHiddenByCollapse(tasks, t, collapsed));

  return (
    <div className="task-list">
      {visible.map((t) => {
        const depth = getDepth(tasks, t);
        const isP = isParentTask(tasks, t.id);
        const isCol = collapsed.includes(t.id);
        const taskDeps = deps.filter((d) => d.to === t.id);
        const dur = t.duration
          ? fmtDuration(t.duration)
          : Math.ceil(
              (new Date(t.plannedEnd).getTime() - new Date(t.plannedStart).getTime()) / 86400000,
            ) + "d";

        return (
          <div
            key={t.id}
            className={`task-row${isP ? " task-row-parent" : ""}`}
            style={{ paddingLeft: depth * 16 + 8 }}
          >
            <div className="task-name-col">
              {isP && (
                <span className="task-toggle" onClick={() => onToggleCollapse(t.id)}>
                  {isCol ? "\u25B6" : "\u25BC"}
                </span>
              )}
              <span className={isP ? "task-name-parent" : ""}>{t.name}</span>
              <span className="task-meta">
                {dur} &middot; {t.plannedStart}
                {!isP && (
                  <>
                    {" "}
                    &middot; Cost: {t.plannedCost} &middot; Actual:{" "}
                    <input
                      type="number"
                      className="task-inline-input"
                      value={t.actualCost}
                      min={0}
                      onChange={(e) =>
                        onUpdate(t.id, { actualCost: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </>
                )}
              </span>
              {taskDeps.length > 0 && (
                <div className="task-deps">
                  {taskDeps.map((d) => {
                    const pred = tasks.find((x) => x.id === d.from);
                    if (!pred) return null;
                    return (
                      <span key={d.from} className="dep-tag">
                        {pred.name}
                        <button
                          className="dep-remove"
                          onClick={() => onRemoveDep(d.from, t.id)}
                        >
                          &times;
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="task-bar-col">
              <div className="task-bar">
                <div
                  className="task-bar-fill"
                  style={{
                    width: `${t.percentComplete}%`,
                    background:
                      t.percentComplete >= 100
                        ? "var(--success)"
                        : t.percentComplete > 0
                          ? "var(--accent)"
                          : "var(--border)",
                  }}
                />
              </div>
            </div>

            <div className="task-pct-col">
              {isP ? (
                <span>{t.percentComplete}%</span>
              ) : (
                <>
                  <input
                    type="number"
                    className="task-inline-input task-pct-input"
                    value={t.percentComplete}
                    min={0}
                    max={100}
                    onChange={(e) =>
                      onUpdate(t.id, {
                        percentComplete: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)),
                      })
                    }
                  />
                  %
                </>
              )}
            </div>

            <div className="task-actions-col">
              {!isP && (
                <select
                  className="task-inline-select"
                  value={t.assigneeId || ""}
                  onChange={(e) => onAssign(t.id, e.target.value || null)}
                >
                  <option value="">{"\uD83D\uDC64"}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              )}
              {!isP && (
                <select
                  className="task-inline-select"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) onAddDep(e.target.value, t.id);
                    e.target.value = "";
                  }}
                >
                  <option value="">+dep</option>
                  {tasks
                    .filter(
                      (x) => x.id !== t.id && !deps.some((d) => d.from === x.id && d.to === t.id),
                    )
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              )}
              <button
                className="btn-danger btn-sm"
                onClick={() => onDelete(t.id)}
                title="Delete"
              >
                &times;
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
