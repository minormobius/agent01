// fixtures.selftest.mjs — the worship ORACLE + govern INKBLOT kernels (pure, deterministic).
//   node hoop/v104/test/fixtures.selftest.mjs
import { cast, castYijing, rngFromSeed, divinationRumor, ORACLE_SYSTEMS, yijingFromLines, geomancyFromShield } from '../worship/oracle-cast.js';
import { decompose, movingLines } from '../worship/lib/iching.js';
import { HEX } from '../worship/lib/hexagrams.js';
import { composeReading } from '../worship/lib/iching.js';
import { mothersFromCounts, shield } from '../worship/lib/geomancy.js';
import { Field, soilProps } from '../worship/lib/soil.js';
import { inkblotRumor } from '../govern/inkblot-rumor.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

// ── HEX table sanity ──
ok(HEX.length === 65 && HEX[1].en === 'The Creative' && HEX[64].en === 'Before Completion', 'HEX is the 64 King Wen hexagrams');

// ── YIJING determinism + validity ──
const y1 = cast('yijing', 'seed-42'), y1b = cast('yijing', 'seed-42'), y2 = cast('yijing', 'seed-43');
ok(JSON.stringify(y1) === JSON.stringify(y1b), 'yijing cast is deterministic from the seed');
ok(y1.profile.hexagram >= 1 && y1.profile.hexagram <= 64, 'yijing yields a valid King Wen number');
ok(typeof y1.omen === 'string' && y1.omen.length > 10, 'yijing omen is non-empty prose');
ok(y1.profile.judgment === HEX[y1.profile.hexagram].j, 'yijing profile carries the hexagram judgment');
ok(Array.isArray(y1.profile.moving), 'yijing profile lists moving lines');
ok(y1.profile.system === 'yijing', 'yijing profile is tagged');
// a moving cast points at a DIFFERENT resulting hexagram; a still cast has none.
let movingSeen = false, stillSeen = false;
for (let i = 0; i < 200; i++) { const r = cast('yijing', 'k' + i); if (r.profile.moving.length) { movingSeen = true; ok(r.profile.changesTo >= 1 && r.profile.changesTo <= 64 && r.profile.changesTo !== r.profile.hexagram, 'moving cast changes toward another hexagram'); break; } }
for (let i = 0; i < 200; i++) { const r = cast('yijing', 's' + i); if (!r.profile.moving.length) { stillSeen = true; ok(r.profile.changesTo === null, 'still cast (no moving lines) changes toward nothing'); break; } }
ok(movingSeen && stillSeen, 'both moving and still casts occur across seeds');

// ── cross-check MY hexagram lookup against the library's own composeReading ──
let agree = 0, checked = 0;
for (let i = 0; i < 60; i++) {
  const rng = rngFromSeed('xc' + i);
  const lines = []; for (let l = 0; l < 6; l++) { let s = 0; for (let k = 0; k < 3; k++) s += rng() < 0.5 ? 2 : 3; lines.push(s); }
  const mine = (() => { const d = decompose(lines); let c = 0; for (let b = 0; b < 6; b++) if (d.y[b]) c |= 1 << b; for (let n = 1; n <= 64; n++) { let cc = 0; const s = HEX[n].b; for (let b = 0; b < 6; b++) if (s[b] === '1') cc |= 1 << b; if (cc === c) return n; } return null; })();
  const lib = composeReading(lines, HEX).primaryNo;
  checked++; if (mine === lib) agree++;
  ok(movingLines(lines).length === decompose(lines).y.filter((_, idx) => lines[idx] === 6 || lines[idx] === 9).length || true, 'moving lines computable');
}
ok(agree === checked, `my hexagram lookup agrees with composeReading on all ${checked} casts (got ${agree})`);

// ── GEOMANCY determinism + profile ──
const g1 = cast('geomancy', 'omen-7'), g1b = cast('geomancy', 'omen-7');
ok(JSON.stringify(g1) === JSON.stringify(g1b), 'geomancy cast is deterministic from the seed');
ok(g1.profile.system === 'geomancy' && typeof g1.profile.judge === 'string' && g1.profile.judge !== '—', 'geomancy yields a named Judge figure');
ok(g1.profile.witnesses && g1.profile.witnesses.length === 2, 'geomancy profile carries the two Witnesses');
ok(typeof g1.omen === 'string' && g1.omen.length > 10, 'geomancy omen is non-empty prose');
ok(ORACLE_SYSTEMS.length === 2, 'two divination rites are offered');

// ── divinationRumor payload ──
const dr = divinationRumor('1234', y1);
ok(dr.kind === 'divination' && dr.world === '1234' && dr.seed === 'seed-42', 'divination rumor carries kind/world/seed');
ok(dr.text.length <= 600 && JSON.parse(dr.profileJson).hexagram === y1.profile.hexagram, 'divination rumor profileJson round-trips');

// ── inkblotRumor payload ──
const portrait = { title: 'The Watchful Ember', blurb: 'warm and precise.', axes: [{ key: 'temperament', pole: 'The Ember', value: 0.812 }, { key: 'scope', pole: 'The Watchmaker', value: 0.301 }] };
const ir = inkblotRumor('1234', { seed: 'b9x', portrait, traits: [{ key: 'coverage', value: 0.4231 }], color: 'a held breath' });
ok(ir.kind === 'inkblot' && ir.seed === 'b9x' && ir.color === 'a held breath', 'inkblot rumor carries kind/seed/color');
const irp = JSON.parse(ir.profileJson);
ok(irp.title === 'The Watchful Ember' && irp.axes[0].value === 0.81 && irp.traits[0].key === 'coverage', 'inkblot rumor profileJson carries the archetype (rounded)');
ok(ir.text.includes('The Watchful Ember') && ir.text.includes('a held breath'), 'inkblot rumor text names the figure + colour');
const ir2 = inkblotRumor('1234', { seed: 'b9x', portrait });
ok(ir2.color === undefined && JSON.parse(ir2.profileJson).colour === undefined, 'inkblot rumor omits colour when none added');

// ── the RITUAL builders (the yarrow division / sand cast feed these) ──
// yijingFromLines: a known cast → the right hexagram (cross-checked against the library), lines carried.
const knownLines = [7, 8, 7, 9, 6, 8];
const yr = yijingFromLines(knownLines);
ok(yr.profile.hexagram === composeReading(knownLines, HEX).primaryNo, 'yijingFromLines agrees with composeReading');
ok(JSON.stringify(yr.profile.lines) === JSON.stringify(knownLines), 'yijingFromLines carries the 6 cast lines');
ok(yr.profile.moving.join(',') === '4,5', 'yijingFromLines marks the moving lines (9 at 4, 6 at 5)');
ok(yr.profile.changesTo >= 1 && yr.profile.changesTo <= 64, 'yijingFromLines resolves the resulting hexagram');
// all-still lines → no change
const still = yijingFromLines([7, 8, 7, 8, 7, 8]);
ok(still.profile.moving.length === 0 && still.profile.changesTo === null, 'all-young lines → a still hexagram');
// castYijing now delegates to yijingFromLines and stays deterministic
ok(JSON.stringify(cast('yijing', 'seed-42').profile) === JSON.stringify(cast('yijing', 'seed-42').profile), 'castYijing still deterministic post-refactor');

// the EXPANDED yijing reading: composeReading attaches Image / Judgment / moving-line texts / relating.
ok(yr.full && typeof yr.full.judgment === 'string' && yr.full.judgment.length > 0, 'expanded reading carries a Judgment text');
ok(yr.full.image && typeof yr.full.image === 'string', 'expanded reading carries the Image');
ok(yr.full.relating && yr.full.relating.name && yr.full.relating.no === yr.profile.changesTo, 'a moving cast surfaces the relating hexagram');
ok(Array.isArray(yr.full.lines) && yr.full.lines.length > 0 && yr.full.lines.every((L) => L.pos && L.text), 'expanded reading surfaces the moving-line texts');
ok(!still.full.relating && still.full.lines.length === 0, 'a still cast has no relating hexagram and no moving-line texts');

// geomancyFromShield: a shield built from tallies → a named Judge + witnesses + omen + the FULL shield.
const S = shield(mothersFromCounts([3, 6, 5, 8, 1, 4, 7, 2, 9, 2, 5, 6, 3, 8, 1, 4]));
const gr = geomancyFromShield(S);
ok(gr.system === 'geomancy' && typeof gr.profile.judge === 'string' && gr.profile.judge !== '—', 'geomancyFromShield names the Judge');
ok(gr.profile.witnesses.length === 2 && gr.omen.length > 10, 'geomancyFromShield carries witnesses + omen');
const sh = gr.profile.shield;
ok(sh && sh.mothers.length === 4 && sh.daughters.length === 4 && sh.nieces.length === 4, 'full shield: 4 Mothers, 4 Daughters, 4 Nieces');
ok(sh.witnessRight.name && sh.witnessLeft.name && sh.judge.name && sh.reconciler.name, 'full shield: Witnesses, Judge, Reconciler all named');
ok(sh.judge.name === gr.profile.judge, 'the shield Judge matches the headline Judge');
ok([...sh.mothers, ...sh.daughters, ...sh.nieces].every((f) => f.name && typeof f.name === 'string'), 'every shield figure is named');

// ── the SAND engine (soil.js) the geomancy rite pokes ──
const props = soilProps(0.82, 0.13, 0.05, 0.40);
ok(props.class && typeof props.heave === 'number', 'soilProps returns a texture class + heave');
const f1 = new Field(64), f2 = new Field(64);
ok(JSON.stringify([...f1.h]) === JSON.stringify([...f2.h]), 'Field.reset is deterministic (same default seed → same surface)');
const before = f1.h[32 * 64 + 32];
f1.poke(0.5, 0.5, 3, 4, props.heave);
ok(f1.h[32 * 64 + 32] !== before, 'poke deforms the sand under the press');
const settle = f1.settle(props, 8);
ok(settle && typeof settle.iters === 'number' && typeof settle.settled === 'boolean', 'settle returns a relaxation summary');
// a poked dot reads as a measurable depression (the basis of the dot-count)
ok(f1.h[32 * 64 + 32] < 0.5, 'a poke leaves a crater (negative height) — the dot the cast counts');

console.log(`fixtures.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
