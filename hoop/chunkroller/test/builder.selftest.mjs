// builder.selftest.mjs — the interactive bounded-floor builder (translation tiling, tessellation shape).
//   node hoop/chunkroller/test/builder.selftest.mjs
import { createBuild, growSide, toggleWall, sealFrontier, frontier, histogram, biomeOf, closedWallCount } from '../builder.js';
import { edgeFree, buildWalk, midKey } from '../../v099/v8/manager.js';
import { buildFoam } from '../../v099/v7/foam.js';
import { SAMPLE_SHAPE } from '../shapes.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

// 0) THE SEAM CONTRACT (the clash fix): two chunks whose regions OVERLAP must generate identical Voronoi
// nuclei in the overlap when they SHARE the foam-lattice seed — that's what makes neighbouring chunks abut
// without a clash. With DIFFERENT foam seeds the overlap nuclei diverge (the old bug). buildFoam keys
// nuclei by (gid, seed).
function nucleiByGid(region, seed) { const f = buildFoam({ regions: [region], cellSize: 16, depth: 2.4, seed }); const m = new Map(); for (const c of f.cells) m.set(c.gid, [c.x, c.y]); return m; }
const rA = { x0: 0, y0: 0, x1: 320, y1: 320 }, rB = { x0: 160, y0: 0, x1: 480, y1: 320 };
{
  const a = nucleiByGid(rA, 99), b = nucleiByGid(rB, 99);
  let shared = 0, same = 0; for (const [g, p] of a) if (b.has(g)) { shared++; const q = b.get(g); if (Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9) same++; }
  ok(shared > 40 && same === shared, `SHARED foam seed ⇒ overlap nuclei bit-identical, no clash (${same}/${shared})`);
}
{
  const a = nucleiByGid(rA, 1), b = nucleiByGid(rB, 2);
  let shared = 0, same = 0; for (const [g, p] of a) if (b.has(g)) { shared++; const q = b.get(g); if (Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9) same++; }
  ok(shared > 40 && same < shared * 0.05, `DIFFERENT foam seeds ⇒ overlap nuclei CLASH (${same}/${shared} identical — the old bug)`);
}

// 1) a fresh build is one centred TESSELLATION ward, SEALED — walls a priori (the boundary is portless)
const s = createBuild(7, { v2: true, portsMax: 1 });
ok(s.world.chunks.length === 1, 'createBuild places exactly one ward');
ok(s.world.chunks[0].poly.length === SAMPLE_SHAPE.boundary.length, `ward 0 fills the tessellation outline (${s.world.chunks[0].poly.length} segs, not a 6-edge hex)`);
ok(s.world.chunks[0].rooms.length > 8, 'ward 0 has rooms (v2 solver ran over the deformed shape)');
ok(s.world.chunks[0].ports.length === 0, `a lone ward is SEALED — portless walls a priori (${s.world.chunks[0].ports.length} ports)`);
ok(Object.keys(s.world.chunks[0].rooms.reduce((a, r) => (a[r.role] = 1, a), {})).length >= 10, 'v2 ward plants many building types (role floors)');

// 1b) NO CONCOURSE ON WALLS: in a sealed ward the concourse never touches the wall rim (no port = no
// concourse). Measure: of the perimeter cells, almost none carry road.
function perimRoad(ch) { let perim = 0, road = 0; for (let i = 0; i < ch.cells.length; i++) if (ch.cells[i].poly.some((v) => v[2] === -1)) { perim++; if (ch.road[i]) road++; } return { perim, road }; }
{ const pr = perimRoad(s.world.chunks[0]); ok(pr.road / pr.perim < 0.1, `the sealed ward keeps the concourse off its walls (${pr.road}/${pr.perim} perimeter cells carry road — only walled-in-room doors)`); }

// 2) grow off a wall SIDE → it OPENS (gets a port) and a connected neighbour renders, by TRANSLATION
const fr = frontier(s);
ok(fr.length === 6 && fr.every((f) => f.closed), 'a lone ward shows 6 frontier SIDES, all closed walls (a priori)');
const nb = growSide(s, 0, fr[0].sideK, 'market');
ok(nb === 1 && s.world.chunks.length === 2, 'growSide adds the neighbour');
ok(s.world.chunks[0].ports.some((p) => s.sideOf[p.edge] === fr[0].sideK), 'growing OPENED ward 0’s grown side (it now carries a seam port)');
ok(biomeOf(s, 1) === 'market', 'the neighbour took the chosen biome');
// the neighbour is ward 0 TRANSLATED by the side-k lattice vector T_k
const T = s.T[fr[0].sideK];
ok(s.world.chunks[1].poly.every((p, i) => Math.abs(p.x - (s.world.chunks[0].poly[i].x + T.x)) < 1e-6 && Math.abs(p.y - (s.world.chunks[0].poly[i].y + T.y)) < 1e-6), 'the neighbour is the ward translated by T_k (translation tiling)');

// 2b) THE TESSELLATION SEAM: the shared side's segments coincide exactly (zero gap), so the wiggly seam
// tiles. The parent's side-k segment midpoints all appear among the neighbour's segment midpoints.
{
  const A = s.world.chunks[0], B = s.world.chunks[1];
  const bKeys = new Set(); for (let e = 0; e < B.poly.length; e++) bKeys.add(midKey(B.poly, e));
  let sideSegs = 0, matched = 0; for (let e = 0; e < A.poly.length; e++) if (s.sideOf[e] === fr[0].sideK) { sideSegs++; if (bKeys.has(midKey(A.poly, e))) matched++; }
  ok(sideSegs >= 4 && matched === sideSegs, `the wiggly shared side tiles with zero gap (${matched}/${sideSegs} segments coincide)`);
}

// 2c) one connected walk-graph world
function reach(world) {
  const walk = buildWalk(world); const seen = new Uint8Array(walk.N); const q = [0]; seen[0] = 1;
  for (let h = 0; h < q.length; h++) for (const v of walk.adj[q[h]]) if (!seen[v]) { seen[v] = 1; q.push(v); }
  return world.chunks.every((ch) => { const b = walk.base[ch.id]; for (let i = 0; i < ch.cells.length; i++) if (seen[b + i]) return true; return false; });
}
ok(reach(s.world), 'every ward is walk-reachable from ward 0 (connected floor)');

// 2d) NO CLASH at the seam: the two abutting wards slice the SAME global foam — no cell of one sits on top
// of a cell of the other.
{
  const A = s.world.chunks[0].cells, B = s.world.chunks[1].cells, cs = s.world.chunks[0].cellSize;
  let minD = Infinity; for (const a of A) for (const b of B) { const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2; if (d < minD) minD = d; }
  ok(Math.sqrt(minD) > cs * 0.3, `abutting wards don't overlap — closest cross-seam cells ${Math.sqrt(minD).toFixed(1)}px apart`);
}

// 2c) one connected walk-graph world
ok(reach(s.world), 'every ward is walk-reachable from ward 0 (connected floor)');

// 3) the boundary is closed walls A PRIORI — every frontier side is a wall carrying 0 ports, and the
// concourse stays off all of them. No sealing needed.
ok(frontier(s).every((f) => f.closed), 'every frontier side is a closed wall by default (a priori)');
let boundaryPorts = 0;
for (const ch of s.world.chunks) for (let e = 0; e < ch.poly.length; e++) if (edgeFree(s.world, ch, e)) for (const p of ch.ports) if (p.edge === e) boundaryPorts++;
ok(boundaryPorts === 0, 'no concourse port sits on any boundary (wall) segment — the walls are portless (the no-concourse-on-walls is pinned on the sealed ward in 1b)');

// 3b) toggleWall opens a wall into a port-stub, and re-closes it
const wf = frontier(s).filter((f) => f.chunkId === 1 && f.closed)[0];
ok(toggleWall(s, 1, wf.sideK) && s.world.chunks[1].ports.some((p) => s.sideOf[p.edge] === wf.sideK), 'toggleWall opens a wall (the side gets a port)');
ok(toggleWall(s, 1, wf.sideK) && !s.world.chunks[1].ports.some((p) => s.sideOf[p.edge] === wf.sideK), 'toggleWall re-closes the wall (0 ports again)');

// 3c) growing off a wall side opens it and still connects
const nb2 = growSide(s, 1, wf.sideK, 'garden');
ok(nb2 === 2 && reach(s.world), 'growing off a wall side opens it and connects');
ok(sealFrontier(s) >= 0 && frontier(s).every((f) => f.closed), 'sealFrontier leaves the frontier all walls (a no-op when already walled)');

// 5) determinism — same seed + same build script ⇒ identical floor
function build(seed) { const t = createBuild(seed, { v2: true, portsMax: 1 }); const f = frontier(t); growSide(t, 0, f[0].sideK, 'market'); growSide(t, 0, f[1].sideK, 'garden'); sealFrontier(t); return t; }
const a = build(11), b = build(11);
const sig = (t) => JSON.stringify(t.world.chunks.map((ch) => [ch.rooms.length, ch.ports.length, ch.road.reduce((x, v) => x + v, 0)]));
ok(sig(a) === sig(b), 'the builder is deterministic (same seed ⇒ identical floor)');
const h = histogram(a);
ok(h.market >= 1 && h.garden >= 1, 'histogram counts each placed ward biome');

// 6) the plain-hexagon fallback (shape: null) still tiles by translation
const hx = createBuild(3, { shape: null, v2: false, portsMax: 1 });
ok(hx.world.chunks[0].poly.length === 6, 'shape:null builds a 6-edge hexagon ward');
const hf = frontier(hx); const hn = growSide(hx, 0, hf[0].sideK, 'commons');
ok(hn === 1 && reach(hx.world), 'the hexagon floor grows + connects too');

console.log(`builder.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
