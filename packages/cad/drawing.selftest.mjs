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
  check(/^(\d+(\.\d+)?:1|1:\d+(\.\d+)?)$/.test(d.scale) && d.width <= 900 && d.svg.includes(`scale ${d.scale}`), `the sheet is drawn at a stated ratio (${d.scale}) and fits the width asked for (${d.width} px)`);
  // ordinate dimensions: where every hole sits, from a datum at the corner
  const ord = d.dims.filter((x) => x.axis.startsWith('x-') || x.axis.startsWith('y-'));
  check(ord.length === 13 && d.svg.includes('class="datum"') && ord.some((o) => Math.abs(o.value - 20) < 1e-6) && ord.some((o) => Math.abs(o.value - 32) < 1e-6), `the nine holes give ${ord.length} ordinates from the datum, on the view their axes point at`);
  const again = drawing([part('plate')], { title: 'plate' });
  check(again.svg === d.svg, 'the same input draws the same SVG');
}
// 2. internal dimensioning: a plate with a named window and a row of holes —
//    what a machinist needs and an overall size alone cannot give
{
  const tree = JSON.stringify({ units: 'mm', params: { w: 120, h: 60, t: 5, d: 6, x0: 20, p: 20, y: 15 }, features: [
    { op: 'sketch', id: 'face', loops: [
      { name: 'outline', rect: { c: [0, 0], w: 'w', h: 'h' } },
      { name: 'window', rect: { c: [0, 15], w: 60, h: 20 } },
      ...['A', 'B', 'C', 'D'].map((n, i) => ({ name: `hole${n}`, circle: { c: [`-w/2 + x0 + ${i}*p`, '-h/2 + y'], r: 'd/2' } })),
    ] },
    { op: 'extrude', id: 'plate', profile: ['face'], depth: 't' },
  ] });
  const r = engine.build(tree, { kernel: 'truck' });
  const d = drawing([{ id: 'fixture', mesh: r.mesh, faces: r.report.faces }], { title: 'fixture' });
  const by = (a) => d.dims.filter((x) => x.axis === a).map((x) => x.value).sort((p, q) => p - q);
  check(by('x-hole').join() === '20,80' && by('pitch').join() === '60' && d.svg.includes('3× 20 = 60'), `an evenly spaced row is one pitch dimension, not four ordinates: ${d.svg.includes('3× 20 = 60') ? '3× 20 = 60' : 'missing'}, ends at ${by('x-hole').join(' and ')}`);
  check(by('y-hole').join() === '15' && by('x-pocket').join() === '30,90' && by('y-pocket').join() === '35,55', `the window's edges are dimensioned from the datum: x ${by('x-pocket').join(', ')} · y ${by('y-pocket').join(', ')}`);
  check(d.svg.includes('window 60 × 20'), 'a named sketch loop is called out by its own name and size');
  // a turned part is made to diameters: its outside ones are called out too
  const nut = engine.build(JSON.stringify({ units: 'mm', features: [
    { op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [[4.2, 0], [11, 0], [11, 3.5], [5, 3.5], [5, 15], [4.2, 15]] }] },
    { op: 'revolve', id: 'nut', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } },
  ] }), { kernel: 'truck' });
  if (nut.ok) {
    const dn = drawing([{ id: 'nut', mesh: nut.mesh, faces: nut.report.faces }], { title: 'nut' });
    const dia = [...new Set(dn.diameters.map((x) => +x.diameter.toFixed(2)))].sort((a, b) => a - b);
    const bores = dn.holes.map((h) => +h.diameter.toFixed(2));
    check(bores.join() === '8.4' && dia.join() === '10,22', `a turned part reads its bore ⌀${bores.join()} and its outside diameters ⌀${dia.join(', ⌀')} — the kernel reorders a revolve's faces, so each is matched to the face it actually made`);
  } else check(false, `the turned fixture did not build: ${nut.report.error?.op}: ${nut.report.error?.msg}`);
  const overall = Object.fromEntries(d.dims.filter((x) => ['width', 'height', 'depth'].includes(x.axis)).map((x) => [x.axis, +x.value.toFixed(3)]));
  check(overall.width === 120 && overall.depth === 60 && overall.height === 5, `and the overall size still reads ${overall.width} × ${overall.depth} × ${overall.height}`);
  const noInternals = drawing([{ id: 'fixture', mesh: r.mesh, faces: r.report.faces }], { title: 'fixture', internals: false });
  check(!noInternals.dims.some((x) => x.axis.startsWith('x-')) && !noInternals.svg.includes('class="datum"'), 'internals: false draws the outline and the overall size alone');
}

// 3. a blind bore reads its depth; a boss is not a hole
{
  const d = drawing([part('case')], { title: 'case' });
  check(d.holes.length === 1 && near(d.holes[0].diameter, 42, 1e-6) && near(d.holes[0].depth, 7, 1e-6) && d.svg.includes('⌀42 ↧7'), `the cup's interior is one blind bore: ⌀${d.holes[0]?.diameter} ↧${d.holes[0]?.depth}, its rim is not a hole`);
  const dims = Object.fromEntries(d.dims.map((x) => [x.axis, +x.value.toFixed(2)]));
  check(dims.width === 44 && dims.height === 8, `overall ${dims.width} × ${dims.height}`);
}
// 4. views on demand, no hidden lines on request, a bad view named
{
  const d = drawing([part('arbor')], { views: ['iso', 'front'], hidden: false });
  check(d.views.length === 2 && d.views[0].name === 'iso' && d.views.every((v) => v.hidden === 0) && !d.svg.includes('class="h"'), 'iso and front, no hidden lines when not asked');
  let err = ''; try { drawing([part('arbor')], { views: ['side'] }); } catch (e) { err = e.message; }
  check(/no view named side/.test(err) && Object.keys(VIEWS).length === 7, `an unknown view is refused: ${err}`);
}
// 5. an assembly, posed: the lift at half a turn
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
