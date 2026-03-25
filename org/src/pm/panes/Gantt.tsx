/**
 * Gantt pane — DOM-based interactive chart with drag resize/move, dependency linking.
 */

import { useRef, useEffect, useCallback, useState } from "react";
import type { ProjectActions } from "../useProject";
import type { Task } from "../types";
import {
  getTreeOrder,
  getDepth,
  isParentTask,
  isHiddenByCollapse,
  computeCriticalPath,
  addDateDays,
} from "../engine";

interface Props {
  project: ProjectActions;
}

type DragMode = "move" | "resize-l" | "resize-r";

interface DragState {
  taskId: string;
  mode: DragMode;
  startX: number;
  origStart: string;
  origEnd: string;
  origDur: number;
}

interface LinkState {
  fromId: string;
  startX: number;
  startY: number;
}

const LABEL_W = 120;
const ROW_H = 32;

export function Gantt({ project }: Props) {
  const { state, updateTask, addDep, toggleCollapse } = project;
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const linkRef = useRef<LinkState | null>(null);
  const svgOverlayRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const { tasks, deps, collapsed, members } = state;

  // Compute layout
  const treeOrder = getTreeOrder(tasks);
  const visible = treeOrder.filter((t) => !isHiddenByCollapse(tasks, t, collapsed));
  const taskIdx: Record<string, number> = {};
  visible.forEach((t, i) => {
    taskIdx[t.id] = i;
  });

  const critical = computeCriticalPath(tasks, deps);

  const starts = tasks.map((t) => new Date(t.plannedStart).getTime());
  const ends = tasks.map((t) => new Date(t.plannedEnd).getTime());
  const tMin = tasks.length ? Math.min(...starts) : Date.now();
  const tMax = tasks.length ? Math.max(...ends) : Date.now() + 86400000;
  const tRange = Math.max(tMax - tMin, 86400000);
  const totalDays = Math.ceil(tRange / 86400000);

  const vpWidth = viewportRef.current?.clientWidth ?? 800;
  const barAreaBase = Math.max(vpWidth - LABEL_W, 200);
  const barAreaW = zoom === 0.5 ? barAreaBase : barAreaBase * zoom;
  const innerW = LABEL_W + barAreaW + 40;

  const pxFromTime = (ts: number) => ((ts - tMin) / tRange) * barAreaW;
  const pxToDays = (px: number) => (px / barAreaW) * (tRange / 86400000);

  // ── Drag handlers ──

  const handleDragMove = useCallback(
    (clientX: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaDays = Math.round(pxToDays(clientX - drag.startX));
      if (deltaDays === 0) return;

      const updates: Partial<Task> = {};
      if (drag.mode === "move") {
        updates.plannedStart = addDateDays(drag.origStart, deltaDays);
        updates.plannedEnd = addDateDays(drag.origEnd, deltaDays);
      } else if (drag.mode === "resize-l") {
        const newStart = addDateDays(drag.origStart, deltaDays);
        if (newStart < drag.origEnd) {
          updates.plannedStart = newStart;
          updates.duration = Math.max(
            8,
            (new Date(drag.origEnd).getTime() - new Date(newStart).getTime()) / 3600000,
          );
        }
      } else if (drag.mode === "resize-r") {
        const newEnd = addDateDays(drag.origEnd, deltaDays);
        if (newEnd > drag.origStart) {
          updates.plannedEnd = newEnd;
          updates.duration = Math.max(
            8,
            (new Date(newEnd).getTime() - new Date(drag.origStart).getTime()) / 3600000,
          );
        }
      }
      updateTask(drag.taskId, updates);
    },
    [updateTask, pxToDays],
  );

  const handleDragEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  // ── Link handlers ──

  const handleLinkMove = useCallback((clientX: number, clientY: number) => {
    const link = linkRef.current;
    const svg = svgOverlayRef.current;
    if (!link || !svg) return;
    const line = svg.querySelector("line");
    if (line) {
      line.setAttribute("x2", String(clientX));
      line.setAttribute("y2", String(clientY));
    }
  }, []);

  const handleLinkEnd = useCallback(
    (clientX: number, clientY: number) => {
      const link = linkRef.current;
      linkRef.current = null;
      if (svgOverlayRef.current) {
        svgOverlayRef.current.remove();
        svgOverlayRef.current = null;
      }
      if (!link) return;

      // Find which row the mouse is over
      const el = document.elementFromPoint(clientX, clientY);
      const row = el?.closest("[data-task-id]");
      if (!row) return;
      const toId = row.getAttribute("data-task-id")!;
      if (toId !== link.fromId) {
        addDep(link.fromId, toId);
      }
    },
    [addDep],
  );

  // ── Global mouse/touch listeners ──

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current) handleDragMove(e.clientX);
      if (linkRef.current) handleLinkMove(e.clientX, e.clientY);
    };
    const onMouseUp = (e: MouseEvent) => {
      if (dragRef.current) handleDragEnd();
      if (linkRef.current) handleLinkEnd(e.clientX, e.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (dragRef.current) handleDragMove(t.clientX);
      if (linkRef.current) handleLinkMove(t.clientX, t.clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (dragRef.current) handleDragEnd();
      if (linkRef.current) handleLinkEnd(t.clientX, t.clientY);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [handleDragMove, handleDragEnd, handleLinkMove, handleLinkEnd]);

  // ── Bar interaction starters ──

  const startDrag = (e: React.MouseEvent, taskId: string, mode: DragMode) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    dragRef.current = {
      taskId,
      mode,
      startX: e.clientX,
      origStart: t.plannedStart,
      origEnd: t.plannedEnd,
      origDur: t.duration,
    };
  };

  const startTouchDrag = (e: React.TouchEvent, taskId: string, mode: DragMode) => {
    e.stopPropagation();
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    dragRef.current = {
      taskId,
      mode,
      startX: e.touches[0].clientX,
      origStart: t.plannedStart,
      origEnd: t.plannedEnd,
      origDur: t.duration,
    };
  };

  const startLink = (e: React.MouseEvent, fromId: string) => {
    e.preventDefault();
    e.stopPropagation();
    // Create SVG overlay for the link line
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999";
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(e.clientX));
    line.setAttribute("y1", String(e.clientY));
    line.setAttribute("x2", String(e.clientX));
    line.setAttribute("y2", String(e.clientY));
    line.setAttribute("stroke", "#58a6ff");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-dasharray", "4 3");
    svg.appendChild(line);
    document.body.appendChild(svg);
    svgOverlayRef.current = svg;
    linkRef.current = { fromId, startX: e.clientX, startY: e.clientY };
  };

  // ── Date header ──

  const labelStep = Math.max(1, Math.floor(totalDays / Math.max(Math.floor(barAreaW / 60), 3)));
  const headerDates: { x: number; w: number; label: string }[] = [];
  for (let d = 0; d <= totalDays; d += labelStep) {
    const x = (d / totalDays) * barAreaW;
    const w = (labelStep / totalDays) * barAreaW;
    const dt = new Date(tMin + d * 86400000);
    headerDates.push({ x, w: Math.min(w, barAreaW - x), label: `${dt.getMonth() + 1}/${dt.getDate()}` });
  }

  // ── Today marker ──

  const now = Date.now();
  const showToday = now >= tMin && now <= tMax + 86400000 * 7;
  const todayX = pxFromTime(now);

  // ── Dependency arrows ──

  const svgH = visible.length * ROW_H;
  const arrows: { path: string; head: string }[] = [];
  for (const d of deps) {
    const fi = taskIdx[d.from];
    const ti = taskIdx[d.to];
    if (fi === undefined || ti === undefined) continue;
    const from = visible[fi];
    const to = visible[ti];
    const x1 = LABEL_W + pxFromTime(new Date(from.plannedEnd).getTime());
    const y1 = fi * ROW_H + ROW_H / 2;
    const x2 = LABEL_W + pxFromTime(new Date(to.plannedStart).getTime());
    const y2 = ti * ROW_H + ROW_H / 2;
    const midX = x1 + 8;
    arrows.push({
      path: `M${x1},${y1} L${midX},${y1} L${midX},${y2} L${x2 - 4},${y2}`,
      head: `${x2},${y2} ${x2 - 5},${y2 - 3} ${x2 - 5},${y2 + 3}`,
    });
  }

  if (tasks.length === 0) {
    return <div className="pm-empty">Add tasks to see the Gantt chart</div>;
  }

  return (
    <div className="gantt">
      {/* Zoom controls */}
      <div className="gantt-zoom">
        {[0.5, 1, 2, 4].map((z) => (
          <button
            key={z}
            className={`btn-sm${zoom === z ? " btn-primary" : " btn-secondary"}`}
            onClick={() => setZoom(z)}
          >
            {z === 0.5 ? "Fit" : `${z}x`}
          </button>
        ))}
      </div>

      <div className="gantt-viewport" ref={viewportRef}>
        <div className="gantt-inner" style={{ width: innerW }}>
          {/* Header */}
          <div className="gantt-header">
            <div className="gantt-header-label">Task</div>
            <div className="gantt-header-dates" style={{ width: barAreaW }}>
              {headerDates.map((h, i) => (
                <div
                  key={i}
                  className="gantt-header-date"
                  style={{ position: "absolute", left: h.x, width: h.w }}
                >
                  {h.label}
                </div>
              ))}
            </div>
          </div>

          {/* Rows + arrows + today */}
          <div style={{ position: "relative" }}>
            {showToday && (
              <div
                className="gantt-today"
                style={{ left: LABEL_W + todayX }}
              />
            )}

            <svg
              className="gantt-dep-svg"
              width={innerW}
              height={svgH}
              viewBox={`0 0 ${innerW} ${svgH}`}
            >
              {arrows.map((a, i) => (
                <g key={i}>
                  <path d={a.path} fill="none" stroke="#8b949e" strokeWidth="1" />
                  <polygon points={a.head} fill="#8b949e" />
                </g>
              ))}
            </svg>

            {visible.map((t) => {
              const isCrit = critical.has(t.id);
              const isP = isParentTask(tasks, t.id);
              const depth = getDepth(tasks, t);
              const x1 = pxFromTime(new Date(t.plannedStart).getTime());
              const x2 = pxFromTime(new Date(t.plannedEnd).getTime());
              const barW = Math.max(x2 - x1, 4);
              const fillW = barW * (t.percentComplete / 100);
              const indent = depth * 16;
              const isCol = collapsed.includes(t.id);
              const member = members.find((m) => m.id === t.assigneeId);

              const maxLen = Math.max(6, 16 - depth * 2);
              const label =
                t.name.length > maxLen ? t.name.slice(0, maxLen - 1) + "\u2026" : t.name;

              return (
                <div
                  key={t.id}
                  className={`gantt-row${selectedId === t.id ? " selected" : ""}`}
                  data-task-id={t.id}
                  onClick={() => setSelectedId(selectedId === t.id ? null : t.id)}
                >
                  <div
                    className={`gantt-row-label${isCrit ? " crit" : ""}`}
                    style={{ paddingLeft: 8 + indent }}
                    title={t.name}
                  >
                    {isP && (
                      <span
                        className="collapse-toggle"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapse(t.id);
                        }}
                      >
                        {isCol ? "\u25B6" : "\u25BC"}
                      </span>
                    )}
                    {!isP && depth > 0 && <span style={{ display: "inline-block", width: 14 }} />}
                    {member && (
                      <span
                        style={{
                          display: "inline-block",
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: member.color,
                          marginRight: 3,
                        }}
                        title={member.displayName}
                      />
                    )}
                    {label}
                  </div>
                  <div className="gantt-row-bars" style={{ width: barAreaW }}>
                    {isP ? (
                      <div
                        className="gantt-bar-summary"
                        style={{ left: x1, width: barW }}
                      />
                    ) : (
                      <div
                        className={`gantt-bar gantt-bar-bg${isCrit ? " crit" : ""}`}
                        style={{ left: x1, width: barW }}
                        onMouseDown={(e) => startDrag(e, t.id, "move")}
                        onTouchStart={(e) => startTouchDrag(e, t.id, "move")}
                      >
                        <div
                          className="gantt-handle gantt-handle-l"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            startDrag(e, t.id, "resize-l");
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            startTouchDrag(e, t.id, "resize-l");
                          }}
                        />
                        <div
                          className={`gantt-bar-fill ${isCrit ? "crit" : "normal"}`}
                          style={{ width: fillW }}
                        />
                        <div className="gantt-bar-pct">{t.percentComplete}%</div>
                        <div
                          className="gantt-handle gantt-handle-r"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            startDrag(e, t.id, "resize-r");
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            startTouchDrag(e, t.id, "resize-r");
                          }}
                        />
                        <div
                          className="gantt-link-dot"
                          onMouseDown={(e) => startLink(e, t.id)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
