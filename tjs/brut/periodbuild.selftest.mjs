#!/usr/bin/env node
// periodbuild.selftest.mjs — one building in its period, on its own plot (the /brut/period/ kernel).
//
//   node tjs/brut/periodbuild.selftest.mjs
import { building, resolveParams, paramsToQuery, deriveParams, subtract, ERAS } from './periodbuild.js';
import { PERIODS } from './period.js';

let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) failed++; };

// determinism, purity, the permalink
{
  const a = JSON.stringify(building(resolveParams('era=haussmann&s=k2')).parts), b = JSON.stringify(building(resolveParams('era=haussmann&s=k2')).parts);
  const R = Math.random; Math.random = () => { throw new Error('Math.random'); };
  let pure = true; try { for (const e of ERAS) building(resolveParams(`era=${e}&s=x`)); } catch { pure = false; }
  Math.random = R;
  ok(a === b && pure, 'the same seed is the same building, and every era builds with Math.random removed');
  let round = 0;
  for (const e of ERAS) for (const q of [`era=${e}&s=7`, `era=${e}&s=7&w=9.5`, `era=${e}&s=q&n=3&d=11`]) { const p = resolveParams(q); if (JSON.stringify(resolveParams(paramsToQuery(p))) === JSON.stringify(p)) round++; }
  ok(round === ERAS.length * 3 && paramsToQuery(resolveParams('era=georgian&s=7')) === 'era=georgian&s=7', `the permalink round-trips (${round} links), and an untouched seed's link is just its era and seed`);
}

// a wall with holes in it: the pieces and the holes tile the face exactly
{
  const holes = [{ x0: 1, x1: 2, z0: 1, z1: 3 }, { x0: 3, x1: 4.5, z0: 0, z1: 2.5 }, { x0: 1.5, x1: 3.5, z0: 4, z1: 5 }];
  const pc = subtract({ x0: 0, x1: 6, z0: 0, z1: 6 }, holes, [2, 4.5]), area = pc.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
  let overlap = 0;
  for (const r of pc) for (const h of holes) if (r.x0 < h.x1 - 1e-9 && h.x0 < r.x1 - 1e-9 && r.z0 < h.z1 - 1e-9 && h.z0 < r.z1 - 1e-9) overlap++;
  ok(Math.abs(area + 2 + 3.75 + 2 - 36) < 1e-9 && overlap === 0, `subtract: ${pc.length} wall pieces + the openings tile the face exactly, none over a hole`);
}

// every era: sound parts, on its plot, a plan per storey inside the walls
{
  let bad = 0, off = 0, total = 0, planBad = 0, levels = 0, noStair = 0;
  for (const e of ERAS) for (const s of ['1', '2', '3', 'a', 'b']) {
    const b = building(resolveParams(`era=${e}&s=${s}`), 0, { endRight: true });
    const site = new Set(['pavement', 'kerb', 'road', 'yard', 'under', 'garden', 'front', 'area floor', 'area wall', 'step', 'rail', 'bar']);
    for (const p of b.parts) {
      total++;
      const v = p.shape === 'quad' || p.shape === 'tri' ? p.pts.flat() : [p.x, p.y, p.z, p.w ?? 1, p.h ?? 1, p.d ?? 1, p.r ?? 1];
      if (v.some((x) => !Number.isFinite(x)) || (!p.shape && (p.w <= 0 || p.h <= 0 || p.d <= 0))) bad++;
      if (!site.has(p.kind) && !p.shape && (p.x < -1.2 || p.x > b.W + 1.2 || p.z > 1.6 || p.z < -b.D - 1.2)) off++;
    }
    for (const L of b.plan) {
      levels++;
      if (!L.stair && !(e === 'village')) noStair++;
      for (const r of [...L.rooms, ...(L.stair ? [L.stair] : [])]) if (r.x0 < -1e-6 || r.y0 < -1e-6 || r.x1 > b.W + 1e-6 || r.y1 > b.D + 1e-6 || r.x1 <= r.x0 || r.y1 <= r.y0) planBad++;
    }
  }
  ok(bad === 0, `${total.toLocaleString()} parts across ${ERAS.length} eras × 5 seeds, every one finite with a positive size`);
  ok(off === 0, 'every part of the building stands on its plot (a jetty, a cornice or a balcony oversails by at most a metre)');
  ok(planBad === 0 && noStair === 0, `${levels} floor plans, every room inside the walls and a stair on every floor (a longhouse needs none)`);
}

// what the parts SAY about the period
{
  const g = building(resolveParams('era=georgian&s=7')), kinds = (b) => new Set(b.parts.map((p) => p.kind));
  const gk = kinds(g), glass = g.parts.filter((p) => p.kind === 'glass').length, sashes = g.shell.walls.reduce((s, w) => s + w.openings.filter((o) => o.kind === 'sash').length, 0);
  ok(['flat arch', 'sill', 'meeting rail', 'glazing bar', 'fanlight', 'pilaster', 'rustication', 'modillion', 'coping', 'chimney stack', 'chimney pot', 'area wall', 'step', 'bar'].every((k) => gk.has(k)) && glass === sashes, `a Georgian house is built of its details: gauged flat arches, sills, meeting rails, a fanlight and doorcase, rustication, modillions, its stacks and pots, its area, steps and railings (and a pane for each of its ${sashes} sashes)`);
  const front = g.shell.walls.find((w) => w.kind === 'front'), sash = front.openings.find((o) => o.kind === 'sash' && o.z0 > 2);
  const glassFront = g.parts.filter((p) => p.kind === 'glass' && Math.abs(p.ry) < 1e-6 && p.z > -0.5).map((p) => p.z);
  ok(glassFront.length && glassFront.every((z) => z < -0.1 && z > -0.25), `the sashes sit back in their reveals (glass ${(-Math.max(...glassFront) * 100).toFixed(0)}–${(-Math.min(...glassFront) * 100).toFixed(0)} cm behind the face: the 1709 Act's four inches)`);
  const walls = g.parts.filter((p) => p.kind === 'wall' && Math.abs(p.ry) < 1e-6 && p.z > -1);
  const thick = (z) => Math.max(...walls.filter((p) => Math.abs(p.y - z) < 1).map((p) => p.d));
  ok(thick(1) > thick(g.eaves - 1.2), `its walls thicken toward the ground (${(thick(1) * 1000).toFixed(0)} mm at the street, ${(thick(g.eaves - 1.2) * 1000).toFixed(0)} mm at the top)`);
  const m = building(resolveParams('era=medieval&s=3')), mk = kinds(m);
  const jet = Math.max(...m.parts.filter((p) => p.kind === 'wall' && Math.abs(p.ry) < 1e-6 && p.z > -1).map((p) => p.z + p.d / 2));
  ok(['bressumer', 'joist end', 'post', 'brace', 'front gable', 'counter'].every((k) => mk.has(k)) && jet > 0.6, `a medieval house oversails the street ${jet.toFixed(2)} m by its top storey, on bressumers and joist ends; posts, braces, a gable to the street, a shop counter let down`);
  const h = building(resolveParams('era=haussmann&s=3')), hk = kinds(h);
  ok(['brisis', 'terrasson', 'dormer', 'balcony slab', 'console', 'architrave', 'window cornice', 'fascia', 'carriage door'].every((k) => hk.has(k)), 'a Haussmann block: a mansard (slate brisis, zinc terrasson) with dormers, balconies on consoles, stone surrounds, the étage noble crowned, shopfronts and the porte cochère');
  const gl = building(resolveParams('era=glass&s=3'));
  ok(!gl.parts.some((p) => p.kind === 'wall') && gl.parts.filter((p) => p.kind === 'mullion').length > 200, 'a glass tower has no wall at all: its face is mullions, transoms and glass hung on the frame');
}

// a seed's own building stands up
{
  let fail = 0, n = 0;
  for (const e of ERAS) { if (!['masonry', 'stone'].includes(PERIODS[e].system)) continue; for (let s = 0; s < 40; s++) { const b = building(resolveParams(`era=${e}&s=${s}`)); n++; if (!b.structure.ok) fail++; } }
  const pushed = building(resolveParams('era=georgian&s=7&n=9'));
  ok(fail === 0 && !pushed.structure.ok, `all ${n} seeded load-bearing buildings stand; pushed to nine storeys, a Georgian house says it would not (${(pushed.structure.worst * 100).toFixed(0)}%)`);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
