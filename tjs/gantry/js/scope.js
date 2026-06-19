// scope.js — the dynamic-analysis instrument. Two canvas-2D scopes read the
// per-device sampled simulation from deckengine.js (dynamic axis/motor keys):
//
//   KinematicsScope — four stacked traces (position / velocity / acceleration /
//   jerk) over the move's timeline, one coloured line per axis. This is where
//   the seven-segment S-curve shows itself: trapezoidal velocity, the
//   characteristic flat-topped acceleration, and the square-wave jerk.
//
//   TorqueScope — one panel per motor. The shaded band is the available pullout
//   torque T_avail(ω(t)) (which sags as the rotor speeds up); the bright line is
//   the torque demand |T(t)|. Wherever demand pokes above the band, the motor is
//   skipping steps — that region is filled red and the panel is badged STALL.
//   This is the whole point of "test driven down to the motor level".
//
// Both share a playhead so the 3D animation, the kinematics, and the torque
// verdict all read the same instant.

const AXIS_COLOR = { x: '#39d6c8', y: '#ffb454', z1: '#7ee787', z2: '#c08cff' };
const MOTOR_COLOR = { A: '#39d6c8', B: '#ffb454', Z1: '#7ee787', Z2: '#c08cff' };
const GRID = 'rgba(255,255,255,0.06)';
const INK = '#8a8aa0';

function fitDPI(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr; canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function niceMax(v) {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = v / Math.pow(10, exp);
  const step = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
  return step * Math.pow(10, exp);
}

export class KinematicsScope {
  constructor(canvas) { this.canvas = canvas; this.field = 'v'; }

  // sim: deckengine.simulateDevice output (dynamic axisKeys + colors).
  // visible: key->bool (defaults to shown). playFrac in [0,1].
  draw(sim, visible, playFrac) {
    const { ctx, w, h } = fitDPI(this.canvas);
    ctx.clearRect(0, 0, w, h);
    if (!sim) return;
    const rows = [
      { key: 'p', label: 'position', unit: 'mm', signed: false },
      { key: 'v', label: 'velocity', unit: 'mm/s', signed: true },
      { key: 'a', label: 'acceleration', unit: 'mm/s²', signed: true },
      { key: 'j', label: 'jerk', unit: 'mm/s³', signed: true },
    ];
    const padL = 52, padR = 10, padT = 6, padB = 14, gap = 8;
    const rh = (h - padT - padB - gap * (rows.length - 1)) / rows.length;
    const n = sim.time.length;
    const color = (a) => (sim.colors && sim.colors.axis[a]) || AXIS_COLOR[a] || '#39d6c8';
    const axes = (sim.axisKeys || []).filter((a) => visible[a] !== false);

    rows.forEach((row, ri) => {
      const y0 = padT + ri * (rh + gap);
      const plotW = w - padL - padR;
      // y-range across visible axes for this field
      let maxAbs = 1e-9;
      for (const a of axes) for (const s of sim.axes[a]) maxAbs = Math.max(maxAbs, Math.abs(s[row.key]));
      maxAbs = niceMax(maxAbs);
      const yMid = row.signed ? y0 + rh / 2 : y0 + rh - 2;
      const yScale = row.signed ? (rh / 2 - 2) / maxAbs : (rh - 4) / maxAbs;

      // frame + zero line
      ctx.strokeStyle = GRID; ctx.lineWidth = 1;
      ctx.strokeRect(padL, y0, plotW, rh);
      if (row.signed) { ctx.beginPath(); ctx.moveTo(padL, yMid); ctx.lineTo(padL + plotW, yMid); ctx.stroke(); }

      // label
      ctx.fillStyle = INK; ctx.font = '10px ui-monospace,monospace'; ctx.textAlign = 'left';
      ctx.fillText(`${row.label} (${row.unit})`, padL + 4, y0 + 11);
      ctx.textAlign = 'right';
      ctx.fillText(maxAbs.toPrecision(2), padL - 4, y0 + 10);

      // traces
      for (const a of axes) {
        ctx.strokeStyle = color(a); ctx.lineWidth = 1.6; ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = padL + (i / (n - 1)) * plotW;
          const val = sim.axes[a][i][row.key];
          const y = yMid - val * yScale;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      // playhead
      this._playhead(ctx, padL, y0, plotW, rh, playFrac);
    });
  }
  _playhead(ctx, x0, y0, w, h, f) {
    if (f == null) return;
    const x = x0 + f * w;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(x, y0); ctx.lineTo(x, y0 + h); ctx.stroke();
  }
}

export class TorqueScope {
  constructor(canvas) { this.canvas = canvas; }

  draw(sim, playFrac) {
    const { ctx, w, h } = fitDPI(this.canvas);
    ctx.clearRect(0, 0, w, h);
    if (!sim) return;
    const motors = sim.motorKeys || ['A', 'B', 'Z1', 'Z2'];
    const mcolor = (k) => (sim.colors && sim.colors.motor[k]) || MOTOR_COLOR[k] || '#39d6c8';
    const padL = 52, padR = 10, padT = 6, padB = 6, gap = 8;
    const rh = (h - padT - padB - gap * (motors.length - 1)) / motors.length;
    const n = sim.time.length;

    motors.forEach((k, ri) => {
      const y0 = padT + ri * (rh + gap);
      const plotW = w - padL - padR;
      const series = sim.motors[k];
      let maxT = 1e-6;
      for (const e of series) maxT = Math.max(maxT, e.absDemand, e.avail);
      maxT = niceMax(maxT);
      const yBase = y0 + rh - 2;
      const yScale = (rh - 4) / maxT;
      const stalled = sim.verdict.stall[k];
      const peakUtil = sim.verdict.peakUtil[k];

      ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.strokeRect(padL, y0, plotW, rh);

      // available-torque band (filled)
      ctx.beginPath();
      ctx.moveTo(padL, yBase);
      for (let i = 0; i < n; i++) {
        const x = padL + (i / (n - 1)) * plotW;
        ctx.lineTo(x, yBase - series[i].avail * yScale);
      }
      ctx.lineTo(padL + plotW, yBase); ctx.closePath();
      ctx.fillStyle = 'rgba(120,130,150,0.16)'; ctx.fill();
      ctx.strokeStyle = 'rgba(150,160,180,0.55)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = padL + (i / (n - 1)) * plotW;
        const y = yBase - series[i].avail * yScale;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();

      // demand line, with red fill where it exceeds available
      ctx.strokeStyle = mcolor(k); ctx.lineWidth = 1.8; ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = padL + (i / (n - 1)) * plotW;
        const y = yBase - Math.min(series[i].absDemand, maxT) * yScale;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      // overdemand shading
      for (let i = 1; i < n; i++) {
        if (series[i].stall) {
          const x = padL + (i / (n - 1)) * plotW;
          const xp = padL + ((i - 1) / (n - 1)) * plotW;
          const yd = yBase - Math.min(series[i].absDemand, maxT) * yScale;
          const ya = yBase - series[i].avail * yScale;
          ctx.fillStyle = 'rgba(255,77,109,0.30)';
          ctx.fillRect(xp, yd, x - xp + 0.6, ya - yd);
        }
      }

      // labels
      ctx.fillStyle = INK; ctx.font = '10px ui-monospace,monospace'; ctx.textAlign = 'left';
      ctx.fillStyle = mcolor(k);
      ctx.fillText(`motor ${k}`, padL + 4, y0 + 11);
      ctx.fillStyle = INK; ctx.textAlign = 'right';
      ctx.fillText(maxT.toPrecision(2) + ' N·m', padL - 4, y0 + 10);
      // verdict badge
      ctx.textAlign = 'right';
      if (stalled) { ctx.fillStyle = '#ff4d6d'; ctx.fillText('STALL', padL + plotW - 6, y0 + 11); }
      else { ctx.fillStyle = peakUtil > 0.85 ? '#ffb454' : '#7ee787'; ctx.fillText(`${Math.round(peakUtil * 100)}%`, padL + plotW - 6, y0 + 11); }

      // playhead
      if (playFrac != null) {
        const x = padL + playFrac * plotW;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(x, y0); ctx.lineTo(x, y0 + rh); ctx.stroke();
      }
    });
  }
}
