// hoop/story/locks.js — puzzle-gated map progression: the deterministic lock layer + choke-finder. Pure.
//
// The navmesh of a region is the `doors + opens` graph (deck.js#buildWalk): a building is ONE open room
// reached by a SINGLE street door — a true BRIDGE, an edge whose removal isolates the building. So a
// "lock on a door" is: pick a bridge, mark its membrane `requires <state>`, and refuse passage across it
// unless meetsState (the story engine's gate evaluator, over the player's inventory/facts).
//
// THREE powers, all from this one graph:
//   • gate a CHUNK   — region seams cross only at discrete gate chambers (view.isGate); lock a gate.
//   • gate a BUILDING— its street door is a bridge; lock it and the building is sealed.
//   • circle a ZONE  — chokeForZone() = the passable membranes crossing a geometric disk's boundary
//                      (the cut). bridges() finds the natural single-door chokes; reachable() PROVES a
//                      lock isolates the zone (no path routes around it).
//
// Determinism is load-bearing: locks are a pure function of (view, seed) so every machine sees the same
// sealed doors (world geometry), while whether a door is OPEN FOR YOU is per-player (your save). That is
// exactly hoop's two-tier model. A membrane's identity is its two chambers' gids — atproto-stable.

export const memKey = (ga, gb) => (ga < gb ? ga + '~' + gb : gb + '~' + ga);
const hashStr = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// Build the pure nav graph from a region view (passable membranes only: doors + opens).
export function navGraph(view) {
  const n = view.nReal, adj = Array.from({ length: n }, () => []), seen = new Set();
  const add = (a, b) => {
    if (a >= n || b >= n || a === b || seen.has(a + ',' + b)) return;
    seen.add(a + ',' + b); seen.add(b + ',' + a);
    const k = memKey(view.bandGid[a], view.bandGid[b]);
    adj[a].push({ to: b, k }); adj[b].push({ to: a, k });
  };
  for (const e of (view.scene.doors || [])) add(e.a, e.b);
  for (const e of (view.scene.opens || [])) add(e.a, e.b);
  return { n, adj, pos: (i) => view.seeds[i], gid: (i) => view.bandGid[i], owner: (i) => view.owner[i] };
}

// BFS reachability from `from`, treating membranes in `blocked` (a Set of keys) as impassable.
export function reachable(g, from, blocked) {
  const seen = new Set([from]), q = [from];
  while (q.length) { const u = q.pop(); for (const { to: v, k } of g.adj[u]) { if (blocked && blocked.has(k)) continue; if (!seen.has(v)) { seen.add(v); q.push(v); } } }
  return seen;
}

// Tarjan bridges → the natural single-door chokes. Returns [{ k, a, b }] (membrane + its two cells).
export function bridges(g) {
  const n = g.n, disc = new Int32Array(n).fill(-1), low = new Int32Array(n), out = [];
  let t = 0;
  const dfs = (u, pk) => {                                   // pk = the membrane key we entered u by (skip it once)
    disc[u] = low[u] = t++;
    for (const { to: v, k } of g.adj[u]) {
      if (k === pk) continue;
      if (disc[v] === -1) { dfs(v, k); low[u] = Math.min(low[u], low[v]); if (low[v] > disc[u]) out.push({ k, a: u, b: v }); }
      else low[u] = Math.min(low[u], disc[v]);
    }
  };
  for (let s = 0; s < n; s++) if (disc[s] === -1) dfs(s, null);
  return out;
}

// The smaller side sealed off if a bridge is cut (the "restricted zone" behind that door).
export function sealedSide(g, bridge) {
  const sideA = reachable(g, bridge.a, new Set([bridge.k]));
  return sideA.size <= g.n - sideA.size ? sideA : reachable(g, bridge.b, new Set([bridge.k]));
}

// Circle an arbitrary spot → the cut. interior = cells within `radius` of center reachable inside the
// disk; cut = the passable membranes crossing the boundary (lock them all to seal the disk).
export function chokeForZone(g, centerIdx, radius) {
  const c = g.pos(centerIdx), inside = (i) => { const p = g.pos(i); return (p.x - c.x) ** 2 + (p.y - c.y) ** 2 <= radius * radius; };
  const interior = new Set([centerIdx]), q = [centerIdx];
  while (q.length) { const u = q.pop(); for (const { to: v } of g.adj[u]) if (inside(v) && !interior.has(v)) { interior.add(v); q.push(v); } }
  const cut = [], seenK = new Set();
  for (const u of interior) for (const { to: v, k } of g.adj[u]) if (!interior.has(v) && !seenK.has(k)) { seenK.add(k); cut.push({ k, a: u, b: v }); }
  return { interior, cut };
}

// Deterministic lock layer for a region: pick a building-sized bridge (a single-door vault) by hash and
// seal it behind `requires`. Never seals a gate cell (would soft-lock the chunk crossing). Pure (view, seed).
export function deterministicLocks(view, { seed = 0, requires = { items: ['keeper key'] }, label = 'a sealed vault', minZone = 4, maxZone = 30, max = 1 } = {}) {
  const g = navGraph(view), gateCells = new Set(view.isGate || []);
  const cands = [];
  for (const br of bridges(g)) {
    const zone = sealedSide(g, br);
    if (zone.size < minZone || zone.size > maxZone) continue;
    const cells = [...zone];
    if (cells.some((i) => gateCells.has(i))) continue;       // don't trap a seam crossing inside the vault
    if (cells.some((i) => view.owner[i] === -1)) continue;   // building-only — never seal concourse or trap the @'s road spawn
    cands.push({ br, zone, h: hashStr(seed + ':' + br.k) });
  }
  cands.sort((p, q) => p.h - q.h);
  return cands.slice(0, max).map(({ br, zone }) => ({
    key: br.k, doorCells: [br.a, br.b], requires, label,
    zone: [...zone], doorMid: midOf(view, br.a, br.b), centerGid: view.bandGid[[...zone][0]],
  }));
}
function midOf(view, a, b) { const p = view.seeds[a], q = view.seeds[b]; return [(p.x + q.x) / 2, (p.y + q.y) / 2]; }

// Which locked membranes can THIS player not cross right now? (gate eval = the story engine's meetsState).
// `meets(requires)` is supplied by the caller so locks.js stays dependency-free.
export function blockedKeys(locks, meets) {
  const out = new Set();
  for (const lk of locks) if (!meets(lk.requires)) out.add(lk.key);
  return out;
}
