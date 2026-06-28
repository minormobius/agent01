// node sprite/quad/quad.selftest.mjs — the quadruped kernel. Pure, no DOM.
import { buildQuadGenome, quadFrame, quadSVG, QuadCritter, FAMILIES, DEFAULT_GENES } from './quad.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const g = buildQuadGenome('quad:7', FAMILIES.hound);
const cells = quadFrame(g, 0);
ok(cells.length > 120, `frame has substance (${cells.length} cells)`);
ok(cells.every(c => c.x >= 0 && c.y >= 0 && c.x < g.w && c.y < g.h), 'all cells in-bounds');
ok(cells.every(c => typeof c.c === 'string'), 'cells carry colors');

// determinism
ok(JSON.stringify(quadFrame(buildQuadGenome('quad:7', FAMILIES.hound), 0)) === JSON.stringify(cells), 'frame deterministic from (seed,genes,t)');
ok(JSON.stringify(buildQuadGenome('quad:8', FAMILIES.hound)) !== JSON.stringify(g), 'different seed → different genome');

// gait actually animates: feet move between phases
function feet(frame, gen) {
  // count lit cells on the ground line — leg/foot contact shifts as it trots
  return frame.filter(c => c.y >= gen.groundLine - 0.5).map(c => c.x).sort((a,b)=>a-b).join(',');
}
ok(feet(quadFrame(g, 0), g) !== feet(quadFrame(g, 0.28), g), 'gait moves the legs between phases');
ok(JSON.stringify(quadFrame(g, 0)) !== JSON.stringify(quadFrame(g, 0.4)), 'frame evolves as it trots');

// family proportions express: a bear has a deeper trunk than a hound (more body cells)
const bear = quadFrame(buildQuadGenome('f', FAMILIES.bear), 0).length;
const hound = quadFrame(buildQuadGenome('f', FAMILIES.hound), 0).length;
ok(bear > hound, `bear is bulkier than hound (${hound} < ${bear} cells)`);

// robot chassis swaps the eye to the mechanical tell + a steel hue
const robo = buildQuadGenome('r', FAMILIES.robot);
ok(robo.mech === true && robo.eye === '#ff6a6a', 'robot is mechanical with a red optic');
ok(robo.genes.hue === 210, 'robot uses a steel hue');

// faceLeft mirrors horizontally
const r0 = quadFrame(g, 0), rL = quadFrame(g, 0, true);
const head0 = Math.max(...r0.map(c => c.x)), headL = Math.min(...rL.map(c => c.x));
ok((g.w - 1 - head0) === headL, 'faceLeft mirrors the silhouette');

// animator: reproducible from seed + #steps, and it moves
const a = new QuadCritter({ seed: 'm', genes: FAMILIES.boar }), b = new QuadCritter({ seed: 'm', genes: FAMILIES.boar });
for (let i = 0; i < 90; i++) { a.step(1/60); b.step(1/60); }
ok(JSON.stringify(a.frame()) === JSON.stringify(b.frame()), 'animator reproducible from (seed,#steps)');
const c1 = JSON.stringify(a.frame()); for (let i = 0; i < 40; i++) a.step(1/60);
ok(JSON.stringify(a.frame()) !== c1, 'animator frame evolves');

// SVG
const svg = quadSVG(g, 8);
ok(svg.startsWith('<svg') && svg.includes('<rect') && svg.endsWith('</svg>'), 'quadSVG well-formed');

console.log(`\nsprite/quad/quad.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
