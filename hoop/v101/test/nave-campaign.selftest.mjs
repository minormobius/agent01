// node hoop/v101/test/nave-campaign.selftest.mjs
// INTEGRATION: the v100 nave campaign resolves against the REAL nave geometry. Proves the faction-quest
// module's signature roles match the nave's per-chunk meta, so fqWardXY (index.html) can find each ward.
import { buildNave } from '../../nave/nave.js';
import { FQ, FQ_ORDER, fqSignatureExclusive } from '../story/factionquest.js';

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error('  ✗ ' + m); } };

// mirror index.html#fqWardXY against the built world's meta.
function wardChunk(meta, world, faction) {
  const sig = fqSignatureExclusive(faction);
  let ci = -1;
  for (let i = 1; i < meta.length; i++) { const m = meta[i]; if (m && m.faction === faction && m.exclusive === sig) { ci = i; break; } }
  if (ci < 0) for (let i = 1; i < meta.length; i++) { const m = meta[i]; if (m && m.faction === faction) { ci = i; break; } }
  return ci;
}

for (const seed of [7, 42, 1000]) {
  const nave = buildNave(seed), meta = nave.meta, world = nave.world;
  ok(meta.length === 7, `seed ${seed}: seven chunks`);
  ok(meta[0] && meta[0].faction == null, `seed ${seed}: chunk 0 is the commons (no faction)`);
  for (const faction of FQ_ORDER) {
    const ci = wardChunk(meta, world, faction);
    ok(ci > 0, `seed ${seed}: ${faction} high ward resolves (got chunk ${ci})`);
    if (ci > 0) {
      ok(meta[ci].faction === faction, `seed ${seed}: ${faction} ward chunk has the right faction`);
      ok(meta[ci].exclusive === fqSignatureExclusive(faction), `seed ${seed}: ${faction} ward exclusive = ${fqSignatureExclusive(faction)}`);
      const ch = world.chunks[ci];
      ok(ch && ch.poly && ch.poly.length >= 3, `seed ${seed}: ${faction} ward chunk has a polygon (waypoint centroid)`);
    }
  }
  // three distinct wards, one per faction
  const cis = FQ_ORDER.map((f) => wardChunk(meta, world, f));
  ok(new Set(cis).size === 3, `seed ${seed}: the three faction wards are distinct chunks`);
}

console.log((bad ? '✗ ' : '✓ ') + 'nave-campaign.selftest — ' + (n - bad) + '/' + n + ' checks');
process.exit(bad ? 1 : 0);
