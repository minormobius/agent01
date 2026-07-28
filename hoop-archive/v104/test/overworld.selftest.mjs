// overworld.selftest — the OVERWORLD kernel: terrain field, deterministic scatter, footprint spacing,
// band coherence, fauna. Pure — no DOM. Mirrors garden.selftest's contract (same-seed reproducibility).
import { makeOverworld, bandAt, descriptorForOrganism, SURFACE_BANDS, organismById } from '../over/overworld.js';
import { ORGANISMS, organismsInBand } from '../over/ecology.js';
import { growthForm } from '../garden/flora.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// 1. determinism — the same seed makes the same landscape (the atproto/permalink contract)
const a = makeOverworld(21, { w: 800, h: 600 });
const b = makeOverworld(21, { w: 800, h: 600 });
ok(JSON.stringify(a.plants) === JSON.stringify(b.plants), 'same seed → identical plant scatter');
ok(JSON.stringify(a.fauna) === JSON.stringify(b.fauna), 'same seed → identical fauna');
ok(JSON.stringify(makeOverworld(99, { w: 800, h: 600 }).plants) !== JSON.stringify(a.plants), 'a different seed → a different landscape');

// 2. the terrain field returns real bands, coherent over neighbours (not white noise)
{
  const bset = new Set();
  for (let i = 0; i < 400; i++) bset.add(bandAt((i * 37) % 800, (i * 53) % 600, 21));
  for (const bnd of bset) ok(SURFACE_BANDS.includes(bnd), `bandAt returns a real surface band (${bnd})`);
  ok(bset.size >= 2, `the patch has terrain VARIETY (${bset.size} bands), not one homogeneous field`);
  // coherence: a point and its close neighbour usually share a band (blobs, not static)
  let same = 0, n = 0;
  for (let i = 0; i < 200; i++) { const x = (i * 41) % 780, y = (i * 29) % 580; n++; if (bandAt(x, y, 21) === bandAt(x + 12, y, 21)) same++; }
  ok(same / n > 0.6, `terrain is COHERENT (${(same / n * 100) | 0}% of near-neighbours share a band)`);
}

// 3. the scatter is sane
ok(a.plants.length > 50, `a landscape is populated (${a.plants.length} plants)`);
ok(a.plants.every((p) => p.x >= 0 && p.x <= a.w && p.y >= 0 && p.y <= a.h), 'every plant is inside the patch');
ok(a.plants.every((p) => organismById(p.orgId) && organismById(p.orgId).kind === 'producer'), 'every plant is a real producer from the palette');
ok(a.plants.every((p) => p.band !== 'benthic'), 'nothing is rooted on the open water');
ok(a.plants.every((p) => p.size >= 0.5 && p.size <= 1), 'wild stands run mature (size 0.5..1)');

// 4. footprint spacing — plants keep their radius (no two big plants stacked on one spot)
{
  let stacked = 0, pairs = 0;
  const big = a.plants.filter((p) => p.foot >= 20);
  for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) {
    const dx = big[i].x - big[j].x, dy = big[i].y - big[j].y; if (Math.abs(dx) > 60 || Math.abs(dy) > 60) continue;
    pairs++; const min = (big[i].foot + big[j].foot) * 0.4; if (dx * dx + dy * dy < min * min) stacked++;
  }
  ok(pairs === 0 || stacked / pairs < 0.05, `big plants keep their footprint (${stacked}/${pairs} too-close pairs)`);
}

// 5. band coherence of the plants — a plant only grows in a band its organism belongs to
ok(a.plants.every((p) => (organismById(p.orgId).bands || []).includes(p.band)), 'each plant grows in a band its organism actually inhabits');

// 6. the growth-form (the plant's "soul") survives the trip — trees, herbs, grain all appear
{
  const forms = new Set(a.plants.map((p) => p.form));
  ok(forms.size >= 3, `the landscape shows a MIX of growth-forms (${[...forms].join(', ')})`);
  ok([...forms].every((f) => a.plants.find((p) => p.form === f && f === growthForm(descriptorForOrganism(organismById(p.orgId))))), 'form matches the flora kernel (soul preserved)');
}

// 7. fauna is present, real, and light (seasoning, not a zoo)
ok(a.fauna.length >= 1, `some ambient fauna (${a.fauna.length})`);
ok(a.fauna.every((f) => organismById(f.orgId) && organismById(f.orgId).kind === 'animal'), 'every fauna is a real animal from the palette');
ok(a.fauna.length < a.plants.length, 'plants outnumber fauna (the plants are the point)');

// 8. density scales the population
ok(makeOverworld(21, { w: 800, h: 600, density: 2 }).plants.length > a.plants.length, 'higher density → more plants');

console.log(`overworld.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
