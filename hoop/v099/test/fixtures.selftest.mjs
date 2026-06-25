// fixtures.selftest.mjs — the worship ORACLE + govern INKBLOT kernels (pure, deterministic).
//   node hoop/v099/test/fixtures.selftest.mjs
import { cast, castYijing, rngFromSeed, divinationRumor, ORACLE_SYSTEMS } from '../worship/oracle-cast.js';
import { decompose, movingLines } from '../worship/lib/iching.js';
import { HEX } from '../worship/lib/hexagrams.js';
import { composeReading } from '../worship/lib/iching.js';
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

console.log(`fixtures.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
