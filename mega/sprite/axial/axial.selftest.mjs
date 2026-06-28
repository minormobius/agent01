// node sprite/axial/axial.selftest.mjs — the axial/vermiform kernel. Pure, no DOM.
import { buildAxialGenome, axialFrame, axialSVG, AxialCritter, FAMILIES } from './axial.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const g = buildAxialGenome('ax:7', FAMILIES.snake);
const cells = axialFrame(g, 0);
ok(cells.length > 150, `frame has substance (${cells.length} cells)`);
ok(cells.every(c => c.x >= 0 && c.y >= 0 && c.x < g.w && c.y < g.h), 'all cells in-bounds');

// determinism
ok(JSON.stringify(axialFrame(buildAxialGenome('ax:7', FAMILIES.snake), 0)) === JSON.stringify(cells), 'frame deterministic');
ok(JSON.stringify(buildAxialGenome('ax:8', FAMILIES.snake)) !== JSON.stringify(g), 'different seed → different genome');

// the slither: the undulation wave moves the body between phases
ok(JSON.stringify(axialFrame(g, 0)) !== JSON.stringify(axialFrame(g, 0.3)), 'undulation animates the body');

// the body actually undulates: its vertical spread is larger than a straight tube would give
function ySpread(frame) { const ys = frame.map(c => c.y); return Math.max(...ys) - Math.min(...ys); }
ok(ySpread(axialFrame(g, 0)) > g.girth * 2, 'body undulates beyond its own girth');

// longer body → wider horizontal extent
function xSpread(gen) { const f = axialFrame(gen, 0), xs = f.map(c => c.x); return Math.max(...xs) - Math.min(...xs); }
ok(xSpread(buildAxialGenome('L', { length: 1.4 })) > xSpread(buildAxialGenome('L', { length: 0.6 })), 'longer gene → longer body');

// annulation is derived from `segments`: more rings → more dark band cells
function ringCells(gen) { return axialFrame(gen, 0).filter(c => c.c === gen.dark).length; }
ok(ringCells(buildAxialGenome('r', { segments: 16 })) > ringCells(buildAxialGenome('r', { segments: 4 })), 'more segments → more ring cells');

// family tells: eel has fins (more cells than a finless twin), mech-worm is mechanical
const eel = buildAxialGenome('e', FAMILIES.eel), eelNoFin = buildAxialGenome('e', { ...FAMILIES.eel, fins: 0 });
ok(axialFrame(eel, 0).length > axialFrame(eelNoFin, 0).length, 'eel fins add silhouette');
const mw = buildAxialGenome('m', FAMILIES.mechworm);
ok(mw.mech === true && mw.eye === '#7fe0ff', 'mech-worm is mechanical with an optic');

// animator reproducible + evolving
const A = new AxialCritter({ seed: 'm', genes: FAMILIES.worm }), B = new AxialCritter({ seed: 'm', genes: FAMILIES.worm });
for (let i = 0; i < 90; i++) { A.step(1/60); B.step(1/60); }
ok(JSON.stringify(A.frame()) === JSON.stringify(B.frame()), 'animator reproducible from (seed,#steps)');
const c1 = JSON.stringify(A.frame()); for (let i = 0; i < 30; i++) A.step(1/60);
ok(JSON.stringify(A.frame()) !== c1, 'animator frame evolves');

const svg = axialSVG(g, 7);
ok(svg.startsWith('<svg') && svg.includes('<rect') && svg.endsWith('</svg>'), 'axialSVG well-formed');

console.log(`\nsprite/axial/axial.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
