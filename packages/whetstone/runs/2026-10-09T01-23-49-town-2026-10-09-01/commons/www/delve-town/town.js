// town.js: turn a Delve room graph into a town plan. Pure functions; node or browser.
// Assumption (modalmobius's, stated on the page): every door is two-way. Under it:
//   building = connected component of rooms; room = Voronoi cell inside the building's footprint;
//   a door is drawn where two connected rooms share a wall. If they don't share one, the door is
//   counted as unplaced (it would need a corridor, or a floor: a fireman's pole). Nothing is hidden.
// Roads are NOT in the data. Buildings are packed into blocks and the streets are the gaps. Said so on the page.
(function (root) {
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  // Merge posts that are the same room carved twice: the rule lives in delve-rooms/rooms.js (dedupe).
  const R = root.DelveRooms || (typeof require !== 'undefined' ? require('../delve-rooms/rooms.js') : null);
  const dedupe = R.dedupe;

  // Undirected doors among mapped rooms (reciprocity assumed). Returns [i, j, recordedBothWays].
  function doors(rooms, edges) {
    const idx = new Map(rooms.map((r, i) => [r.uri, i])), seen = new Map();
    for (const e of edges) {
      if (!idx.has(e.from) || !idx.has(e.to)) continue;
      const a = idx.get(e.from), b = idx.get(e.to); if (a === b) continue;
      const k = Math.min(a, b) + ' ' + Math.max(a, b);
      seen.set(k, (seen.get(k) || 0) | (a < b ? 1 : 2));
    }
    return [...seen].map(([k, m]) => { const [i, j] = k.split(' ').map(Number); return [i, j, m === 3]; });
  }

  function components(n, ds) {
    const p = [...Array(n).keys()], f = x => (p[x] === x ? x : (p[x] = f(p[x])));
    for (const [i, j] of ds) p[f(i)] = f(j);
    const g = new Map();
    for (let i = 0; i < n; i++) { const r = f(i); if (!g.has(r)) g.set(r, []); g.get(r).push(i); }
    return [...g.values()].sort((a, b) => b.length - a.length || a[0] - b[0]);
  }

  // Clip convex polygon to the half-plane closer to p than to q.
  function clip(poly, p, q) {
    const nx = q.x - p.x, ny = q.y - p.y, c = (q.x * q.x + q.y * q.y - p.x * p.x - p.y * p.y) / 2;
    const side = v => nx * v.x + ny * v.y - c; // <= 0 means p's side
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const A = poly[k], B = poly[(k + 1) % poly.length], sa = side(A), sb = side(B);
      if (sa <= 0) out.push(A);
      if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) { const t = sa / (sa - sb); out.push({ x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) }); }
    }
    return out;
  }

  function voronoi(seeds, w, h) {
    return seeds.map((p, i) => {
      let poly = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
      seeds.forEach((q, j) => { if (j !== i) poly = clip(poly, p, q); });
      return poly;
    });
  }

  // Shared wall between cells i and j: the vertices of cell i that sit on the i|j bisector.
  function wall(cells, seeds, i, j) {
    const p = seeds[i], q = seeds[j], d = (v, s) => Math.hypot(v.x - s.x, v.y - s.y);
    const on = cells[i].filter(v => Math.abs(d(v, p) - d(v, q)) < 1e-6 * (1 + d(v, p)));
    if (on.length < 2) return null;
    const [a, b] = on, len = Math.hypot(a.x - b.x, a.y - b.y);
    return len > 1e-6 ? { a, b, len, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } } : null;
  }

  // One building: place room seeds so connected rooms share walls; keep the best of several tries.
  function building(members, ds, opt = {}) {
    const n = members.length, cell = opt.cell || 90;
    const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
    // Pad the footprint around the seeds: rooms on the outside of a building meet along walls that run
    // outward (hull edges of the Delaunay graph), and a tight box cuts those walls off.
    const pad = n > 2 ? (opt.pad ?? cell * 0.6) : 0, w = cols * cell + 2 * pad, h = rows * cell + 2 * pad;
    const local = new Map(members.map((g, k) => [g, k]));
    const links = ds.filter(([i, j]) => local.has(i) && local.has(j)).map(([i, j, both]) => [local.get(i), local.get(j), both]);
    const starts = [];
    for (let t = 0; t < (n < 2 ? 1 : opt.tries || 150); t++) {
      const R = rng(1000 + t * 7919 + n);
      const s = members.map(() => ({ x: pad + (w - 2 * pad) * (0.15 + 0.7 * R()), y: pad + (h - 2 * pad) * (0.15 + 0.7 * R()), vx: 0, vy: 0 }));
      for (let it = 0; it < 300; it++) {
        for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
          const A = s[a], B = s[b], dx = A.x - B.x, dy = A.y - B.y, d2 = dx * dx + dy * dy + 1, f = cell * cell * 0.6 / d2, d = Math.sqrt(d2);
          A.vx += f * dx / d; A.vy += f * dy / d; B.vx -= f * dx / d; B.vy -= f * dy / d;
        }
        for (const [a, b] of links) { const A = s[a], B = s[b], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, f = (d - cell * 0.8) * 0.05; A.vx += f * dx / d; A.vy += f * dy / d; B.vx -= f * dx / d; B.vy -= f * dy / d; }
        for (const P of s) { P.x = Math.max(pad + 4, Math.min(w - pad - 4, P.x + P.vx * 0.5)); P.y = Math.max(pad + 4, Math.min(h - pad - 4, P.y + P.vy * 0.5)); P.vx *= 0.6; P.vy *= 0.6; }
      }
      const cells = voronoi(s, w, h);
      const placed = links.map(([a, b, both]) => ({ a, b, both, wall: wall(cells, s, a, b) }));
      const ok = placed.filter(p => p.wall).length, minWall = Math.min(Infinity, ...placed.filter(p => p.wall).map(p => p.wall.len));
      const score = ok * 1e6 + (isFinite(minWall) ? minWall : 0);
      starts.push({ score, seeds: s.map(({ x, y }) => ({ x, y })), cells, placed, ok });
    }
    // Hill-climb from the best few starts: nudge one seed at a time, keep moves that don't score worse.
    // Random restarts alone stall on graphs like K5 minus an edge (planar, but one door short).
    const evalSeeds = s => { const cells = voronoi(s, w, h), placed = links.map(([a, b, both]) => ({ a, b, both, wall: wall(cells, s, a, b) }));
      const ok = placed.filter(p => p.wall).length, mw = Math.min(Infinity, ...placed.filter(p => p.wall).map(p => p.wall.len));
      // A missing door scores how near it is to having an empty circle on its diameter (a Gabriel edge,
      // which always shares a wall): it gives the climb a slope where the door count alone is flat.
      let near = 0;
      for (const p of placed) if (!p.wall) {
        const A = s[p.a], B = s[p.b], m = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, r = Math.hypot(A.x - B.x, A.y - B.y) / 2;
        near += Math.min(0, ...s.map((C, k) => (k === p.a || k === p.b) ? 0 : Math.hypot(C.x - m.x, C.y - m.y) - r));
      }
      return { score: ok * 1e6 + near * 100 + (isFinite(mw) ? mw : 0), seeds: s, cells, placed, ok }; };
    starts.sort((a, b) => b.score - a.score);
    let best = starts[0];
    if (n > 2) {
      best = evalSeeds(best.seeds);
      for (let st = 0; st < Math.min(opt.starts || 6, starts.length) && best.ok < links.length; st++) {
        let cur = evalSeeds(starts[st].seeds); const R = rng(424242 + n + st * 31), N = opt.climb || 2000;
        for (let it = 0; it < N && cur.ok < links.length; it++) {
          const step = cell * 0.5 * (1 - it / N) + 2, k = Math.floor(R() * n), s = cur.seeds.map(p => ({ ...p }));
          s[k].x = Math.max(4, Math.min(w - 4, s[k].x + (R() - .5) * 2 * step)); s[k].y = Math.max(4, Math.min(h - 4, s[k].y + (R() - .5) * 2 * step));
          const c = evalSeeds(s); if (c.score >= cur.score) cur = c;
        }
        if (cur.score > best.score) best = cur;
      }
    }
    if (n > 2) { // then widen the narrowest door wall a little, never losing a door
      const R = rng(99 + n);
      for (let it = 0; it < (opt.polish || 400); it++) {
        const k = Math.floor(R() * n), s = best.seeds.map(p => ({ ...p }));
        s[k].x = Math.max(4, Math.min(w - 4, s[k].x + (R() - .5) * cell * 0.2)); s[k].y = Math.max(4, Math.min(h - 4, s[k].y + (R() - .5) * cell * 0.2));
        const c = evalSeeds(s); if (c.score > best.score) best = c;
      }
    }
    // Proof that no flat plan holds every door: Euler (E > 3V - 6), or E > 2V - 4 with no triangle (K3,3).
    const L = links.length, adj = members.map(() => new Set()); for (const [a, b] of links) { adj[a].add(b); adj[b].add(a); }
    const tri = links.some(([a, b]) => [...adj[a]].some(c => adj[b].has(c)));
    const nonPlanar = n >= 3 && (L > 3 * n - 6 || (!tri && L > 2 * n - 4));
    return { members, w, h, seeds: best.seeds, cells: best.cells, doors: best.placed, placedDoors: best.ok, totalDoors: L, nonPlanar };
  }

  // Pack buildings into rows of blocks; streets are the gaps between blocks.
  function town(rooms, edges, opt = {}) {
    const d = dedupe(rooms, edges), rs = d.rooms, ds = doors(rs, edges);
    const comps = components(rs.length, ds), street = opt.street || 34, maxW = opt.width || 900;
    const bs = comps.map(c => building(c, ds, opt));
    let x = street, y = street, rowH = 0;
    for (const b of bs) {
      if (x + b.w + street > maxW && x > street) { x = street; y += rowH + street; rowH = 0; }
      b.x = x; b.y = y; x += b.w + street; rowH = Math.max(rowH, b.h);
    }
    const W = Math.max(maxW, ...bs.map(b => b.x + b.w + street)), H = y + rowH + street;
    return { rooms: rs, merged: d.merged, doors: ds, buildings: bs, W, H, street,
      stats: { rooms: rs.length, buildings: bs.length, doors: ds.length, recordedBothWays: ds.filter(x => x[2]).length,
        placed: bs.reduce((s, b) => s + b.placedDoors, 0), provenNonPlanar: bs.filter(b => b.nonPlanar).length, largest: bs.length ? bs[0].members.length : 0 } };
  }

  const api = { dedupe, doors, components, voronoi, wall, building, town, clip };
  if (typeof module !== 'undefined') module.exports = api; else root.DelveTown = api;
})(this);
