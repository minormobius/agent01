/**
 * Kanban pane — lane-based workflow board with drag-drop, inline controls.
 */

import { useRef, useCallback, useState } from "react";
import type { ProjectActions } from "../useProject";
import type { Task } from "../types";
import { isParentTask, syncTaskToLane } from "../engine";

interface Props {
  project: ProjectActions;
}

export function Kanban({ project }: Props) {
  const { state, updateTask } = project;
  const { tasks, kanbanLanes, members } = state;
  const dragTaskRef = useRef<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const leafTasks = tasks.filter((t) => !isParentTask(tasks, t.id));

  const handleDragStart = useCallback((taskId: string) => {
    dragTaskRef.current = taskId;
  }, []);

  const handleDrop = useCallback(
    (laneId: string) => {
      const taskId = dragTaskRef.current;
      dragTaskRef.current = null;
      if (!taskId) return;

      const lane = kanbanLanes.find((l) => l.id === laneId);
      if (!lane) return;

      // Sync lane → task state
      const updates: Partial<Task> = { kanbanLane: laneId };
      if (lane.role === "done") {
        updates.percentComplete = 100;
        updates.reviewed = true;
        updates.queued = true;
      } else if (lane.role === "review") {
        updates.percentComplete = 100;
        updates.reviewed = false;
        updates.queued = true;
      } else if (lane.role === "active") {
        updates.queued = true;
        if (updates.percentComplete === undefined) {
          const t = tasks.find((x) => x.id === taskId);
          if (t && t.percentComplete === 0) updates.percentComplete = 5;
        }
      } else if (lane.role === "queued") {
        updates.queued = true;
      } else if (lane.role === "backlog") {
        updates.queued = false;
        updates.reviewed = false;
      }

      updateTask(taskId, updates);
    },
    [kanbanLanes, tasks, updateTask],
  );

  return (
    <div className="kanban-board">
      {kanbanLanes.map((lane) => {
        const laneTasks = leafTasks.filter((t) => {
          const laneId = t.kanbanLane || syncTaskToLane(t, kanbanLanes);
          return laneId === lane.id;
        });

        return (
          <div
            key={lane.id}
            className="kanban-lane"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(lane.id)}
          >
            <div className="kanban-lane-header">
              <span className="kanban-lane-name">{lane.name}</span>
              <span className="kanban-lane-count">{laneTasks.length}</span>
            </div>
            <div className="kanban-lane-body">
              {laneTasks.map((t) => {
                const member = members.find((m) => m.id === t.assigneeId);
                const isExpanded = expandedCard === t.id;

                return (
                  <div
                    key={t.id}
                    className="kanban-card"
                    draggable
                    onDragStart={() => handleDragStart(t.id)}
                    onClick={() => setExpandedCard(isExpanded ? null : t.id)}
                  >
                    <div className="kanban-card-top">
                      <div className="kanban-card-name">{t.name}</div>
                      <div className="kanban-card-flags">
                        {t.queued && <span className="kanban-flag kanban-flag-q" title="Queued">Q</span>}
                        {t.reviewed && <span className="kanban-flag kanban-flag-r" title="Reviewed">R</span>}
                      </div>
                    </div>
                    <div className="kanban-card-meta">
                      <span>{t.percentComplete}%</span>
                      {t.plannedCost > 0 && <span>${t.plannedCost}</span>}
                      {member && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: member.color,
                              display: "inline-block",
                            }}
                          />
                          {member.displayName}
                        </span>
                      )}
                    </div>
                    <div className="kanban-card-bar">
                      <div
                        className="kanban-card-bar-fill"
                        style={{
                          width: `${t.percentComplete}%`,
                          background:
                            t.percentComplete >= 100 ? "var(--success)" : "var(--accent)",
                        }}
                      />
                    </div>

                    {/* Expanded inline controls */}
                    {isExpanded && (
                      <div className="kanban-card-expanded" onClick={(e) => e.stopPropagation()}>
                        <div className="kanban-card-field">
                          <label>Progress</label>
                          <div className="kanban-card-field-row">
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={t.percentComplete}
                              onChange={(e) =>
                                updateTask(t.id, { percentComplete: parseInt(e.target.value) })
                              }
                              className="kanban-range"
                            />
                            <span className="kanban-range-val">{t.percentComplete}%</span>
                          </div>
                        </div>
                        <div className="kanban-card-field">
                          <label>Actual Cost</label>
                          <input
                            type="number"
                            min={0}
                            value={t.actualCost}
                            onChange={(e) =>
                              updateTask(t.id, { actualCost: parseFloat(e.target.value) || 0 })
                            }
                            className="task-inline-input"
                          />
                        </div>
                        <div className="kanban-card-checks">
                          <label className={`task-check${t.queued ? " checked" : ""}`}>
                            <input
                              type="checkbox"
                              checked={t.queued}
                              onChange={(e) => updateTask(t.id, { queued: e.target.checked })}
                            />
                            Queued
                          </label>
                          <label className={`task-check${t.reviewed ? " checked" : ""}`}>
                            <input
                              type="checkbox"
                              checked={t.reviewed}
                              onChange={(e) => updateTask(t.id, { reviewed: e.target.checked })}
                            />
                            Reviewed
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
