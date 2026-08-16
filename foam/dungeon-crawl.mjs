// foam/dungeon-crawl.mjs — the crawl layer: tile-by-tile movement over a
// canonical `foam-dungeon` document.
//
// The crawler deliberately consumes the EXPORT format, not the live dungeon
// object — the same code crawls a dungeon generated in-page and one loaded
// from a downloaded .json (dungeon/FORMAT.md). If crawling ever needs a field
// the format lacks, the format grows — that keeps the interchange contract
// honest.
//
// Movement rules:
//   - a step goes to a lattice neighbour (grid: 4-neighbour; hex: the 6
//     axial neighbours) whose tile exists in the SAME room, with a height
//     gate: |Δy| ≤ dyMax. The kernel's walk certificate bounds certified
//     floor slopes at maxGrade ≈ 1.05, so dyMax defaults to
//     1.05·tileSize + 0.35 (the knee-step allowance) — every step the floor
//     itself would permit, nothing a cliff would forbid.
//   - tile sampling can still gap a room (coverage is never 100% on sloped
//     polygonal floors), so each room's step graph is BRIDGED: while it has
//     more than one component, the closest inter-component tile pair within
//     reach (plan distance ≤ 2.6·tileSize, |Δy| ≤ 1.5·dyMax) is connected —
//     a deterministic "scramble" move. Pairs beyond that are joined
//     unconditionally as a last resort and counted, so the selftest can see
//     how often the fallback fires.
//   - standing on a door tile allows a TRANSIT through that door to the
//     matching door tile in the far room.
//
// Deterministic, node + browser, no dependencies.

const HEXN = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
const GRIDN = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function defaultDyMax(tileSize) { return 1.05 * tileSize + 0.35; }

// buildCrawl(json) → {
//   json, dyMax,
//   rooms: Map(roomId → { info, byKey: Map(key→tile), adj: Map(key→[key…]),
//                         bridges, forcedBridges, doors: [{to, face, tile, farTile}] }),
//   startRoom, startTile,
// }
export function buildCrawl(json, opts = {}) {
  if (json.format !== 'foam-dungeon') throw new Error('not a foam-dungeon document');
  const tileSize = json.tile.size;
  const dyMax = opts.dyMax ?? defaultDyMax(tileSize);
  const shape = json.tile.shape;
  // blocked: Set of 'room:tile' keys that cannot be stood on (obstacles).
  // CRITICAL ORDER: adjacency AND bridging are computed from geometry alone
  // — the full tile set — and blocked tiles are cut out afterwards. Bridges
  // exist to heal tile-SAMPLING gaps; computing them after blocking let a
  // scramble hop apex-to-apex across a rubble wall (found by a human
  // crawler walking through a solid wall). A wall now blocks exactly what
  // it covers, nothing routes around it. Door / entrance / goal tiles are
  // never blocked (the content roller reserves them).
  const blocked = opts.blocked ?? null;
  const roomById = new Map(json.rooms.map((r) => [r.id, r]));
  const rooms = new Map();

  for (const r of json.rooms) {
    const isB = (k) => blocked !== null && blocked.has(r.id + ':' + k);
    const walk = r.tiles;
    const byKey = new Map(r.tiles.map((t) => [t.key, t]));
    const adj = new Map(walk.map((t) => [t.key, []]));
    const link = (a, b) => { adj.get(a).push(b); adj.get(b).push(a); };
    // neighbours under the height gate — lattice deltas for periodic
    // shapes; aperiodic tiles (poly carried) adjoin by SHARED EDGE, found
    // through their bit-identical rounded vertices. This is why the whole
    // crawl layer is graph-based: a tiling only owes us an adjacency.
    if (shape === 'penrose') {
      const vk = (p) => Math.round(p[0] * 512) + ',' + Math.round(p[1] * 512);
      const edgeOwner = new Map();
      for (const t of walk) {
        if (!t.poly) continue;
        for (let i = 0; i < t.poly.length; i++) {
          const a = vk(t.poly[i]), b = vk(t.poly[(i + 1) % t.poly.length]);
          const ek = a < b ? a + '|' + b : b + '|' + a;
          const other = edgeOwner.get(ek);
          if (other !== undefined && other !== t.key) {
            const n = byKey.get(other);
            if (Math.abs(n.y - t.y) <= dyMax) link(t.key, other);
          } else edgeOwner.set(ek, t.key);
        }
      }
    } else {
      for (const t of walk) {
        const deltas = shape === 'hex' ? HEXN : GRIDN;
        for (const [da, db] of deltas) {
          const nk = shape === 'hex'
            ? (t.q === undefined ? null : (t.q + da) + ',' + (t.r + db))
            : (t.i === undefined ? null : (t.i + da) + ',' + (t.j + db));
          if (!nk || !byKey.has(nk)) continue;
          const n = byKey.get(nk);
          if (t.key < nk && Math.abs(n.y - t.y) <= dyMax) link(t.key, nk);
        }
      }
    }
    // bridge the gaps: union-find components, join closest pairs
    const par = new Map(walk.map((t) => [t.key, t.key]));
    const find = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
    for (const [a, ns] of adj) for (const b of ns) { const ra = find(a), rb = find(b); if (ra !== rb) par.set(ra, rb); }
    let bridges = 0, forcedBridges = 0;
    const compCount = () => new Set(walk.map((t) => find(t.key))).size;
    while (compCount() > 1) {
      let best = null, bd = Infinity, forced = null, fd = Infinity;
      for (let i = 0; i < walk.length; i++) {
        for (let j = i + 1; j < walk.length; j++) {
          const a = walk[i], b = walk[j];
          if (find(a.key) === find(b.key)) continue;
          const d = Math.hypot(a.x - b.x, a.z - b.z);
          const dy = Math.abs(a.y - b.y);
          if (d <= 2.6 * tileSize && dy <= 1.5 * dyMax && d < bd) { bd = d; best = [a.key, b.key]; }
          if (d + dy * 0.5 < fd) { fd = d + dy * 0.5; forced = [a.key, b.key]; }
        }
      }
      const pick = best ?? forced;
      if (!pick) break;                       // single tile — cannot happen with >1 comps
      link(pick[0], pick[1]);
      const ra = find(pick[0]), rb = find(pick[1]);
      par.set(ra, rb);
      if (best) bridges++; else forcedBridges++;
    }
    // doors, with the far-side tile resolved from the far room's record
    const doors = r.doors.map((d) => {
      const far = roomById.get(d.to);
      const fd = far.doors.find((x) => x.face === d.face);
      return { to: d.to, face: d.face, at: d.at, tile: d.tile, farTile: fd ? fd.tile : null };
    });
    // NOW the wall lands: blocked tiles vanish from the finished graph —
    // no adjacency, and no bridge may terminate on or re-route around them
    if (blocked !== null) {
      for (const t of r.tiles) if (isB(t.key)) adj.delete(t.key);
      for (const [a, ns] of adj) adj.set(a, ns.filter((b) => !isB(b)));
    }
    rooms.set(r.id, { info: r, byKey, adj, bridges, forcedBridges, doors, links: [] });
  }

  // v3 trapdoor passages: a `trapdoor` link is one-way (the drop); a `hatch`
  // links both ways. Attached per-room as directed links.
  for (const td of json.trapdoors ?? []) {
    rooms.get(td.fromRoom)?.links.push({ kind: td.kind, tile: td.fromTile, to: td.toRoom, toTile: td.toTile, drop: td.drop });
    if (td.kind === 'hatch') {
      rooms.get(td.toRoom)?.links.push({ kind: 'hatch', tile: td.toTile, to: td.fromRoom, toTile: td.fromTile, drop: td.drop });
    }
  }

  const startRoom = json.entrance;
  const sr = rooms.get(startRoom);
  const startTile = (sr.info.tiles.find((t) => t.kind === 'entrance') ?? sr.info.tiles[0]).key;
  return { json, dyMax, rooms, startRoom, startTile };
}

// Reachability over (room, tile) states: steps within rooms + door transits.
// Returns { seen: Set('room:tile'), roomsSeen: Set(roomId), endpointsReachable,
//           steps: Map('room:tile' → step count) }.
export function crawlReachability(crawl) {
  const seen = new Map();
  const key = (r, t) => r + ':' + t;
  const q = [[crawl.startRoom, crawl.startTile]];
  seen.set(key(crawl.startRoom, crawl.startTile), 0);
  for (let h = 0; h < q.length; h++) {
    const [ri, tk] = q[h];
    const d = seen.get(key(ri, tk));
    const room = crawl.rooms.get(ri);
    for (const nk of room.adj.get(tk) ?? []) {
      if (!seen.has(key(ri, nk))) { seen.set(key(ri, nk), d + 1); q.push([ri, nk]); }
    }
    for (const door of room.doors) {
      if (door.tile !== tk || door.farTile === null) continue;
      if (!seen.has(key(door.to, door.farTile))) {
        seen.set(key(door.to, door.farTile), d + 1);
        q.push([door.to, door.farTile]);
      }
    }
    for (const ln of room.links) {
      if (ln.tile !== tk) continue;
      if (!seen.has(key(ln.to, ln.toTile))) {
        seen.set(key(ln.to, ln.toTile), d + 1);
        q.push([ln.to, ln.toTile]);
      }
    }
  }
  const roomsSeen = new Set([...seen.keys()].map((k) => Number(k.split(':')[0])));
  return {
    seen,
    roomsSeen,
    endpointsReachable: crawl.json.endpoints.filter((e) => roomsSeen.has(e)),
    stepsTo: (ri, tk) => seen.get(key(ri, tk)),
  };
}

// Movement budget: every (room, tile) state reachable within `budget` steps
// of the given position — steps within rooms and door transits both cost 1.
// Returns Map('room:tile' → cost), including the start at cost 0. This is
// the VTT move range: the UI highlights the current room's entries as legal
// squares and lights doors whose transit fits the budget.
// `blocked` (optional Set of 'room:tile') is a DYNAMIC overlay — tiles
// currently impassable on top of the graph (e.g. an enemy standing there).
export function reachableWithin(crawl, room, tile, budget, blocked = null) {
  const out = new Map();
  const key = (r, t) => r + ':' + t;
  out.set(key(room, tile), 0);
  const q = [[room, tile]];
  for (let h = 0; h < q.length; h++) {
    const [ri, tk] = q[h];
    const d = out.get(key(ri, tk));
    if (d >= budget) continue;
    const R = crawl.rooms.get(ri);
    for (const nk of R.adj.get(tk) ?? []) {
      const k = key(ri, nk);
      if (out.has(k) || (blocked && blocked.has(k))) continue;
      out.set(k, d + 1); q.push([ri, nk]);
    }
    for (const door of R.doors) {
      if (door.tile !== tk || door.farTile === null) continue;
      const k = key(door.to, door.farTile);
      if (out.has(k) || (blocked && blocked.has(k))) continue;
      out.set(k, d + 1); q.push([door.to, door.farTile]);
    }
    for (const ln of R.links) {
      if (ln.tile !== tk) continue;
      const k = key(ln.to, ln.toTile);
      if (out.has(k) || (blocked && blocked.has(k))) continue;
      out.set(k, d + 1); q.push([ln.to, ln.toTile]);
    }
  }
  return out;
}

// Per-room + global health of a document's crawl graph — what the selftest
// asserts and a UI can surface.
export function crawlReport(json, opts = {}) {
  const crawl = buildCrawl(json, opts);
  const reach = crawlReachability(crawl);
  let forced = 0, bridged = 0;
  // a room is PARTITIONED when its free tiles no longer form one component
  // — a wall may texture a room or offer cover, never split it
  const partitionedRoomIds = [];
  for (const [rid, r] of crawl.rooms) {
    forced += r.forcedBridges; bridged += r.bridges;
    const keys = [...r.adj.keys()];
    if (keys.length > 1) {
      const seen = new Set([keys[0]]);
      const q = [keys[0]];
      for (let h = 0; h < q.length; h++) {
        for (const nk of r.adj.get(q[h])) if (!seen.has(nk)) { seen.add(nk); q.push(nk); }
      }
      if (seen.size !== keys.length) partitionedRoomIds.push(rid);
    }
  }
  return {
    rooms: crawl.rooms.size,
    bridgedRooms: bridged,
    forcedBridges: forced,
    partitionedRoomIds,
    allRoomsReachable: reach.roomsSeen.size === crawl.rooms.size,
    endpointsReachable: reach.endpointsReachable.length,
    endpointsTotal: json.endpoints.length,
    complete: reach.endpointsReachable.length === json.endpoints.length,
  };
}
