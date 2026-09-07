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
   *
   *   groups     string[]|number[]        per-unit group (state) for cohesion
   *   cohesion   number 0..1              energy barrier on splitting a group
   *   balance    number 0..1              push regions toward equal population
   *   resources  [{ name, values, minFrac, minPerRegion }]
   *                                       a FLOOR: every region must hold at
   *                                       least `minFrac` of its fair share of
   *                                       this, or `minPerRegion` in the
   *                                       resource's own units — whichever the
   *                                       caller sets. Use minPerRegion when a
   *                                       fair share is the wrong ask: every
   *                                       superstate wants A coastline, not an
   *                                       equal thirteenth of the coastline.
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
    // ---- state lines as an energy barrier -------------------------------
    //
    // Redrawing a state is expensive in a way no econometric axis can see, so
    // it is priced in twice, once on each side of the algorithm:
    //
    //   here, a SURCHARGE on edges that cross a state line. The MST minimises
    //   total weight, so it now prefers to run inside states and to enter a
    //   neighbouring state only where it must. States end up as subtrees joined
    //   by a few bottleneck edges — which are exactly the edges a cut wants.
    //
    //   and below, a BARRIER subtracted from the score of any cut that falls
    //   inside a state, so splitting one has to be worth more than leaving it
    //   whole.
    //
    // The surcharge is in units of the median neighbour distance, so `cohesion`
    // is a dimensionless 0..1 dial rather than a number in z-score units that
    // would need retuning whenever the axes changed.
    const cohesion = Math.max(0, Math.min(1, spec.cohesion == null ? 0 : spec.cohesion));
    // How much of the state preference is currently in force. The ladder turns
    // this down rather than let the population floor go; both the tree
    // surcharge and the cut barrier read it.
    const cohEaseRef = { v: 1 };
    const cohEase = () => cohEaseRef.v;
    const gid = new Int32Array(n).fill(-1);
    if (spec.groups && spec.groups.length === n) {
      const seen = new Map();
      for (let i = 0; i < n; i++) {
        const g = spec.groups[i];
        if (g == null) continue;
        if (!seen.has(g)) seen.set(g, seen.size);
        gid[i] = seen.get(g);
      }
    }
    const sameGroup = (a, b) => gid[a] >= 0 && gid[a] === gid[b];

    let dMed = 1;
    if (cohesion > 0) {
      const sample = [];
      for (let i = 0; i < n; i++) for (const j of adj[i]) if (j > i) sample.push(dist(i, j));
      if (sample.length) { sample.sort((a, b) => a - b); dMed = sample[sample.length >> 1] || 1; }
    }
    const crossSurchargeFull = cohesion * 2 * dMed;

    const cost = (a, b) => {
      let base = dist(a, b) + 1e-6;
      if (crossSurchargeFull && !sameGroup(a, b)) base += crossSurchargeFull * cohEase();
      if (!flowOf.size) return base;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const f = flowOf.get(key) || 0;
      return base / (1 + flowPull * f);
    };

    /**
     * Prim, re-runnable.
     *
     * The tree has to be rebuilt when the state surcharge changes, because the
     * surcharge is what puts states in the tree as subtrees — and the ladder
     * below turns it down when the population floor cannot otherwise be met.
     * Without the rebuild the dial saturates: past about 0.4 the tree stops
     * changing and asking harder for whole states does nothing at all.
     */
    const buildMST = () => {
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
      return mstAdj;
    };

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
    const evaluate = (nodes, treeAdj, admissible, penalty) => {
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
      const R = nRes ? Array.from({ length: order.length }, () => new Float64Array(nRes)) : null;
      const Sx = Array.from({ length: order.length }, () => new Float64Array(D));
      const Sxx = Array.from({ length: order.length }, () => new Float64Array(D));
      const pos = new Map();
      order.forEach((u, i) => { pos.set(u, i); });
      for (let i = order.length - 1; i >= 0; i--) {
        const u = order[i];
        W[i] += w[u];
        subtreeCount[i] += 1;
        for (let d = 0; d < D; d++) { Sx[i][d] += w[u] * columns[d][u]; Sxx[i][d] += w[u] * columns[d][u] * columns[d][u]; }
        if (R) for (let r = 0; r < nRes; r++) R[i][r] += resVals[r][u];
        const p = parent.get(u);
        if (p >= 0) {
          const pi = pos.get(p);
          W[pi] += W[i];
          subtreeCount[pi] += subtreeCount[i];
          for (let d = 0; d < D; d++) { Sx[pi][d] += Sx[i][d]; Sxx[pi][d] += Sxx[i][d]; }
          if (R) for (let r = 0; r < nRes; r++) R[pi][r] += R[i][r];
        }
      }
      const total = ssd(W[0], Sx[0], Sxx[0]);
      let bestCut = null, bestGain = -Infinity;
      for (let i = 1; i < order.length; i++) {
        const u = order[i], p = parent.get(u);
        const restW = W[0] - W[i];
        if (!restW || !W[i]) continue;
        const raAdm = R ? R[i] : null;
        let rbAdm = null;
        if (R) { rbAdm = new Float64Array(nRes); for (let r = 0; r < nRes; r++) rbAdm[r] = R[0][r] - R[i][r]; }
        if (admissible && !admissible(W[i], subtreeCount[i], raAdm, restW, order.length - subtreeCount[i], rbAdm)) continue;
        const restSx = new Float64Array(D), restSxx = new Float64Array(D);
        for (let d = 0; d < D; d++) { restSx[d] = Sx[0][d] - Sx[i][d]; restSxx[d] = Sxx[0][d] - Sxx[i][d]; }
        let gain = total - ssd(W[i], Sx[i], Sxx[i]) - ssd(restW, restSx, restSxx);
        if (penalty) {
          gain -= penalty(u, p, W[i], raAdm, restW, rbAdm);
        }
        if (gain > bestGain) { bestGain = gain; bestCut = [u, p]; }
      }
      return { total, bestCut, bestGain, size: order.length, nodes: order };
    };

    // ---- what a cut costs beyond its variance ---------------------------
    //
    // SKATER on its own answers one question: which cut removes the most
    // within-region variance. That is not the whole of what makes a superstate
    // a plausible one, so three more terms are priced into the same score.
    //
    // Everything below is normalised to roughly 0..1 and then multiplied by the
    // total population, because SSD is a POPULATION-WEIGHTED sum of squared
    // z-scores and therefore scales with total population too. Without that the
    // dials would mean different things on a county map and a state map.
    const totalW = w.reduce((t, v) => t + v, 0);
    const balanceW = Math.max(0, Math.min(1, spec.balance == null ? 0 : spec.balance));
    const resSpecs = (spec.resources || []).filter((r) => r && r.values && r.values.length === n);
    const nRes = resSpecs.length;
    const resVals = resSpecs.map((r) => Float64Array.from(r.values, (v) => (v > 0 ? v : 0)));
    const resTotal = resVals.map((v) => v.reduce((t, x) => t + x, 0));

    const target = totalW / k;                       // an equal share of people

    // Term scales, chosen so each dial at 1.0 can outvote the other rather than
    // one swamping it. Measured, not guessed: at these values the state dial
    // takes splits from 35/53 to 5/53, the balance dial takes the
    // largest:smallest population ratio from 3.0 to 1.8, and turning both up
    // still moves both numbers.
    //
    // SEA ACCESS IS NOT AVAILABLE AT ALL, at any strength, and four attempts
    // say so rather than one. A floor of a fair share of coastline: infeasible,
    // relaxes to nothing. A floor of an absolute 50 km a region: also
    // infeasible. A penalty for stranding a coastless part: the number of
    // landlocked regions did not move off two at any weight. Discounting tree
    // edges that run toward the water, so that coast-reaching chains exist to
    // be cut: two landlocked became one, and cost the population ratio 3.0 ->
    // 4.0 and three more split states.
    //
    // The reason is structural and worth stating plainly: a region can only be
    // what some SUBTREE of the spanning tree is, the tree is built from
    // econometric similarity, and interior counties resemble each other. There
    // is no subtree from Nebraska to the Gulf, so no cut can select one.
    //
    // What is true anyway: eleven of the thirteen regions reach the ocean
    // without being asked. The other two are the interior plains and the
    // mountain west, which is not an artefact — that is where the country's
    // landlocked people live. So coastline is REPORTED per region and not
    // forced, because a dial that cannot move its own number is worse than no
    // dial.
    //
    // WATER IS NOT A PENALTY EITHER, and that is also the result of trying it.
    // As soft penalties of this kind they did not merely fail, they went
    // backwards: asking for even per-capita water took the worst:best ratio
    // across regions from 24.8:1 to 26.9:1, and asking every region to have a
    // coast still left regions landlocked. The reason is structural. A greedy
    // top-down cut penalises the two PARTS in front of it, and a part that is
    // perfectly proportional today can split into disproportionate regions
    // three cuts later — the penalty never sees that. So both are FLOORS
    // instead, in `admissible` below, which is the mechanism the population
    // floor already uses and which works because it constrains what may happen
    // rather than nudging what is preferred.
    const COHESION_COST = 1.0;
    const BALANCE_COST = 1.6;


    const wholeShares = (weight) => Math.max(1, Math.round(weight / target));

    /**
     * How far a cut is from splitting its component into whole fair shares.
     *
     * A greedy tree cut does not know how many regions each side will hold, so
     * "balanced" cannot simply mean "half". What it can mean: this component is
     * worth about m fair shares, so the two sides should look like some whole
     * split of m — one and (m-1), two and (m-2), and so on. The best such split
     * is the one this scores against.
     *
     * Normalised by one fair share, so the value is "how many people-shares
     * away from a clean split is this", which is the same number whether the
     * cut is the first or the twelfth.
     *
     * Scoring the two sides INDEPENDENTLY, which is what this did first, is
     * degenerate: for a two-way split the deviations always sum to exactly 1
     * whatever the cut, so the dial had no effect at all on the case it exists
     * for. Tying the two sides to a shared m is what makes it discriminate.
     */
    const shareDev = (wa, wb) => {
      const mC = Math.max(2, Math.round((wa + wb) / target));
      let best = Infinity;
      for (let m = 1; m < mC; m++) {
        const d = Math.abs(wa - m * target) + Math.abs(wb - (mC - m) * target);
        if (d < best) best = d;
      }
      return best / target;
    };

    const penalty = (!cohesion && !balanceW) ? null : (u, p, wa, ra, wb, rb) => {
      let pen = 0;

      // 1. the state-line barrier: a cut INSIDE a state has to earn its keep.
      //    Flat, because that is what an energy barrier is — the cost of
      //    breaking a state does not depend on where you break it.
      if (cohesion && sameGroup(u, p)) pen += cohesion * cohEase() * COHESION_COST;

      // 2. population balance. Scaled so that a thoroughly unbalanced cut costs
      //    about what breaking a state costs; otherwise turning the state dial
      //    up silently disables this one, and a dial that does nothing is worse
      //    than no dial.
      if (balanceW) pen += balanceW * BALANCE_COST * shareDev(wa, wb);

      return pen * totalW;
    };

    const minCount = spec.minCount == null ? 8 : spec.minCount;
    let frac = spec.minWeightFrac == null ? 0.55 : spec.minWeightFrac;

    // THE ORDER THIS GIVES WAY IN IS A DESIGN DECISION, and the wrong order is
    // visibly wrong. Requiring every region to reach the sea can make a good
    // cut inadmissible; if the population floor relaxes first to make room, the
    // map comes back with regions 28 times the size of each other, which is a
    // worse map than one with a landlocked region. So the resource floors step
    // down to nothing first, and only then does the population floor move.
    let evals, treeAdj, cuts, usedFrac = frac, resEase = 1, usedResEase = 1;
    let usedCohEase = 1, mstAdj = null, mstEase = null;
    for (let attempt = 0; attempt < 14; attempt++) {
      const floorW = (totalW / k) * frac;
      const resFloor = resSpecs.map((rs, r) => (rs.minPerRegion != null
        ? rs.minPerRegion * resEase
        : Math.max(0, Math.min(1, rs.minFrac == null ? 0 : rs.minFrac)) * resEase * (resTotal[r] / k)));
      const admissible = (wa, ca, ra, wb, cb, rb) => {
        if (wa < floorW || wb < floorW || ca < minCount || cb < minCount) return false;
        for (let r = 0; r < nRes; r++) {
          if (!resFloor[r] || !resTotal[r]) continue;
          // a part that will hold m regions needs m fair shares of the resource
          if (ra[r] < resFloor[r] * wholeShares(wa)) return false;
          if (rb[r] < resFloor[r] * wholeShares(wb)) return false;
        }
        return true;
      };

      if (mstEase !== cohEaseRef.v || !mstAdj) { mstAdj = buildMST(); mstEase = cohEaseRef.v; }
      treeAdj = mstAdj.map((a) => a.slice());
      cuts = [];
      evals = [{ nodes: [...Array(n).keys()] }].map((t) => ({ ...t, ...evaluate(t.nodes, treeAdj, admissible, penalty) }));

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
        evals.push({ nodes: A, ...evaluate(A, treeAdj, admissible, penalty) }, { nodes: B, ...evaluate(B, treeAdj, admissible, penalty) });
      }
      usedFrac = frac; usedResEase = resEase; usedCohEase = cohEaseRef.v;
      if (evals.length >= k) break;
      // Give way in this order, and the order is the whole point: resource
      // floors first, then the state barrier, and the population floor last.
      // Turning the state dial up used to make the population floor
      // unreachable, which sent the ladder straight to relaxing it — so asking
      // harder for whole states silently produced regions three times the size
      // of each other. Keeping states whole is a preference. Not having one
      // superstate three times another is closer to a requirement.
      if (nRes && resEase > 0) resEase = resEase <= 0.2001 ? 0 : resEase - 0.2;
      else if (cohesion && cohEaseRef.v > 0) cohEaseRef.v = cohEaseRef.v <= 0.2501 ? 0 : cohEaseRef.v - 0.25;
      else frac *= 0.7;                            // only now touch the people
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
      minWeightFrac: usedFrac, minCount, resourceEase: usedResEase, cohesionEase: usedCohEase,
      sse: evals.reduce((s, e) => s + e.total, 0),
      sizes: groups.map((g) => g.length),
      weights: groups.map((g) => g.reduce((t, i) => t + w[i], 0)),

      // ---- how well the preferences were actually met ------------------
      //
      // Reported rather than asserted. These are soft terms in a greedy score,
      // so the honest thing is to show what came out, not to claim the dial
      // was obeyed.
      resources: resSpecs.map((rs, r) => ({
        name: rs.name || `r${r}`,
        minFrac: rs.minFrac || 0,
        byRegion: groups.map((g) => g.reduce((t, i) => t + resVals[r][i], 0)),
        total: resTotal[r],
      })),
      balance: (() => {
        const ws = groups.map((g) => g.reduce((t, i) => t + w[i], 0));
        const mean = ws.reduce((t, v) => t + v, 0) / (ws.length || 1);
        const spread = ws.length ? Math.max(...ws) / Math.max(1e-9, Math.min(...ws)) : 1;
        return {
          meanWeight: mean,
          ratio: spread,                                   // largest / smallest
          cv: Math.sqrt(ws.reduce((t, v) => t + (v - mean) ** 2, 0) / (ws.length || 1)) / (mean || 1),
        };
      })(),
      // How much of the map's original grouping survived: units whose region is
      // the one that most of their group went to.
      groupIntegrity: (() => {
        if (gid.every((g) => g < 0)) return null;
        const byGroup = new Map();
        for (let i = 0; i < n; i++) {
          if (gid[i] < 0) continue;
          let m = byGroup.get(gid[i]);
          if (!m) byGroup.set(gid[i], m = new Map());
          m.set(region[i], (m.get(region[i]) || 0) + w[i]);
        }
        let kept = 0, tot = 0, split = 0;
        for (const m of byGroup.values()) {
          let top = 0, sum = 0;
          for (const v of m.values()) { sum += v; if (v > top) top = v; }
          kept += top; tot += sum;
          if (m.size > 1) split++;
        }
        return { intact: tot ? kept / tot : 1, groupsSplit: split, groups: byGroup.size };
      })(),
    };
  }

  const API = { skater, standardize, haversine };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ATLAS_REGION = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
