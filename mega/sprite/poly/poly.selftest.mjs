// node sprite/poly/poly.selftest.mjs — the polypod kernel. Pure, no DOM.
import { buildPolyGenome, polyFrame, polySVG, PolyCritter, FAMILIES } from './poly.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const g = buildPolyGenome('poly:7', FAMILIES.spider);
const cells = polyFrame(g, 0);
ok(cells.length > 150, `frame has substance (${cells.length} cells)`);
ok(cells.every(c => c.x >= 0 && c.y >= 0 && c.x < g.w && c.y < g.h), 'all cells in-bounds');

// determinism
ok(JSON.stringify(polyFrame(buildPolyGenome('poly:7', FAMILIES.spider), 0)) === JSON.stringify(cells), 'frame deterministic');
ok(JSON.stringify(buildPolyGenome('poly:8', FAMILIES.spider)) !== JSON.stringify(g), 'different seed → different genome');

// leg count is honored: more leg pairs → more limb cells, left/right symmetric-ish at rest
function legSpread(frame, gen) {
  // count lit cells well outside the body radius (the splayed legs)
  return frame.filter(c => Math.abs(c.x - gen.cx) > gen.w * 0.22).length;
}
const six = buildPolyGenome('L', { legs: 3 }), ten = buildPolyGenome('L', { legs: 5 });
ok(legSpread(polyFrame(ten, 0), ten) > legSpread(polyFrame(six, 0), six), 'more leg pairs → more splayed limb');

// metachronal gait actually moves the legs between phases
ok(JSON.stringify(polyFrame(g, 0)) !== JSON.stringify(polyFrame(g, 0.3)), 'gait animates the legs');

// the gait is metachronal, not lock-step: legs are NOT all in the same phase. Sample two legs'
// phases at t=0 — adjacent pairs differ.
{
  const { legPhase, gaitStep } = await import('../wave.js');
  const a = gaitStep(legPhase(0, 1, 5, 0.12, {})).swing, b = gaitStep(legPhase(2, 1, 5, 0.12, {})).swing;
  ok(Math.abs(a - b) > 0.1, 'metachronal: non-adjacent legs are out of phase');
}

// family tells: crab is wide + has claws; ant has antennae; spiderbot is mechanical
const crab = buildPolyGenome('c', FAMILIES.crab);
ok(crab.genes.claws > 0.5 && crab.bodyW > 1.3, 'crab is wide with claws');
ok(buildPolyGenome('a', FAMILIES.ant).genes.antennae > 0.5, 'ant has antennae');
const bot = buildPolyGenome('b', FAMILIES.spiderbot);
ok(bot.mech === true && bot.eye === '#7fe0ff', 'spiderbot is mechanical with an optic');

// crab claws change the silhouette vs a plain spider of the same legs
ok(JSON.stringify(polyFrame(crab, 0)) !== JSON.stringify(polyFrame(buildPolyGenome('c', { legs: 5 }), 0)), 'claws alter the front limbs');

// animator reproducible + evolving
const A = new PolyCritter({ seed: 'm', genes: FAMILIES.ant }), B = new PolyCritter({ seed: 'm', genes: FAMILIES.ant });
for (let i = 0; i < 90; i++) { A.step(1/60); B.step(1/60); }
ok(JSON.stringify(A.frame()) === JSON.stringify(B.frame()), 'animator reproducible from (seed,#steps)');
const c1 = JSON.stringify(A.frame()); for (let i = 0; i < 30; i++) A.step(1/60);
ok(JSON.stringify(A.frame()) !== c1, 'animator frame evolves');

const svg = polySVG(g, 7);
ok(svg.startsWith('<svg') && svg.includes('<rect') && svg.endsWith('</svg>'), 'polySVG well-formed');

console.log(`\nsprite/poly/poly.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
