// node hoop/v100/test/rind-floor.selftest.mjs
// INTEGRATION: the offset four-chunk rind floor, built the way index.html#maybeBuildRind does it — laid
// far from the nave so NO rind port can coincide with a nave port (the deck-leak guard CLAUDE.md warns
// about), internally connected (hub links all three stations), infrastructure-only, and the shaft endpoints
// (a teleport pair) both resolve to real walk nodes. Proves the wiring before the browser drive.
import { prepareNave, naveSolveNext } from '../../nave/nave.js';
import { prepareRind, rindSolveNext, RIND_CHUNKS, rindRoles } from '../../rind/rind.js';
import { createWorld, addChunk, buildWalk, globalOf } from '../v8/manager.js';
import { nearestConcourse } from '../descent.js';

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error('  ✗ ' + m); } };
const polyCentroid = (poly) => { let x = 0, y = 0; for (const p of poly) { x += p.x; y += p.y; } return { x: x / poly.length, y: y / poly.length }; };
const RIND_OFFSET = 6000;

for (const seed of [7, 42]) {
  // build the nave into a world (deck 0)
  const nst = prepareNave(seed); while (naveSolveNext(nst) >= 0); const world = nst.world;
  const naveChunks = world.chunks.length;
  ok(naveChunks === 7, `seed ${seed}: nave has 7 chunks (deck 0)`);

  // build the rind offset east of the nave commons, tag deck 1, add to the SAME world
  const nc = polyCentroid(world.chunks[0].poly);
  const rst = prepareRind((seed ^ 0x9e3779b9) >>> 0, { cx: nc.x + RIND_OFFSET, cy: nc.y });
  let r, rindRecs = [];
  while ((r = rindSolveNext(rst))) { r.rec.deck = 1; r.rec.rind = true; addChunk(world, r.rec); rindRecs.push(r.rec); }
  ok(rindRecs.length === 4, `seed ${seed}: rind floor is 4 chunks`);
  ok(rindRecs.every((rc) => rc.deck === 1), `seed ${seed}: every rind chunk tagged deck 1`);
  ok(rst.meta.map((m) => m.station).join(',') === 'mercury,mars,venus,jupiter', `seed ${seed}: domains are Mercury·Mars·Venus·Jupiter`);

  // OFFSET GUARD: no rind port coincides with any nave port (else buildWalk would link decks → leak)
  const portKey = (p) => Math.round(p.x) + ',' + Math.round(p.y);
  const navePorts = new Set();
  for (let i = 0; i < naveChunks; i++) for (const p of world.chunks[i].ports) navePorts.add(portKey(p));
  let coincide = 0;
  for (const rc of rindRecs) for (const p of rc.ports) if (navePorts.has(portKey(p))) coincide++;
  ok(coincide === 0, `seed ${seed}: NO rind port coincides with a nave port (decks can't leak) — found ${coincide}`);

  // rind chunks really are far from the nave in world coords
  let naveMaxX = -1e9; for (let i = 0; i < naveChunks; i++) for (const p of world.chunks[i].poly) naveMaxX = Math.max(naveMaxX, p.x);
  let rindMinX = 1e9; for (const rc of rindRecs) for (const p of rc.poly) rindMinX = Math.min(rindMinX, p.x);
  ok(rindMinX > naveMaxX, `seed ${seed}: the rind floor sits entirely east of the nave (${Math.round(rindMinX)} > ${Math.round(naveMaxX)})`);

  // the Seven's verbs re-read at scale: Venus's gardens (grow/heal) + Jupiter's court (govern/play) live
  // here; NO worship (that is Saturn/Sol, the lower rind).
  const roles = rindRoles();
  ok(roles.includes('grow') && roles.includes('play'), `seed ${seed}: upper rind carries grow (Venus) + play (Jupiter)`);
  ok(!roles.includes('worship'), `seed ${seed}: no worship on the upper rind (Saturn/Sol are the lower rind)`);
  ok(['move', 'trade', 'learn', 'make', 'mend', 'grow', 'heal', 'govern'].every((x) => roles.includes(x)), `seed ${seed}: the four domains' verbs are all placed`);

  // walk the combined world: the shaft teleport pair (nave concourse ↔ rind hub concourse) both resolve
  const walk = buildWalk(world);
  const sc = nearestConcourse(world.chunks[0], nc.x, nc.y);
  const hub = rindRecs[0], hc = polyCentroid(hub.poly), hsc = nearestConcourse(hub, hc.x, hc.y);
  ok(sc && hsc, `seed ${seed}: both shaft feet found a concourse cell`);
  const n0 = globalOf(walk, 0, sc.cell), n1 = globalOf(walk, hub.id, hsc.cell);
  ok(n0 >= 0 && n1 >= 0, `seed ${seed}: both shaft endpoints resolve to walk nodes (the teleport pair)`);
  ok((walk.nodeChunk[n1] !== undefined) && (world.chunks[walk.nodeChunk[n1]].deck === 1), `seed ${seed}: the rind end of the shaft is on deck 1`);

  // rind internal connectivity: the hub shares a port location with each station (the star)
  const locOf = (ch) => new Set(ch.ports.map(portKey));
  const hubLoc = locOf(hub);
  let stationsLinked = 0;
  for (let i = 1; i < 4; i++) { for (const k of locOf(rindRecs[i])) if (hubLoc.has(k)) { stationsLinked++; break; } }
  ok(stationsLinked === 3, `seed ${seed}: the hub links all three stations (clean star) — linked ${stationsLinked}/3`);
}

console.log((bad ? '✗ ' : '✓ ') + 'rind-floor.selftest — ' + (n - bad) + '/' + n + ' checks');
process.exit(bad ? 1 : 0);
