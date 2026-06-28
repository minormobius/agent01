// node sprite/radial/radial.selftest.mjs — the radial critter kernel. Pure, no DOM.
import { buildRadialGenome, radialFrame, radialSVG, RadialCritter, DEFAULT_GENES } from './radial.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── genome + frame ──
const g = buildRadialGenome('echino:7');
ok(g.arms === 5 && g.tree && g.lenByGen.length === g.depth + 1, 'genome: 5 arms, tree, lengths per gen');
const cells = radialFrame(g, null, g.size);
ok(cells.length > 40, `frame produces cells (${cells.length})`);
ok(cells.every(c => c.x >= 0 && c.y >= 0 && c.x < g.size && c.y < g.size), 'all cells in-bounds');
ok(cells.every(c => typeof c.c === 'string'), 'cells carry colors');

// determinism: same seed → identical genome + identical rest frame
const g2 = buildRadialGenome('echino:7');
ok(JSON.stringify(radialFrame(g2, null, g2.size)) === JSON.stringify(cells), 'rest frame deterministic from seed');
ok(JSON.stringify(buildRadialGenome('echino:8')) !== JSON.stringify(g), 'different seed → different genome');

// N-fold symmetry at rest: lit cells split ~evenly across the `arms` angular sectors
function sectorCounts(frame, N, arms, rot) {
  const c = (N - 1) / 2, counts = new Array(arms).fill(0);
  for (const p of frame) {
    const dx = p.x - c, dy = p.y - c; if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue; // skip the disc
    let ang = Math.atan2(dy, dx) - rot; ang = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    counts[Math.floor(ang / (Math.PI * 2) * arms) % arms]++;
  }
  return counts;
}
{
  const sc = sectorCounts(cells, g.size, g.arms, g.rot);
  const mean = sc.reduce((a, b) => a + b, 0) / g.arms;
  const spread = Math.max(...sc) - Math.min(...sc);
  ok(spread <= mean * 0.5, `rest pose is ~rotationally symmetric (sectors ${sc.join(',')}, mean ${mean.toFixed(0)})`);
}

// arm count is honored: a 7-armed critter splits into 7 sectors with mass in each
{
  const g7 = buildRadialGenome('hept', { arms: 7 });
  const sc = sectorCounts(radialFrame(g7, null, g7.size), g7.size, 7, g7.rot);
  ok(sc.length === 7 && sc.every(v => v > 0), `7 arms → 7 populated sectors (${sc.join(',')})`);
}

// branching: deeper genomes have strictly more filament than shallow ones
{
  const shallow = radialFrame(buildRadialGenome('br', { depth: 1 }), null, 41).length;
  const deep = radialFrame(buildRadialGenome('br', { depth: 4 }), null, 41).length;
  ok(deep > shallow, `more branching → more cells (depth1 ${shallow} < depth4 ${deep})`);
}

// ── Kuramoto animator ──
const cr = new RadialCritter({ seed: 'k', genes: { arms: 6, coupling: 2.5 } });
ok(cr.n === 6 && cr.theta.length === 6, 'critter allocates 6 oscillators');
const r0 = cr.order();
for (let i = 0; i < 600; i++) cr.step(1 / 60);
const rHi = cr.order();
ok(rHi > 0.85, `strong coupling synchronizes the arms (r ${r0.toFixed(2)}→${rHi.toFixed(2)})`);

// no coupling → arms drift apart (lower order than the synchronized case)
const cr0 = new RadialCritter({ seed: 'k', genes: { arms: 6, coupling: 0 } });
for (let i = 0; i < 600; i++) cr0.step(1 / 60);
ok(cr0.order() < rHi, `K=0 stays desynchronized (r ${cr0.order().toFixed(2)} < ${rHi.toFixed(2)})`);

// animator determinism: same seed + #steps → identical frame
const a = new RadialCritter({ seed: 'det', genes: { arms: 5 } });
const b = new RadialCritter({ seed: 'det', genes: { arms: 5 } });
for (let i = 0; i < 120; i++) { a.step(1 / 60); b.step(1 / 60); }
ok(JSON.stringify(a.frame()) === JSON.stringify(b.frame()), 'animator reproducible from (seed, #steps)');

// the frame changes as it writhes (it's alive, not static)
const c1 = JSON.stringify(a.frame()); for (let i = 0; i < 60; i++) a.step(1 / 60);
ok(JSON.stringify(a.frame()) !== c1, 'frame evolves as the arms writhe');

// ── the central eye chases the psyche: the pupil dilates as sync drops ──
{
  const ge = buildRadialGenome('eye', { arms: 6 });
  const pupil = (theta) => radialFrame(ge, theta, ge.size).filter(c => c.c === '#06070a').length;
  const synced = new Float64Array(6).fill(1.0);            // r = 1 (locked)
  const spread = Float64Array.from({ length: 6 }, (_, i) => i * Math.PI * 2 / 6); // r ≈ 0 (chaos)
  const pSync = pupil(synced), pWander = pupil(spread);
  ok(pSync > 0, 'eye has a pupil');
  ok(pWander > pSync, `pupil dilates as sync drops (locked ${pSync} < chaotic ${pWander})`);
  // and the iris carries the accent hue, not a gold arm shade
  ok(radialFrame(ge, synced, ge.size).some(c => /^hsl\(/.test(c.c) && c.c.includes(`${ge.genes.accentHue}`)), 'iris uses the accent hue');
}

// SVG well-formed
const svg = radialSVG(g, 10);
ok(svg.startsWith('<svg') && svg.includes('<rect') && svg.endsWith('</svg>'), 'radialSVG well-formed');

console.log(`\nsprite/radial/radial.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
