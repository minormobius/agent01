// locks.selftest.mjs — the puzzle-gated map progression core (hoop/story/locks.js). Pure, no network.
// Proves bridges/choke/isolation on synthetic graphs AND a deterministic lockable vault on a real region.
//   node hoop/test/locks.selftest.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { navGraph, bridges, reachable, sealedSide, chokeForZone, deterministicLocks, blockedKeys, memKey } from '../story/locks.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// a tiny view-like object: cells at integer x positions, membranes as door edges
function view(n, doors, opts = {}) {
  return { nReal: n, scene: { doors: doors.map(([a, b]) => ({ a, b })), opens: (opts.opens || []).map(([a, b]) => ({ a, b })) },
           seeds: Array.from({ length: n }, (_, i) => ({ x: (opts.xs && opts.xs[i]) ?? i, y: 0 })), bandGid: Array.from({ length: n }, (_, i) => 'g' + i), owner: opts.owner || Array(n).fill(0), isGate: opts.isGate || [] };
}

// 1. a line 0-1-2-3-4 is a tree → every membrane is a bridge
{
  const g = navGraph(view(5, [[0, 1], [1, 2], [2, 3], [3, 4]]));
  ok('line has 4 bridges', bridges(g).length === 4);
  const br = bridges(g).find((b) => b.k === memKey('g1', 'g2'));
  ok('cutting 1-2 seals the smaller side {0,1}', sealedSide(g, br).size === 2);
}

// 2. a loop has NO bridges (you can always route around)
{
  const g = navGraph(view(4, [[0, 1], [1, 2], [2, 3], [3, 0]]));
  ok('a cycle has zero bridges', bridges(g).length === 0);
}

// 3. a vault: a 2-edge-connected road {0..4} + a building {5,6,7} joined by ONE door (4-5)
{
  const g = navGraph(view(8, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [1, 3], [4, 5], [5, 6], [6, 7], [5, 7]]));
  const door = bridges(g).find((b) => b.k === memKey('g4', 'g5'));
  ok('the single door is the only bridge', bridges(g).length === 1 && !!door);
  const vault = sealedSide(g, door);
  ok('the vault is {5,6,7}', vault.size === 3 && [5, 6, 7].every((i) => vault.has(i)));
  // locking it isolates the vault from the road
  const blocked = new Set([door.k]);
  ok('locked: road cannot reach the vault', !reachable(g, 0, blocked).has(6));
  ok('locked: vault cannot reach the road', !reachable(g, 6, blocked).has(0));
  ok('unlocked: road reaches the vault', reachable(g, 0, new Set()).has(6));
}

// 4. chokeForZone — circle a spot, get the boundary cut
{
  const g = navGraph(view(8, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]], { xs: [0, 1, 2, 10, 11, 12, 13, 14] }));
  const { interior, cut } = chokeForZone(g, 1, 3);           // disk around cell 1 (x=1, r=3) → {0,1,2}
  ok('zone disk catches the near cluster', interior.size === 3 && [0, 1, 2].every((i) => interior.has(i)));
  ok('the cut is the single boundary membrane 2-3', cut.length === 1 && cut[0].k === memKey('g2', 'g3'));
}

// 5. blockedKeys — only locks the player can't satisfy
{
  const locks = [{ key: 'a~b', requires: { items: ['key'] } }, { key: 'c~d', requires: {} }];
  const haveKey = (req) => !(req.items || []).includes('key') || true === false;   // player lacks 'key'
  ok('blocks the keyed door, not the open one', blockedKeys(locks, (r) => (r.items || []).every((t) => false)).has('a~b'));
  ok('an empty gate is never blocked', !blockedKeys(locks, () => true).size);
}

// 6. REAL region — a deterministic single-door vault that genuinely isolates, never traps a gate
{
  const { ringLattice } = await import('../econ/region.js');
  const { coarseSolve, solveRegion } = await import('../econ/record.js');
  const { deckScene } = await import('../econ/deck.js');
  const L = ringLattice({ Ri: 150, T: 12, cell: 1, regionsPerRing: 30 });
  const record = coarseSolve({ lattice: L, seed: 7, axMin: 0, axMax: 5 });
  const az = record.hubs[0].az, ax = record.hubs[0].ax, gz = Math.floor(L.nz / 2);
  const solved = solveRegion({ lattice: L, seed: 7, grade: 0.4, record, az, ax, axSpan: 16 });
  const d = deckScene({ lattice: L, seed: 7, record, az, ax, axSpan: 16, pxPerCell: 120, gz, solved });
  const v = { nReal: d.nReal, scene: { doors: d.scene.doors, opens: d.scene.opens }, seeds: d.seeds, bandGid: d.band.map((c) => c.gid), owner: Array.from(d.owner), isGate: [...d.isGate] };
  const locks = deterministicLocks(v, { seed: 7 });
  ok('a vault was found on this deck', locks.length === 1);
  const lk = locks[0], g = navGraph(v);
  // pick an outside cell (not in the zone) and prove the lock seals the vault
  const zoneSet = new Set(lk.zone);
  let outside = -1; for (let i = 0; i < v.nReal; i++) if (!zoneSet.has(i) && v.owner[i] === -1) { outside = i; break; }
  ok('the lock isolates the vault from the concourse', outside >= 0 && !reachable(g, outside, new Set([lk.key])).has(lk.zone[0]));
  ok('but it is reachable when unlocked', reachable(g, outside, new Set()).has(lk.zone[0]));
  ok('the vault contains no seam gate', !lk.zone.some((i) => v.isGate.includes(i)));
  ok('zone size is building-scale', lk.zone.length >= 4 && lk.zone.length <= 30);
  // determinism: same (view, seed) ⇒ same locked membrane
  ok('locks are deterministic', deterministicLocks(v, { seed: 7 })[0].key === lk.key);
}

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
