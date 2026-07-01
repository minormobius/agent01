// wayfind.js — ROUTING over the woven pancake, and the CERTIFICATE that validates the whole construction.
//
// The chambers + their doors/stairs are a navigation graph:
//   • DOOR edges — between in-plane neighbours (same layer): you walk through a wall-gap to the next room.
//   • STAIR edges — between a chamber and its other-layer partner, i.e. the over/under FACILITY. BUT the two
//     centre hubs have NO stair (a chamber.js invariant), so the white hub and the production hub are NOT
//     directly linked.
//
// That last fact is the load-bearing claim of the entire design, and routing is what proves it: a path from
// the white hub to the production hub is FORCED to leave on a white arm, cross a stair somewhere out in the
// field (the weave), and come back on a production arm — it can never take a shaft straight down the middle.
// `certify()` checks exactly this, plus full reachability and that every production line is reachable from the
// white hub (representation: the cortex can reach the whole floor). Pure, deterministic, node-tested.

// build the nav graph from a foam3d model
export function buildNav(m) {
  const N = m.nuclei.length, door = Array.from({ length: N }, () => []), stair = new Array(N).fill(-1);
  for (const n of m.nuclei) {
    for (const j of n.neighbors) {
      const q = m.nuclei[j];
      if (q.iz === n.iz) door[n.i].push(j);                         // same layer → a door
      else if (!n.hub && !q.hub) stair[n.i] = j;                    // other layer → a stair, unless either is a hub
    }
  }
  const adj = (i) => { const out = door[i].slice(); if (stair[i] >= 0) out.push(stair[i]); return out; };
  return { N, door, stair, adj, m };
}

// A* (Euclidean heuristic) over door+stair edges; stairs cost a little more (a climb). Returns the path + stats.
export function route(nav, a, b) {
  const m = nav.m, h = (i) => Math.hypot(m.nuclei[i].x - m.nuclei[b].x, m.nuclei[i].y - m.nuclei[b].y, m.nuclei[i].z - m.nuclei[b].z);
  const g = new Map([[a, 0]]), came = new Map(), open = [[h(a), a]];
  const pop = () => { let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k; return open.splice(bi, 1)[0]; };
  while (open.length) {
    const [, u] = pop(); if (u === b) break;
    const gu = g.get(u);
    for (const v of nav.adj(u)) {
      const isStair = nav.stair[u] === v, w = isStair ? 2.2 : 1;
      const ng = gu + Math.hypot(m.nuclei[u].x - m.nuclei[v].x, m.nuclei[u].y - m.nuclei[v].y, m.nuclei[u].z - m.nuclei[v].z) * w;
      if (!g.has(v) || ng < g.get(v)) { g.set(v, ng); came.set(v, u); open.push([ng + h(v), v]); }
    }
  }
  if (!came.has(b) && a !== b) return null;
  const path = [b]; let x = b; while (x !== a) { x = came.get(x); if (x === undefined) return null; path.push(x); }
  path.reverse();
  let stairs = 0, doors = 0; for (let k = 1; k < path.length; k++) (nav.stair[path[k - 1]] === path[k] ? stairs++ : doors++);
  return { path, doors, stairs, cost: g.get(b) };
}

const centre = (m, kind) => { const cands = m.nuclei.filter((n) => n.hub === kind); let best = cands[0], bd = Infinity; for (const n of cands) { const d = n.x * n.x + n.y * n.y; if (d < bd) { bd = d; best = n; } } return best ? best.i : 0; };

// THE CERTIFICATE — the validation endpoint, offline
export function certify(m) {
  const nav = buildNav(m);
  // (1) the whole floor is ONE navigable space (every chamber reachable through doors+stairs)
  const seen = new Set([0]), q = [0]; for (let k = 0; k < q.length; k++) for (const v of nav.adj(q[k])) if (!seen.has(v)) { seen.add(v); q.push(v); }
  const connected = seen.size === nav.N;
  // (2) the two hubs share NO direct edge (no stair, not in-plane adjacent)
  const whubs = m.nuclei.filter((n) => n.hub === 'whub').map((n) => n.i), phubs = new Set(m.nuclei.filter((n) => n.hub === 'phub').map((n) => n.i));
  let hubsDirect = false; for (const i of whubs) for (const v of nav.adj(i)) if (phubs.has(v)) hubsDirect = true;
  // (3) the load-bearing claim: white-hub → production-hub EXISTS but is FORCED through the weave (≥1 stair)
  const wc = centre(m, 'whub'), pc = centre(m, 'phub'), r = route(nav, wc, pc);
  const throughWeave = !!r && r.stairs >= 1;
  // (4) representation: from the white hub the cortex can reach EVERY production line
  const reachAll = m.prodThreads.every((t) => t.cells.length > 0 && route(nav, wc, t.cells[0]) !== null);
  return { connected, hubsDirect, throughWeave, reachAll, hubRoute: r, ok: connected && !hubsDirect && throughWeave && reachAll };
}

if (typeof globalThis !== 'undefined') globalThis.RindWayfind = { buildNav, route, certify };
