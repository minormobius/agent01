// menace.selftest.mjs — the overworld's living menace (over/menace.js): boids bee swarms that
// wake, chase, catch, leash home; spiders that strike underfoot.
//   node hoop/v107/test/menace.selftest.mjs
//
// The sim only reads { player, chunks, gathered } off the roam state, so the fixtures here are
// synthetic — exact positions, no seed archaeology. The kernel's determinism is pinned last.

import { createMenace, stepMenace, spiderUnderfoot, isBeeSwarm, isSpider, AGGRO_R, LEASH_R, CONTACT_R, BOIDS, MAXV } from '../over/menace.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const bee = (id, x, y) => ({ id, x, y, orgId: 'bee', plan: 'poly', band: 'meadow', swarm: true, fight: true });
const spider = (id, x, y) => ({ id, x, y, orgId: 'wolfspider', plan: 'poly', band: 'thicket', swarm: false, fight: true });
const bird = (id, x, y) => ({ id, x, y, orgId: 'blackbird', plan: 'quad', band: 'grove', swarm: false, fight: false });
const roamWith = (fauna, px, py) => ({ player: { x: px, y: py }, gathered: new Set(), chunks: new Map([['0,0', { fauna }]]) });
const step = (sim, roam, frames) => { let last = null; for (let i = 0; i < frames; i++) last = stepMenace(sim, roam, 1 / 60); return last; };

// ── 1. the predicates ──
ok(isBeeSwarm(bee('b', 0, 0)) && !isBeeSwarm(spider('s', 0, 0)) && !isBeeSwarm(bird('q', 0, 0)), 'a bee swarm is fight+swarm; spiders and birds are not');
ok(isSpider(spider('s', 0, 0)) && !isSpider(bee('b', 0, 0)) && !isSpider(bird('q', 0, 0)), 'a spider is fight without swarm; birds never fight');

// ── 2. sleep / wake: the aggro radius ──
{
  const roam = roamWith([bee('b1', 0, 0)], AGGRO_R + 80, 0);
  const sim = createMenace();
  const r = step(sim, roam, 30);
  ok(r.swarms.length === 0 && !r.engage, 'outside the aggro radius the swarm stays asleep on its flowers');
  roam.player.x = AGGRO_R - 40;
  const r2 = step(sim, roam, 1);
  ok(r2.swarms.length === 1 && r2.swarms[0].boids.length === BOIDS, 'stray inside the radius → the flock wakes (a full complement of bees)');
}

// ── 3. the chase: the flock closes on a standing player and CATCHES them ──
{
  const roam = roamWith([bee('b1', 0, 0)], 150, 0);
  const sim = createMenace();
  let caught = -1, d0 = Infinity, dMid = Infinity;
  for (let i = 0; i < 600; i++) {
    const r = stepMenace(sim, roam, 1 / 60);
    if (r.swarms.length) { const s = r.swarms[0]; const d = Math.hypot(s.cx - roam.player.x, s.cy - roam.player.y); if (i === 1) d0 = d; if (i === 60) dMid = d; }
    if (r.engage) { caught = i; ok(r.engage.id === 'b1', 'the engagement names the fauna that caught you'); break; }
  }
  ok(dMid < d0, `the flock closes distance (${d0.toFixed(0)} → ${dMid.toFixed(0)} px after 1 s)`);
  ok(caught > 0 && caught < 600, `a standing player is caught (frame ${caught}) — the chase has teeth`);
}

// ── 4. the leash: outrun it and the flock goes home and settles ──
{
  const roam = roamWith([bee('b1', 0, 0)], 150, 0);
  const sim = createMenace();
  step(sim, roam, 10);                       // woken, mid-chase
  ok(sim.swarms.size === 1 && [...sim.swarms.values()][0].aggro, 'the flock is aggro while the player is inside the leash');
  roam.player.x = LEASH_R + 400;             // sprint away
  let settled = -1;
  for (let i = 0; i < 1200; i++) { stepMenace(sim, roam, 1 / 60); if (!sim.swarms.size) { settled = i; break; } }
  ok(settled >= 0, `beyond the leash the flock drifts home and settles (frame ${settled}) — no cross-map stalking`);
  const r = step(sim, roam, 5);
  ok(!r.engage && r.swarms.length === 0, 'a settled flock menaces no one');
}

// ── 5. defeat + prune hygiene ──
{
  const roam = roamWith([bee('b1', 0, 0)], 100, 0);
  const sim = createMenace();
  step(sim, roam, 5);
  roam.gathered.add('foe:b1');               // the host resolved the fight
  const r = step(sim, roam, 2);
  ok(r.swarms.length === 0 && !r.engage, 'a defeated swarm is dropped mid-flight and never re-engages');
  const roam2 = roamWith([bee('b2', 0, 0)], 100, 0);
  step(sim, roam2, 3);
  roam2.chunks.clear();                      // chunk pruned out from under the flock
  const r2 = step(sim, roam2, 2);
  ok(r2.swarms.length === 0, 'a pruned chunk takes its flock with it (no orphan boids)');
}

// ── 6. spiders: underfoot means underfoot ──
{
  const fauna = [spider('s1', 8, 0), spider('s2', 300, 0), bee('b1', 4, 0), bird('q1', 2, 0)];
  const roam = roamWith(fauna, 0, 0);
  const hit = spiderUnderfoot(roam);
  ok(hit && hit.id === 's1', 'the spider you stepped on triggers — the nearer non-spider fauna do not');
  ok(!spiderUnderfoot(roamWith([spider('s2', 300, 0)], 0, 0)), 'a spider across the clearing does NOT trigger (no chase, pure ambush)');
  roam.gathered.add('foe:s1');
  ok(!spiderUnderfoot(roam), 'a crushed spider stays crushed');
}

// ── 7. determinism: same walk, same chase ──
{
  const mk = () => roamWith([bee('b1', 0, 0)], 140, 60);
  const a = createMenace(), b = createMenace();
  const ra = mk(), rb = mk();
  let sa = null, sb = null;
  for (let i = 0; i < 120; i++) { sa = stepMenace(a, ra, 1 / 60); sb = stepMenace(b, rb, 1 / 60); }
  const ca = sa.swarms[0], cb = sb.swarms[0];
  ok(ca && cb && ca.cx === cb.cx && ca.cy === cb.cy, 'two sims fed the same walk produce the identical flock (seeded rng, no Math.random)');
}

// ── 8. tuning sanity ──
ok(AGGRO_R < LEASH_R, 'the leash is wider than the aggro (you can always run out of a fight you walked into)');
ok(CONTACT_R < AGGRO_R && MAXV > 0 && BOIDS > 4, 'contact < aggro; the flock moves; a swarm reads as a swarm');

console.log(`menace.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
