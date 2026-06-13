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

// Generate a course for the active world.
//   opts: { mode, R, len, seed, scale }   (R/len ignored for earth)
export function generateCourse({ mode, R = 0, len = 0, seed = 1, scale = 1 } = {}) {
  const rnd = mulberry32(seed * 2654435761 >>> 0);
  const N = 12;
  const r = 16 * scale;                 // gate radius (duck ≈ 4 m)
  const pts = [];

  if (mode === 'cylinder') {
    const startZ = len * 0.3 + 70, endZ = len * 0.92;
    const step = (endZ - startZ) / (N - 1);
    let th = -Math.PI / 2;              // start at the "bottom" (matches the spawn)
    const altMax = Math.min(R * 0.45, 360);
    for (let i = 0; i < N; i++) {
      th += (rnd() - 0.5) * 0.8;        // meander around the circumference
      const alt = 40 + rnd() * altMax;  // height above the floor
      const rho = R - alt;
      const z = startZ + step * i;
      pts.push([Math.cos(th) * rho, Math.sin(th) * rho, z]);
    }
  } else {
    let ang = Math.PI;                  // heading −Z (matches earth spawn facing)
    let p = [0, 120, -140];
    for (let i = 0; i < N; i++) {
      ang += (rnd() - 0.5) * 0.9;
      const y = 55 + rnd() * 200;
      pts.push([p[0], y, p[2]]);
      p = [p[0] + Math.sin(ang) * 135, 0, p[2] - Math.cos(ang) * 135];
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
