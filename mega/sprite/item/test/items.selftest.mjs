// items.selftest.mjs — pins the item characteristics engine (mega/sprite/item/items.js).
// Run: node mega/sprite/item/test/items.selftest.mjs
import {
  rollItem, rollMany, scoreItem, nameItem, rollGenome,
  KINDS, KIND_ORDER, MATERIALS, QUALITY, AFFIXES, GRADES,
  DEFAULT_GENOME, ARCHETYPES, AXES,
} from '../items.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── the deck is well-formed ──
{
  ok(KIND_ORDER.length === 8, 'eight kinds in the deck');
  ok(Object.values(KINDS).every((K) => K.glyph && K.accent && K.form && AXES.every((a) => typeof K.base[a] === 'number')), 'every kind: glyph, accent, form, all five base axes');
  ok(Object.values(KINDS).every((K) => Object.keys(K.mats).every((m) => MATERIALS[m])), 'every kind references only real materials');
  ok(Object.values(MATERIALS).every((M) => M.color && AXES.every((a) => typeof M[a] === 'number')), 'every material: colour + a factor per axis');
  ok(QUALITY.length === 6 && QUALITY.every((q) => q.mult > 0 && q.frame), 'six quality tiers, each with a positive mult + frame colour');
  ok(AFFIXES.every((a) => (a.slot === 'pre' || a.slot === 'suf') && a.cue && a.word && a.delta), 'every affix: slot, cue, word, deltas');
}

// ── DETERMINISM — the load-bearing invariant ──
{
  let same = true;
  for (const n of [0, 1, 7, 42, 1000, 2 ** 31]) same = same && eq(rollItem(n), rollItem(n));
  ok(same, 'rollItem(n) is deterministic across repeated calls');
  ok(eq(rollGenome(99), rollGenome(99)), 'rollGenome(n) is deterministic');
  const g = rollGenome(99);
  ok(eq(rollItem(5, g), rollItem(5, g)), 'rollItem(n, genome) is deterministic');
  ok(!eq(rollItem(5), rollItem(6)), 'different seeds generally give different items');
}

// ── a rolled item is well-shaped ──
{
  const it = rollItem(12345);
  ok(KINDS[it.kind] && MATERIALS[it.material] && QUALITY.some((q) => q.id === it.quality), 'roll picks a real kind/material/quality');
  ok(AXES.every((a) => typeof it.stats[a] === 'number' && it.stats[a] >= 0), 'all five stats are non-negative numbers');
  ok(it.worth >= 0 && it.worth <= 100, 'worth is in 0..100');
  ok(GRADES.some((gr) => gr.id === it.grade), 'grade is a real band');
  ok(typeof it.name === 'string' && it.name.length > 0, 'item has a name');
  ok(it.affixes.length <= 2 && it.affixCues.length === it.affixes.length, 'at most one prefix + one suffix; a cue per affix');
  ok(it.name.includes(MATERIALS[it.material].name), 'name carries the material');
}

// ── the oracle is monotonic in value and bounded ──
{
  const lo = scoreItem({ stats: { weight: 2, value: 10, durability: 10, potency: 10, lore: 10 } });
  const hi = scoreItem({ stats: { weight: 2, value: 200, durability: 130, potency: 140, lore: 150 } });
  ok(hi.worth >= lo.worth, 'a richer item is worth at least as much');
  ok(hi.worth === 100 || hi.worth > 80, 'a maxed item grades near the top');
  ok(lo.worth >= 0 && hi.worth <= 100, 'worth stays in 0..100');
  ok(GRADES[0].id === 'junk' && GRADES[GRADES.length - 1].id === 'mythic', 'grade bands run junk → mythic');
}

// ── distribution over many rolls: every kind appears, every grade is valid, worth bounded ──
{
  const items = rollMany([...Array(3000).keys()]);
  const kinds = new Set(items.map((i) => i.kind));
  ok(kinds.size === 8, 'all eight kinds show up over 3000 rolls');
  ok(items.every((i) => i.worth >= 0 && i.worth <= 100), 'worth always bounded');
  ok(items.every((i) => GRADES.some((g) => g.id === i.grade)), 'every grade valid');
  // higher quality should, on average, score higher worth (cause → measured outcome)
  const byQ = {}; for (const it of items) { (byQ[it.quality] ||= []).push(it.worth); }
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  ok(avg(byQ.relic || [1]) > avg(byQ.crude || [0]), 'relics out-appraise crude items on average');
}

// ── genome archetypes pull correlated distributions ──
{
  const seeds = [...Array(1500).keys()];
  // find a seed that rolls each named archetype, then compare kind frequencies
  const armory = armoryGenome();
  const scriptorium = scriptoriumGenome();
  const aBlades = rollMany(seeds, armory).filter((i) => i.kind === 'blade').length;
  const sBlades = rollMany(seeds, scriptorium).filter((i) => i.kind === 'blade').length;
  const sTomes = rollMany(seeds, scriptorium).filter((i) => i.kind === 'tome').length;
  const aTomes = rollMany(seeds, armory).filter((i) => i.kind === 'tome').length;
  ok(aBlades > sBlades, 'an armory rolls more blades than a scriptorium');
  ok(sTomes > aTomes, 'a scriptorium rolls more tomes than an armory');
  ok(ARCHETYPES.some((a) => a.id === armory.archetype) && armory.archetype === 'armory', 'rollGenome surfaces the archetype id');
}

function findGenomeOf(id) { for (let n = 0; n < 5000; n++) { const g = rollGenome(n); if (g.archetype === id) return g; } throw new Error('no ' + id); }
function armoryGenome() { return findGenomeOf('armory'); }
function scriptoriumGenome() { return findGenomeOf('scriptorium'); }

console.log(`items.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
