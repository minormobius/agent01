// verbflow.selftest.mjs — pin upperrind's flavour layer: the dominant-verbs palette + the whorl
// flow field. Pure math, no canvas, no deps. Run: node rind/upperrind/verbflow.selftest.mjs
import { buildPocketWorld } from '../ops/pocketweave.js';
import { VERB_COLORS, verbColor, dominantVerb, floorHue, flowAt, whorlPath, WARD_VERBS, vhex } from './verbflow.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const approx = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// ── 1. the palette: six ward verbs, all present, all distinct hues ──
ok(WARD_VERBS.length === 6, 'six ward verbs');
const cols = WARD_VERBS.map((v) => verbColor(v));
ok(cols.every((c) => /^#[0-9a-f]{6}$/i.test(c)), 'every ward verb has a hex colour');
ok(new Set(cols).size === 6, 'the six ward-verb colours are all distinct');
ok(verbColor('nonesuch') === verbColor('nonesuch') && verbColor('nonesuch')[0] === '#', 'unknown verb → a fallback hex');
ok(VERB_COLORS.mend && VERB_COLORS.play, 'palette exposes the raw map');

// ── 2. dominant verb + floor hue resolve over a real world ──
const world = buildPocketWorld(7);
const wv = [];
for (let i = 0; i < 6; i++) { const v = dominantVerb(world, 'W' + i); ok(!!v, `W${i} has a dominant verb`); wv.push(v); }
ok(new Set(wv).size === 6, 'the six whites carry six distinct dominant verbs');
ok(dominantVerb(world, 'CW') === null && dominantVerb(world, 'CP') === null, 'commons have no ward verb');
ok(dominantVerb(world, 'P3') === null && dominantVerb(world, 'X0:1') === null, 'engines & interfaces have no ward verb');
// white floor hue == its verb colour; engine floor hue == its engine colour
for (let i = 0; i < 6; i++) { const h = floorHue(world, 'W' + i), vc = vhex(verbColor(wv[i])); ok(h[0] === vc[0] && h[1] === vc[1] && h[2] === vc[2], `W${i} floor hue == verb colour`); }
for (let j = 0; j < 8; j++) { const h = floorHue(world, 'P' + j), ec = vhex(world.wefts[j].color); ok(h[0] === ec[0] && h[2] === ec[2], `P${j} floor hue == engine hue`); }
{ const whiteHues = Array.from({ length: 6 }, (_, i) => floorHue(world, 'W' + i).join(',')); ok(new Set(whiteHues).size === 6, 'six white floors, six distinct hues'); }

// ── 3. flowAt: tangent perpendicular to the spine normal, hub→rim ──
{
  const p = world.pocket('W0'); p.ensureSeg(0);
  const s = p.spine[10];
  const f = flowAt(p.spine, s.x, s.y);
  ok(f.i >= 0, 'flowAt finds a sample');
  // tangent (cosθ,sinθ) should be orthogonal to the normal (nx,ny)
  const dot = Math.cos(f.theta) * s.nx + Math.sin(f.theta) * s.ny;
  ok(Math.abs(dot) < 1e-6, 'flow tangent ⟂ spine normal');
  // and point toward increasing index (rim-ward): compare with the raw sample delta
  const a = p.spine[9], b = p.spine[11], dx = b.x - a.x, dy = b.y - a.y;
  ok(Math.cos(f.theta) * dx + Math.sin(f.theta) * dy > 0, 'flow points hub→rim');
  ok(flowAt(null, 0, 0).i === -1 && flowAt([], 0, 0).theta === 0, 'flowAt degrades on an empty spine');
}

// ── 4. whorlPath: bounded, monotone radius, leads along theta, chirality flips ──
{
  const theta = 0.7, r0 = 9;
  const w = whorlPath(100, 200, r0, theta, 1, { samples: 22 });
  ok(w.length === 46, 'whorl has samples+1 points');
  ok(approx(w[0], 100) && approx(w[1], 200), 'whorl starts at its centre (t=0, r=0)');
  // radius is monotone non-decreasing and bounded by r0
  let prev = -1, mono = true, bounded = true;
  for (let i = 0; i <= 22; i++) { const r = Math.hypot(w[2 * i] - 100, w[2 * i + 1] - 200); if (r < prev - 1e-9) mono = false; if (r > r0 + 1e-9) bounded = false; prev = r; }
  ok(mono, 'whorl radius grows monotonically');
  ok(bounded, 'whorl radius bounded by r0 (not a runaway log spiral)');
  ok(approx(Math.hypot(w[44] - 100, w[45] - 200), r0), 'whorl reaches r0 at the tail');
  // the origin TANGENT is exactly theta (curl is t², so φ'(0)=0) — check with a fine sample so the
  // first discrete step approaches the true lead-in direction
  const wf = whorlPath(100, 200, r0, theta, 1, { samples: 4000 });
  const lead = Math.atan2(wf[3] - 200, wf[2] - 100);
  ok(Math.abs(Math.atan2(Math.sin(lead - theta), Math.cos(lead - theta))) < 1e-3, 'whorl leads along the flow tangent');
  // chirality: mirror the tail across the flow axis
  const wl = whorlPath(0, 0, r0, theta, 1), wr = whorlPath(0, 0, r0, theta, -1);
  const cross = (px, py) => Math.cos(theta) * py - Math.sin(theta) * px;   // signed side of the flow line
  ok(cross(wl[44], wl[45]) * cross(wr[44], wr[45]) < 0, 'opposite chirality curls to opposite sides');
}

console.log(`\nverbflow.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
