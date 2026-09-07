#!/usr/bin/env node
/* flux selftest — the crystal as a magnet: a brick is a dipole, a diamagnet
   expels the field and a paramagnet draws it in, colonies are domains, the
   lines are finite, stop at bricks, and come out the same twice.

     node packages/bismuth/flux.selftest.mjs */

import { Growth } from "./crystal.js";
import { genome } from "./genome.js";
import { Flux, Section, fieldDir, axesOf, MATERIALS, VIEWS, PLANES, DEFAULT_FLUX } from "./flux.js";

let checks = 0, fails = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("  ✗ " + msg); } };
const section = (t) => console.log(t);
const len = (v) => Math.hypot(v[0], v[1], v[2]);

section("directions");
{
  const up = fieldDir(0, 90), x = fieldDir(0, 0), y = fieldDir(90, 0);
  ok(Math.abs(up[2] - 1) < 1e-12 && Math.abs(x[0] - 1) < 1e-12 && Math.abs(y[1] - 1) < 1e-12, "azimuth from +x, elevation up to +z");
  ok(MATERIALS.length === 4 && DEFAULT_FLUX.material === "off", "four materials, off by default");
  ok(VIEWS.length === 3 && PLANES.length === 5 && DEFAULT_FLUX.applied === true && DEFAULT_FLUX.view === "flux" && DEFAULT_FLUX.plane === "facing", "three views, five planes; the applied field on and the lines by default");
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

section("remanence");
{
  // the field switched off: a ferromagnet keeps its magnetization, an induced magnet has nothing left
  const g = new Growth(48112).run(2500);
  g.deploy({ masons: 4, budget: 150, axis: [0.2, 0.2, 1.0, 1.0, 0.3, 0] }, null);
  for (let i = 0; i < 4000 && g.colonies[1].laid < 30; i++) g.step();
  const on = new Flux(g, { material: "ferro", strength: 3, az: 20, el: 55 }).prepare();
  const off = new Flux(g, { material: "ferro", strength: 3, az: 20, el: 55, applied: false }).compute();
  ok(off.H.every((v) => v === 0) && off.remanent && !off.applied, "the applied field is zero and the crystal is remanent");
  ok(off.easy.length === on.easy.length && off.easy.every((e, i) => e.join() === on.easy[i].join()), "the domains keep the easy axes the field gave them");
  ok(off.n === on.n && off.mx.every((v, i) => v === on.mx[i]), "and every dipole its moment");
  ok(Math.abs(off.ref - 0.25) < 1e-12 && on.ref === 1, "the remanent scale is a quarter of the sphere's equatorial field");
  const dia = new Flux(g, { material: "dia", strength: 3, applied: false }).compute();
  ok(dia.n === on.n && dia.mx.every((v) => v === 0) && dia.trace().length === 0, "a diamagnet with no field has no moment and no lines");
  // the remanent field is the crystal's own: a dipole's far field, falling as r⁻³
  const bb = g.sub.bounds(), c = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2], R = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
  const b1 = [0, 0, 0], b2 = [0, 0, 0];
  off.fieldAt(c[0] + 3 * R, c[1], c[2], b1); off.fieldAt(c[0] + 6 * R, c[1], c[2], b2);
  const ratio = len(b1) / len(b2);
  ok(ratio > 6.5 && ratio < 9.5, `the far field falls as a dipole's, ×${ratio.toFixed(1)} for half the distance`);
  // the lines start on the crystal's surface, outside it, where the field leaves it, and never run through a brick
  const segs = off.trace();
  ok(off.seeds > 100 && off.lines > 80 && off.candidates > off.seeds, `${off.seeds} seeds on the surface from ${off.candidates} candidates, ${off.lines} lines drawn`);
  let inBrick = 0, starts = 0;
  for (let i = 0; i < segs.length; i += 8) {
    if (i === 0 || segs[i] !== segs[i - 4] || segs[i + 1] !== segs[i - 3] || segs[i + 2] !== segs[i - 2]) starts++;
    if (off.solid((segs[i] + segs[i + 4]) / 2, (segs[i + 1] + segs[i + 5]) / 2, (segs[i + 2] + segs[i + 6]) / 2)) inBrick++;
  }
  const gap = 1.35 + 1e-9, mo = g.sub.moteOffset;
  const against = off.seedPts.filter((s) => { const b = g.bricks[s.i]; return !off.solid(s.x, s.y, s.z) && Math.hypot(s.x - b.x - mo[0], s.y - b.y - mo[1], s.z - b.z - mo[2]) <= gap && s.out > 0; }).length;
  ok(starts === off.lines && against === off.seedPts.length, `every seed sits just off its brick, in open space, where the field leaves the surface (${against} of ${off.seedPts.length})`);
  ok(inBrick === 0, "no segment runs through a brick");
  ok(segs.every(Number.isFinite), "every coordinate is finite");
  const again = new Flux(g, { material: "ferro", strength: 3, az: 20, el: 55, applied: false }).compute().trace();
  ok(again.length === segs.length && again.every((v, i) => v === segs[i]), "the same lines twice");
}

section("the section");
{
  const g = new Growth(48112).run(2500);
  const F = new Flux(g, { material: "dia", strength: 3, az: 20, el: 55 }).compute();
  const c = [(F.lo[0] + F.hi[0]) / 2, (F.lo[1] + F.hi[1]) / 2, (F.lo[2] + F.hi[2]) / 2], ext = Math.max(F.hi[0] - F.lo[0], F.hi[1] - F.lo[1], F.hi[2] - F.lo[2]) / 2;
  const S = F.section({ c, n: [0.6, -0.7, 0.4], ext });
  ok(S.res === 128 && S.rgba.length === 128 * 128 * 4 && S.stamp === 1 && !S.done, "a quick plane from the grid: one texture, not yet sharp");
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  ok(Math.abs(dot(S.u, S.n)) < 1e-9 && Math.abs(dot(S.v, S.n)) < 1e-9 && Math.abs(dot(S.u, S.v)) < 1e-9 && Math.abs(len(S.u) - 1) < 1e-9 && Math.abs(len(S.v) - 1) < 1e-9, "an orthonormal basis in the plane");
  const corners = S.corners();
  ok(corners.length === 12 && Math.abs(Math.hypot(corners[3] - corners[0], corners[4] - corners[1], corners[5] - corners[2]) - 2 * ext) < 1e-9, "the quad spans the box");
  // the plane cuts the crystal where there are bricks
  let solid = 0, agree = 0, p = [0, 0, 0];
  for (let j = 0; j < S.res; j += 4) for (let i = 0; i < S.res; i += 4) { const k = j * S.res + i; S.at(i, j, p); const s = F.solid(p[0], p[1], p[2]); if (s) solid++; if (s === (S.solid[k] > 0)) agree++; }
  ok(solid > 20 && agree === 32 * 32, `the cut is where the bricks are (${solid} of 1024 probes solid)`);
  const quick = S.bm.slice();
  let calls = 0; while (!S.refine(1000)) calls++;
  ok(S.done && S.stamp > 1, `sharp after ${calls + 1} calls`);
  // sharp agrees with the dipoles directly, and differs from the grid somewhere
  let off = 0, moved = 0, b = [0, 0, 0];
  for (let j = 0; j < S.res; j += 8) for (let i = 0; i < S.res; i += 8) { const k = j * S.res + i; if (S.solid[k]) continue; S.at(i, j, p); F.fieldAt(p[0], p[1], p[2], b); if (Math.abs(len(b) - S.bm[k]) > 1e-6) off++; if (Math.abs(quick[k] - S.bm[k]) > 1e-3) moved++; }
  ok(off === 0 && moved > 0, `the sharp plane is the dipoles' own field (${moved} of 256 probes moved from the grid's)`);
  ok(S.rgba.every((v) => v >= 0 && v <= 255) && S.lic.every((v) => v >= 0 && v <= 1), "a texture of bytes, a convolution in [0, 1]");
  const S2 = new Section(F, { c, n: [0.6, -0.7, 0.4], ext }); while (!S2.refine(1000)) { /* */ }
  ok(S2.rgba.every((v, i) => v === S.rgba[i]), "the same plane twice");
  // an axis plane, and a coarse one
  const Z = F.section({ c, n: [0, 0, 1], ext, res: 64 });
  ok(Z.res === 64 && Math.abs(Z.u[2]) < 1e-9 && Math.abs(Z.v[2]) < 1e-9, "a floor plan at half resolution lies flat");
  // domains colour the cut of a ferromagnet, the metal's grey otherwise
  const Fm = new Flux(g, { material: "ferro", strength: 3, applied: false }).compute();
  const Sm = Fm.section({ c, n: [0.6, -0.7, 0.4], ext });
  let k0 = -1; for (let k = 0; k < S.solid.length; k++) if (S.solid[k]) { k0 = k; break; }
  ok(k0 >= 0 && S.rgba[k0 * 4] === S.rgba[k0 * 4 + 1] && Sm.rgba[k0 * 4] !== Sm.rgba[k0 * 4 + 1], "the cut is grey for an induced magnet and coloured by domain for a ferromagnet");
}

console.log(`\n${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
