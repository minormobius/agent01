// biome/over/test/over.selftest.mjs — the contract for the overworld's pure kernels.
//   • eden.js   — deterministic forest/lake/stream geometry (vendored from hoop; treeSpacing added).
//   • fauna.js  — roll a biome + map every catalog animal onto a sprite body plan.
// Run: node biome/over/test/over.selftest.mjs   (no browser, no canvas — pure data).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeEden } from '../eden.js';
import { planFor, rollBiome, BIOME_KEYS, PLANS } from '../fauna.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(HERE, '../../gacha/catalog.json'), 'utf8'));
const animals = Object.values(catalog.organisms).filter((o) => o.kind === 'animal' || (o.guild && o.guild !== 'producer'));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } };

// ── eden: determinism + the geometry invariants we rely on (a subset of hoop's eden test) ──
{
  const a = makeEden(7), b = makeEden(7);
  ok(a.spawn().gx === b.spawn().gx && a.spawn().gy === b.spawn().gy, 'eden: same seed → same spawn');
  ok(a.passable(a.spawn().gx, a.spawn().gy), 'eden: spawn is on passable ground');

  // trees never stand in water; passability blocks lakes & streams
  let treesInWater = 0, sampled = 0;
  for (let az = 0; az < 3; az++) for (let ax = 0; ax < 3; ax++)
    for (const t of a.tileTrees(az, ax)) { sampled++; if (a.inWater(t[0], t[1])) treesInWater++; }
  ok(sampled > 50, 'eden: forest generates a meaningful number of trees (' + sampled + ')');
  ok(treesInWater === 0, 'eden: no tree stands in water (' + treesInWater + ' did)');

  // treeSpacing dials density: sparser spacing ⇒ fewer trees over the same region
  const dense = makeEden(7, { treeSpacing: 0.6 }), sparse = makeEden(7, { treeSpacing: 1.8 });
  let nd = 0, ns = 0;
  for (let az = 0; az < 3; az++) for (let ax = 0; ax < 3; ax++) { nd += dense.tileTrees(az, ax).length; ns += sparse.tileTrees(az, ax).length; }
  ok(nd > ns, `eden: smaller treeSpacing ⇒ denser forest (dense ${nd} > sparse ${ns})`);
}

// ── fauna: planFor is TOTAL and only ever names a known plan/family ──
{
  const FAMILIES = { poly: ['ant', 'spider', 'crab', 'spiderbot'], quad: ['hound', 'boar', 'bear', 'robot'], axial: ['worm', 'snake', 'eel', 'mechworm'], radial: [null] };
  let bad = 0;
  for (const o of animals) {
    const p = planFor(o);
    if (!PLANS.includes(p.plan)) { bad++; console.error('    unknown plan for ' + o.id + ': ' + p.plan); continue; }
    if (!FAMILIES[p.plan].includes(p.family)) { bad++; console.error('    bad family for ' + o.id + ' (' + p.plan + '): ' + p.family); }
  }
  ok(bad === 0, 'fauna: every catalog animal maps to a known plan+family (' + animals.length + ' animals)');

  // the mapping actually USES the variety — at least three of the four plans appear across the roster
  const plansSeen = new Set(animals.map((o) => planFor(o).plan));
  ok(plansSeen.size >= 3, 'fauna: roster exercises ≥3 body plans (' + [...plansSeen].join(',') + ')');

  // spot checks: the obvious creatures land on the obvious plans
  const byId = Object.fromEntries(animals.map((o) => [o.id, o]));
  const check = (id, plan) => { if (byId[id]) ok(planFor(byId[id]).plan === plan, `fauna: ${id} → ${plan} (got ${planFor(byId[id]).plan})`); };
  check('spider', 'poly'); check('bee', 'poly'); check('aphid', 'poly');
  check('horse', 'quad'); check('rabbit', 'quad'); check('roedeer', 'quad');
  check('earthworm', 'axial');
}

// ── fauna: rollBiome is deterministic, well-formed, and always produces a lively cast ──
{
  const r1 = rollBiome(42, catalog), r2 = rollBiome(42, catalog);
  ok(JSON.stringify(r1) === JSON.stringify(r2), 'fauna: rollBiome(42) is deterministic');
  ok(BIOME_KEYS.includes(r1.biomeKey), 'fauna: rolled a known biome (' + r1.biomeKey + ')');
  ok(r1.biome.palette && Array.isArray(r1.biome.palette.meadow), 'fauna: biome carries a palette');
  ok(r1.edenOpts.treeSpacing > 0, 'fauna: biome supplies an eden treeSpacing');

  // sweep a range of seeds: every roll must have a cast with ≥1 swarm species and ≥1 quad, and every
  // cast member must carry the fields the renderer needs.
  let minCast = 99, noSwarm = 0, noQuad = 0, badMember = 0;
  for (let n = 0; n < 60; n++) {
    const r = rollBiome(n, catalog);
    minCast = Math.min(minCast, r.cast.length);
    if (!r.cast.some((c) => c.social === 'swarm')) noSwarm++;
    if (!r.cast.some((c) => c.plan === 'quad')) noQuad++;
    for (const c of r.cast) {
      if (!(c.plan && c.genes && c.size > 0 && c.speed > 0 && c.seed && c.pop && c.pop.groupSize >= 1)) badMember++;
    }
  }
  ok(minCast >= 6, 'fauna: every roll casts ≥6 species (min ' + minCast + ')');
  ok(noSwarm === 0, 'fauna: every roll includes a swarm species (' + noSwarm + ' rolls lacked one)');
  ok(noQuad === 0, 'fauna: every roll includes a quadruped (' + noQuad + ' rolls lacked one)');
  ok(badMember === 0, 'fauna: every cast member carries renderer fields (' + badMember + ' bad)');

  // a swarm species really is small & fast; a solitary one big & slow (the allometric tell)
  const all = [];
  for (let n = 0; n < 30; n++) all.push(...rollBiome(n, catalog).cast);
  const sw = all.filter((c) => c.social === 'swarm'), so = all.filter((c) => c.social === 'solo');
  const mean = (a, f) => a.reduce((s, x) => s + f(x), 0) / Math.max(1, a.length);
  ok(sw.length && mean(sw, (c) => c.speed) > mean(so.length ? so : sw, (c) => c.speed), 'fauna: swarm species are faster than solitary ones');
  ok(sw.length && mean(sw, (c) => c.size) < (so.length ? mean(so, (c) => c.size) : 99), 'fauna: swarm species are smaller than solitary ones');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} over.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
