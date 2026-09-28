// scene.js — one frame of a Grown world as light and crystal, for gl.js: every organ as its attractor,
// bonds as threads, armour and reef as crystal, bites as hot threads, the medium as motes. Shared by
// the sketchbook (grown/main.js) and the film (nobody/).
import { ORGANS, flowsFor, WX, WZ } from '../vendor/attractor/lib/organism.js';
import { prism } from './gl.js';

const gseed = new WeakMap();
export const seedOf = (g) => { if (!gseed.has(g)) { let h = 7; for (const ch of JSON.stringify(g)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; gseed.set(g, h >>> 0); } return gseed.get(g); };
export function point(buf, p, col, b, size) { buf.need(7); buf.a.set([p[0], p[1], p[2], col[0] * b, col[1] * b, col[2] * b, size], buf.n); buf.n += 7; }

/** Fill R's buffers with world W, a fraction f past its last step, at time tau (s: the orbits' clock). */
export function scene(R, W, f, tau, { haze = true, glow = 1, hazeColour = [0.25, 0.55, 0.6] } = {}) {
  const P = R.points, C = R.crystals; P.n = 0; C.n = 0;
  for (const B of W.bodies) {
    const pose = B.pose(f), flows = flowsFor(B.genome), hungry = Math.max(0, Math.min(1, 1 - B.E / (B.capacity() * 0.3)));
    for (const o of pose.organs) {
      const cl = flows[o.type], n = Math.round(40 + 70 * o.size), r = 0.45 + 0.6 * o.size, d = o.axis;
      let e1 = Math.abs(d[1]) < 0.9 ? [d[2], 0, -d[0]] : [0, -d[2], d[1]]; const l1 = Math.hypot(...e1); e1 = e1.map((v) => v / l1);
      const e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
      const col = ORGANS[o.type].colour, g = glow * (o.type === 'mouth' ? 1.2 : 1) * (1 - 0.6 * hungry);
      for (let j = 0; j < n; j++) {
        const off = (j * 2654435761 + o.i * 40503 + B.id * 97) % cl.n, rate = 50 + ((j * 7919) % 60);
        for (let l = 0; l < 3; l++) {
          const q = (Math.floor((tau - l * 0.03) * rate) + off) % cl.n, x = cl.p[q * 3] * r, y = cl.p[q * 3 + 1] * r, z = cl.p[q * 3 + 2] * r;
          point(P, [o.p[0] + d[0] * x + e1[0] * y + e2[0] * z, o.p[1] + d[1] * x + e1[1] * y + e2[1] * z, o.p[2] + d[2] * x + e1[2] * y + e2[2] * z], col, 0.3 * g * (1 - l / 3), 0.9);
        }
      }
      if (o.parent >= 0) { const a = pose.organs[o.parent].p; for (let k = 1; k < 10; k++) point(P, [a[0] + (o.p[0] - a[0]) * k / 10, a[1] + (o.p[1] - a[1]) * k / 10, a[2] + (o.p[2] - a[2]) * k / 10], [0.8, 0.75, 0.9], 0.12 * glow, 0.7); }
    }
    for (const c of B.crystals) {
      const o = pose.organs[c.organ]; if (!o) continue;
      const F = o.frame, d = [F.r[0] * c.dir[0] + F.u[0] * c.dir[1] + F.f[0] * c.dir[2], F.r[1] * c.dir[0] + F.u[1] * c.dir[1] + F.f[1] * c.dir[2], F.r[2] * c.dir[0] + F.u[2] * c.dir[1] + F.f[2] * c.dir[2]];
      prism(C, [o.p[0] + d[0] * 0.2 * o.size, o.p[1] + d[1] * 0.2 * o.size, o.p[2] + d[2] * 0.2 * o.size], d, c.len, 0.1 + 0.08 * c.len, c.spin, W.s - c.born, (seedOf(B.genome) % 7) / 7);
    }
  }
  // bites: a hot thread from the biting mouth to the organ it bites
  for (const [a, b] of W.bites) for (let k = 0; k <= 12; k++) point(P, [a[0] + (b[0] - a[0]) * k / 12, a[1] + (b[1] - a[1]) * k / 12, a[2] + (b[2] - a[2]) * k / 12], [1, 0.3, 0.2], 0.9, 1.6);
  if (R.reefOf !== W || R.reefLen !== W.reef.length) { R.reef.n = 0; for (const c of W.reef) prism(R.reef, c.p, c.dir, c.len, 0.1 + 0.08 * c.len, c.spin, 3000, (c.lineage % 7) / 7); R.uploadReef(); R.reefLen = W.reef.length; R.reefOf = W; }
  if (haze) {                                              // the medium: a mote per cell, as bright as its mineral
    const M = W.medium, MX = WX / 4, MZ = WZ / 4, hz = typeof haze === 'number' ? haze : 1;
    for (let i = 0; i < M.length; i++) { const m = M[i]; if (m < 0.12) continue; const x = i % MX, z = Math.floor(i / MX) % MZ, y = Math.floor(i / (MX * MZ)), h = ((i * 2654435761) >>> 0) / 4294967296, h2 = ((i * 40503 + 7) * 2246822519 >>> 0) / 4294967296, h3 = ((i * 97 + 3) * 3266489917 >>> 0) / 4294967296; point(P, [(x + h) * 4, (y + h2) * 4, (z + h3) * 4], hazeColour, 0.14 * hz * Math.min(1.2, m), 2.2); }
  }
}
