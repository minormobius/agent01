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

// 1) a fresh build is one centred TESSELLATION ward (the floor uses the editor geometry by default)
const s = createBuild(7, { v2: true, portsMax: 1 });
ok(s.world.chunks.length === 1, 'createBuild places exactly one ward');
ok(s.world.chunks[0].poly.length === SAMPLE_SHAPE.boundary.length, `ward 0 fills the tessellation outline (${s.world.chunks[0].poly.length} segs, not a 6-edge hex)`);
ok(s.world.chunks[0].rooms.length > 8, 'ward 0 has rooms (v2 solver ran over the deformed shape)');
ok(s.world.chunks[0].ports.length <= 6 && s.world.chunks[0].ports.length >= 4, `~one port per side, not per segment (${s.world.chunks[0].ports.length} on 6 sides)`);
ok(Object.keys(s.world.chunks[0].rooms.reduce((a, r) => (a[r.role] = 1, a), {})).length >= 10, 'v2 ward plants many building types (role floors)');

// 2) grow off a free SIDE → a connected neighbour, by TRANSLATION (not reflection)
const fr = frontier(s);
ok(fr.length === 6 && fr.every((f) => !f.closed), 'a lone ward shows 6 open frontier SIDES (grouped from 30 segments)');
const nb = growSide(s, 0, fr[0].sideK, 'market');
ok(nb === 1 && s.world.chunks.length === 2, 'growSide adds the neighbour');
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

// 3) CLOSED WALL: seal a frontier side → that whole side has 0 ports
const wf = frontier(s).filter((f) => f.chunkId === 1 && !f.closed)[0];
ok(toggleWall(s, 1, wf.sideK), 'toggleWall seals a frontier side');
ok(!s.world.chunks[1].ports.some((p) => s.sideOf[p.edge] === wf.sideK), 'the closed wall carries ZERO ports across its whole side');
ok(reach(s.world), 'the floor stays connected after walling a side');
toggleWall(s, 1, wf.sideK);   // reopen
ok(s.world.chunks[1].ports.some((p) => s.sideOf[p.edge] === wf.sideK), 'toggleWall re-opens the wall (the side gets a port back)');

// 3b) growing off a sealed side re-opens it and still connects
toggleWall(s, 1, wf.sideK);
const nb2 = growSide(s, 1, wf.sideK, 'garden');
ok(nb2 === 2 && reach(s.world), 'growing off a sealed side re-opens it and connects');

// 4) seal the whole frontier → many closed walls, floor still one world, no boundary ports
const before = closedWallCount(s);
const sealed = sealFrontier(s);
ok(sealed > 0 && closedWallCount(s) === before + sealed, `sealFrontier closes every open frontier side (${sealed})`);
ok(frontier(s).every((f) => f.closed), 'after sealing, no open frontier sides remain');
ok(reach(s.world), 'the sealed bounded floor is still one connected world');
let boundaryPorts = 0;
for (const ch of s.world.chunks) for (let e = 0; e < ch.poly.length; e++) if (edgeFree(s.world, ch, e)) for (const p of ch.ports) if (p.edge === e) boundaryPorts++;
ok(boundaryPorts === 0, 'no concourse port sits on any sealed boundary segment');

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
