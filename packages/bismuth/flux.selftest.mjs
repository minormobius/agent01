#!/usr/bin/env node
/* flux selftest — the crystal as a magnet: a brick is a dipole, a diamagnet
   expels the field and a paramagnet draws it in, colonies are domains, the
   lines are finite, stop at bricks, and come out the same twice.

     node packages/bismuth/flux.selftest.mjs */

import { Growth } from "./crystal.js";
import { genome } from "./genome.js";
import { Flux, fieldDir, axesOf, MATERIALS, DEFAULT_FLUX } from "./flux.js";

let checks = 0, fails = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("  ✗ " + msg); } };
const section = (t) => console.log(t);
const len = (v) => Math.hypot(v[0], v[1], v[2]);

section("directions");
{
  const up = fieldDir(0, 90), x = fieldDir(0, 0), y = fieldDir(90, 0);
  ok(Math.abs(up[2] - 1) < 1e-12 && Math.abs(x[0] - 1) < 1e-12 && Math.abs(y[1] - 1) < 1e-12, "azimuth from +x, elevation up to +z");
  ok(MATERIALS.length === 4 && DEFAULT_FLUX.material === "off", "four materials, off by default");
}

section("one brick");
{
  // a single cubic brick under a vertical field: a paramagnet adds to the field above and below it and subtracts beside it; a diamagnet the reverse
  const g = new Growth(Object.assign(genome(1), { voxels: [[0, 0, 0]], budget: 0 }));
  ok(g.bricks.length === 1, "one brick");
  const c = g.sub.moteOffset, b = g.bricks[0], cx = b.x + c[0], cy = b.y + c[1], cz = b.z + c[2];
  const probe = (material) => { const F = new Flux(g, { material, strength: 2, az: 0, el: 90 }).prepare(); const above = [0, 0, 0], beside = [0, 0, 0]; F.fieldAt(cx, cy, cz + 2, above); F.fieldAt(cx + 2, cy, cz, beside); return { above: above[2], beside: beside[2], n: F.n }; };
  const p = probe("para"), d = probe("dia");
  ok(p.n === 1 && p.above > 1 && p.beside < 1, `paramagnet: stronger above (${p.above.toFixed(3)}), weaker beside (${p.beside.toFixed(3)})`);
  ok(d.above < 1 && d.beside > 1, `diamagnet: weaker above (${d.above.toFixed(3)}), stronger beside (${d.beside.toFixed(3)})`);
  ok(Math.abs((p.above - 1) + (d.above - 1)) < 1e-12, "and the two are mirror images");
  ok(axesOf(g.sub).length === 3, "the cubic lattice has three easy axes");
}

section("a crystal");
{
  const g = new Growth(48112).run(2500);
  const F = new Flux(g, { material: "dia", strength: 2, az: 20, el: 55, lines: 120 }).prepare();
  ok(F.n === g.bricks.length && F.cells.n > 10, `${F.n} dipoles in ${F.cells.n} cells`);
  let slices = 0; while (!F.step(3)) slices++;
  ok(F.done && F.progress === 1, `the grid fills in slices (${slices + 1} steps)`);
  const segs = F.trace();
  ok(F.lines > 60 && segs.length > 1000 && segs.length % 8 === 0, `${F.lines} lines, ${segs.length / 8} segments`);
  let finite = true, inBrick = 0, tooLong = 0;
  for (let i = 0; i < segs.length; i += 8) {
    for (let k = 0; k < 8; k++) if (!Number.isFinite(segs[i + k])) finite = false;
    if (F.solid((segs[i] + segs[i + 4]) / 2, (segs[i + 1] + segs[i + 5]) / 2, (segs[i + 2] + segs[i + 6]) / 2)) inBrick++;
    if (Math.hypot(segs[i + 4] - segs[i], segs[i + 5] - segs[i + 1], segs[i + 6] - segs[i + 2]) > 0.36) tooLong++;
  }
  ok(finite, "every coordinate is finite");
  ok(inBrick === 0, `no segment runs through a brick (${inBrick})`);
  ok(tooLong === 0, "every step is a step");
  ok(F.maxI > 1.05, `the crystal shapes the field (up to ${F.maxI.toFixed(2)}× the applied field somewhere)`);
  // the multipole far field agrees with a direct sum, to the cartoon's precision
  const bb = g.sub.bounds(), far = [bb.max[0] + 12, (bb.min[1] + bb.max[1]) / 2, bb.max[2] + 6], out = [0, 0, 0];
  F.fieldAt(far[0], far[1], far[2], out);
  let dx = F.H[0], dy = F.H[1], dz = F.H[2];
  for (let i = 0; i < F.n; i++) { const ex = far[0] - F.px[i], ey = far[1] - F.py[i], ez = far[2] - F.pz[i]; const r2 = ex * ex + ey * ey + ez * ez, r = Math.sqrt(r2), inv3 = 1 / (r2 * r); const md = (F.mx[i] * ex + F.my[i] * ey + F.mz[i] * ez) / r2; dx += (3 * md * ex - F.mx[i]) * inv3; dy += (3 * md * ey - F.my[i]) * inv3; dz += (3 * md * ez - F.mz[i]) * inv3; }
  ok(Math.hypot(out[0] - dx, out[1] - dy, out[2] - dz) < 0.02 * len([dx, dy, dz]), `the cells' far field matches the direct sum (${(100 * Math.hypot(out[0] - dx, out[1] - dy, out[2] - dz) / len([dx, dy, dz])).toFixed(2)}% off)`);
  // the same twice
  const F2 = new Flux(g, { material: "dia", strength: 2, az: 20, el: 55, lines: 120 }).compute();
  const segs2 = F2.trace();
  ok(segs2.length === segs.length && segs2.every((v, i) => v === segs[i]), "the same lines twice");
  // no bricks: the field is the applied field everywhere
  const empty = new Growth(Object.assign(genome(1), { voxels: [], budget: 0 }));
  const F0 = new Flux(empty, { material: "dia" }).compute();
  const s = [0, 0, 0]; F0.sample((F0.lo[0] + F0.hi[0]) / 2, (F0.lo[1] + F0.hi[1]) / 2, (F0.lo[2] + F0.hi[2]) / 2, s);
  ok(F0.n === 0 && Math.abs(len(s) - 1) < 1e-6, "no bricks: the applied field, unbent");
}

section("domains");
{
  // a ferromagnet: colonies with different anisotropy pick different easy axes
  const g = new Growth(7).run(1200);
  g.deploy({ masons: 4, budget: 150, axis: [0.2, 0.2, 1.0, 1.0, 0.3, 0] }, null);
  for (let i = 0; i < 4000 && g.colonies[1].laid < 30; i++) g.step();
  const F = new Flux(g, { material: "ferro", strength: 2, az: 45, el: 30 }).prepare();
  ok(F.easy.length === 2 && F.easy.every((e) => Math.abs(len(e) - 1) < 1e-9), "two colonies, two unit easy axes");
  ok(F.easy[0].join() !== F.easy[1].join(), `and they differ: ${F.easy.map((e) => e.map((v) => +v.toFixed(2)).join(",")).join(" | ")}`);
  ok(F.easy.every((e) => e[0] * F.H[0] + e[1] * F.H[1] + e[2] * F.H[2] >= 0), "both point with the applied field");
  // on a tiling and on the quasicrystal the easy axes are the substrate's own
  const q = new Growth(Object.assign(genome(3), { substrate: { shape: "hex", R: 16, ic: { disk: 3, thickness: 2 }, z0: 6 }, budget: 200 })).run();
  ok(axesOf(q.sub).length === 7, "a prism has six in-plane easy axes and the axis");
  const Fq = new Flux(q, { material: "ferro", strength: 2, az: 20, el: 55, lines: 60 }).compute();
  ok(Fq.n === q.bricks.length && Fq.trace().length > 0, "a prism crystal magnetizes and traces");
  const ico = new Growth(Object.assign(genome(3), { substrate: { shape: "ico", R: 8, ic: { disk: 3, thickness: 1.6 } }, budget: 120 })).run();
  ok(axesOf(ico.sub).length === 15, "the quasicrystal has fifteen easy axes, its two-fold axes");
  const Fi = new Flux(ico, { material: "dia", strength: 2, lines: 60 }).compute();
  ok(Fi.n === ico.bricks.length && Fi.trace().length > 0, "the quasicrystal expels flux too");
}

console.log(`\n${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
