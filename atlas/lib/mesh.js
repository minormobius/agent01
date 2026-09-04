// mesh.js — turn an atlas topology into GPU-ready triangles.
//
// The topology stores a unit as a flat list of rings, because that is all the
// Canvas2D path needed: fill with the nonzero rule and holes take care of
// themselves. A triangulator has to be told which ring is an island and which
// is a lake, and that grouping is not in the file — so it is reconstructed
// here, from containment rather than from winding. Winding cannot be trusted:
// county shapefiles come from half a dozen agencies and ESRI winds outer rings
// the opposite way to GeoJSON.
//
//   1. Find a strictly interior point of every ring — the centroid of the first
//      triangle of the ring triangulated alone, which is inside by
//      construction. A ring VERTEX will not do: Broomfield County, Colorado has
//      a ring whose first vertex lies exactly on the boundary of the ring that
//      contains it, and a ray-cast from a boundary point is a coin toss. That
//      single ambiguity mis-signed 0.2 square units and put the county 7.6% out.
//   2. Nesting depth = how many other rings contain that point. Even depth is
//      land, odd depth is water, so an island in a lake in an island comes out
//      right, and winding never enters into it.
//   3. Each hole is assigned to the smallest ring that contains it, and each
//      outer ring plus its holes goes to the triangulator as one polygon.
//
// VERTICES ARE NOT SHARED BETWEEN UNITS, deliberately. Two counties either side
// of a border reference the same arc points, but each mesh vertex carries the
// index of the unit it belongs to so the shader can look up that unit's colour.
// Sharing the vertex would mean sharing the colour. The duplication costs about
// two megabytes on a county map and buys a one-call draw.
//
// Positions are NOT stored here — only `srcIdx`, the index of each mesh vertex
// in the layer's projected point array. Panning and zooming never touch it, and
// a resize or refit rebuilds positions with a gather loop instead of a
// re-triangulation, because those only change the projection by an affine
// factor and an affine map cannot invalidate a triangulation.

/* global globalThis, require, module */
(function (root) {
  'use strict';

  const TRI = root.ATLAS_TRI || (typeof require !== 'undefined' ? require('./triangulate.js') : null);

  /** Ray-casting point-in-ring, on the flat [x,y,...] coordinates of a ring. */
  function pointInRing(xs, ring, x, y) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = xs[ring[i] * 2], yi = xs[ring[i] * 2 + 1];
      const xj = xs[ring[j] * 2], yj = xs[ring[j] * 2 + 1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function ringArea(px, ring) {
    let s = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      s += (px[ring[j] * 2] - px[ring[i] * 2]) * (px[ring[i] * 2 + 1] + px[ring[j] * 2 + 1]);
    }
    return s / 2;
  }

  function ringBBox(px, ring) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of ring) {
      const x = px[p * 2], y = px[p * 2 + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  }

  /**
   * A point strictly inside a ring.
   *
   * Triangulate the ring on its own and take the centroid of any resulting
   * triangle: the triangles tile the interior, so their centroids are interior
   * by construction. Anything cheaper — a vertex, the bounding-box centre, the
   * centroid of the whole ring — can land on the boundary or outside it, and
   * the containment test that follows has no way to recover from that.
   */
  function interiorPoint(px, ring) {
    const coords = new Float64Array(ring.length * 2);
    for (let i = 0; i < ring.length; i++) {
      coords[i * 2] = px[ring[i] * 2];
      coords[i * 2 + 1] = px[ring[i] * 2 + 1];
    }
    const t = TRI.earcut(coords, null, 2);
    if (!t.length) return [coords[0], coords[1]];
    const a = t[0] * 2, b = t[1] * 2, c = t[2] * 2;
    return [(coords[a] + coords[b] + coords[c]) / 3,
            (coords[a + 1] + coords[b + 1] + coords[c + 1]) / 3];
  }

  /**
   * Group a unit's rings into polygons: for each outer ring, the holes it owns.
   * Returns [{ outer, holes: [] }, ...].
   */
  function groupRings(px, rings) {
    if (rings.length === 1) return [{ outer: 0, holes: [] }];

    const bb = rings.map((r) => ringBBox(px, r));
    const pt = rings.map((r) => interiorPoint(px, r));
    const depth = new Int32Array(rings.length);
    const inside = rings.map(() => []);

    for (let i = 0; i < rings.length; i++) {
      const [x, y] = pt[i];
      for (let j = 0; j < rings.length; j++) {
        if (i === j) continue;
        const b = bb[j];
        if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;   // bbox reject
        if (pointInRing(px, rings[j], x, y)) { depth[i]++; inside[i].push(j); }
      }
    }

    const areaOf = rings.map((r) => Math.abs(ringArea(px, r)));
    const out = [];
    const slot = new Map();
    for (let i = 0; i < rings.length; i++) {
      if (depth[i] % 2 === 0) { slot.set(i, out.length); out.push({ outer: i, holes: [] }); }
    }
    for (let i = 0; i < rings.length; i++) {
      if (depth[i] % 2 === 0) continue;
      // its parent is the smallest ring containing it that is one level out
      let best = -1;
      for (const j of inside[i]) {
        if (depth[j] !== depth[i] - 1) continue;
        if (best < 0 || areaOf[j] < areaOf[best]) best = j;
      }
      if (best >= 0 && slot.has(best)) out[slot.get(best)].holes.push(i);
    }
    return out;
  }

  /**
   * @param {object} topo   decoded topology (refs, ringStart, polyStart, ids)
   * @param {Float32Array} px   projected coordinates, x,y interleaved
   * @param {Int32Array} arcOff  first point index of each arc within px
   * @returns {object} mesh
   */
  function buildMesh(topo, px, arcOff) {
    const N = topo.ids.length;
    const srcIdx = [];
    const unitIdx = [];
    const tris = [];
    const triStart = new Uint32Array(N + 1);
    const vertStart = new Uint32Array(N + 1);

    for (let u = 0; u < N; u++) {
      triStart[u] = tris.length;
      vertStart[u] = srcIdx.length;

      // ---- assemble this unit's rings as lists of px point indices ----
      const rings = [];
      for (let r = topo.polyStart[u]; r < topo.polyStart[u + 1]; r++) {
        const ring = [];
        let first = true;
        for (let k = topo.ringStart[r]; k < topo.ringStart[r + 1]; k++) {
          const ref = topo.refs[k], rev = ref < 0, a = rev ? ~ref : ref;
          const s = arcOff[a], e = arcOff[a + 1];
          // consecutive arcs share their junction point: every arc after the
          // first contributes from its second point on, exactly as the Canvas2D
          // path builder does, so the two can never disagree about a boundary
          for (let n = first ? 0 : 1; n < e - s; n++) ring.push(rev ? e - 1 - n : s + n);
          first = false;
        }
        // the ring closes back on its first point; the triangulator wants it open
        while (ring.length > 1 &&
               px[ring[0] * 2] === px[ring[ring.length - 1] * 2] &&
               px[ring[0] * 2 + 1] === px[ring[ring.length - 1] * 2 + 1]) ring.pop();
        if (ring.length >= 3) rings.push(ring);
      }
      if (!rings.length) continue;

      const groups = groupRings(px, rings);

      // ---- triangulate each outer ring with its holes ----
      for (const g of groups) {
        const group = [g.outer].concat(g.holes);
        const coords = [];
        const localSrc = [];
        const holeIndices = [];
        for (let i = 0; i < group.length; i++) {
          if (i > 0) holeIndices.push(localSrc.length);
          for (const p of rings[group[i]]) {
            coords.push(px[p * 2], px[p * 2 + 1]);
            localSrc.push(p);
          }
        }
        const t = TRI.earcut(coords, holeIndices.length ? holeIndices : null, 2);
        if (!t.length) continue;
        const base = srcIdx.length;
        for (const p of localSrc) { srcIdx.push(p); unitIdx.push(u); }
        for (let i = 0; i < t.length; i++) tris.push(base + t[i]);
      }
    }
    triStart[N] = tris.length;
    vertStart[N] = srcIdx.length;

    return {
      srcIdx: Uint32Array.from(srcIdx),
      unitIdx: (N < 65536 ? Uint16Array : Uint32Array).from(unitIdx),
      tris: Uint32Array.from(tris),
      triStart,
      vertStart,
      units: N,
      vertices: srcIdx.length,
      triangles: tris.length / 3,
    };
  }

  /** Gather projected positions for the mesh. Called whenever `px` changes. */
  function meshPositions(mesh, px, out) {
    const n = mesh.srcIdx.length;
    const pos = out && out.length === n * 2 ? out : new Float32Array(n * 2);
    const src = mesh.srcIdx;
    for (let i = 0; i < n; i++) {
      const s = src[i] * 2;
      pos[i * 2] = px[s];
      pos[i * 2 + 1] = px[s + 1];
    }
    return pos;
  }

  const API = { buildMesh, meshPositions, ringArea, pointInRing, groupRings, interiorPoint };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ATLAS_MESH = API;
}(typeof globalThis !== 'undefined' ? globalThis : this));
