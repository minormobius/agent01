// verbflow.selftest.mjs — pin upperrind's flavour palette: the dominant-verbs colours and their
// (world,key) resolvers. Pure, no canvas, no deps. Run: node rind/upperrind/verbflow.selftest.mjs
import { buildPocketWorld } from '../ops/pocketweave.js';
import { VERB_COLORS, verbColor, dominantVerb, floorHue, WARD_VERBS, vhex } from './verbflow.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

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

console.log(`\nverbflow.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
