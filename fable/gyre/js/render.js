// 3D renderer — hand-rolled projection onto canvas 2D, in the torus-pack
// house style (no three.js, no build). The torus is a painter's-algorithm
// shaded quad mesh; goo patches and the goal are painted onto the surface
// quads themselves; the trajectory and items draw on top, dimmed when they
// pass the far side of the surface (cheap, readable "x-ray" occlusion).
//
// Interaction modes are decided by where a drag starts: near the ball = aim,
// anywhere else = orbit the camera.

import { R_MAJ, R_TUBE, BALL_R, embed, frame, POWER_MIN, POWER_MAX } from './engine.js';

const TAU = Math.PI * 2;
const NU = 44, NV = 22;          // mesh resolution

function pal() {
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? {
    bg: '#14130f', meshLo: [38, 36, 30], meshHi: [96, 92, 80], line: 'rgba(0,0,0,.25)',
    goo: [47, 160, 110], goal: [70, 192, 138], goalRing: '#46c08a',
    attract: '#d98a3a', repel: '#4f9ad6', bumper: '#c2607f', pad: '#a39bff', ball: '#ffffff',
    trail: 'rgba(163,155,255,.85)', trailFar: 'rgba(163,155,255,.22)', text: '#ece7da',
    winmap: 'rgba(120,200,150,.55)', dial: 'rgba(236,231,218,.25)', inset: 'rgba(28,27,22,.88)',
  } : {
    bg: '#f3efe6', meshLo: [196, 188, 168], meshHi: [246, 242, 230], line: 'rgba(0,0,0,.08)',
    goo: [47, 157, 114], goal: [31, 157, 110], goalRing: '#1f9d6e',
    attract: '#cf7a25', repel: '#2f7fc8', bumper: '#c2607f', pad: '#4338ca', ball: '#23202b',
    trail: 'rgba(67,56,202,.85)', trailFar: 'rgba(67,56,202,.2)', text: '#1f1d1a',
    winmap: 'rgba(40,150,90,.5)', dial: 'rgba(31,29,26,.22)', inset: 'rgba(255,255,255,.9)',
  };
}

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.world = world;
    this.p = pal(); this.dpr = window.devicePixelRatio || 1;
    this.yaw = 0.7; this.pitch = -1.0;     // pleasing initial view
    this.showMap = false;
    this.light = norm3({ x: -0.4, y: 0.55, z: 0.75 });
    this.layout();
    this._bakeMesh();
  }

  layout() {
    const max = Math.min(this.canvas.parentElement.clientWidth || 560, 580);
    this.size = max;
    this.canvas.width = max * this.dpr; this.canvas.height = max * this.dpr;
    this.canvas.style.width = max + 'px'; this.canvas.style.height = max + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scale = max / 34;                 // world units → px
    this.camDist = 90;
  }

  // ---- camera ----
  rot(p) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const x1 = p.x * cy - p.y * sy, y1 = p.x * sy + p.y * cy, z1 = p.z;
    return { x: x1, y: y1 * cp - z1 * sp, z: y1 * sp + z1 * cp };
  }
  proj(q) {
    const k = this.camDist / (this.camDist - q.z);
    return { x: this.size / 2 + q.x * this.scale * k, y: this.size / 2 + q.y * this.scale * k, k };
  }
  pr(p) { return this.proj(this.rot(p)); }

  // ---- static mesh with baked surface tints (goo, goal) ----
  _bakeMesh() {
    const w = this.world;
    this.quads = [];
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const u0 = (i / NU) * TAU, u1 = ((i + 1) / NU) * TAU;
        const v0 = (j / NV) * TAU, v1 = ((j + 1) / NV) * TAU;
        const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
        const c = embed(uc, vc);
        let tint = null;
        const gd = dist3(c, w._goal);
        if (gd <= w.goal.rad + 0.4) tint = 'goal';
        else for (const g of w.goo) { if (dist3(c, g._p) <= g.rad) { tint = 'goo'; break; } }
        this.quads.push({
          pts: [embed(u0, v0), embed(u1, v0), embed(u1, v1), embed(u0, v1)],
          n: frame(uc, vc).n, c, tint,
        });
      }
    }
  }

  setSolutionMap(grid, na, np) { this.mapGrid = grid; this.mapNa = na; this.mapNp = np; }

  // is the surface point (already rotated) facing the camera?
  facing(nRot) { return nRot.z > -0.05; }

  draw(opts = {}) {
    const ctx = this.ctx, P = this.p, S = this.size, w = this.world;
    ctx.clearRect(0, 0, S, S);

    // --- torus mesh, painter's algorithm ---
    const drawList = [];
    for (const q of this.quads) {
      const r0 = this.rot(q.pts[0]), r1 = this.rot(q.pts[1]), r2 = this.rot(q.pts[2]), r3 = this.rot(q.pts[3]);
      const nR = this.rot(q.n);
      drawList.push({ q, r: [r0, r1, r2, r3], nR, z: (r0.z + r1.z + r2.z + r3.z) / 4 });
    }
    drawList.sort((a, b) => a.z - b.z);
    for (const d of drawList) {
      const lam = Math.max(0, d.nR.x * this.light.x + d.nR.y * this.light.y + d.nR.z * this.light.z);
      let base = mix(P.meshLo, P.meshHi, lam);
      if (d.q.tint === 'goo') base = mix(base, P.goo, 0.55);
      else if (d.q.tint === 'goal') base = mix(base, P.goal, 0.6);
      const back = d.nR.z < 0;
      ctx.fillStyle = `rgba(${base[0] | 0},${base[1] | 0},${base[2] | 0},${back ? 0.45 : 1})`;
      const p0 = this.proj(d.r[0]), p1 = this.proj(d.r[1]), p2 = this.proj(d.r[2]), p3 = this.proj(d.r[3]);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath();
      ctx.fill();
      if (!back) { ctx.strokeStyle = P.line; ctx.lineWidth = 0.5; ctx.stroke(); }
    }

    // --- goal ring ---
    this._surfaceRing(w.goal.u, w.goal.v, w.goal.rad, P.goalRing);

    // --- trajectory (x-ray on the far side) ---
    if (opts.trail && opts.trail.length > 1) this._trail(opts.trail);

    // --- items ---
    for (const m of w.magnets) this._dot(m.u, m.v, 0.9 + Math.abs(m.q) * 0.35, m.q >= 0 ? P.attract : P.repel, m.q >= 0 ? '+' : '−');
    for (const b of w.bumpers) this._dot(b.u, b.v, b.rad, P.bumper, null, 0.85);
    // launch pad
    this._surfaceRing(w.ball0.u, w.ball0.v, 0.9, P.pad);

    // --- aim arrow ---
    if (opts.aim) this._aim(opts.aim.psi, opts.aim.power);

    // --- ball ---
    {
      const bp = opts.ballUV || w.ball0;
      const e = embed(bp.u, bp.v);
      const nR = this.rot(frame(bp.u, bp.v).n);
      const lifted = { x: e.x + frame(bp.u, bp.v).n.x * BALL_R, y: e.y + frame(bp.u, bp.v).n.y * BALL_R, z: e.z + frame(bp.u, bp.v).n.z * BALL_R };
      const s = this.pr(lifted);
      const front = this.facing(nR);
      ctx.globalAlpha = front ? 1 : 0.35;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(s.x + 1.5, s.y + 2, BALL_R * this.scale * s.k, 0, 7); ctx.fill();
      ctx.fillStyle = P.ball; ctx.beginPath(); ctx.arc(s.x, s.y, BALL_R * this.scale * s.k, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // --- overlays ---
    if (this.showMap && this.mapGrid) this._winmapDial();
    this._inset(opts);
  }

  _trail(trail) {
    const ctx = this.ctx, P = this.p;
    let prev = null, prevFront = true;
    for (const t of trail) {
      const e = embed(t.u, t.v);
      const f = frame(t.u, t.v);
      const lifted = { x: e.x + f.n.x * BALL_R * 0.7, y: e.y + f.n.y * BALL_R * 0.7, z: e.z + f.n.z * BALL_R * 0.7 };
      const nR = this.rot(f.n);
      const s = this.pr(lifted);
      const front = this.facing(nR);
      if (prev) {
        ctx.strokeStyle = front && prevFront ? P.trail : P.trailFar;
        ctx.lineWidth = front && prevFront ? 2.2 : 1.4;
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(s.x, s.y); ctx.stroke();
      }
      prev = s; prevFront = front;
    }
  }

  _dot(u, v, rad, color, glyph, alpha = 1) {
    const ctx = this.ctx;
    const e = embed(u, v), f = frame(u, v);
    const lifted = { x: e.x + f.n.x * 0.3, y: e.y + f.n.y * 0.3, z: e.z + f.n.z * 0.3 };
    const nR = this.rot(f.n);
    const s = this.pr(lifted);
    const front = this.facing(nR);
    const r = rad * this.scale * s.k * 0.8;
    ctx.globalAlpha = (front ? 1 : 0.3) * alpha;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 7); ctx.fill();
    if (glyph) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x - r * 0.45, s.y); ctx.lineTo(s.x + r * 0.45, s.y);
      if (glyph === '+') { ctx.moveTo(s.x, s.y - r * 0.45); ctx.lineTo(s.x, s.y + r * 0.45); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _surfaceRing(u, v, rad, color) {
    // approximate circle of chord-radius `rad` about (u,v), drawn on the surface
    const ctx = this.ctx;
    const f = frame(u, v);
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    let prev = null, prevFront = true;
    const K = 26;
    for (let k = 0; k <= K; k++) {
      const a = (k / K) * TAU;
      const du = rad * Math.cos(a) / f.A, dv = rad * Math.sin(a) / R_TUBE;
      const e = embed(u + du, v + dv);
      const nf = frame(u + du, v + dv);
      const lifted = { x: e.x + nf.n.x * 0.15, y: e.y + nf.n.y * 0.15, z: e.z + nf.n.z * 0.15 };
      const nR = this.rot(nf.n);
      const s = this.pr(lifted);
      const front = this.facing(nR);
      if (prev) {
        ctx.globalAlpha = front && prevFront ? 0.95 : 0.25;
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(s.x, s.y); ctx.stroke();
      }
      prev = s; prevFront = front;
    }
    ctx.globalAlpha = 1;
  }

  _aim(psi, power) {
    const ctx = this.ctx, P = this.p, w = this.world;
    const f = frame(w.ball0.u, w.ball0.v);
    const len = 1.6 + (power - POWER_MIN) / (POWER_MAX - POWER_MIN) * 4.5;
    // sample the heading as a short surface arc
    ctx.strokeStyle = P.pad; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]);
    let prev = null;
    const K = 10;
    for (let k = 0; k <= K; k++) {
      const t = (k / K) * len;
      const du = t * Math.cos(psi) / f.A, dv = t * Math.sin(psi) / R_TUBE;
      const e = embed(w.ball0.u + du, w.ball0.v + dv);
      const nf = frame(w.ball0.u + du, w.ball0.v + dv);
      const s = this.pr({ x: e.x + nf.n.x * 0.3, y: e.y + nf.n.y * 0.3, z: e.z + nf.n.z * 0.3 });
      if (prev) { ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(s.x, s.y); ctx.stroke(); }
      prev = s;
    }
    ctx.setLineDash([]);
    if (prev) { ctx.fillStyle = P.pad; ctx.beginPath(); ctx.arc(prev.x, prev.y, 4, 0, 7); ctx.fill(); }
  }

  // screen-space tangent basis at the launch pad (for aim-drag mapping)
  aimBasis() {
    const w = this.world;
    const e = embed(w.ball0.u, w.ball0.v);
    const f = frame(w.ball0.u, w.ball0.v);
    const p0 = this.pr(e);
    const pu = this.pr({ x: e.x + f.eu.x, y: e.y + f.eu.y, z: e.z + f.eu.z });
    const pv = this.pr({ x: e.x + f.ev.x, y: e.y + f.ev.y, z: e.z + f.ev.z });
    return { origin: p0, eu: { x: pu.x - p0.x, y: pu.y - p0.y }, ev: { x: pv.x - p0.x, y: pv.y - p0.y } };
  }

  _winmapDial() {
    const ctx = this.ctx, P = this.p, na = this.mapNa, np = this.mapNp;
    const cx = this.size - 74, cy = 74, r0 = 16, r1 = 62;
    ctx.fillStyle = P.inset; ctx.beginPath(); ctx.arc(cx, cy, r1 + 6, 0, 7); ctx.fill();
    ctx.strokeStyle = P.dial; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r1 + 6, 0, 7); ctx.stroke();
    for (let i = 0; i < na; i++) {
      const a0 = (i / na) * TAU, a1 = ((i + 1) / na) * TAU;
      for (let j = 0; j < np; j++) {
        if (!this.mapGrid[i * np + j]) continue;
        const rr0 = r0 + (j / np) * (r1 - r0), rr1 = r0 + ((j + 1) / np) * (r1 - r0);
        ctx.fillStyle = P.winmap;
        ctx.beginPath(); ctx.arc(cx, cy, rr1, a0, a1); ctx.arc(cx, cy, rr0, a1, a0, true); ctx.closePath(); ctx.fill();
      }
    }
    ctx.fillStyle = P.text; ctx.font = '9px ui-monospace, monospace'; ctx.textAlign = 'center';
    ctx.fillText('win-map ψ×power', cx, cy + r1 + 16);
  }

  _inset(opts) {
    // unwrapped (u,v) map, bottom-left
    const ctx = this.ctx, P = this.p, w = this.world;
    const W = 132, H = 76, x0 = 12, y0 = this.size - H - 12;
    ctx.fillStyle = P.inset; ctx.fillRect(x0, y0, W, H);
    ctx.strokeStyle = P.dial; ctx.strokeRect(x0, y0, W, H);
    const px = (u, v) => ({ x: x0 + (u / TAU) * W, y: y0 + (v / TAU) * H });
    for (const g of w.goo) { const s = px(g.u, g.v); ctx.fillStyle = `rgba(${P.goo[0]},${P.goo[1]},${P.goo[2]},.4)`; ctx.beginPath(); ctx.arc(s.x, s.y, g.rad * 3.2, 0, 7); ctx.fill(); }
    for (const m of w.magnets) { const s = px(m.u, m.v); ctx.fillStyle = m.q >= 0 ? P.attract : P.repel; ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, 7); ctx.fill(); }
    for (const b of w.bumpers) { const s = px(b.u, b.v); ctx.fillStyle = P.bumper; ctx.beginPath(); ctx.arc(s.x, s.y, 2.6, 0, 7); ctx.fill(); }
    { const s = px(w.goal.u, w.goal.v); ctx.strokeStyle = P.goalRing; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(s.x, s.y, 4.4, 0, 7); ctx.stroke(); }
    if (opts.trail && opts.trail.length > 1) {
      ctx.strokeStyle = P.trail; ctx.lineWidth = 1;
      let prev = null;
      for (const t of opts.trail) {
        const s = px(t.u, t.v);
        if (prev && Math.abs(s.x - prev.x) < W / 2 && Math.abs(s.y - prev.y) < H / 2) {
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(s.x, s.y); ctx.stroke();
        }
        prev = s;
      }
    }
    { const bp = opts.ballUV || w.ball0; const s = px(bp.u, bp.v); ctx.fillStyle = P.ball; ctx.beginPath(); ctx.arc(s.x, s.y, 2.8, 0, 7); ctx.fill(); }
    ctx.fillStyle = P.text; ctx.font = '9px ui-monospace, monospace'; ctx.textAlign = 'left';
    ctx.fillText('unwrapped u×v', x0 + 4, y0 - 4);
  }
}

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function dist3(a, b) { const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
function norm3(v) { const l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l }; }

// Static thumbnail for gallery cards: small 3D view with the answer trail.
export function drawThumb(canvas, world, sr, px = 150) {
  const r = new Renderer(canvas, world);
  r.size = px;
  canvas.width = px * r.dpr; canvas.height = px * r.dpr;
  canvas.style.width = px + 'px'; canvas.style.height = px + 'px';
  r.ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  r.scale = px / 34;
  r._inset = () => {};            // no inset on thumbnails
  r.draw({ trail: sr && sr.answer ? sr.answer.trace : null });
}
