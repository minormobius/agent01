#!/usr/bin/env node
// drawing.selftest.mjs — the SVG drawing, checked by its numbers: the views
// it lays out, the overall dimensions it writes, the holes it calls out and
// how it groups them, hidden lines where the geometry says there must be
// some, and that the same input gives the same SVG twice.
import fs from 'node:fs';
import path from 'node:path';
import { drawing, VIEWS } from './lib/drawing.js';
import { flatten, solveAngles, modelOf } from './lib/assembly.js';
import { kernels, facesOf, benchRef, ROOT } from './agent/common.mjs';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const bench = (n) => fs.readFileSync(path.join(ROOT, 'bench', `${n}.json`), 'utf8');
const { engine } = await kernels();
const part = (n) => { const r = engine.build(bench(n), { kernel: 'truck' }); if (!r.ok) throw new Error(`${n}: ${r.report.error?.msg}`); return { id: n, mesh: r.mesh, faces: r.report.faces }; };

// 1. the plate: three views, its size, its nine holes in three diameters
{
  const d = drawing([part('plate')], { title: 'plate' });
  check(d.views.map((v) => v.name).join() === 'front,top,right' && d.svg.startsWith('<svg') && d.svg.includes('data-view="top"'), `three views in one SVG (${(d.svg.length / 1024).toFixed(0)} kB, ${d.ms.toFixed(0)} ms)`);
  check(near(d.overall[0], 40, 1e-3) && near(d.overall[1], 40, 1e-3) && near(d.overall[2], 1.5, 1e-6), `overall ${d.overall.map((x) => +x.toFixed(3)).join(' × ')} (⌀40 × 1.5)`);
  const dims = Object.fromEntries(d.dims.map((x) => [x.axis, +x.value.toFixed(3)]));
  check(dims.width === 40 && dims.height === 1.5 && dims.depth === 40 && d.svg.includes('>40<') && d.svg.includes('>1.5<'), `dimensions written: width ${dims.width}, height ${dims.height}, depth ${dims.depth}`);
  const groups = new Map(); for (const h of d.holes) groups.set(h.diameter.toFixed(3), (groups.get(h.diameter.toFixed(3)) || 0) + 1);
  // the tree says one ⌀1 centre, five ⌀0.32 pivots, three ⌀1.2 pillars — and a circle is four exact arcs, so each is four cylindrical faces
  check(d.holes.length === 9 && groups.get('1.200') === 3 && groups.get('0.320') === 5 && groups.get('1.000') === 1 && d.holes.every((h) => h.names.length === 4), `the tree's 9 holes, each from 4 arc faces: ${[...groups].map(([k, n]) => `${n}× ⌀${+k}`).join(', ')}`);
  check(d.holes.every((h) => near(h.depth, 1.5, 1e-6)) && d.svg.includes('3× ⌀1.2') && d.svg.includes('5× ⌀0.32') && d.svg.includes('>⌀1<') && !d.svg.includes('↧'), 'every hole is through the plate: called out by count and diameter (a lone hole by diameter alone), no depth');
  const top = d.views.find((v) => v.name === 'top'), front = d.views.find((v) => v.name === 'front');
  check(top.callouts === 9 && front.callouts === 0, 'the holes are called out on the top view, whose direction is their axis');
  check(front.hidden > 0 && d.svg.includes('class="h"'), `the front view has hidden lines (${front.hidden}): the bores seen through the plate`);
  check(d.scale === '2:1', `the sheet is drawn at ${d.scale}`);
  const again = drawing([part('plate')], { title: 'plate' });
  check(again.svg === d.svg, 'the same input draws the same SVG');
}
// 2. a blind bore reads its depth; a boss is not a hole
{
  const d = drawing([part('case')], { title: 'case' });
  check(d.holes.length === 1 && near(d.holes[0].diameter, 42, 1e-6) && near(d.holes[0].depth, 7, 1e-6) && d.svg.includes('⌀42 ↧7'), `the cup's interior is one blind bore: ⌀${d.holes[0]?.diameter} ↧${d.holes[0]?.depth}, its rim is not a hole`);
  const dims = Object.fromEntries(d.dims.map((x) => [x.axis, +x.value.toFixed(2)]));
  check(dims.width === 44 && dims.height === 8, `overall ${dims.width} × ${dims.height}`);
}
// 3. views on demand, no hidden lines on request, a bad view named
{
  const d = drawing([part('arbor')], { views: ['iso', 'front'], hidden: false });
  check(d.views.length === 2 && d.views[0].name === 'iso' && d.views.every((v) => v.hidden === 0) && !d.svg.includes('class="h"'), 'iso and front, no hidden lines when not asked');
  let err = ''; try { drawing([part('arbor')], { views: ['side'] }); } catch (e) { err = e.message; }
  check(/no view named side/.test(err) && Object.keys(VIEWS).length === 7, `an unknown view is refused: ${err}`);
}
// 4. an assembly, posed: the lift at half a turn
{
  const lift = JSON.parse(bench('lift'));
  const { components, mates, drive, partTrees } = await flatten(lift, benchRef, { facesOf });
  const angles = solveAngles(components, mates, drive, 0.5);
  const built = new Map(); for (const [k, tr] of partTrees) built.set(k, engine.build(tr, { kernel: 'truck' }));
  const bodies = components.filter((c) => !c.reference).map((c) => ({ id: c.id, mesh: built.get(c.partKey).mesh, model: modelOf(c, angles), faces: built.get(c.partKey).report.faces }));
  const d = drawing(bodies, { title: 'lift', note: 't = 0.5 s' });
  const dims = Object.fromEntries(d.dims.map((x) => [x.axis, +x.value.toFixed(3)]));
  check(bodies.length === 7 && d.svg.includes('7 bodies') && d.svg.includes('t = 0.5 s'), `seven posed bodies on one sheet (${d.ms.toFixed(0)} ms)`);
  const platform = d.holes.filter((h) => h.body === 'platform'), nut = d.holes.filter((h) => h.body === 'nut');
  check(dims.width === 24 && dims.height === 40 && dims.depth === 24, `the posed assembly is dimensioned as a whole: ${dims.width} × ${dims.depth} × ${dims.height}`);
  check(platform.length === 8 && nut.length === 1 && platform.some((h) => Math.abs(h.diameter - 1.2) < 1e-6), `holes are found per body and named per part: ${platform.length} in the platform, ${nut.length} in the nut`);
}
console.log(fails ? `\n✗ ${fails} failing` : '\n✓ drawing selftest passed');
process.exit(fails ? 1 : 0);
