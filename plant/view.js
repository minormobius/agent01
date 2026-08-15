// view.js — the summon inspector's renderer.
//
// Draws a constellation the way the ENGINE sees it, not the way a modelling
// tool would. That distinction is the whole point of this page:
//
//   · the SEEDS are what actually exist in the foam — points, nothing more
//   · the WIREFRAME is the dual polyhedron they imply, drawn by connecting
//     each neighbour to its nearest neighbours
//   · the SPHERE is where the seeds would sit under an isotropic metric
//
// So the gap between the wireframe and the sphere IS the anisotropy, made
// visible. That is the thing there is currently an open question about
// (loop.mino.mobi, "Is the anisotropic squash something a player should FEEL"),
// and it cannot be answered by reading the algebra — only by looking at it and
// deciding whether it reads as the world having a grain or as the shapes being
// broken.
//
// No dependencies, no build step, no WebGL. An orthographic projection with a
// painter's-algorithm depth sort is enough for five convex solids, and it keeps
// this file readable by the next agent that has to change it.

import { SOLIDS, constellation, verify } from './solids.mjs';

const V = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  norm: (a) => { const l = V.len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

/** Orbit: yaw about Y, then pitch about X. Returns camera-space coords. */
function camera(p, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return [x1, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp];
}

/**
 * The dual polyhedron's edges, found geometrically rather than tabulated.
 *
 * The neighbour directions ARE the dual's vertices, and on a regular solid
 * every edge has the same length — so the edges are exactly the pairs at the
 * minimum separation. Computed on the UNIT directions, never on the placed
 * seeds: under an anisotropic metric the placed seeds are not equidistant, and
 * taking "nearest pairs" there would connect a different, wrong graph and hide
 * the very squash this page exists to show.
 */
export function dualEdges(solid) {
  const dirs = SOLIDS[solid].normals.map(V.norm);
  let min = Infinity;
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) {
      const d = V.len(V.sub(dirs[i], dirs[j]));
      if (d < min) min = d;
    }
  }
  const edges = [];
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) {
      if (V.len(V.sub(dirs[i], dirs[j])) < min * 1.02) edges.push([i, j]);
    }
  }
  return edges;
}

/**
 * The naive placement — unit direction times a common radius — kept so the page
 * can show the 22° trap rather than assert it. This is the bug solids.mjs was
 * written to fix, and a reader who can flip between them understands in one
 * second what the header comment takes twenty lines to explain.
 */
export function naiveNeighbours(solid, { r, rotate }) {
  const c = Math.cos(rotate), s = Math.sin(rotate);
  return SOLIDS[solid].normals.map((d) => {
    const u = V.norm(d);
    const y = [u[0] * c + u[2] * s, u[1], -u[0] * s + u[2] * c];
    return [y[0] * 2 * r, y[1] * 2 * r, y[2] * 2 * r];
  });
}

export function render(svg, opts) {
  const { solid, r, aniso, rotate, yaw, pitch, naive, showSphere } = opts;
  const con = constellation(solid, { r, aniso, rotate });
  const pts = naive ? naiveNeighbours(solid, { r, rotate }) : con.neighbours;
  const edges = dualEdges(solid);

  const W = svg.clientWidth || 640, H = svg.clientHeight || 520;
  // Scale to the widest extent so a squashed solid and a round one are framed
  // the same — the comparison is the point, and auto-fitting each separately
  // would silently normalise away the difference the page exists to show.
  let ext = 0;
  for (const p of pts) ext = Math.max(ext, V.len(p));
  const scale = (Math.min(W, H) * 0.36) / (ext || 1);
  const proj = (p) => {
    const c = camera(p, yaw, pitch);
    return [W / 2 + c[0] * scale, H / 2 - c[1] * scale, c[2]];
  };

  const P = pts.map(proj);
  const O = proj([0, 0, 0]);
  const parts = [];

  // The isotropic reference sphere, drawn first so everything sits on top of
  // it. This is the "what it would look like with no grain" ghost.
  if (showSphere) {
    parts.push(`<circle cx="${O[0].toFixed(1)}" cy="${O[1].toFixed(1)}" r="${(2 * r * scale).toFixed(1)}"
      fill="none" stroke="var(--ghost)" stroke-width="1" stroke-dasharray="3 4"/>`);
  }

  // Painter's algorithm: draw far things first. Convex solids only, which all
  // five of these are, so a per-edge depth sort is exact enough to read.
  const drawn = edges
    .map(([i, j]) => ({ i, j, z: (P[i][2] + P[j][2]) / 2 }))
    .sort((a, b) => a.z - b.z);
  for (const e of drawn) {
    const back = e.z < 0;
    parts.push(`<line x1="${P[e.i][0].toFixed(1)}" y1="${P[e.i][1].toFixed(1)}"
      x2="${P[e.j][0].toFixed(1)}" y2="${P[e.j][1].toFixed(1)}"
      stroke="var(${back ? '--edge-back' : '--edge'})" stroke-width="${back ? 1 : 1.8}"/>`);
  }

  // Spokes from the centre seed. These are the neighbour vectors themselves —
  // the actual content of a constellation — so they are drawn faintly but
  // always, to keep "a cell is a set of points" in front of the reader.
  for (const p of P) {
    parts.push(`<line x1="${O[0].toFixed(1)}" y1="${O[1].toFixed(1)}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}"
      stroke="var(--spoke)" stroke-width="0.75"/>`);
  }

  const order = P.map((p, i) => ({ p, i })).sort((a, b) => a.p[2] - b.p[2]);
  for (const { p } of order) {
    const near = p[2] >= 0;
    parts.push(`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${near ? 4.5 : 3}"
      fill="var(${near ? '--seed' : '--seed-back'})"/>`);
  }
  parts.push(`<circle cx="${O[0].toFixed(1)}" cy="${O[1].toFixed(1)}" r="5.5" fill="var(--centre)"/>`);

  svg.innerHTML = parts.join('\n');

  // The verdict, from the same function CI runs. A page that showed a picture
  // and asserted "exact" separately could drift from the test; this cannot.
  const v = verify(con);
  return {
    faces: con.neighbours.length,
    ok: v.ok,
    errDeg: v.maxNormalErrorDeg,
    inradius: v.inradius,
    naiveErrDeg: naive ? worstNaiveError(solid, { r, aniso, rotate }) : null,
  };
}

/**
 * How wrong the naive placement is, in degrees, measured rather than quoted.
 * The header comment says 22° at aniso 2.2; this recomputes it live so the
 * number on the page is never a stale claim about the code.
 */
function worstNaiveError(solid, { r, aniso, rotate }) {
  const c = Math.cos(rotate), s = Math.sin(rotate);
  let worst = 0;
  for (const d of SOLIDS[solid].normals) {
    const u = V.norm(d);
    const want = [u[0] * c + u[2] * s, u[1], -u[0] * s + u[2] * c];
    // Naive seed n = 2r·want. Its bisector normal is M·n ∝ [nx, ny·aniso, nz].
    const n = [want[0] * 2 * r, want[1] * 2 * r, want[2] * 2 * r];
    const got = V.norm([n[0], n[1] * aniso, n[2]]);
    // atan2 of the cross and dot: well-conditioned near 0, where acos is not.
    const cross = [
      want[1] * got[2] - want[2] * got[1],
      want[2] * got[0] - want[0] * got[2],
      want[0] * got[1] - want[1] * got[0],
    ];
    worst = Math.max(worst, Math.atan2(V.len(cross), V.dot(want, got)) * 180 / Math.PI);
  }
  return worst;
}
