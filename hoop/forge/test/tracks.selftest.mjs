// tracks.selftest.mjs — pins THE TWO-TRACK FINDING: two non-intersecting connective networks that both reach
// every facility are a PLANAR IMPOSSIBILITY on this foam (the answer to "material track + pedestrian track").
// node hoop/forge/test/tracks.selftest.mjs

import { buildForgeRegion } from '../floor.js';
import { twoTracks } from '../tracks.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const reg = buildForgeRegion(7, { count: 19, optimize: true });
const r = twoTracks(reg), st = r.stats;

// the two tracks ARE disjoint by construction (a wall between freight and foot traffic — the easy part)
ok(st.disjoint && st.sharedCells === 0, 'the two tracks share no chambers (disjoint by construction)');

// the OBSTRUCTION (a): no interstitial tissue — the interior is road + rooms, nothing between
ok(st.interstitialFrac < 0.02, `≈no interstitial space (interstitialFrac ${st.interstitialFrac.toFixed(3)} — interior is road+rooms only)`);

// the OBSTRUCTION (b): the concourse IS the connectivity — remove it and the rooms shatter into many pockets
ok(st.concourseComplement.components > 30, `the concourse's complement shatters into pockets (${st.concourseComplement.components} components)`);
ok(st.concourseComplement.largestFrac < 0.25, `…no large connected complement (largest ${(st.concourseComplement.largestFrac * 100 | 0)}%)`);

// the material tree CAN reach every facility (it's the connective net) …
ok(st.material.reached === st.facilities, `material track reaches every facility (${st.material.reached}/${st.facilities})`);
// … but then the pedestrian tree CANNOT also reach every facility — the planar obstruction
ok(st.pedestrian.reached < st.facilities, `pedestrian track canNOT also reach all in 2D (${st.pedestrian.reached}/${st.facilities}) — the obstruction`);
ok(st.feasibleIn2D === false, 'verdict: two everywhere-reaching non-intersecting tracks are infeasible in 2D (⇒ go to decks)');

// reproducible
const r2 = twoTracks(buildForgeRegion(7, { count: 19, optimize: true }));
ok(JSON.stringify(st) === JSON.stringify(r2.stats), 'the probe is deterministic');

console.log(`\ntracks.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
