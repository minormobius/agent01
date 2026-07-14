// roam.selftest — the ROAMED overworld: chunk determinism, roam-and-return, voronoi tiling, water-blocked
// movement, and the two roam verbs (forage / encounter). Pure — no DOM. Mirrors overworld.selftest's
// same-seed contract, extended to the streamed-chunk world.
import { makeChunk, voronoiCells, isWater, bandAt, CHUNK, organismById } from '../over/overworld.js';
import { createRoam, getChunk, ensureAround, stepPlayer, chunkCoordAt, residentChunks,
  forageTarget, forage, encounterTarget, foeOf, defeat, isDefeated } from '../over/roam.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// 1. a chunk is a PURE function of (seed, cx, cy) — the roam-and-return / permalink contract
{
  const a = makeChunk(7, 2, -3), b = makeChunk(7, 2, -3);
  ok(JSON.stringify(a.plants) === JSON.stringify(b.plants), 'same (seed,cx,cy) → identical plants');
  ok(JSON.stringify(a.fauna) === JSON.stringify(b.fauna), 'same (seed,cx,cy) → identical fauna');
  ok(JSON.stringify(a.cells) === JSON.stringify(b.cells), 'same (seed,cx,cy) → identical voronoi cells');
  ok(JSON.stringify(makeChunk(8, 2, -3).plants) !== JSON.stringify(a.plants), 'a different seed → a different chunk');
  ok(JSON.stringify(makeChunk(7, 3, -3).plants) !== JSON.stringify(a.plants), 'a different chunk coord → different content');
}

// 2. chunk content lives in the chunk's WORLD rect; ids are stable + unique
{
  const c = makeChunk(3, 5, 5);
  ok(c.x0 === 5 * CHUNK && c.y0 === 5 * CHUNK, 'chunk world origin = coord × CHUNK');
  ok(c.plants.every((p) => p.x >= c.x0 && p.x < c.x0 + CHUNK && p.y >= c.y0 && p.y < c.y0 + CHUNK), 'every plant sits inside its chunk rect');
  ok(new Set(c.plants.map((p) => p.id)).size === c.plants.length, 'plant ids are unique within a chunk');
  ok(c.plants.every((p) => organismById(p.orgId) && organismById(p.orgId).kind === 'producer'), 'every plant is a real producer');
  ok(c.plants.every((p) => p.band !== 'benthic'), 'nothing roots on open water');
  ok(c.fauna.every((f) => organismById(f.orgId) && organismById(f.orgId).kind === 'animal'), 'every creature is a real animal');
}

// 3. voronoi tiling covers the chunk with no gaps/overlaps (areas sum to the chunk area)
{
  const size = 512, cells = voronoiCells(11, 0, 0, size);
  ok(cells.length > 4, `a chunk tiles into several voronoi cells (${cells.length})`);
  const area = (poly) => { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
  const total = cells.reduce((s, c) => s + area(c.poly), 0);
  ok(Math.abs(total - size * size) / (size * size) < 0.01, `cells partition the chunk (area ${total | 0} ≈ ${size * size})`);
  ok(cells.every((c) => c.poly.length >= 3 && ['heath', 'meadow', 'grove', 'thicket', 'fen', 'benthic'].includes(c.band)), 'each cell is a real polygon with a real band');
  // seam: the shared edge column of two adjacent chunks draws the SAME sites → cells align (determinism)
  ok(JSON.stringify(voronoiCells(11, 0, 0, size)) === JSON.stringify(voronoiCells(11, 0, 0, size)), 'voronoi is deterministic');
}

// 4. createRoam spawns on LAND, deterministically, and streams chunks around the player
{
  const r1 = createRoam(42), r2 = createRoam(42);
  ok(r1.player.x === r2.player.x && r1.player.y === r2.player.y, 'spawn is deterministic from the seed');
  ok(!isWater(r1.player.x, r1.player.y, 42), 'the player spawns on dry land, never in the lake');
  ok(residentChunks(r1).length === (2 * r1.keep + 1) ** 2, `keep=${r1.keep} → ${(2 * r1.keep + 1) ** 2} resident chunks around spawn`);
}

// 5. movement is blocked by water; walking off into a new chunk streams it in and prunes the old
{
  const r = createRoam(5, { keep: 1 });
  // find a water direction from spawn (scan the ring) and prove we can't cross it
  let blocked = false;
  for (let a = 0; a < 64 && !blocked; a++) {
    const dx = Math.cos(a) * 8, dy = Math.sin(a) * 8;
    if (isWater(r.player.x + dx, r.player.y + dy, r.seed)) {
      const px = r.player.x, py = r.player.y; stepPlayer(r, dx, dy);
      ok(!(r.player.x === px + dx && r.player.y === py + dy), 'a step straight into water is blocked (axis-slide at most)');
      blocked = true;
    }
  }
  if (!blocked) ok(true, 'no water adjacent to spawn (nothing to block) — acceptable');
  // walk far in +x; the origin chunk should get pruned once we are keep+1 chunks away
  const r2 = createRoam(9, { keep: 1 });
  const [ocx, ocy] = chunkCoordAt(r2, r2.player.x, r2.player.y);
  for (let i = 0; i < 400; i++) stepPlayer(r2, 24, 0);   // march east (water only axis-slides, still progresses)
  const [ncx] = chunkCoordAt(r2, r2.player.x, r2.player.y);
  ok(ncx > ocx, `marching east advanced the player across chunks (${ocx} → ${ncx})`);
  ok(!r2.chunks.has(ocx + ',' + ocy), 'the origin chunk was pruned after roaming away (roam-and-return: rebuilt on return)');
  // returning regenerates the origin chunk identically
  const fresh = makeChunk(r2.seed, ocx, ocy), reentered = getChunk(r2, ocx, ocy);
  ok(JSON.stringify(fresh.plants) === JSON.stringify(reentered.plants), 'returning to a pruned chunk rebuilds it byte-identical');
}

// 6. forage — the nearest gatherable plant is found, gathered once, and stays gathered
{
  const r = createRoam(21, { keep: 2 });
  // teleport the player onto a gatherable plant so a target exists
  let target = null;
  for (const c of residentChunks(r)) { const g = c.plants.find((p) => p.gather); if (g) { target = g; break; } }
  ok(target, 'the roamed world contains gatherable plants (forage hooks for hoopy)');
  if (target) {
    r.player.x = target.x; r.player.y = target.y;
    const t = forageTarget(r); ok(t && t.id === target.id, 'forageTarget finds the plant under the player');
    const y = forage(r, t); ok(y && y.orgId === target.orgId && y.name, 'forage returns a yield descriptor (orgId + name)');
    ok(r.gathered.has(target.id) && forage(r, t) === null, 'a plant can only be foraged once');
    ok(forageTarget(r) === null || forageTarget(r).id !== target.id, 'a foraged plant is no longer a target');
    // survives a chunk rebuild (gathered set is keyed by stable id)
    r.chunks.clear(); ensureAround(r);
    ok(r.gathered.has(target.id), 'a foraged plant stays foraged across a chunk prune/rebuild');
  }
}

// 7. encounter — a fightable creature (a swarm/predator) is found and resolves to a foe
{
  let r = null, foe = null;
  for (let s = 1; s < 40 && !foe; s++) {   // some seeds' spawn neighbourhood has no swarm; scan a few
    r = createRoam(s, { keep: 2 });
    let f = null;
    for (const c of residentChunks(r)) { const e = c.fauna.find((x) => x.fight); if (e) { f = e; break; } }
    if (f) { r.player.x = f.x; r.player.y = f.y; foe = encounterTarget(r); }
  }
  ok(foe, 'a fightable creature (a bee-swarm/spider) is reachable in the roamed world');
  if (foe) {
    const d = foeOf(foe); ok(d && d.name && (d.swarm || d.plan === 'poly'), 'foeOf resolves a foe descriptor (name + swarm/predator)');
    defeat(r, foe); ok(isDefeated(r, foe), 'a defeated creature is marked (does not re-menace this visit)');
  }
}

// 8. density scales chunk population
ok(makeChunk(1, 0, 0, { density: 2 }).plants.length > makeChunk(1, 0, 0, { density: 1 }).plants.length, 'higher density → more plants per chunk');

console.log(`roam.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
