/**
 * S-Curve pane — canvas chart with PV/EV/AC curves and baseline overlays.
 */

import { useRef, useEffect } from "react";
import type { ProjectActions } from "../useProject";
import { getLeafTasks } from "../engine";

interface Props {
  project: ProjectActions;
}

export function SCurve({ project }: Props) {
  const { state } = project;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { tasks, baselines, baselineVisible } = state;
  const leaves = getLeafTasks(tasks);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || leaves.length === 0) return;

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

    // Time range
    const starts = leaves.map((t) => new Date(t.plannedStart).getTime());
    const ends = leaves.map((t) => new Date(t.plannedEnd).getTime());
    const projStart = Math.min(...starts);
    const projEnd = Math.max(...ends);
    const totalDays = Math.max(Math.ceil((projEnd - projStart) / 86400000), 1);
    const bac = leaves.reduce((s, t) => s + t.plannedCost, 0);
    const yMax = bac * 1.1 || 1;

    // Helpers
    const xFromDay = (d: number) => pad.l + (d / totalDays) * chartW;
    const yFromVal = (v: number) => pad.t + chartH - (v / yMax) * chartH;

    // Axes
    ctx.strokeStyle = "#2a2a3e";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + chartH);
    ctx.lineTo(pad.l + chartW, pad.t + chartH);
    ctx.stroke();

    // Y grid
    ctx.fillStyle = "#8888a0";
    ctx.font = "10px system-ui";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const v = (yMax * i) / 4;
      const y = yFromVal(v);
      ctx.fillText(Math.round(v).toString(), pad.l - 4, y + 3);
      if (i > 0) {
        ctx.beginPath();
        ctx.setLineDash([2, 3]);
        ctx.moveTo(pad.l, y);
        ctx.lineTo(pad.l + chartW, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Sample curves
    function samplePV(taskList: typeof leaves, day: number): number {
      const sampleTime = projStart + day * 86400000;
      let pv = 0;
      for (const t of taskList) {
        const ps = new Date(t.plannedStart).getTime();
        const pe = new Date(t.plannedEnd).getTime();
        const dur = Math.max(pe - ps, 1);
        const elapsed = Math.max(0, Math.min(sampleTime - ps, dur));
        pv += t.plannedCost * (elapsed / dur);
      }
      return pv;
    }

    const now = Date.now();
    const todayDay = Math.max(0, (now - projStart) / 86400000);
    const maxDay = Math.min(todayDay, totalDays);

    // Build PV, EV, AC arrays
    const pvPts: [number, number][] = [];
    const evPts: [number, number][] = [];
    const acPts: [number, number][] = [];

    const steps = Math.min(totalDays, 200);
    for (let i = 0; i <= steps; i++) {
      const d = (i / steps) * totalDays;
      pvPts.push([xFromDay(d), yFromVal(samplePV(leaves, d))]);

      if (d <= maxDay) {
        // EV = sum of earned based on actual % (constant up to today)
        const ev = leaves.reduce((s, t) => s + t.plannedCost * (t.percentComplete / 100), 0);
        const evInterp = ev * Math.min(d / maxDay, 1);
        evPts.push([xFromDay(d), yFromVal(evInterp)]);

        // AC = actual cost pro-rated
        const ac = leaves.reduce((s, t) => s + t.actualCost, 0);
        const acInterp = ac * Math.min(d / maxDay, 1);
        acPts.push([xFromDay(d), yFromVal(acInterp)]);
      }
    }

    function drawLine(pts: [number, number][], color: string, dash?: number[]) {
      if (pts.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0], pts[i][1]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawLine(pvPts, "#58a6ff");
    drawLine(evPts, "#3fb950");
    drawLine(acPts, "#f85149");

    // Today line
    if (todayDay >= 0 && todayDay <= totalDays) {
      const tx = xFromDay(todayDay);
      ctx.strokeStyle = "rgba(245, 158, 11, 0.7)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(tx, pad.t);
      ctx.lineTo(tx, pad.t + chartH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Baseline overlays
    const baselineColors = ["#d2a8ff", "#f0883e", "#56d4dd", "#e3b341"];
    let bIdx = 0;
    for (const bl of baselines) {
      if (!baselineVisible[bl.id]) continue;
      const blLeaves = getLeafTasks(bl.tasks);
      const color = baselineColors[bIdx % baselineColors.length];
      bIdx++;

      const blPts: [number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const d = (i / steps) * totalDays;
        blPts.push([xFromDay(d), yFromVal(samplePV(blLeaves, d))]);
      }
      drawLine(blPts, color, [6, 4]);
    }
  }, [tasks, baselines, baselineVisible, leaves]);

  return (
    <div className="scurve-pane">
      <div className="scurve-canvas-wrap">
        <canvas ref={canvasRef} className="scurve-canvas" />
      </div>

      {/* Legend */}
      <div className="scurve-legend">
        <LegendItem color="#58a6ff" label="PV (Planned)" />
        <LegendItem color="#3fb950" label="EV (Earned)" />
        <LegendItem color="#f85149" label="AC (Actual)" />
        {baselines
          .filter((bl) => baselineVisible[bl.id])
          .map((bl, i) => {
            const colors = ["#d2a8ff", "#f0883e", "#56d4dd", "#e3b341"];
            return (
              <LegendItem
                key={bl.id}
                color={colors[i % colors.length]}
                label={`v${bl.version} ${bl.label}`}
                dashed
              />
            );
          })}
      </div>

      {/* Baseline controls */}
      {baselines.length > 0 && (
        <div className="scurve-baselines">
          <h3>Baselines</h3>
          {baselines.map((bl) => (
            <label key={bl.id} className="scurve-bl-toggle">
              <input
                type="checkbox"
                checked={!!baselineVisible[bl.id]}
                onChange={() => project.toggleBaselineVisible(bl.id)}
              />
              v{bl.version}: {bl.label}
              <button
                className="btn-danger btn-sm"
                style={{ marginLeft: 8 }}
                onClick={() => project.deleteBaseline(bl.id)}
              >
                &times;
              </button>
            </label>
          ))}
        </div>
      )}

      <button
        className="btn-secondary btn-sm"
        style={{ marginTop: 12 }}
        onClick={() => {
          const label = prompt("Baseline label:");
          if (label) project.takeBaseline(label);
        }}
      >
        Take Baseline
      </button>
    </div>
  );
}

function LegendItem({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <div className="scurve-legend-item">
      <svg width="20" height="10">
        <line
          x1="0"
          y1="5"
          x2="20"
          y2="5"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? "4 2" : undefined}
        />
      </svg>
      <span>{label}</span>
    </div>
  );
}
