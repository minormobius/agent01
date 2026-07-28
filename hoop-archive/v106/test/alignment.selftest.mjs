// alignment.selftest — PLANETARY ALIGNMENT (alignment.js). Pins: a zeroed tally, resolving any game thing
// to its planet (explicit / gem lattice / item material / raw tag), the tally + normalize + dominant + rank
// math, and the 7-axis radar geometry. Pure — no DOM.
//
//   node hoop/v106/test/alignment.selftest.mjs

import { newAlignment, coerce, planetOfThing, tally, tallyAll, total, normalized, dominant, ranked, radarPoints } from '../alignment.js';
import { PLANET_ORDER, READING_ORDER } from '../planets.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const approx = (a, b, e = 1e-9) => Math.abs(a - b) < e;

// ── 1. a fresh tally is seven zeros ──
const a0 = newAlignment();
ok(PLANET_ORDER.length === 7 && PLANET_ORDER.every((k) => a0[k] === 0), 'newAlignment() is a zeroed tally over the seven');
ok(total(a0) === 0 && dominant(a0) === null, 'an empty tally has no total and no dominant');

// ── 2. planetOfThing resolves every kind of game object ──
ok(planetOfThing('Mars') === 'mars' && planetOfThing('iron') === 'mars', 'a raw tag / metal resolves through planetOf');
ok(planetOfThing({ planet: 'venus' }) === 'venus' && planetOfThing({ planetKey: 'sol' }) === 'sol', 'an explicit .planet / .planetKey wins');
ok(planetOfThing({ system: 'hexagonal', hardness: 7 }) === 'mars', 'a gem resolves by its crystal lattice (hexagonal → mars)');
ok(planetOfThing({ material: 'gold' }) === 'sol' && planetOfThing({ material: 'iron' }) === 'mars', 'an item resolves by its material (gold → sol, iron → mars)');
ok(planetOfThing({ metal: 'lead' }) === 'saturn', 'gear with only a metal resolves it');
ok(planetOfThing(null) === null && planetOfThing({ nope: 1 }) === null, 'an unaligned / null thing resolves to null (never pollutes the tally)');

// ── 3. tally adds interactions; unresolved is a no-op ──
const a = newAlignment();
tally(a, 'mars'); tally(a, { material: 'iron' }, 2); tally(a, { system: 'hexagonal' });   // all Mars
ok(a.mars === 4, 'tally accepts a key, a thing, and a weight (4 Mars interactions)');
tally(a, { nope: 1 }); tally(a, 'venus', 0);
ok(total(a) === 4, 'an unresolved or weightless interaction is a no-op');
tallyAll(a, [{ material: 'gold' }, { planet: 'venus' }, 'venus']);
ok(a.sol === 1 && a.venus === 2, 'tallyAll folds a whole list (a gold ingot + two Venus things)');

// ── 4. normalize / dominant / rank ──
const nz = normalized(a);
ok(approx(PLANET_ORDER.reduce((s, k) => s + nz[k], 0), 1), 'normalized shares sum to 1');
ok(dominant(a) === 'mars', 'dominant is the richest axis (Mars, 4)');
const rk = ranked(a);
ok(rk.length === 7 && rk[0].planet === 'mars' && rk[0].count === 4, 'ranked lists all seven, richest first');
ok(approx(rk[0].share, 4 / 7), 'ranked carries each planet\'s share of the tally');

// ── 5. radar geometry — seven axes, top-clockwise, scaled to the strongest ──
const pts = radarPoints(a, 100, 100, 80);
ok(pts.length === 7 && pts.every((p, i) => p.planet === READING_ORDER[i]), 'radarPoints gives one vertex per planet in reading order');
ok(approx(pts[0].ax, 100) && pts[0].ay < 100, 'axis 0 (Sol) points straight up from the centre');
const marsPt = pts.find((p) => p.planet === 'mars');
ok(approx(marsPt.frac, 1), 'the strongest axis (Mars) is scaled out to the rim (frac = 1)');
ok(pts.every((p) => p.frac >= 0 && p.frac <= 1 + 1e-9), 'every data vertex sits within the rim');
const abs = radarPoints(a, 100, 100, 80, { scaleToMax: false });
ok(abs.find((p) => p.planet === 'mars').frac < 1, 'scaleToMax:false plots absolute shares (Mars < full rim)');

// ── 6. coerce repairs a sparse / stored blob ──
const rc = coerce({ mars: 3, bogus: 9 });
ok(rc.mars === 3 && rc.sol === 0 && !('bogus' in rc) && total(rc) === 3, 'coerce rebuilds a full seven-key tally from a partial save, dropping junk');

console.log(`\nalignment.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
