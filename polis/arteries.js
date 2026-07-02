// arteries.js — inter-town arteries as the superlevel set of a Physarum flux field,
// grown on the Voronoi mesh graph. Port of hoop/paint/flux.js's idea, compacted:
// trips between towns (a gravity model) are routed on the cell graph by least cost
// (cost = length / conductance); flux accumulates; conductance ADAPTS to flux (grow
// where used, decay where idle). Iterate and the roads people actually need light up
// as thick edges threading between the cells — dispersed paths at first, then a few
// arterials as the big towns become centres of gravity.
//
// Steppable so the viewer can animate the network forming. Pure; deterministic.

export function makeArteries(mesh, { mu = 1.1, grow = 1.0, decay = 0.32, baseline = 1, condMax = 40 } = {}) {
  const cells = mesh.cells, N = cells.length;
  // canonical edge list from the (symmetric) adjacency, land-only (no routing through sea)
  const ea = [], eb = [], len = [], adj = Array.from({ length: N }, () => []);
  const seen = new Set();
  for (const c of cells) for (const n of c.neigh) {
    const a = Math.min(c.id, n), b = Math.max(c.id, n), key = a * N + b;
    if (seen.has(key)) continue; seen.add(key);
    if (cells[a].elev < mesh.baseSea || cells[b].elev < mesh.baseSea) continue;  // arteries stay on land
    const ei = ea.length; ea.push(a); eb.push(b);
    len.push(Math.max(0.05, Math.hypot(cells[a].wx - cells[b].wx, cells[a].wy - cells[b].wy)));
    adj[a].push([b, ei]); adj[b].push([a, ei]);
  }
  const E = ea.length;
  const cond = new Float64Array(E).fill(baseline);
  const flux = new Float64Array(E);
  const dist = new Float64Array(N), prevE = new Int32Array(N), done = new Uint8Array(N);

  // binary heap of [key,node]
  const hk = new Float64Array(N + 4), hv = new Int32Array(N + 4); let hn = 0;
  const push = (k, v) => { let i = hn++; hk[i] = k; hv[i] = v; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]];[hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
  const pop = () => { const v = hv[0]; hn--; if (hn) { hk[0] = hk[hn]; hv[0] = hv[hn]; let i = 0; for (; ;) { const L = 2 * i + 1, R = L + 1; let m = i; if (L < hn && hk[L] < hk[m]) m = L; if (R < hn && hk[R] < hk[m]) m = R; if (m === i) break;[hk[m], hk[i]] = [hk[i], hk[m]];[hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return v; };

  function dijkstra(src, cost) {
    hn = 0; done.fill(0); for (let i = 0; i < N; i++) dist[i] = Infinity;
    dist[src] = 0; prevE[src] = -1; push(0, src);
    while (hn) { const u = pop(); if (done[u]) continue; done[u] = 1; for (const [v, ei] of adj[u]) { const nd = dist[u] + cost[ei]; if (nd < dist[v]) { dist[v] = nd; prevE[v] = ei; push(nd, v); } } }
  }

  let iter = 0;
  return {
    E, ea, eb, len, get cond() { return cond; }, get flux() { return flux; }, get iter() { return iter; },
    // towns: [{cell, pop}]. one reinforcement round.
    step(towns) {
      const cost = new Float64Array(E); for (let i = 0; i < E; i++) cost[i] = len[i] / cond[i];
      flux.fill(0);
      const T = towns.filter((t) => t.pop > 0 && cells[t.cell].elev >= mesh.baseSea);
      for (let a = 0; a < T.length; a++) {
        dijkstra(T[a].cell, cost);
        for (let b = 0; b < T.length; b++) {
          if (b === a) continue;
          const d = Math.hypot(cells[T[a].cell].wx - cells[T[b].cell].wx, cells[T[a].cell].wy - cells[T[b].cell].wy);
          const w = (T[a].pop * T[b].pop) / (1e6 * (1 + d * d));      // gravity demand (scaled)
          let u = T[b].cell; let guard = 0;
          while (u !== T[a].cell && guard++ < N) { const ei = prevE[u]; if (ei < 0) break; flux[ei] += w; u = (ea[ei] === u) ? eb[ei] : ea[ei]; }
        }
      }
      let maxF = 0; for (let i = 0; i < E; i++) if (flux[i] > maxF) maxF = flux[i];
      for (let i = 0; i < E; i++) {
        const fN = maxF > 0 ? flux[i] / maxF : 0, tgt = Math.pow(fN, mu);
        cond[i] = Math.min(condMax, baseline + (cond[i] - baseline) * (1 - decay) + grow * 6 * tgt);
      }
      iter++;
      return { iter, maxFlux: maxF };
    },
    // 3-tier classification of the current network by conductance quantile (for drawing)
    tiers() {
      const cs = [...cond].filter((c) => c > baseline + 0.05).sort((a, b) => a - b);
      const q = (f) => cs.length ? cs[Math.floor(cs.length * f)] : Infinity;
      const hi = q(0.9), mid = q(0.65), lo = baseline + 0.05;
      const tier = new Int8Array(E);
      for (let i = 0; i < E; i++) tier[i] = cond[i] >= hi ? 3 : cond[i] >= mid ? 2 : cond[i] > lo ? 1 : 0;
      return tier;
    },
  };
}
