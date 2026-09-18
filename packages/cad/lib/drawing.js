// drawing.js — an engineering drawing from the exact mesh: SVG, three views,
// hidden lines, overall dimensions, hole callouts. No kernel, no browser, so
// the MCP server, the CLI and the page all draw the same picture.
//
//   import { drawing } from './lib/drawing.js';
//   const { svg, views, overall, holes } = drawing([{ mesh, faces }], { title: 'plate' });
//   // an assembly: one body per component, posed
//   drawing(components.map((c) => ({ id: c.id, mesh: meshes.get(c.partKey), model: modelOf(c, angles), faces })), { title });
//
// Views are third-angle: front at the bottom left, top above it, right
// beside it; `views` picks any of front, back, top, bottom, left, right, iso.
// Lines: a body's feature edges (a crease over 25°), its silhouette in that
// view, and every boundary edge. Each is cut into short pieces and a ray is
// cast from each piece toward the viewer through a BVH of every body; a
// piece that hits something is a hidden line (dashed), the rest solid.
// Dimensions: the overall width and height on the front view, the depth on
// the top view, in mm, from the posed meshes. Callouts: every cylindrical
// hole whose axis points at a view is called out there as `n× ⌀d` (`↧ depth`
// when blind), from the exact faces the kernel names, grouped by diameter.
// `balloons: [{ point: [x,y,z], text }]` adds numbered item balloons on a ring
// around the drawing — how an exploded view is keyed to a parts list; and
// `dimensions: false` leaves the overall sizes off, which an exploded view
// wants, since its extent is the explosion's, not the assembly's.
// The output is deterministic for a given input, so a drawing can be diffed.
import { BVH, posedTriangles } from './proximity.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const xf = (m, p) => (m ? [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]] : p);
const xfDir = (m, d) => (m ? norm([m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]]) : d);

/// The standard views: `back` points at the viewer, `up` is up on the sheet.
export const VIEWS = {
  front: { back: [0, -1, 0], up: [0, 0, 1] },
  back: { back: [0, 1, 0], up: [0, 0, 1] },
  top: { back: [0, 0, 1], up: [0, 1, 0] },
  bottom: { back: [0, 0, -1], up: [0, -1, 0] },
  right: { back: [1, 0, 0], up: [0, 0, 1] },
  left: { back: [-1, 0, 0], up: [0, 0, 1] },
  iso: { back: norm([1, -1, 1]), up: [0, 0, 1] },
};
function basis(name) {
  const v = VIEWS[name]; if (!v) throw new Error(`no view named ${name}; views: ${Object.keys(VIEWS).join(', ')}`);
  const back = norm(v.back), u = norm(cross(v.up, back)), up = cross(back, u);
  return { name, back, u, v: up, dir: [-back[0], -back[1], -back[2]] };
}

// ── edges of a posed body: adjacency once, then per view ─────────────────
function edgeStructure(mesh, model) {
  const { pos, idx } = mesh; const m = idx.length / 3;
  const P = new Float64Array(pos.length / 3 * 3);
  for (let i = 0; i < pos.length; i += 3) { const p = xf(model, [pos[i], pos[i + 1], pos[i + 2]]); P[i] = p[0]; P[i + 1] = p[1]; P[i + 2] = p[2]; }
  const N = new Float64Array(m * 3);
  for (let t = 0; t < m; t++) {
    const a = idx[3 * t] * 3, b = idx[3 * t + 1] * 3, c = idx[3 * t + 2] * 3;
    const n = norm(cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]));
    N[3 * t] = n[0]; N[3 * t + 1] = n[1]; N[3 * t + 2] = n[2];
  }
  const adj = new Map(); // edge key → [p, q, t1, t2 | -1]
  for (let t = 0; t < m; t++) for (let k = 0; k < 3; k++) {
    const p = idx[3 * t + k], q = idx[3 * t + ((k + 1) % 3)]; const key = p < q ? p * 4294967296 + q : q * 4294967296 + p;
    const e = adj.get(key); if (e) e[3] = t; else adj.set(key, [p, q, t, -1]);
  }
  return { P, N, edges: [...adj.values()] };
}
const COS_CREASE = Math.cos((25 * Math.PI) / 180);
/// The edges worth drawing in a view: creases, silhouettes, boundaries — as [x,y,z, x,y,z] in world.
function viewEdges(es, dir) {
  const out = []; const { P, N } = es;
  for (const [p, q, t1, t2] of es.edges) {
    let keep = t2 < 0;
    if (!keep) {
      const d1 = N[3 * t1] * dir[0] + N[3 * t1 + 1] * dir[1] + N[3 * t1 + 2] * dir[2], d2 = N[3 * t2] * dir[0] + N[3 * t2 + 1] * dir[1] + N[3 * t2 + 2] * dir[2];
      const crease = N[3 * t1] * N[3 * t2] + N[3 * t1 + 1] * N[3 * t2 + 1] + N[3 * t1 + 2] * N[3 * t2 + 2] < COS_CREASE;
      keep = crease || (d1 < 0) !== (d2 < 0);
    }
    if (keep) out.push([P[3 * p], P[3 * p + 1], P[3 * p + 2], P[3 * q], P[3 * q + 1], P[3 * q + 2]]);
  }
  return out;
}

// ── visibility: a ray from each piece of an edge toward the viewer ──────
function rayBox(p, inv, n) { let tmin = -Infinity, tmax = Infinity; for (let k = 0; k < 3; k++) { const t1 = (n.min[k] - p[k]) * inv[k], t2 = (n.max[k] - p[k]) * inv[k]; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2)); } return tmax >= Math.max(tmin, 0); }
function rayHit(p, d, T, eps) {
  const e1 = [T[3] - T[0], T[4] - T[1], T[5] - T[2]], e2 = [T[6] - T[0], T[7] - T[1], T[8] - T[2]];
  const h = cross(d, e2); const a = dot(e1, h); if (Math.abs(a) < 1e-12) return false;
  const f = 1 / a, s = [p[0] - T[0], p[1] - T[1], p[2] - T[2]]; const u = f * dot(s, h); if (u < -1e-9 || u > 1 + 1e-9) return false;
  const q = cross(s, e1); const v = f * dot(d, q); if (v < -1e-9 || u + v > 1 + 1e-9) return false;
  return f * dot(e2, q) > eps;
}
function occluded(p, back, bvh, eps) {
  const o = [p[0] + back[0] * eps, p[1] + back[1] * eps, p[2] + back[2] * eps];
  const inv = back.map((x) => 1 / x); const T = new Float64Array(9); const stack = [bvh.root];
  while (stack.length) {
    const n = bvh.nodes[stack.pop()]; if (!n || !rayBox(o, inv, n)) continue;
    if (n.count) { for (let i = n.start; i < n.start + n.count; i++) if (rayHit(o, back, bvh.tri(i, T), eps)) return true; }
    else stack.push(n.left, n.right);
  }
  return false;
}
/// Cut every edge into pieces, classify each, and merge runs: [{x1,y1,x2,y2,hidden}] in view mm.
function classify(edges, B, bvh, step, eps, hidden) {
  const segs = [];
  for (const e of edges) {
    const a = [e[0], e[1], e[2]], b = [e[3], e[4], e[5]];
    const pa = [dot(a, B.u), dot(a, B.v)], pb = [dot(b, B.u), dot(b, B.v)];
    const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]); if (len < 1e-6) continue;
    const n = hidden ? Math.min(24, Math.max(1, Math.ceil(len / step))) : 1;
    let runStart = 0, runHidden = null;
    for (let i = 0; i < n; i++) {
      const tm = (i + 0.5) / n; const mid = [a[0] + (b[0] - a[0]) * tm, a[1] + (b[1] - a[1]) * tm, a[2] + (b[2] - a[2]) * tm];
      const h = hidden ? occluded(mid, B.back, bvh, eps) : false;
      if (runHidden === null) runHidden = h;
      else if (h !== runHidden) { const t0 = runStart / n, t1 = i / n; segs.push({ x1: pa[0] + (pb[0] - pa[0]) * t0, y1: pa[1] + (pb[1] - pa[1]) * t0, x2: pa[0] + (pb[0] - pa[0]) * t1, y2: pa[1] + (pb[1] - pa[1]) * t1, hidden: runHidden }); runStart = i; runHidden = h; }
    }
    const t0 = runStart / n; segs.push({ x1: pa[0] + (pb[0] - pa[0]) * t0, y1: pa[1] + (pb[1] - pa[1]) * t0, x2: pb[0], y2: pb[1], hidden: runHidden });
  }
  return segs;
}

// ── holes: cylindrical faces whose normal points at their axis ───────────
function holesOf(bodies) {
  const out = [];
  for (const body of bodies) {
    const faces = body.faces || []; const { mesh, model } = body; if (!mesh.fid) continue;
    const byFace = new Map();
    for (let t = 0; t < mesh.fid.length; t++) { const f = mesh.fid[t]; (byFace.get(f) || byFace.set(f, []).get(f)).push(t); }
    const seen = [];
    faces.forEach((f, fi) => {
      if (f.geom?.kind !== 'cylinder') return;
      const tris = byFace.get(fi); if (!tris || !tris.length) return;
      const axis = xfDir(model, f.geom.axis), center = xf(model, f.geom.center), r = f.geom.radius;
      const P = (t, i) => { const v = mesh.idx[3 * t + i] * 3; return xf(model, [mesh.pos[v], mesh.pos[v + 1], mesh.pos[v + 2]]); };
      // Hole or boss? From the face's OWN normal against the radial direction
      // at its centroid: a bore faces its axis, a shaft faces away. Not from a
      // triangle's winding — and not from `geom.kind` alone, because a
      // revolve labels the flat annulus between two diameters a cylinder too,
      // and that face's normal is along the axis, not across it (measured on
      // a flanged nut, 2026-09-13). A wall whose normal is not radial is not
      // a wall of this bore.
      const nrm = xfDir(model, f.normal || [0, 0, 0]);
      const rel = sub(xf(model, f.centroid || center), center);
      const radial = sub(rel, axis.map((x) => x * dot(rel, axis)));
      const len = Math.hypot(...radial);
      if (len < r * 0.5) return;               // the centroid is on the axis: not a cylindrical wall
      const facing = dot(nrm, radial) / len;
      if (Math.abs(facing) < 0.5) return;      // faces along its axis: an annulus, not a wall
      const hole = facing < 0;                 // toward its axis is a bore; away from it is a shaft
      let lo = Infinity, hi = -Infinity;
      for (const t of tris) for (let i = 0; i < 3; i++) { const sAx = dot(sub(P(t, i), center), axis); if (sAx < lo) lo = sAx; if (sAx > hi) hi = sAx; }
      // The same bore comes back as several faces — a circle is four exact
      // arcs, a revolve one face per quadrant. One hole: match on the axis
      // LINE (its nearest point to the origin, the same whichever piece and
      // whichever way the axis points) and the radius, within a tolerance.
      const foot = sub(center, axis.map((x) => x * dot(center, axis)));
      const tol = Math.max(1e-4, r * 1e-3);
      const h = seen.find((x) => x.hole === hole && Math.abs(x.r - r) < tol && Math.abs(Math.abs(dot(x.axis, axis)) - 1) < 1e-6 && Math.hypot(...sub(x.foot, foot)) < tol);
      if (h) { h.lo = Math.min(h.lo, lo); h.hi = Math.max(h.hi, hi); h.names.push(f.names[f.names.length - 1]); return; }
      const cyl = { body: body.id, names: [f.names[f.names.length - 1]], diameter: 2 * r, r, foot, axis, center, lo, hi, hole };
      seen.push(cyl); out.push(cyl);
    });
  }
  return out;
}

// ── features: the sketch loops the kernel named, as things to dimension ──
// A face's last name is `<op>.<loop>[pattern][arc]` — `plate.slotRlo[3]`,
// `plate.tapA[3]`, `plate.pivot[2][0]`. So the loops of the sketch come back
// as groups, which is exactly the granularity a drawing dimensions: this
// slot, that bore, that bolt circle's third hole. The outline and the
// extrude's two caps are the part itself, not features in it.
const NOT_A_FEATURE = new Set(['outline', 'start', 'end', 'profile', 'body']);
function featuresOf(bodies) {
  const out = [];
  for (const body of bodies) {
    const faces = body.faces || []; const { mesh, model } = body;
    if (!mesh.fid || !faces.length) continue;
    const byFace = new Map();
    for (let t = 0; t < mesh.fid.length; t++) { const f = mesh.fid[t]; (byFace.get(f) || byFace.set(f, []).get(f)).push(t); }
    const groups = new Map();
    faces.forEach((f, fi) => {
      const last = f.names[f.names.length - 1] || '';
      const loop = last.replace(/^[^.]*\./, '').replace(/\[\d+\]/g, '');
      if (!loop || NOT_A_FEATURE.has(loop)) return;
      const brackets = last.match(/\[\d+\]/g) || [];
      const key = loop + brackets.slice(0, -1).join(''); // keep the pattern index, drop the arc's
      let g = groups.get(key);
      if (!g) { g = { body: body.id, name: loop, key, kinds: new Set(), faces: 0, pts: [] }; groups.set(key, g); }
      g.kinds.add(f.geom?.kind || 'other'); g.faces++;
      for (const t of byFace.get(fi) || []) for (let k = 0; k < 3; k++) { const v = mesh.idx[3 * t + k] * 3; const p = xf(model, [mesh.pos[v], mesh.pos[v + 1], mesh.pos[v + 2]]); g.pts.push(p[0], p[1], p[2]); }
    });
    for (const g of groups.values()) out.push({ ...g, kind: [...g.kinds].every((k) => k === 'cylinder') ? 'hole' : 'pocket', pts: Float64Array.from(g.pts) });
  }
  return out;
}
/// A feature's box in one view's plane, and how deep it runs into the sheet.
function projBox(pts, B) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    const p = [pts[i], pts[i + 1], pts[i + 2]];
    const x = dot(p, B.u), y = dot(p, B.v), z = dot(p, B.back);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, depth: z1 - z0 };
}
/// Pack dimensions onto levels: a dimension shares a level with another only
/// if their spans do not overlap, so no two labels sit on top of each other.
function packLevels(items, pad) {
  const levels = [];
  for (const it of items.sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo))) {
    let L = 0;
    while (levels[L] && levels[L].some((o) => it.lo < o.hi + pad && o.lo < it.hi + pad)) L++;
    (levels[L] || (levels[L] = [])).push(it); it.level = L;
  }
  return levels.length;
}

// ── the sheet ───────────────────────────────────────────────────────────
const NICE = [100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
const fmt = (x) => { const s = (Math.round(x * 100) / 100).toFixed(2); return s.replace(/\.?0+$/, ''); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * bodies: [{ id?, mesh: {pos, idx, fid?}, model?: 16 floats column-major, faces?: the kernel's face report }]
 * opts: views, hidden (default true), title, units, width (px, default 900), scale (px per mm, else fitted to a 1:n or n:1)
 */
export function drawing(bodies, { views = ['front', 'top', 'right'], hidden = true, title = 'part', units = 'mm', width = 900, scale: fixedScale, callouts = true, note, balloons = [], internals, dimensions = true } = {}) {
  const t0 = performance.now();
  bodies = bodies.filter((b) => b.mesh && b.mesh.idx.length);
  if (!bodies.length) throw new Error('nothing to draw: no mesh');
  // world bbox and the scene BVH (every body, posed)
  const tris = []; let count = 0;
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const b of bodies) { const T = posedTriangles(b.mesh, b.model || I); tris.push(T); count += T.length; }
  const all = new Float64Array(count); let o = 0; for (const T of tris) { all.set(T, o); o += T.length; }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < all.length; i += 3) for (let k = 0; k < 3; k++) { if (all[i + k] < min[k]) min[k] = all[i + k]; if (all[i + k] > max[k]) max[k] = all[i + k]; }
  const overall = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const diag = Math.hypot(...overall) || 1;
  const bvh = hidden ? new BVH(all) : null;
  const eps = diag * 1e-5, step = diag / 80;
  const structs = bodies.map((b) => edgeStructure(b.mesh, b.model || null));
  const holes = callouts ? holesOf(bodies) : [];
  // internal dimensions are for a PART sheet: on an assembly they would be a
  // thicket, so they are off unless asked for
  const wantInternals = internals ?? bodies.length === 1;
  const features = wantInternals ? featuresOf(bodies) : [];

  // each view: segments in its own mm plane, its bbox
  const vs = views.map((name) => {
    const B = basis(name);
    const edges = structs.flatMap((es) => viewEdges(es, B.dir));
    const segs = classify(edges, B, bvh, step, eps, hidden);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of segs) { x0 = Math.min(x0, s.x1, s.x2); x1 = Math.max(x1, s.x1, s.x2); y0 = Math.min(y0, s.y1, s.y2); y1 = Math.max(y1, s.y1, s.y2); }
    if (!segs.length) { x0 = y0 = 0; x1 = y1 = 1; }
    const facing = holes.filter((h) => Math.abs(dot(h.axis, B.back)) > 0.999).map((h) => ({ ...h, x: dot(h.center, B.u), y: dot(h.center, B.v), depth: h.hi - h.lo }));
    const marks = facing.filter((h) => h.hole);
    // a turned part's outside diameters: called out, but never dimensioned
    // from a datum — a shaft is made to a diameter, not to a position
    const turned = facing.filter((h) => !h.hole);
    return { name, B, segs, box: [x0, y0, x1, y1], w: x1 - x0, h: y1 - y0, marks, turned, hiddenCount: segs.filter((s) => s.hidden).length, visibleCount: segs.filter((s) => !s.hidden).length };
  });
  const byName = Object.fromEntries(vs.map((v) => [v.name, v]));
  // Internal dimensions go on ONE view — the one that sees the most features,
  // which is the face a machinist works from. Spreading them over three views
  // puts a ladder between two views and reads worse, not better.
  const MAX_ORDINATES = 16;
  let dimView = null;
  if (features.length) {
    for (const v of vs) {
      v.feats = features.map((f) => ({ ...f, box: projBox(f.pts, v.B) })).filter((f) => f.box.w > 1e-9 || f.box.h > 1e-9);
      // a feature the view looks INTO reads as a shape; one seen edge-on is a line
      v.facing = v.feats.filter((f) => f.box.w > v.w * 0.002 && f.box.h > v.h * 0.002);
    }
    // the view to dimension is the one that can actually be dimensioned: holes
    // whose axis points at it, and pockets it looks into — not features it
    // sees edge-on, which are lines
    const score = (v) => v.marks.length + v.facing.filter((f) => f.kind === 'pocket' && f.box.w < v.w * 0.98 && f.box.h < v.h * 0.98).length;
    dimView = vs.reduce((a, b) => (score(b) > (a ? score(a) : 0) ? b : a), null);
  }
  if (dimView) {
    // ORDINATE dimensions, not a staircase of chains: one datum at the part's
    // corner, and every hole centre and pocket edge gets its distance from it
    // on a single ladder. A dozen features would be a dozen stacked dimension
    // lines any other way — this is how a drilled plate is actually drawn.
    const v = dimView, [bx0, by0] = v.box;
    const xs = new Map(), ys = new Map(), notes = [], spans = [];
    // two features that round to the same number are one ordinate: writing it
    // twice says nothing and the labels collide
    const at = (map, pos, what, origin) => { const k = fmt(pos - origin); if (!map.has(k)) map.set(k, { pos, what }); };
    const rows = new Map();
    for (const m of v.marks) { const k = `${m.diameter.toFixed(3)}|${m.y.toFixed(3)}`; (rows.get(k) || rows.set(k, []).get(k)).push(m); }
    for (const row of [...rows.values()].sort((a, b) => b.length - a.length)) {
      row.sort((a, b) => a.x - b.x);
      at(ys, row[0].y, 'hole', by0);
      // an evenly spaced run says so once, as a pitch, instead of an ordinate per hole
      const pitch = row.length > 2 ? (row[row.length - 1].x - row[0].x) / (row.length - 1) : null;
      const even = pitch !== null && row.every((m, i) => Math.abs(m.x - (row[0].x + i * pitch)) < Math.max(1e-4, Math.abs(pitch) * 0.01));
      if (even) { at(xs, row[0].x, 'hole', bx0); at(xs, row[row.length - 1].x, 'hole', bx0); spans.push({ lo: row[0].x, hi: row[row.length - 1].x, label: `${row.length - 1}× ${fmt(pitch)} = ${fmt(row[row.length - 1].x - row[0].x)}`, kind: 'pitch' }); }
      else for (const m of row) at(xs, m.x, 'hole', bx0);
    }
    const pockets = (v.facing || []).filter((f) => f.kind === 'pocket' && f.box.w < v.w * 0.98 && f.box.h < v.h * 0.98).sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
    for (const f of pockets) {
      notes.push({ x: f.box.x1, y: f.box.y1, text: `${f.name} ${fmt(f.box.w)} × ${fmt(f.box.h)}` });
      at(xs, f.box.x0, 'pocket', bx0); at(xs, f.box.x1, 'pocket', bx0); at(ys, f.box.y0, 'pocket', by0); at(ys, f.box.y1, 'pocket', by0);
    }
    const ord = (map, origin) => [...map.values()].map((e) => ({ ...e, value: e.pos - origin })).filter((e) => Math.abs(e.value) > Math.max(diag * 1e-4, 1e-6)).sort((a, b) => a.pos - b.pos).slice(0, MAX_ORDINATES);
    v.plan = { hOrd: ord(xs, bx0), vOrd: ord(ys, by0), spans: spans.slice(0, 3), notes, datum: [bx0, by0] };
    // numbers stagger over two rows, three where they are dense; then any
    // pitch line; then the overall dimension, outside its own ladder
    v.plan.hStagger = v.plan.hOrd.length > 6 ? 3 : 2;
    v.plan.vStagger = v.plan.vOrd.length > 6 ? 3 : 2;
    v.plan.hLevels = v.plan.hOrd.length ? v.plan.hStagger + v.plan.spans.length + 1 : 0;
    v.plan.vLevels = v.plan.vOrd.length ? v.plan.vStagger + 1 : 0;
    if (!v.plan.hOrd.length && !v.plan.vOrd.length && !v.plan.notes.length) dimView = null;
    // which side each ladder hangs on: never between two views
    // (the layout below puts `top` above the front view and `right` beside it)
    v.plan.side = { h: v.name === 'top' ? 'above' : 'below', v: v.name === 'right' ? 'right' : 'left' };
  }
  // layout in mm: front bottom-left, top above, right beside (third angle); anything else in a row after
  const gap = Math.max(diag * 0.25, 4), dimRoom = Math.max(diag * 0.22, 6);

  const placed = []; let cx = 0, cy = 0; const front = byName.front, top = byName.top, right = byName.right;
  if (front) { front.ox = 0; front.oy = 0; placed.push(front); cx = front.w; cy = front.h; }
  if (top) { top.ox = front ? front.box[0] - top.box[0] : 0; top.oy = (front ? front.h + gap : 0); placed.push(top); cx = Math.max(cx, top.ox + top.w); cy = top.oy + top.h; }
  if (right) { right.ox = (front ? front.w + gap : 0); right.oy = front ? front.box[1] - right.box[1] : 0; placed.push(right); cx = Math.max(cx, right.ox + right.w); cy = Math.max(cy, right.oy + right.h); }
  let rx = cx + (placed.length ? gap : 0);
  for (const v of vs) if (!placed.includes(v)) { v.ox = rx; v.oy = 0; placed.push(v); rx += v.w + gap; cx = Math.max(cx, v.ox + v.w); cy = Math.max(cy, v.h); }
  // ox/oy are the sheet-mm offsets of each view's box corner
  for (const v of vs) { v.sx = v.ox - v.box[0]; v.sy = v.oy - v.box[1]; }
  const sheetW = cx + dimRoom, sheetH = cy + dimRoom;
  // scale: px per mm, a nice ratio at 96 dpi unless given
  // how wide the note ladder will be: the longest label it must hold
  const noteLabels = (v) => [
    ...[...new Map((v?.marks || []).map((m) => [`${m.diameter.toFixed(4)}|${m.depth.toFixed(3)}`, m])).values()].map((m) => `12× ⌀${fmt(m.diameter)} ↧${fmt(m.depth)}`),
    ...(v?.plan?.notes || []).map((n) => n.text),
  ];
  const roomFor = (v) => (noteLabels(v).length ? 28 + Math.max(...noteLabels(v).map((l) => l.length)) * 6.9 : 0);
  const noteRoom = Math.max(0, ...vs.map(roomFor));
  const pxPerMm = 96 / 25.4; const budget = (width - 60 - noteRoom) / sheetW;
  const S = fixedScale ?? (NICE.map((n) => n * pxPerMm).find((s) => s <= budget) ?? NICE[NICE.length - 1] * pxPerMm);
  const ratio = S / pxPerMm; const scaleText = ratio >= 1 ? `${fmt(ratio)}:1` : `1:${fmt(1 / ratio)}`;
  const margin = 30, titleH = 72, below = 64; // px under the lowest view for its dimension, its text and its label; then the title block
  // room on the right for the hole callouts of whichever view has the most text
  let calloutRoom = noteRoom;
  for (const v of vs) {
    const g = new Map(); for (const m of v.marks) { const k = `${m.diameter.toFixed(4)}|${m.depth.toFixed(3)}`; g.set(k, (g.get(k) || 0) + 1); }
    for (const [k, n] of g) { const [dia, depth] = k.split('|').map(Number); calloutRoom = Math.max(calloutRoom, 28 + `${n > 1 ? n + '× ' : ''}⌀${fmt(dia)} ↧${fmt(depth)}`.length * 6.7); }
    for (const n of v.plan?.notes || []) calloutRoom = Math.max(calloutRoom, 28 + n.text.length * 6.7);
  }
  const balloonRoom = balloons.length ? 56 : 0;
  // the internal dimension ladders need their own room, on whichever sides they hang
  const LEVEL = 22, FIRST = 20;
  const ladder = (n) => (n ? FIRST + n * LEVEL : 0);
  const pl = dimView?.plan;
  const room = { left: 0, right: 0, below: 0, above: 0 };
  if (pl) { room[pl.side.v] = ladder(pl.vLevels); room[pl.side.h] = ladder(pl.hLevels); }
  // an estimate of the sheet while drawing (the note ladder clamps against it);
  // the real size is the crop at the end
  const West = Math.ceil(sheetW * S + 2 * margin + dimRoom * S + calloutRoom + balloonRoom + room.left + room.right);
  const Hest = Math.ceil(sheetH * S + 2 * margin + below + titleH + balloonRoom + room.above + room.below);
  // sheet mm → px: x right, y up
  // views to the right of the dimensioned one are pushed clear of its note
  // ladder — in pixels, because the ladder's width does not scale with the part
  for (const v of vs) v.shift = dimView && v !== dimView && v.ox > dimView.ox ? roomFor(dimView) : 0;
  const X = (v, x) => margin + dimRoom * S + room.left + (v.sx + x) * S + (v.shift || 0), Y = (v, y) => margin + balloonRoom + room.above + (sheetH - (v.sy + y)) * S;
  const parts = [];
  // every helper reports what it covers, so the sheet is cropped to its
  // content at the end instead of being guessed from reserved margins
  const ink = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const mark = (x, y) => { if (x < ink.x0) ink.x0 = x; if (x > ink.x1) ink.x1 = x; if (y < ink.y0) ink.y0 = y; if (y > ink.y1) ink.y1 = y; };
  const line = (a, b, c, d, cls) => { mark(a, b); mark(c, d); parts.push(`<line x1="${a.toFixed(2)}" y1="${b.toFixed(2)}" x2="${c.toFixed(2)}" y2="${d.toFixed(2)}" class="${cls}"/>`); };
  const text = (x, y, s, cls = 't', anchor = 'middle', rot = 0) => {
    const w = String(s).length * 6.9, h = 13;
    if (rot) { mark(x - h, y - w / 2); mark(x + h, y + w / 2); }
    else { const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2; mark(x0, y - h); mark(x0 + w, y + 4); }
    parts.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" class="${cls}" text-anchor="${anchor}"${rot ? ` transform="rotate(${rot} ${x.toFixed(2)} ${y.toFixed(2)})"` : ''}>${esc(s)}</text>`);
  };
  // a linear dimension between two sheet points, offset by `off` px perpendicular (positive: outward)
  const dim = (x1, y1, x2, y2, off, label, horizontal) => {
    const ext = 6, arrow = 6;
    if (horizontal) {
      const y = y1 + off; line(x1, y1 + Math.sign(off) * 2, x1, y + Math.sign(off) * ext, 'dim'); line(x2, y2 + Math.sign(off) * 2, x2, y + Math.sign(off) * ext, 'dim');
      line(x1, y, x2, y, 'dim'); parts.push(`<path d="M${x1} ${y} l${arrow} -2.5 v5 z M${x2} ${y} l-${arrow} -2.5 v5 z" class="arrow"/>`);
      text((x1 + x2) / 2, y + (off > 0 ? 13 : -5), label, 'dimtext');
    } else {
      const x = x1 + off; line(x1 + Math.sign(off) * 2, y1, x + Math.sign(off) * ext, y1, 'dim'); line(x2 + Math.sign(off) * 2, y2, x + Math.sign(off) * ext, y2, 'dim');
      line(x, y1, x, y2, 'dim'); parts.push(`<path d="M${x} ${y1} l-2.5 -${arrow} h5 z M${x} ${y2} l-2.5 ${arrow} h5 z" class="arrow"/>`);
      text(x + (off > 0 ? 13 : -5), (y1 + y2) / 2, label, 'dimtext', 'middle', -90);
    }
  };
  const dims = []; const notePoints = [];
  for (const v of vs) {
    const g = []; const px = (x) => X(v, x), py = (y) => Y(v, y);
    for (const s of v.segs) g.push(`<line x1="${px(s.x1).toFixed(2)}" y1="${py(s.y1).toFixed(2)}" x2="${px(s.x2).toFixed(2)}" y2="${py(s.y2).toFixed(2)}"${s.hidden ? ' class="h"' : ''}/>`);
    mark(px(v.box[0]), py(v.box[1])); mark(px(v.box[2]), py(v.box[3]));
    parts.push(`<g class="view" data-view="${v.name}">${g.join('')}</g>`);
    // dimensions: width and height on the front (or the first view), depth on
    // the top — outside the ordinate ladder, where there is one
    const isFront = dimensions && v === (front || vs[0]);
    const p0 = v.plan;
    const hOut = 18 + (p0 && p0.side.h === 'below' ? FIRST + (p0.hLevels - 1) * LEVEL : 0);
    const vOut = -18 - (p0 && p0.side.v === 'left' ? FIRST + (p0.vLevels - 1) * LEVEL : 0);
    text(px((v.box[0] + v.box[2]) / 2), py(v.box[1]) + 14 + (isFront ? hOut + 20 : 0), v.name.toUpperCase(), 'label');
    if (isFront) {
      dim(px(v.box[0]), py(v.box[1]), px(v.box[2]), py(v.box[1]), hOut, `${fmt(v.w)}`, true); dims.push({ view: v.name, axis: 'width', value: v.w });
      dim(px(v.box[0]), py(v.box[3]), px(v.box[0]), py(v.box[1]), vOut, `${fmt(v.h)}`, false); dims.push({ view: v.name, axis: 'height', value: v.h });
    }
    if (dimensions && v === top && front) { dim(px(v.box[0]), py(v.box[3]), px(v.box[0]), py(v.box[1]), vOut, `${fmt(v.h)}`, false); dims.push({ view: v.name, axis: 'depth', value: v.h }); }
    if (dimensions && v === right && !front) { dim(px(v.box[0]), py(v.box[1]), px(v.box[2]), py(v.box[1]), hOut, `${fmt(v.w)}`, true); dims.push({ view: v.name, axis: 'depth', value: v.w }); }
    // the internal ladders: where every hole and pocket sits, from the part's
    // own corner — an overall size alone cannot be made from
    if (v.plan) {
      const p = v.plan, below = p.side.h === 'below', left = p.side.v === 'left';
      const hBase = below ? py(v.box[1]) + FIRST + (isFront ? 26 : 0) : py(v.box[3]) - FIRST;
      const vBase = left ? px(v.box[0]) - FIRST : px(v.box[2]) + FIRST;
      if (p.hOrd.length || p.vOrd.length) parts.push(`<circle cx="${px(p.datum[0]).toFixed(1)}" cy="${py(p.datum[1]).toFixed(1)}" r="3.5" class="datum"/>`);
      p.hOrd.forEach((e, i) => { // witness line down from the feature, the distance at its end, two staggered rows
        const x = px(e.pos), y0 = py(v.box[1]) + (below ? 4 : -4), y1 = hBase + (below ? 1 : -1) * (i % p.hStagger) * LEVEL;
        line(x, y0, x, y1, 'dim');
        text(x, y1 + (below ? 11 : -5), fmt(e.value), 'dimtext');
        dims.push({ view: v.name, axis: `x-${e.what}`, value: +e.value.toFixed(4) });
      });
      p.vOrd.forEach((e, i) => {
        const y = py(e.pos), x0 = px(v.box[0]) + (left ? -4 : 4), x1 = vBase - (left ? 1 : -1) * (i % p.vStagger) * LEVEL;
        line(x0, y, x1, y, 'dim');
        text(x1 + (left ? -5 : 5), y + 4, fmt(e.value), 'dimtext', left ? 'end' : 'start');
        dims.push({ view: v.name, axis: `y-${e.what}`, value: +e.value.toFixed(4) });
      });
      p.spans.forEach((d, i) => {
        const y = hBase + (below ? 1 : -1) * (p.hStagger + i) * LEVEL;
        dim(px(d.lo), y, px(d.hi), y, 0, d.label, true);
        dims.push({ view: v.name, axis: d.kind, value: +(d.hi - d.lo).toFixed(4) });
      });
      for (const n of p.notes) notePoints.push({ v, x: n.x, y: n.y, text: n.text });
    }
    // notes on a leader, one ladder per view: a hole group by count and
    // diameter, a pocket by name and size. One ladder, so they cannot collide.
    const groups = new Map();
    for (const m of v.marks) { const k = `${m.diameter.toFixed(4)}|${m.depth.toFixed(3)}`; (groups.get(k) || groups.set(k, []).get(k)).push(m); }
    const leaders = [];
    for (const [, ms] of groups) {
      const m = ms.reduce((a, b) => (b.x > a.x || (b.x === a.x && b.y > a.y) ? b : a));
      const through = m.depth >= (overall.reduce((a, b, i) => (Math.abs(m.axis[i]) > 0.999 ? b : a), m.depth)) - 1e-6;
      leaders.push({ x: m.x + m.diameter / 2 * 0.7071, y: m.y + m.diameter / 2 * 0.7071, text: `${ms.length > 1 ? ms.length + '× ' : ''}⌀${fmt(m.diameter)}${through ? '' : ' ↧' + fmt(m.depth)}` });
    }
    if (wantInternals) {
      const outer = new Map();
      for (const c of v.turned) { const k = c.diameter.toFixed(4); if (!outer.has(k) || c.diameter > outer.get(k).diameter) outer.set(k, c); }
      for (const c of outer.values()) leaders.push({ x: c.x + c.diameter / 2 * 0.7071, y: c.y + c.diameter / 2 * 0.7071, text: `⌀${fmt(c.diameter)}` });
    }
    for (const n of notePoints.filter((n) => n.v === v)) leaders.push({ x: n.x, y: n.y, text: n.text });
    // the ladder hangs DOWN the right of the view, clamped to the sheet, so a
    // part with a dozen distinct features does not push its notes off the top
    leaders.sort((a, b) => b.y - a.y).forEach((n, k) => {
      const lx = px(v.box[2]) + 14 + 8 * (k % 2);
      const ly = Math.min(py(v.box[3]) + 8 + 16 * k, Hest - margin - titleH - 8);
      line(px(n.x), py(n.y), lx, ly, 'dim'); line(lx, ly, lx + 6, ly, 'dim'); text(lx + 8, ly + 4, n.text, 'dimtext', 'start');
    });
  }
  // Item balloons ring the view in angular order: a leader from each part out
  // to a numbered circle on a rectangle around the drawing. Order around the
  // ring is the order around the part, so leaders cannot cross; the ring
  // grows until every balloon has room, so they cannot overlap either. (A
  // relaxation blob beside the parts is what crowded a 21-item exploded view.)
  for (const v of vs) {
    if (!balloons.length) continue;
    const r = 11, minGap = 2 * r + 7;
    const x0 = X(v, v.box[0]), x1 = X(v, v.box[2]), y1 = Y(v, v.box[1]), y0 = Y(v, v.box[3]);
    const cx0 = (x0 + x1) / 2, cy0 = (y0 + y1) / 2;
    const pts = balloons.map((b) => ({ text: b.text, px: X(v, dot(b.point, v.B.u)), py: Y(v, dot(b.point, v.B.v)) }));
    let pad = 30; // as tight as the ring can be; it grows below only if the balloons do not fit
    let ring, per, place;
    for (let tries = 0; tries < 12; tries++) {
      const a = x0 - pad, b = x1 + pad, c = y0 - pad, d = y1 + pad;
      ring = { a, b, c, d, w: b - a, h: d - c };
      per = 2 * (ring.w + ring.h);
      if (per >= balloons.length * minGap * 1.05) break;
      pad *= 1.35;
    }
    // perimeter parameter of the point where the ray from the centre leaves the ring
    const tOf = (px, py) => {
      let dx = px - cx0, dy = py - cy0; if (!dx && !dy) dy = -1;
      const sx = dx ? Math.max((ring.a - cx0) / dx, (ring.b - cx0) / dx) : Infinity;
      const sy = dy ? Math.max((ring.c - cy0) / dy, (ring.d - cy0) / dy) : Infinity;
      const k = Math.min(sx, sy);
      const hx = cx0 + dx * k, hy = cy0 + dy * k;
      // walk the perimeter clockwise from the top-left corner
      if (Math.abs(hy - ring.c) < 1e-6) return hx - ring.a;                                  // top edge
      if (Math.abs(hx - ring.b) < 1e-6) return ring.w + (hy - ring.c);                        // right edge
      if (Math.abs(hy - ring.d) < 1e-6) return ring.w + ring.h + (ring.b - hx);               // bottom edge
      return 2 * ring.w + ring.h + (ring.d - hy);                                             // left edge
    };
    place = (t) => {
      t = ((t % per) + per) % per;
      if (t < ring.w) return [ring.a + t, ring.c];
      if (t < ring.w + ring.h) return [ring.b, ring.c + (t - ring.w)];
      if (t < 2 * ring.w + ring.h) return [ring.b - (t - ring.w - ring.h), ring.d];
      return [ring.a, ring.d - (t - 2 * ring.w - ring.h)];
    };
    const items = pts.map((p, i) => ({ ...p, i, t: tOf(p.px, p.py) })).sort((a, b) => a.t - b.t);
    // push apart in order, twice around, so a crowded arc spreads into a clear one
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < items.length; i++) if (items[i].t - items[i - 1].t < minGap) items[i].t = items[i - 1].t + minGap;
      const wrap = items[0].t + per - items[items.length - 1].t;
      if (wrap < minGap) { const shift = (minGap - wrap) / 2; items[0].t += shift; for (let i = items.length - 1; i > 0; i--) items[i].t = Math.min(items[i].t, items[0].t + per - minGap * (items.length - i)); }
    }
    for (const it of items) {
      const [bx, by] = place(it.t);
      line(it.px, it.py, bx, by, 'dim');
      mark(bx - r, by - r); mark(bx + r, by + r);
      parts.push(`<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${r}" class="balloon"/><text x="${bx.toFixed(1)}" y="${(by + 4).toFixed(1)}" class="bnum" text-anchor="middle">${esc(it.text)}</text>`);
    }
  }
  // The sheet is CROPPED to what was drawn, not to reserved margins: every
  // helper above marked the box it covers, so a ladder, a note or a balloon
  // that reaches further simply makes the sheet bigger, and a drawing that
  // needs less does not sit in a field of white.
  const pad = 18;
  const cx0 = (Number.isFinite(ink.x0) ? ink.x0 : 0) - pad, cy0 = (Number.isFinite(ink.y0) ? ink.y0 : 0) - pad;
  const cw = (Number.isFinite(ink.x1) ? ink.x1 : 100) + pad - cx0, ch = (Number.isFinite(ink.y1) ? ink.y1 : 100) + pad - cy0;
  // title block: sized to its own text (11 px monospace ≈ 6.7 px a character), under everything
  const lines = [`${units} · scale ${scaleText} · third angle`, `${overall.map(fmt).join(' × ')} ${units}${bodies.length > 1 ? ` · ${bodies.length} bodies` : ''}${note ? ' · ' + note : ''}`];
  const tbW = Math.max(180, Math.ceil(Math.max(title.length * 8, ...lines.map((l) => l.length * 6.7)) + 16));
  const tbH = 22 + 15 * lines.length;
  const W = Math.ceil(cw), H = Math.ceil(ch + tbH + 26);
  const tbX = Math.max(0, W - tbW - 4), tbY = ch + 8;
  parts.push(`<g class="title"><rect x="${(tbX + cx0).toFixed(1)}" y="${(tbY + cy0).toFixed(1)}" width="${tbW}" height="${tbH}" class="tb"/><text x="${(tbX + cx0 + 8).toFixed(1)}" y="${(tbY + cy0 + 16).toFixed(1)}" class="tt">${esc(title)}</text>${lines.map((l, i) => `<text x="${(tbX + cx0 + 8).toFixed(1)}" y="${(tbY + cy0 + 32 + i * 14).toFixed(1)}" class="t">${esc(l)}</text>`).join('')}</g>`);
  parts.push(`<text x="${(cx0 + 4).toFixed(1)}" y="${(cy0 + ch + tbH + 2).toFixed(1)}" class="t dim">cad.mino.mobi</text>`);
  const style = `<style>svg{background:#fff}.view line{stroke:#111;stroke-width:1.1;stroke-linecap:round;fill:none}.view line.h{stroke:#555;stroke-width:0.8;stroke-dasharray:5 3}.dim{stroke:#1a5cff;stroke-width:0.7;fill:none}.arrow{fill:#1a5cff;stroke:none}text{font:11px ui-monospace,Menlo,Consolas,monospace;fill:#1a5cff}text.label{fill:#111;font-weight:600;letter-spacing:.08em}.balloon{fill:#fff;stroke:#1a5cff;stroke-width:1.2}.datum{fill:none;stroke:#1a5cff;stroke-width:1.4}text.bnum{fill:#1a5cff;font-weight:700;font-size:11px}text.t{fill:#333}.tb{fill:none;stroke:#111;stroke-width:1}.tt{font-size:13px;font-weight:600;fill:#111}</style>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${cx0.toFixed(1)} ${cy0.toFixed(1)} ${W} ${H}">${style}<rect x="${cx0.toFixed(1)}" y="${cy0.toFixed(1)}" width="${W}" height="${H}" fill="#fff"/>${parts.join('\n')}</svg>`;
  return {
    svg, width: W, height: H, scale: scaleText, units, overall, dims,
    views: vs.map((v) => ({ name: v.name, width: v.w, height: v.h, visible: v.visibleCount, hidden: v.hiddenCount, callouts: v.marks.length })),
    holes: holes.filter((h) => h.hole).map((h) => ({ body: h.body, names: h.names, diameter: h.diameter, depth: h.hi - h.lo, axis: h.axis, center: h.center })),
    diameters: holes.filter((h) => !h.hole).map((h) => ({ body: h.body, names: h.names, diameter: h.diameter, length: h.hi - h.lo, axis: h.axis, center: h.center })),
    ms: performance.now() - t0,
  };
}
