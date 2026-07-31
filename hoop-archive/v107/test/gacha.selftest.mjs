// gacha.selftest — the TRADE kernel: biome collections, deterministic pulls, new-bias convergence, closing.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TIER_FOIL, PULL_COST, biomeList, biomeById, biomeForKey, progress, pullRng, pull } from '../garden/gacha.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ark = JSON.parse(readFileSync(join(HERE, '../garden/ark.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// 1. biomes are well-formed closeable collections
const biomes = biomeList(ark);
ok(biomes.length >= 3, `ark exposes biomes (${biomes.length})`);
for (const b of biomes) {
  ok(b.id && b.name && b.tier && b.foil, `biome ${b.name} has identity + foil`);
  ok(b.crops.length >= 2, `biome ${b.name} has a real seed pool (${b.crops.length})`);
  ok(b.crops.every((c) => c.rarity && c.weight > 0), `biome ${b.name} crops carry rarity + weight`);
  ok(b.foil === TIER_FOIL[b.tier], `biome ${b.name} foil matches its tier`);
}
ok(typeof PULL_COST === 'number' && PULL_COST > 0, 'pull cost defined');

// 2. biomeForKey is deterministic + in-range
const k = 'gC3:r2';
ok(biomeForKey(ark, k).id === biomeForKey(ark, k).id, 'biomeForKey is stable');
ok(biomes.includes(biomeForKey(ark, k)), 'biomeForKey returns a real biome');
ok(biomeById(ark, biomes[0].id) === biomes[0], 'biomeById resolves');

// 3. progress / closing
const biome = biomes.reduce((a, b) => (a.crops.length >= b.crops.length ? a : b));   // the biggest pool
ok(!progress(biome, []).complete && progress(biome, []).have === 0, 'empty collection: 0 / not complete');
ok(progress(biome, biome.crops.map((c) => c.id)).complete, 'full collection closes the biome');
ok(Math.abs(progress(biome, [biome.crops[0].id]).pct - 1 / biome.crops.length) < 1e-9, 'pct tracks fraction owned');

// 4. deterministic pulls
const a1 = pull(biome, [], pullRng(7, biome.id, 0));
const a2 = pull(biome, [], pullRng(7, biome.id, 0));
ok(a1.crop.id === a2.crop.id, 'same (seed,biome,index) → same pull');
ok(pull(biome, [], pullRng(7, biome.id, 1)).crop !== undefined, 'next pull index draws too');
ok(a1.isNew && a1.seeds >= 1, 'pulling into an empty collection is new + grants seeds');

// 5. new-bias makes a collection converge to a CLOSE within a sane number of pulls
let owned = new Set(), pulls = 0;
while (progress(biome, owned).have < biome.crops.length && pulls < 400) { const r = pull(biome, owned, pullRng(7, biome.id, pulls)); owned.add(r.crop.id); pulls++; }
ok(progress(biome, owned).complete, `new-bias converges: closed ${biome.name} (${biome.crops.length} crops) in ${pulls} pulls`);
ok(pulls < 200, `closes in a reasonable pull count (${pulls})`);
// dupes still grant seeds (so they fuel planting, not dead pulls)
ok(pull(biome, biome.crops.map((c) => c.id), pullRng(7, biome.id, 9)).isNew === false, 'a fully-owned biome only dupes');
ok(pull(biome, biome.crops.map((c) => c.id), pullRng(7, biome.id, 9)).seeds >= 1, 'dupes still grant seeds');

console.log(`gacha.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
