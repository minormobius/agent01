/**
 * Resources pane — stacked bar chart (per-member-per-week hours) + utilization summary.
 */

import { useRef, useEffect } from "react";
import type { ProjectActions } from "../useProject";
import { getLeafTasks } from "../engine";

interface Props {
  project: ProjectActions;
}

export function Resources({ project }: Props) {
  const { state } = project;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { tasks, members } = state;

  const leaves = getLeafTasks(tasks);
  const assignedMembers = members.filter((m) => leaves.some((t) => t.assigneeId === m.id));

  // Compute weekly buckets
  const starts = leaves.map((t) => new Date(t.plannedStart).getTime());
  const ends = leaves.map((t) => new Date(t.plannedEnd).getTime());
  const tMin = leaves.length ? Math.min(...starts) : Date.now();
  const tMax = leaves.length ? Math.max(...ends) : Date.now();
  const WEEK_MS = 7 * 86400000;

  const weeks: number[] = [];
  for (let w = tMin; w < tMax + WEEK_MS; w += WEEK_MS) {
    weeks.push(w);
  }

  // memberHours[weekIdx][memberId] = hours
  const memberHours: Record<number, Record<string, number>> = {};
  weeks.forEach((_, wi) => {
    memberHours[wi] = {};
  });

  for (const t of leaves) {
    if (!t.assigneeId) continue;
    const ts = new Date(t.plannedStart).getTime();
    const te = new Date(t.plannedEnd).getTime();
    const taskDur = Math.max(te - ts, 1);

    for (let wi = 0; wi < weeks.length; wi++) {
      const ws = weeks[wi];
      const we = ws + WEEK_MS;
      const overlapStart = Math.max(ts, ws);
      const overlapEnd = Math.min(te, we);
      if (overlapEnd <= overlapStart) continue;

      const frac = (overlapEnd - overlapStart) / taskDur;
      const hours = t.duration * frac;
      memberHours[wi][t.assigneeId] = (memberHours[wi][t.assigneeId] || 0) + hours;
    }
  }

  // Max capacity
  const maxCap = assignedMembers.length
    ? Math.max(...assignedMembers.map((m) => m.maxHoursPerWeek))
    : 40;

  // Find max hours in any week
  let maxHours = maxCap;
  for (let wi = 0; wi < weeks.length; wi++) {
    let total = 0;
    for (const mid of Object.keys(memberHours[wi])) {
      total += memberHours[wi][mid];
    }
    maxHours = Math.max(maxHours, total);
  }
  const yMax = maxHours * 1.1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || weeks.length === 0 || assignedMembers.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.clearRect(0, 0, W, H);

    const pad = { t: 20, r: 16, b: 32, l: 48 };
    const chartW = W - pad.l - pad.r;
    const chartH = H - pad.t - pad.b;
    const barW = Math.max((chartW / weeks.length) * 0.8, 4);
    const gap = (chartW / weeks.length) * 0.2;

    // Axes
    ctx.strokeStyle = "#2a2a3e";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + chartH);
    ctx.lineTo(pad.l + chartW, pad.t + chartH);
    ctx.stroke();

    // Y labels
    ctx.fillStyle = "#8888a0";
    ctx.font = "10px system-ui";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const v = (yMax * i) / 4;
      const y = pad.t + chartH - (v / yMax) * chartH;
      ctx.fillText(Math.round(v).toString(), pad.l - 4, y + 3);
    }

    // Stacked bars
    for (let wi = 0; wi < weeks.length; wi++) {
      const x = pad.l + (wi / weeks.length) * chartW + gap / 2;
      let stackY = pad.t + chartH;

      for (const m of assignedMembers) {
        const h = memberHours[wi][m.id] || 0;
        if (h <= 0) continue;
        const barH = (h / yMax) * chartH;
        stackY -= barH;
        ctx.fillStyle = m.color + "cc"; // 80% opacity
        ctx.fillRect(x, stackY, barW, barH);
      }
    }

    // Capacity line
    if (maxCap > 0) {
      const capY = pad.t + chartH - (maxCap / yMax) * chartH;
      ctx.strokeStyle = "#f0883e";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, capY);
      ctx.lineTo(pad.l + chartW, capY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [tasks, members, weeks, assignedMembers, memberHours, yMax, maxCap]);

  if (leaves.length === 0 || assignedMembers.length === 0) {
    return (
      <div className="pm-empty">
        Assign team members to tasks to see resource loading.
      </div>
    );
  }

  // Utilization summary
  const summaryRows = assignedMembers.map((m) => {
    let totalHours = 0;
    let peakHours = 0;
    let weekCount = 0;
    for (let wi = 0; wi < weeks.length; wi++) {
      const h = memberHours[wi][m.id] || 0;
      totalHours += h;
      peakHours = Math.max(peakHours, h);
      if (h > 0) weekCount++;
    }
    const avgHours = weekCount > 0 ? totalHours / weekCount : 0;
    const utilization = m.maxHoursPerWeek > 0 ? (avgHours / m.maxHoursPerWeek) * 100 : 0;
    const overloaded = peakHours > m.maxHoursPerWeek;

    return { member: m, avgHours, peakHours, utilization, overloaded };
  });

  return (
    <div className="resources-pane">
      <div className="scurve-canvas-wrap">
        <canvas ref={canvasRef} className="scurve-canvas" />
      </div>

      {/* Legend */}
      <div className="scurve-legend">
        {assignedMembers.map((m) => (
          <div key={m.id} className="scurve-legend-item">
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: m.color,
                display: "inline-block",
              }}
            />
            <span>{m.displayName}</span>
          </div>
        ))}
        <div className="scurve-legend-item">
          <svg width="20" height="10">
            <line x1="0" y1="5" x2="20" y2="5" stroke="#f0883e" strokeWidth="1.5" strokeDasharray="4 2" />
          </svg>
          <span>Capacity</span>
        </div>
      </div>

      {/* Utilization table */}
      <div className="section" style={{ marginTop: 16 }}>
        <h3>Utilization</h3>
        <div className="forecast-table">
          {summaryRows.map((r) => (
            <div key={r.member.id} className="pm-forecast-row">
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: r.member.color,
                    display: "inline-block",
                  }}
                />
                {r.member.displayName}
              </span>
              <span>
                {r.utilization.toFixed(0)}% avg &middot; {r.peakHours.toFixed(0)}h peak
                {r.overloaded && (
                  <span style={{ color: "var(--warning)", marginLeft: 6 }}>{"\u26A0"} overload</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
