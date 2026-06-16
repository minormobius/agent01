// genome.selftest.mjs — pins the object phylogeny (taxa.js) + the genome engine (genome.js).
// Run: node mega/sprite/item/test/genome.selftest.mjs
import { KINGDOMS, KINGDOM_ORDER, PHYLA, PHYLUM_ORDER, phylaOf, MATTER, MATERIALS, MATERIAL_ORDER, materialsByClass, materialsAt, eraSpecies } from '../taxa.js';
import {
  TRAIT_ORDER, GRADES, express, scoreItem, assemble, rollGenome, rollItem, rollMany,
  splice, mutate, DEFAULT_HOARD, HOARD_ARCHETYPES, rollHoard, eraOf, hoardWithTech,
} from '../genome.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const PRIMS = new Set(['long', 'vessel', 'panel', 'disc', 'garment', 'compound', 'key']);

// ── the tree is well-formed ──
{
  ok(KINGDOM_ORDER.length === 10, 'ten kingdoms (item-native verbs)');
  ok(Object.values(KINGDOMS).every((K) => K.glyph && K.accent && K.does && K.bias), 'every kingdom: glyph, accent, does, bias');
  ok(Object.values(PHYLA).every((p) => KINGDOMS[p.kingdom]), 'every phylum names a real kingdom');
  ok(Object.values(PHYLA).every((p) => PRIMS.has(p.prim)), 'every phylum uses a known sprite primitive');
  ok(Object.values(PHYLA).every((p) => Array.isArray(p.species) && p.species.length && p.base), 'every phylum: species list + base stats');
  ok(KINGDOM_ORDER.every((k) => phylaOf(k).length >= 2), 'every kingdom has ≥2 phyla');
  ok(Object.values(MATERIALS).every((M) => M.tech[0] <= M.tech[1] && M.color), 'every material: a tech band + colour');
}

// ── material gating: any tech in [0,1] yields ≥1 material for every phylum, in-band ──
{
  let coverage = true, banded = true;
  for (const ph of PHYLUM_ORDER) for (let i = 0; i <= 20; i++) {
    const tech = i / 20, mats = materialsAt(ph, tech);
    if (!mats.length) coverage = false;
    if (mats.some(([m]) => tech < MATERIALS[m].tech[0] || tech > MATERIALS[m].tech[1])) banded = false;
  }
  ok(coverage, 'every phylum has a material at every tech level (no dead gaps)');
  ok(banded, 'materialsAt only returns materials whose tech band contains the tech');
}

// ── determinism ──
{
  let same = true; for (const n of [0, 1, 9, 77, 2 ** 30]) same = same && eq(rollItem(n), rollItem(n));
  ok(same, 'rollItem(n) is deterministic');
  ok(eq(rollHoard(42), rollHoard(42)), 'rollHoard(n) is deterministic');
  const h = rollHoard(42);
  ok(eq(rollItem(5, h), rollItem(5, h)), 'rollItem(n, hoard) is deterministic');
  ok(!eq(rollItem(5), rollItem(6)), 'different seeds → different items (generally)');
}

// ── a rolled item is well-shaped ──
{
  const it = rollItem(31337);
  const G = it.genome;
  ok(KINGDOMS[G.kingdom] && PHYLA[G.phylum] && PHYLA[G.phylum].kingdom === G.kingdom, 'genome tree position is consistent (phylum under its kingdom)');
  ok(MATERIALS[G.material] && PHYLA[G.phylum].species.includes(it.species), 'genome carries a real material + a species of its phylum');
  ok(TRAIT_ORDER.every((t) => G.genes[t] >= 0 && G.genes[t] <= 1), 'all eight trait genes are in [0,1]');
  ok(['mass', 'durability', 'potency', 'value', 'tech', 'ornament', 'complexity', 'provenance'].every((k) => typeof it.stats[k] === 'number'), 'expression yields all eight stats');
  ok(it.worth >= 0 && it.worth <= 100 && GRADES.some((g) => g.id === it.grade), 'worth 0..100 + a valid grade');
  ok(typeof it.name === 'string' && it.name.length > 0 && it.glyph && it.frame, 'item has a name, kingdom glyph, and a grade frame colour');
}

// ── expression is monotonic in the value gene, and spikes fire at extremes ──
{
  const base = rollGenome(7);
  const lo = express({ ...base, genes: { ...base.genes, value: 0.05 } });
  const hi = express({ ...base, genes: { ...base.genes, value: 0.95 } });
  ok(hi.value >= lo.value, 'a higher value gene expresses a higher value stat');
  const spiky = assemble({ ...base, genes: { ...base.genes, potency: 0.97, durability: 0.03 } });
  ok(spiky.spikes.some((s) => s.word === 'Keen') && spiky.spikes.some((s) => s.word === 'Brittle'), 'extreme genes earn the right spike affixes (Keen / Brittle)');
  ok(eraOf(0.05) === 'salvage' && eraOf(0.95) === 'ship-grade', 'tech maps to era labels');
}

// ── the oracle is monotonic & bounded ──
{
  const lo = scoreItem({ mass: 2, value: 10, durability: 10, potency: 10, tech: 5, ornament: 5, complexity: 5, provenance: 5 });
  const hi = scoreItem({ mass: 2, value: 400, durability: 130, potency: 140, tech: 95, ornament: 95, complexity: 95, provenance: 95 });
  ok(hi.worth >= lo.worth && lo.worth >= 0 && hi.worth <= 100, 'oracle monotonic in quality, bounded 0..100');
  ok(hi.worth >= 85, 'a maxed item grades mythic-tier');
}

// ── heredity: breeding & chimeras ──
{
  const a = rollItem(101), b = rollItem(202);
  const kid = splice(a, b, 5);
  ok(TRAIT_ORDER.every((t) => kid.genome.genes[t] >= 0 && kid.genome.genes[t] <= 1), 'spliced genes stay in [0,1]');
  ok(PHYLA[kid.phylum] && kid.worth >= 0 && kid.worth <= 100, 'a spliced item is a valid, scorable item');
  ok([a.kingdom, b.kingdom].includes(kid.kingdom) && [a.phylum, b.phylum].includes(kid.phylum), 'child inherits a parent kingdom + a parent body-plan');
  // breeding the same item with itself is never a chimera
  ok(!splice(a, a, 1).lineage.chimera, 'self-splice is never a chimera');
  // cross-kingdom parents eventually produce a flagged chimera (verb ≠ body)
  let sawChimera = false;
  const s = rollItem(1), t = rollMany([...Array(40).keys()]).find((x) => x.kingdom !== s.kingdom);
  for (let k = 0; k < 60 && !sawChimera; k++) sawChimera = splice(s, t, k).lineage.chimera;
  ok(sawChimera, 'cross-kingdom breeding can yield a chimera');
}

// ── mutation drifts genes and can hop the tree ──
{
  const it = rollItem(9);
  const m = mutate(it, 3);
  ok(m.derived && TRAIT_ORDER.every((t) => m.genome.genes[t] >= 0 && m.genome.genes[t] <= 1), 'a mutant is a valid derived item');
  let hopped = false; for (let k = 0; k < 200 && !hopped; k++) { const mm = mutate(it, k); if (mm.phylum !== it.phylum || mm.kingdom !== it.kingdom) hopped = true; }
  ok(hopped, 'mutation sometimes hops phylum/kingdom');
}

// ── hoards: population archetypes pull correlated distributions ──
{
  const seeds = [...Array(1500).keys()];
  const armory = findHoard('armory'), scriptorium = findHoard('scriptorium');
  const aStrike = rollMany(seeds, armory).filter((i) => i.kingdom === 'strike').length;
  const sStrike = rollMany(seeds, scriptorium).filter((i) => i.kingdom === 'strike').length;
  const sLore = rollMany(seeds, scriptorium).filter((i) => i.kingdom === 'lore').length;
  const aLore = rollMany(seeds, armory).filter((i) => i.kingdom === 'lore').length;
  ok(aStrike > sStrike, 'an armory rolls more strike-things than a scriptorium');
  ok(sLore > aLore, 'a scriptorium rolls more lore-things than an armory');
  // a foundry rolls higher average tech than a midden
  const avg = (arr, f) => arr.reduce((s, x) => s + f(x), 0) / arr.length;
  const foundry = rollMany(seeds, findHoard('foundry')), midden = rollMany(seeds, findHoard('midden'));
  ok(avg(foundry, (i) => i.stats.tech) > avg(midden, (i) => i.stats.tech), 'a foundry rolls higher tech than a midden');
}
function findHoard(id) { for (let n = 0; n < 5000; n++) { const h = rollHoard(n); if (h.archetype === id) return h; } throw new Error('no ' + id); }

// ── the matter mini-tree: classes, leaves, tech-banded coverage ──
{
  ok(Object.keys(MATTER).length === 5, 'five matter classes');
  ok(MATERIAL_ORDER.every((m) => MATTER[MATERIALS[m].class]), 'every material belongs to a real matter class');
  ok(['organic', 'mineral', 'metal', 'synthetic', 'exotic'].every((c) => materialsByClass(c).length >= 2), 'every class has ≥2 materials');
  ok(materialsByClass('exotic').includes('plasma') && materialsByClass('synthetic').includes('composite'), 'the sci-fi end is populated (plasma, composite)');
  // the matter-class affinity shows up: a high-tech strike-thing leans metal/synthetic, not exotic-soft
  const strikePh = phylaOf('strike')[0];
  const hiMats = materialsAt(strikePh, 0.95);
  ok(hiMats.length && hiMats.every(([m]) => MATERIALS[m].tech[0] <= 0.95), 'high-tech strike still has in-band materials');
}

// ── the era lexicon skin: same genome, different vocabulary by tech ──
{
  ok(eraSpecies('blade', 0, 'forge-age') !== eraSpecies('blade', 0, 'ship-grade'), 'a blade renames between forge-age and ship-grade');
  const base = rollGenome(3);
  const med = assemble({ ...base, genes: { ...base.genes, tech: 0.1 } });
  const sf = assemble({ ...base, genes: { ...base.genes, tech: 0.95 } });
  ok(med.species === sf.species, 'the canonical species (tree identity) is era-invariant');
  ok(med.era !== sf.era, 'low vs high tech land in different eras');
  ok(typeof med.speciesName === 'string' && typeof sf.speciesName === 'string', 'every item carries a skinned speciesName');
  ok(med.matter && MATTER[med.matter], 'every item reports its matter class');
}

// ── the scifiward dial slides the whole hoard toward ship-grade ──
{
  const seeds = [...Array(800).keys()];
  const lo = rollMany(seeds, hoardWithTech(DEFAULT_HOARD, 0.1));
  const hi = rollMany(seeds, hoardWithTech(DEFAULT_HOARD, 0.95));
  const avg = (a) => a.reduce((s, x) => s + x.stats.tech, 0) / a.length;
  ok(avg(hi) > avg(lo) + 30, 'hoardWithTech(0.95) rolls far higher tech than (0.1)');
  ok(hi.some((i) => MATERIALS[i.material].class === 'exotic'), 'the high-tech dial surfaces exotic materials');
}

console.log(`genome.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
