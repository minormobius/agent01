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
    const first = new Map(); for (let t = 0; t < mesh.fid.length; t++) if (!first.has(mesh.fid[t])) first.set(mesh.fid[t], t);
    const seen = [];
    faces.forEach((f, fi) => {
      if (f.geom?.kind !== 'cylinder') return; const t = first.get(fi); if (t === undefined) return;
      const axis = xfDir(model, f.geom.axis), center = xf(model, f.geom.center), r = f.geom.radius;
      const a = mesh.idx[3 * t] * 3, b = mesh.idx[3 * t + 1] * 3, c = mesh.idx[3 * t + 2] * 3;
      const pa = xf(model, [mesh.pos[a], mesh.pos[a + 1], mesh.pos[a + 2]]), pb = xf(model, [mesh.pos[b], mesh.pos[b + 1], mesh.pos[b + 2]]), pc = xf(model, [mesh.pos[c], mesh.pos[c + 1], mesh.pos[c + 2]]);
      const n = cross(sub(pb, pa), sub(pc, pa)); const cen = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3];
      const rel = sub(cen, center); const along = dot(rel, axis); const radial = [rel[0] - axis[0] * along, rel[1] - axis[1] * along, rel[2] - axis[2] * along];
      if (dot(n, radial) >= 0) return; // the surface faces away from its axis: a boss, not a hole
      // extent along the axis over the face's own vertices
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < mesh.fid.length; k++) if (mesh.fid[k] === fi) for (let j = 0; j < 3; j++) { const v = mesh.idx[3 * k + j] * 3; const p = xf(model, [mesh.pos[v], mesh.pos[v + 1], mesh.pos[v + 2]]); const s = dot(sub(p, center), axis); if (s < lo) lo = s; if (s > hi) hi = s; }
      // The same bore is reported as several faces — a circle is four exact
      // arcs, so a plain bore is four cylinders sharing an axis. One hole:
      // match on the axis LINE (its nearest point to the origin, which is
      // the same whichever piece and whichever way the axis points) and the
      // radius, within a tolerance — exact keys split on the last bits.
      const foot = sub(center, axis.map((x) => x * dot(center, axis)));
      const tol = Math.max(1e-4, r * 1e-3);
      const h = seen.find((x) => Math.abs(x.r - r) < tol && Math.abs(Math.abs(dot(x.axis, axis)) - 1) < 1e-6 && Math.hypot(...sub(x.foot, foot)) < tol);
      if (h) { h.lo = Math.min(h.lo, lo); h.hi = Math.max(h.hi, hi); h.names.push(f.names[f.names.length - 1]); return; }
      const hole = { body: body.id, names: [f.names[f.names.length - 1]], diameter: 2 * r, r, foot, axis, center, lo, hi }; seen.push(hole); out.push(hole);
    });
  }
  return out;
}

// ── the sheet ───────────────────────────────────────────────────────────
const NICE = [100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
const fmt = (x) => { const s = (Math.round(x * 100) / 100).toFixed(2); return s.replace(/\.?0+$/, ''); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * bodies: [{ id?, mesh: {pos, idx, fid?}, model?: 16 floats column-major, faces?: the kernel's face report }]
 * opts: views, hidden (default true), title, units, width (px, default 900), scale (px per mm, else fitted to a 1:n or n:1)
 */
export function drawing(bodies, { views = ['front', 'top', 'right'], hidden = true, title = 'part', units = 'mm', width = 900, scale: fixedScale, callouts = true, note } = {}) {
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

  // each view: segments in its own mm plane, its bbox
  const vs = views.map((name) => {
    const B = basis(name);
    const edges = structs.flatMap((es) => viewEdges(es, B.dir));
    const segs = classify(edges, B, bvh, step, eps, hidden);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of segs) { x0 = Math.min(x0, s.x1, s.x2); x1 = Math.max(x1, s.x1, s.x2); y0 = Math.min(y0, s.y1, s.y2); y1 = Math.max(y1, s.y1, s.y2); }
    if (!segs.length) { x0 = y0 = 0; x1 = y1 = 1; }
    const marks = holes.filter((h) => Math.abs(dot(h.axis, B.back)) > 0.999).map((h) => ({ ...h, x: dot(h.center, B.u), y: dot(h.center, B.v), depth: h.hi - h.lo }));
    return { name, B, segs, box: [x0, y0, x1, y1], w: x1 - x0, h: y1 - y0, marks, hiddenCount: segs.filter((s) => s.hidden).length, visibleCount: segs.filter((s) => !s.hidden).length };
  });
  const byName = Object.fromEntries(vs.map((v) => [v.name, v]));
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
  const pxPerMm = 96 / 25.4; const budget = (width - 60) / sheetW;
  const S = fixedScale ?? (NICE.map((n) => n * pxPerMm).find((s) => s <= budget) ?? NICE[NICE.length - 1] * pxPerMm);
  const ratio = S / pxPerMm; const scaleText = ratio >= 1 ? `${fmt(ratio)}:1` : `1:${fmt(1 / ratio)}`;
  const margin = 30, titleH = 72, below = 64; // px under the lowest view for its dimension, its text and its label; then the title block
  const W = Math.ceil(sheetW * S + 2 * margin + dimRoom * S), H = Math.ceil(sheetH * S + 2 * margin + below + titleH);
  // sheet mm → px: x right, y up
  const X = (v, x) => margin + dimRoom * S + (v.sx + x) * S, Y = (v, y) => margin + (sheetH - (v.sy + y)) * S;
  const parts = [];
  const line = (a, b, c, d, cls) => parts.push(`<line x1="${a.toFixed(2)}" y1="${b.toFixed(2)}" x2="${c.toFixed(2)}" y2="${d.toFixed(2)}" class="${cls}"/>`);
  const text = (x, y, s, cls = 't', anchor = 'middle', rot = 0) => parts.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" class="${cls}" text-anchor="${anchor}"${rot ? ` transform="rotate(${rot} ${x.toFixed(2)} ${y.toFixed(2)})"` : ''}>${esc(s)}</text>`);
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
  const dims = [];
  for (const v of vs) {
    const g = []; const px = (x) => X(v, x), py = (y) => Y(v, y);
    for (const s of v.segs) g.push(`<line x1="${px(s.x1).toFixed(2)}" y1="${py(s.y1).toFixed(2)}" x2="${px(s.x2).toFixed(2)}" y2="${py(s.y2).toFixed(2)}"${s.hidden ? ' class="h"' : ''}/>`);
    parts.push(`<g class="view" data-view="${v.name}">${g.join('')}</g>`);
    // dimensions: width and height on the front (or the first view), depth on the top
    const isFront = v === (front || vs[0]);
    text(px((v.box[0] + v.box[2]) / 2), py(v.box[1]) + 14 + (isFront ? 38 : 0), v.name.toUpperCase(), 'label');
    if (isFront) {
      dim(px(v.box[0]), py(v.box[1]), px(v.box[2]), py(v.box[1]), 18, `${fmt(v.w)}`, true); dims.push({ view: v.name, axis: 'width', value: v.w });
      dim(px(v.box[0]), py(v.box[3]), px(v.box[0]), py(v.box[1]), -18, `${fmt(v.h)}`, false); dims.push({ view: v.name, axis: 'height', value: v.h });
    }
    if (v === top && front) { dim(px(v.box[0]), py(v.box[3]), px(v.box[0]), py(v.box[1]), -18, `${fmt(v.h)}`, false); dims.push({ view: v.name, axis: 'depth', value: v.h }); }
    if (v === right && !front) { dim(px(v.box[0]), py(v.box[1]), px(v.box[2]), py(v.box[1]), 18, `${fmt(v.w)}`, true); dims.push({ view: v.name, axis: 'depth', value: v.w }); }
    // hole callouts: one per diameter, counted, with a leader from the first hole of the group
    const groups = new Map();
    for (const m of v.marks) { const k = `${m.diameter.toFixed(4)}|${m.depth.toFixed(3)}`; (groups.get(k) || groups.set(k, []).get(k)).push(m); }
    let k = 0;
    for (const [, ms] of groups) {
      const m = ms.reduce((a, b) => (b.x > a.x || (b.x === a.x && b.y > a.y) ? b : a));
      const through = m.depth >= (overall.reduce((a, b, i) => (Math.abs(m.axis[i]) > 0.999 ? b : a), m.depth)) - 1e-6;
      const label = `${ms.length > 1 ? ms.length + '× ' : ''}⌀${fmt(m.diameter)}${through ? '' : ' ↧' + fmt(m.depth)}`;
      const ex = px(m.x + m.diameter / 2 * 0.7071), ey = py(m.y + m.diameter / 2 * 0.7071);
      const lx = px(v.box[2]) + 14 + 8 * (k % 2), ly = py(v.box[3]) - 10 - 16 * k;
      line(ex, ey, lx, ly, 'dim'); line(lx, ly, lx + 6, ly, 'dim'); text(lx + 8, ly + 4, label, 'dimtext', 'start');
      k++;
    }
  }
  // title block: sized to its own text (11 px monospace ≈ 6.7 px a character), under everything
  const lines = [`${units} · scale ${scaleText} · third angle`, `${overall.map(fmt).join(' × ')} ${units}${bodies.length > 1 ? ` · ${bodies.length} bodies` : ''}${note ? ' · ' + note : ''}`];
  const tbW = Math.max(180, Math.ceil(Math.max(title.length * 8, ...lines.map((l) => l.length * 6.7)) + 16));
  const tbH = 22 + 15 * lines.length, tbX = Math.max(margin, W - margin - tbW), tbY = H - margin - tbH;
  parts.push(`<g class="title"><rect x="${tbX}" y="${tbY}" width="${tbW}" height="${tbH}" class="tb"/><text x="${tbX + 8}" y="${tbY + 16}" class="tt">${esc(title)}</text>${lines.map((l, i) => `<text x="${tbX + 8}" y="${tbY + 32 + i * 14}" class="t">${esc(l)}</text>`).join('')}</g>`);
  parts.push(`<text x="${margin}" y="${H - margin + 14}" class="t dim">cad.mino.mobi</text>`);
  const style = `<style>svg{background:#fff}.view line{stroke:#111;stroke-width:1.1;stroke-linecap:round;fill:none}.view line.h{stroke:#555;stroke-width:0.8;stroke-dasharray:5 3}.dim{stroke:#1a5cff;stroke-width:0.7;fill:none}.arrow{fill:#1a5cff;stroke:none}text{font:11px ui-monospace,Menlo,Consolas,monospace;fill:#1a5cff}text.label{fill:#111;font-weight:600;letter-spacing:.08em}text.t{fill:#333}.tb{fill:none;stroke:#111;stroke-width:1}.tt{font-size:13px;font-weight:600;fill:#111}</style>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${style}<rect width="${W}" height="${H}" fill="#fff"/>${parts.join('\n')}</svg>`;
  return {
    svg, width: W, height: H, scale: scaleText, units, overall, dims,
    views: vs.map((v) => ({ name: v.name, width: v.w, height: v.h, visible: v.visibleCount, hidden: v.hiddenCount, callouts: v.marks.length })),
    holes: holes.map((h) => ({ body: h.body, names: h.names, diameter: h.diameter, depth: h.hi - h.lo, axis: h.axis, center: h.center })),
    ms: performance.now() - t0,
  };
}
