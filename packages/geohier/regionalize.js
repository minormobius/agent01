// regionalize.js — carve a contiguous map into k regions that are internally
// alike. No dependencies.
//
// WHAT THIS IS FOR: redrawing a country. Ordinary clustering (k-means, wards)
// will happily put a county in Maine and a county in Oregon in the same group
// because their transfer shares match. That is a classification, not a map. A
// region has to be one connected piece of ground, and the constraint changes
// the answer everywhere — it is what makes the result look like a country
// rather than a scatter plot.
//
// THE METHOD is SKATER (Assunção, Neves, Câmara & Freitas 2006), which is the
// standard answer to this problem and is about twenty lines once you see it:
//
//   1. Build the contiguity graph: counties are nodes, shared borders are edges.
//   2. Weight each edge by how UNLIKE its two counties are on the chosen axes.
//   3. Take the minimum spanning tree. The MST is the cheapest set of n-1
//      connections that keeps the whole country in one piece, so it already
//      knows where the country is glued weakly.
//   4. Cut the tree k-1 times, each time removing the single edge whose removal
//      buys the largest drop in within-region variance.
//
// Cutting a TREE is what makes step 4 tractable: any edge removal splits it
// into exactly two connected pieces, so every candidate cut is guaranteed to
// leave contiguous regions and the score is a subtree sum.
//
// THE SIZE-FLOOR PROBLEM, which plain SKATER gets wrong. Greedy
// variance-reduction has a strong preference for shaving off a single extreme
// unit: cutting Harris County, Texas loose removes more within-region variance
// than any balanced cut, so an unconstrained run returns one region of 2,600
// counties and twelve regions that are one county each. That is technically the
// optimum of the stated objective and useless as a map. The standard remedy —
// and the one used here — is a floor: a cut is only a candidate if BOTH sides
// keep at least `minWeightFrac` of an equal share of the population and at
// least `minCount` units. Because cuts only ever shrink a region, checking the
// floor at cut time is enough. If k regions cannot be reached at the requested
// floor the floor is relaxed and the run repeats, and the floor that actually
// applied comes back in the result.
//
// THE ISLANDS PROBLEM, and how it is handled honestly: contiguity has no
// opinion about Hawaii. The county graph is not connected — Alaska, Hawaii,
// Puerto Rico, Nantucket, the San Juans and about twenty other places are their
// own components — and a spanning tree needs a connected graph. So before the
// MST, each stranded component is joined to the nearest county on the mainland
// by great-circle distance between centroids. Those are recorded in
// `seaLinks` and every caller should say they exist: they are the cartographer
// putting a bridge where there is water.

/* global globalThis */
(function (root) {
  'use strict';

  const R_EARTH = 6371;

  function haversine(a, b) {
    const t = Math.PI / 180;
    const dLat = (b[1] - a[1]) * t, dLon = (b[0] - a[0]) * t;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(dLon / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /**
   * Standardise columns to z-scores, so an axis measured in dollars does not
   * outvote one measured as a share purely because dollars are bigger numbers.
   * Robust centring (median / IQR-derived sigma) because county distributions
   * have long right tails and a handful of oil counties would otherwise define
   * the axis by themselves.
   */
  function standardize(columns, { robust = true } = {}) {
    return columns.map((col) => {
      const ok = col.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
      if (!ok.length) return col.map(() => 0);
      let c, s;
      if (robust) {
        const q = (p) => { const h = (ok.length - 1) * p, l = Math.floor(h); return ok[l] + (h - l) * (ok[Math.min(l + 1, ok.length - 1)] - ok[l]); };
        c = q(0.5);
        s = (q(0.75) - q(0.25)) / 1.349 || (ok[ok.length - 1] - ok[0]) / 4 || 1;
      } else {
        c = ok.reduce((t, v) => t + v, 0) / ok.length;
        s = Math.sqrt(ok.reduce((t, v) => t + (v - c) ** 2, 0) / ok.length) || 1;
      }
      // Clip at ±4 sigma. An outlier should pull a region, not become one.
      return col.map((v) => (v == null || !Number.isFinite(v) ? 0 : Math.max(-4, Math.min(4, (v - c) / s))));
    });
  }

  /**
   * @param {object} spec
   *   ids        string[]                 the units, in order
   *   adjacency  { id: id[] }             who touches whom
   *   centroids  { id: [lon, lat] }       for the sea links only
   *   columns    number[][]               one array per axis, already standardised
   *   weights    number[]                 per-unit importance (population)
   *   axisWeights number[]                per-axis importance (default 1)
   *   flows      [from, to, people][]     optional; pulls trading pairs together
   *   flowPull   number                   0 = ignore flows, 1 = strong (default 0.5)
   *   k          number                   how many regions
   * @returns {{ region: Int32Array, seaLinks, mst, cuts, sse }}
   */
  function skater(spec) {
    const { ids, adjacency, centroids, columns, k } = spec;
    const n = ids.length;
    const D = columns.length;
    const at = Object.create(null);
    ids.forEach((id, i) => { at[id] = i; });
    const w = spec.weights && spec.weights.length === n
      ? spec.weights.map((v) => (v != null && v > 0 ? v : 1))
      : new Array(n).fill(1);
    const aw = spec.axisWeights && spec.axisWeights.length === D ? spec.axisWeights : new Array(D).fill(1);

    // ---- 1. contiguity graph -------------------------------------------
    const adj = Array.from({ length: n }, () => []);
    for (const id of ids) {
      const i = at[id];
      for (const j of (adjacency[id] || [])) {
        const b = at[j];
        if (b !== undefined && b !== i) adj[i].push(b);
      }
    }

    // ---- 2. connect the islands ----------------------------------------
    const comp = new Int32Array(n).fill(-1);
    let nComp = 0;
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      const stack = [s]; comp[s] = nComp;
      while (stack.length) {
        const u = stack.pop();
        for (const v of adj[u]) if (comp[v] < 0) { comp[v] = nComp; stack.push(v); }
      }
      nComp++;
    }
    const seaLinks = [];
    if (nComp > 1) {
      // Biggest component is the mainland; every other component gets ONE
      // bridge, from its closest member to the closest member of any component
      // already connected. Cheap O(n * m) because the stranded components are
      // tiny, and the result is deterministic.
      const sizes = new Array(nComp).fill(0);
      for (let i = 0; i < n; i++) sizes[comp[i]]++;
      const order = [...Array(nComp).keys()].sort((a, b) => sizes[b] - sizes[a]);
      const joined = new Set([order[0]]);
      const inJoined = [];
      for (let i = 0; i < n; i++) if (comp[i] === order[0]) inJoined.push(i);
      for (const c of order.slice(1)) {
        const members = [];
        for (let i = 0; i < n; i++) if (comp[i] === c) members.push(i);
        let best = null, bestD = Infinity;
        for (const i of members) {
          const pi = centroids[ids[i]];
          if (!pi) continue;
          for (const j of inJoined) {
            const pj = centroids[ids[j]];
            if (!pj) continue;
            const d = haversine(pi, pj);
            if (d < bestD) { bestD = d; best = [i, j]; }
          }
        }
        if (best) {
          adj[best[0]].push(best[1]); adj[best[1]].push(best[0]);
          seaLinks.push({ from: ids[best[0]], to: ids[best[1]], km: Math.round(bestD) });
          for (const i of members) inJoined.push(i);
          joined.add(c);
        }
      }
    }

    // ---- 3. minimum spanning tree (Prim, dense-enough for a planar graph) --
    const dist = (a, b) => {
      let s = 0;
      for (let d = 0; d < D; d++) { const dv = (columns[d][a] - columns[d][b]) * aw[d]; s += dv * dv; }
      return Math.sqrt(s);
    };
    // Flow affinity: two counties that trade households are alike in a way the
    // econometric axes do not see. Dividing the edge cost by the log of the
    // flow makes the MST prefer to keep them together without letting a single
    // huge metro flow collapse the whole tree onto one node.
    const flowPull = spec.flowPull == null ? 0.5 : spec.flowPull;
    const flowOf = new Map();
    if (spec.flows && flowPull > 0) {
      let maxF = 1;
      for (const [f, t, p] of spec.flows) {
        if (at[f] === undefined || at[t] === undefined) continue;
        const key = at[f] < at[t] ? `${at[f]},${at[t]}` : `${at[t]},${at[f]}`;
        const v = (flowOf.get(key) || 0) + p;
        flowOf.set(key, v);
        if (v > maxF) maxF = v;
      }
      for (const [key, v] of flowOf) flowOf.set(key, Math.log1p(v) / Math.log1p(maxF));
    }
    const cost = (a, b) => {
      const base = dist(a, b) + 1e-6;
      if (!flowOf.size) return base;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const f = flowOf.get(key) || 0;
      return base / (1 + flowPull * f);
    };

    const inTree = new Uint8Array(n);
    const best = new Float64Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    best[0] = 0;
    const mstAdj = Array.from({ length: n }, () => []);
    for (let it = 0; it < n; it++) {
      let u = -1, bu = Infinity;
      for (let i = 0; i < n; i++) if (!inTree[i] && best[i] < bu) { bu = best[i]; u = i; }
      if (u < 0) break;
      inTree[u] = 1;
      if (from[u] >= 0) { mstAdj[u].push(from[u]); mstAdj[from[u]].push(u); }
      for (const v of adj[u]) {
        if (inTree[v]) continue;
        const c = cost(u, v);
        if (c < best[v]) { best[v] = c; from[v] = u; }
      }
    }

    // ---- 4. cut the tree, greedily, k-1 times ---------------------------
    //
    // Score of a set S: the population-weighted sum of squared deviations,
    //   SSD(S) = sum_d [ sum_i w_i x_id^2  -  (sum_i w_i x_id)^2 / sum_i w_i ]
    // which needs only three running sums per dimension, so a candidate cut is
    // O(D) once the subtree sums exist.
    const ssd = (W, Sx, Sxx) => {
      if (!W) return 0;
      let s = 0;
      for (let d = 0; d < D; d++) s += (Sxx[d] - (Sx[d] * Sx[d]) / W) * aw[d];
      return s;
    };

    /** Subtree sums for one tree, rooted anywhere; returns the best ADMISSIBLE cut. */
    const evaluate = (nodes, treeAdj, admissible) => {
      const rootIdx = nodes[0];
      const order = [], parent = new Map();
      const stack = [rootIdx];
      const seen = new Set([rootIdx]);
      parent.set(rootIdx, -1);
      while (stack.length) {
        const u = stack.pop();
        order.push(u);
        for (const v of treeAdj[u]) if (!seen.has(v)) { seen.add(v); parent.set(v, u); stack.push(v); }
      }
      const W = new Float64Array(order.length);
      const subtreeCount = new Int32Array(order.length);
      const Sx = Array.from({ length: order.length }, () => new Float64Array(D));
      const Sxx = Array.from({ length: order.length }, () => new Float64Array(D));
      const pos = new Map();
      order.forEach((u, i) => { pos.set(u, i); });
      for (let i = order.length - 1; i >= 0; i--) {
        const u = order[i];
        W[i] += w[u];
        subtreeCount[i] += 1;
        for (let d = 0; d < D; d++) { Sx[i][d] += w[u] * columns[d][u]; Sxx[i][d] += w[u] * columns[d][u] * columns[d][u]; }
        const p = parent.get(u);
        if (p >= 0) {
          const pi = pos.get(p);
          W[pi] += W[i];
          subtreeCount[pi] += subtreeCount[i];
          for (let d = 0; d < D; d++) { Sx[pi][d] += Sx[i][d]; Sxx[pi][d] += Sxx[i][d]; }
        }
      }
      const total = ssd(W[0], Sx[0], Sxx[0]);
      let bestCut = null, bestGain = -Infinity;
      for (let i = 1; i < order.length; i++) {
        const u = order[i], p = parent.get(u);
        const restW = W[0] - W[i];
        if (!restW || !W[i]) continue;
        if (admissible && !admissible(W[i], subtreeCount[i], restW, order.length - subtreeCount[i])) continue;
        const restSx = new Float64Array(D), restSxx = new Float64Array(D);
        for (let d = 0; d < D; d++) { restSx[d] = Sx[0][d] - Sx[i][d]; restSxx[d] = Sxx[0][d] - Sxx[i][d]; }
        const gain = total - ssd(W[i], Sx[i], Sxx[i]) - ssd(restW, restSx, restSxx);
        if (gain > bestGain) { bestGain = gain; bestCut = [u, p]; }
      }
      return { total, bestCut, bestGain, size: order.length, nodes: order };
    };

    // ---- the floor, and the relaxation ladder ---------------------------
    const totalW = w.reduce((t, v) => t + v, 0);
    const minCount = spec.minCount == null ? 8 : spec.minCount;
    let frac = spec.minWeightFrac == null ? 0.55 : spec.minWeightFrac;

    let evals, treeAdj, cuts, usedFrac = frac;
    for (let attempt = 0; attempt < 8; attempt++) {
      const floorW = (totalW / k) * frac;
      const admissible = (wa, ca, wb, cb) => wa >= floorW && wb >= floorW && ca >= minCount && cb >= minCount;

      treeAdj = mstAdj.map((a) => a.slice());
      cuts = [];
      evals = [{ nodes: [...Array(n).keys()] }].map((t) => ({ ...t, ...evaluate(t.nodes, treeAdj, admissible) }));

      while (evals.length < k) {
        let pick = -1, pickGain = -Infinity;
        for (let i = 0; i < evals.length; i++) {
          if (!evals[i].bestCut) continue;
          if (evals[i].bestGain > pickGain) { pickGain = evals[i].bestGain; pick = i; }
        }
        if (pick < 0) break;                       // no admissible cut anywhere
        const [u, p] = evals[pick].bestCut;
        treeAdj[u] = treeAdj[u].filter((x) => x !== p);
        treeAdj[p] = treeAdj[p].filter((x) => x !== u);
        cuts.push({ a: ids[u], b: ids[p], gain: pickGain });

        const half = (start) => {
          const out = [], st = [start], seen = new Set([start]);
          while (st.length) { const x = st.pop(); out.push(x); for (const y of treeAdj[x]) if (!seen.has(y)) { seen.add(y); st.push(y); } }
          return out;
        };
        const A = half(u), B = half(p);
        evals.splice(pick, 1);
        evals.push({ nodes: A, ...evaluate(A, treeAdj, admissible) }, { nodes: B, ...evaluate(B, treeAdj, admissible) });
      }
      usedFrac = frac;
      if (evals.length >= k) break;
      frac *= 0.7;                                 // relax and try again
    }

    const region = new Int32Array(n).fill(0);

    // Label regions largest-first, so region 0 is the biggest — a stable
    // ordering matters when the colours and the legend have to agree.
    const groups = evals.map((e) => e.nodes).sort((a, b) => {
      const wa = a.reduce((s, i) => s + w[i], 0), wb = b.reduce((s, i) => s + w[i], 0);
      return wb - wa;
    });
    groups.forEach((g, gi) => { for (const i of g) region[i] = gi; });

    return {
      region, ids, k: groups.length, seaLinks, cuts,
      minWeightFrac: usedFrac, minCount,
      sse: evals.reduce((s, e) => s + e.total, 0),
      sizes: groups.map((g) => g.length),
      weights: groups.map((g) => g.reduce((t, i) => t + w[i], 0)),
    };
  }

  const API = { skater, standardize, haversine };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ATLAS_REGION = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
