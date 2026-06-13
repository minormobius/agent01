// course.js — the procedurally generated gate course ("barriers") the duck must
// navigate, plus a landing pad at the end. Pure, deterministic (seeded), zero-dep
// so it runs in node and is pinned by test/course.selftest.mjs.
//
// A "gate" is a ring you fly THROUGH: { pos, fwd (unit travel axis), r }. The
// course winds forward through the world — meandering over the ground on Earth,
// and spiralling down the curved interior (varying angle + altitude) in the
// cylinder. Gate orientation in the renderer comes from fwd; here we only need
// the geometry + the pass test.

import { vec3 } from './math.js';
import { mulberry32 } from './geometry.js';

// Generate a course for the active world. The first gate is placed DEAD AHEAD of
// the spawn (start.pos + start.fwd · gap, same altitude) so you see it the moment
// you spawn; the rest march forward with a gentle meander.
//   opts: { mode, R, len, seed, scale, start:{pos,fwd} }
export function generateCourse({ mode, R = 0, len = 0, seed = 1, scale = 1, start } = {}) {
  const rnd = mulberry32((seed * 2654435761) >>> 0);
  const N = 8;
  const r = 18 * scale;                 // gate radius (duck ≈ 4 m)
  const gap = 120 * scale;              // spacing
  const sp = (start && start.pos) || (mode === 'cylinder' ? [0, -(R - 60), len * 0.15] : [0, 240, 0]);
  const sf = (start && start.fwd) || (mode === 'cylinder' ? [0, 0, 1] : [0, 0, -1]);
  const pts = [];

  if (mode === 'cylinder') {
    const th0 = Math.atan2(sp[1], sp[0]);
    const baseAlt = R - Math.hypot(sp[0], sp[1]);
    const z0 = sp[2] + gap;
    const zEnd = Math.min(len * 0.9, z0 + (N - 1) * gap * 1.2);
    const stepZ = (zEnd - z0) / Math.max(1, N - 1);
    const altMax = Math.min(R * 0.4, 320);
    let th = th0;
    for (let i = 0; i < N; i++) {
      let alt, z;
      if (i === 0) { alt = baseAlt; z = z0; }                  // dead ahead, same height
      else { th += (rnd() - 0.5) * 0.7; alt = 40 + rnd() * altMax; z = z0 + stepZ * i; }
      const rho = R - alt;
      pts.push([Math.cos(th) * rho, Math.sin(th) * rho, z]);
    }
  } else {
    // a 2D heading walk on the ground, anchored at the spawn (dir = [sin a, 0, −cos a])
    let a = Math.atan2(sf[0], -sf[2]);
    const dir = (ang) => [Math.sin(ang), 0, -Math.cos(ang)];
    const baseY = sp[1];
    let p = [sp[0] + dir(a)[0] * gap, baseY, sp[2] + dir(a)[2] * gap]; // first gate ahead
    pts.push([p[0], baseY, p[2]]);
    for (let i = 1; i < N; i++) {
      a += (rnd() - 0.5) * 0.8;
      const y = Math.max(70, baseY + (rnd() - 0.5) * 160);
      const d = dir(a);
      p = [p[0] + d[0] * gap * 1.15, y, p[2] + d[2] * gap * 1.15];
      pts.push([p[0], y, p[2]]);
    }
  }

  // fwd = direction toward the next gate (last inherits the previous heading)
  const gates = pts.map((pos, i) => {
    const nxt = pts[Math.min(i + 1, pts.length - 1)];
    const prv = pts[Math.max(i - 1, 0)];
    const f = vec3.normalize([0, 0, 0], vec3.sub([0, 0, 0], i < pts.length - 1 ? nxt : pos, i < pts.length - 1 ? pos : prv));
    return { pos, fwd: f, r };
  });

  // landing pad just past the final gate, on the floor, facing "up" (inward).
  const last = pts[pts.length - 1];
  let pad;
  if (mode === 'cylinder') {
    const th = Math.atan2(last[1], last[0]);
    pad = { pos: [Math.cos(th) * (R - 1), Math.sin(th) * (R - 1), Math.min(last[2] + 90, len - 6)], up: [-Math.cos(th), -Math.sin(th), 0], r: 34 * scale };
  } else {
    const f = gates[gates.length - 1].fwd;
    pad = { pos: [last[0] + f[0] * 150, 1, last[2] + f[2] * 150], up: [0, 1, 0], r: 34 * scale };
  }
  return { gates, pad };
}

// Did the segment prev→cur pass FORWARD through this gate's disc?
// Cross the gate plane in the +fwd direction, within radius r of the centre.
export function crossedGate(prev, cur, gate) {
  const f = gate.fwd, c = gate.pos;
  const dPrev = (prev[0] - c[0]) * f[0] + (prev[1] - c[1]) * f[1] + (prev[2] - c[2]) * f[2];
  const dCur = (cur[0] - c[0]) * f[0] + (cur[1] - c[1]) * f[1] + (cur[2] - c[2]) * f[2];
  if (!(dPrev <= 0 && dCur > 0)) return false;        // must straddle, travelling +fwd
  const t = dPrev / (dPrev - dCur);
  const x = prev[0] + (cur[0] - prev[0]) * t;
  const y = prev[1] + (cur[1] - prev[1]) * t;
  const z = prev[2] + (cur[2] - prev[2]) * t;
  // radial distance of the crossing point from the gate centre (in the gate plane)
  const dx = x - c[0], dy = y - c[1], dz = z - c[2];
  const along = dx * f[0] + dy * f[1] + dz * f[2];
  const px = dx - f[0] * along, py = dy - f[1] * along, pz = dz - f[2] * along;
  return Math.hypot(px, py, pz) <= gate.r;
}
