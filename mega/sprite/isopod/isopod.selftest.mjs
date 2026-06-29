// node sprite/isopod/isopod.selftest.mjs — the isopod kernel (axial × polypod hybrid). Pure, no DOM.
import { buildIsopodGenome, isopodFrame, isopodSVG, IsopodCritter, FAMILIES } from './isopod.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const g = buildIsopodGenome('iso:7', FAMILIES.pillbug);
const cells = isopodFrame(g, 0);
ok(cells.length > 180, `frame has substance (${cells.length} cells)`);
ok(cells.every(c => c.x >= 0 && c.y >= 0 && c.x < g.w && c.y < g.h), 'all cells in-bounds');

// determinism
ok(JSON.stringify(isopodFrame(buildIsopodGenome('iso:7', FAMILIES.pillbug), 0)) === JSON.stringify(cells), 'frame deterministic');
ok(JSON.stringify(buildIsopodGenome('iso:8', FAMILIES.pillbug)) !== JSON.stringify(g), 'different seed → different genome');

// THE HYBRID: one leg pair per segment (polypod half) → more segments = more splayed limb cells
function legSpread(gen) { return isopodFrame(gen, 0).filter(c => Math.abs(c.x - gen.cx) > gen.baseW + 1).length; }
const s5 = buildIsopodGenome('H', { segments: 5 }), s10 = buildIsopodGenome('H', { segments: 10 });
ok(legSpread(s10) > legSpread(s5), `more segments → more legs (${legSpread(s5)} < ${legSpread(s10)})`);

// the metachronal gait animates the legs
ok(JSON.stringify(isopodFrame(g, 0)) !== JSON.stringify(isopodFrame(g, 0.3)), 'gait animates the legs');

// THE OTHER HALF: segmented armour (axial seams) → segment count drives the dark seam cells
function seamCells(gen) { return isopodFrame(gen, 0).filter(c => c.c === gen.dark).length; }
ok(seamCells(buildIsopodGenome('S', { segments: 10, legGirth: 0.4 })) > seamCells(buildIsopodGenome('S', { segments: 4, legGirth: 0.4 })), 'more segments → more seam cells');

// family tells: giant is bigger than pillbug; mech-pod is mechanical
ok(isopodFrame(buildIsopodGenome('f', FAMILIES.giant), 0).length > isopodFrame(buildIsopodGenome('f', FAMILIES.pillbug), 0).length, 'giant isopod is bulkier than a pill-bug');
const mp = buildIsopodGenome('m', FAMILIES.mechpod);
ok(mp.mech === true && mp.eye === '#7fe0ff', 'mech-pod is mechanical with an optic');

// the body is roughly bilaterally symmetric (top-down): equal mass left and right of the axis
{
  const f = isopodFrame(g, 0); let l = 0, r = 0;
  for (const c of f) { if (c.x < g.cx - 0.5) l++; else if (c.x > g.cx + 0.5) r++; }
  ok(Math.abs(l - r) < (l + r) * 0.18, `bilateral (${l} vs ${r})`);
}

// animator reproducible + evolving
const A = new IsopodCritter({ seed: 'm', genes: FAMILIES.woodlouse }), B = new IsopodCritter({ seed: 'm', genes: FAMILIES.woodlouse });
for (let i = 0; i < 90; i++) { A.step(1/60); B.step(1/60); }
ok(JSON.stringify(A.frame()) === JSON.stringify(B.frame()), 'animator reproducible from (seed,#steps)');
const c1 = JSON.stringify(A.frame()); for (let i = 0; i < 30; i++) A.step(1/60);
ok(JSON.stringify(A.frame()) !== c1, 'animator frame evolves');

const svg = isopodSVG(g, 7);
ok(svg.startsWith('<svg') && svg.includes('<rect') && svg.endsWith('</svg>'), 'isopodSVG well-formed');

console.log(`\nsprite/isopod/isopod.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
