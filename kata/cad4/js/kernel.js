/* CAD⁴ — a solid-modelling kernel for four dimensions. No DOM, no dependencies.

   IMPLICIT, not boundary-representation: a part is a signed distance function, f(p) < 0 inside, built from a FEATURE
   TREE (plain JSON). The tree is the model; everything else (numbers, slices, meshes, the shader) is derived from it.

   THE DIMENSION LADDER. Nothing is drawn in 4D directly. Shapes start in 1D and 2D and climb:
     interval {h}                       1D   |x| ≤ h
     disc {r}, rect {size:[a,b]}, ngon {n, r}                       2D
     ball {dim, r}, box {size:[…]}      any dimension (a box's dimension is its size's length), centred
     product {of:[A, B]}                A in the first coordinates, B in the next: dim A + dim B (disc × disc = duocylinder)
     extrude {of:A, h}                  product with an interval along a new last axis
     revolve {of:A, axis:k}             dim A + 1: A's coordinate k becomes the radius in the plane of k and the new axis
   and in any dimension:
     union / cut / intersect {of:[…]}   (cut: the first minus the rest), optional r: a rounded (smooth) blend
     move {of, by:[…]}   rotate {of, plane:[i, j], deg}   round {of, r}   shell {of, t}   ref {name}
   A lower-dimensional shape used where a higher one is expected is an infinite prism along the missing axes, so cutting a
   4D part with a disc drills a hole (a disc × a plane of it). Numbers may be parameter names or simple expressions of
   them ("2*r", "R+r").

   WHAT IT GIVES: compile(tree) → { dim, sdf(x, y, z, w), bbox, glsl } (the same tree as a JavaScript function and as
   GLSL, parameters as uniforms, so a viewer can turn a hinge without recompiling); measure() (4-volume, the boundary's
   3-volume, centroid, second moments; in 3D the same one dimension down); slice() + mesh() + stl() (a 3D cross-section
   as triangles, exportable); interference() and sweep() (the overlap of two parts, at a pose or along a motion).

   Distances are exact for the primitives, products and revolves, and a lower bound after booleans (enough for sign,
   for marching, and for the measures, which read only the sign and the near field). */

const EXPR = /^[0-9a-zA-Z_+\-*/(). ]+$/, IDENT = /[a-zA-Z_][a-zA-Z_0-9]*/g;
export function num(v, params) {
  if (typeof v === "number") return v;
  if (typeof v !== "string" || !EXPR.test(v)) throw new Error(`not a number or expression: ${JSON.stringify(v)}`);
  const names = Object.keys(params); for (const m of v.match(IDENT) || []) if (!names.includes(m) && !/^e\d*$/.test(m)) throw new Error(`unknown parameter ${m}`); // (nothing but parameters and arithmetic ever reaches Function)
  const out = new Function(...names, `"use strict"; return (${v});`)(...names.map((k) => params[k]));
  if (!Number.isFinite(out)) throw new Error(`expression ${v} is not finite`);
  return out;
}
/* numbers for GLSL: a literal, or (if it mentions a parameter) the same expression over the uniform array */
function gnum(v, params, order) {
  if (typeof v === "number") return lit(v);
  const s = String(v); if (!EXPR.test(s)) throw new Error(`bad expression ${s}`);
  if (!(s.match(IDENT) || []).some((m) => order.includes(m))) return lit(num(v, params));
  return `(${s.replace(/(?<![\w.])(\d+)(?![\w.])/g, "$1.0").replace(IDENT, (m) => { const k = order.indexOf(m); if (k < 0) throw new Error(`unknown parameter ${m}`); return `uP[${k}]`; })})`;
}
const lit = (x) => { const s = String(+x.toFixed(6)); return /[.e]/.test(s) ? s : s + ".0"; };
const INF = 1e9, fin = (v) => Math.abs(v) < 1e8; // (an unbounded side is ±INF, and stays so through moves)

/* ---------------------------------------------------------------- compile
   Every node becomes: dim; f(x, y, z, w) reading its first `dim` arguments; a bounding box; and a GLSL function
   float nK(vec4 p) reading the first `dim` components. */
export function compile(tree, overrides = {}) {
  const params = { ...(tree.params || {}), ...overrides }, order = Object.keys(tree.params || {}), parts = tree.parts || {}, glsl = [], cache = new Map(); let id = 0;
  const N = (v) => num(v, params), GN = (v) => gnum(v, params, order);
  const node = (n) => {
    if (typeof n === "string") n = { op: "ref", name: n };
    if (n.op === "ref") { if (!parts[n.name]) throw new Error(`no part named ${n.name}`); if (!cache.has(n.name)) cache.set(n.name, node(parts[n.name])); return cache.get(n.name); }
    const k = id++, name = `n${k}`, emit = (body) => glsl.push(`float ${name}(vec4 p) { ${body} }`);
    const kids = (n.of ? (Array.isArray(n.of) ? n.of : [n.of]) : []).map(node);
    switch (n.op) {
      case "interval": { const h = N(n.h); emit(`return abs(p.x) - ${GN(n.h)};`); return { dim: 1, f: (x) => Math.abs(x) - h, lo: [-h], hi: [h], name }; }
      case "disc": return node({ op: "ball", dim: 2, r: n.r });
      case "rect": return node({ op: "box", size: n.size });
      case "ball": { const d = n.dim || 4, r = N(n.r); emit(`return length(p.${"xyzw".slice(0, d)}) - ${GN(n.r)};`);
        return { dim: d, f: d === 1 ? (x) => Math.abs(x) - r : d === 2 ? (x, y) => Math.hypot(x, y) - r : d === 3 ? (x, y, z) => Math.hypot(x, y, z) - r : (x, y, z, w) => Math.hypot(x, y, z, w) - r, lo: Array(d).fill(-r), hi: Array(d).fill(r), name }; }
      case "box": { const s = n.size.map(N), d = s.length, h = s.map((v) => v / 2), sw = "xyzw".slice(0, d), V = d === 1 ? "float" : `vec${d}`;
        emit(`${V} q = abs(p.${sw}) - ${d === 1 ? GN(n.size[0]) + " * 0.5" : `${V}(${n.size.map(GN).join(", ")}) * 0.5`}; return ${d === 1 ? "q" : `length(max(q, 0.0)) + min(${d === 2 ? "max(q.x, q.y)" : d === 3 ? "max(q.x, max(q.y, q.z))" : "max(max(q.x, q.y), max(q.z, q.w))"}, 0.0)`};`);
        const [h0, h1 = 0, h2 = 0, h3 = 0] = h, f = (x, y, z, w) => { let q = Math.abs(x) - h0, o = q > 0 ? q * q : 0, m = q; if (d > 1) { q = Math.abs(y) - h1; if (q > 0) o += q * q; if (q > m) m = q; } if (d > 2) { q = Math.abs(z) - h2; if (q > 0) o += q * q; if (q > m) m = q; } if (d > 3) { q = Math.abs(w) - h3; if (q > 0) o += q * q; if (q > m) m = q; } return Math.sqrt(o) + Math.min(m, 0); };
        return { dim: d, f, lo: h.map((v) => -v), hi: h, name }; }
      case "ngon": { const m = n.n, r = N(n.r), a = Math.PI / m, ap = r * Math.cos(a); // a regular polygon, circumradius r: the max over its sides' half-planes (a bound inside the corners' wedges)
        emit(`float an = atan(p.y, p.x), s = ${lit(2 * a)}; an = mod(an + ${lit(a)}, s) - ${lit(a)}; return length(p.xy) * cos(an) - ${GN(n.r)} * ${lit(Math.cos(a))};`);
        return { dim: 2, f: (x, y) => { let an = Math.atan2(y, x); an = ((((an + a) % (2 * a)) + 2 * a) % (2 * a)) - a; return Math.hypot(x, y) * Math.cos(an) - ap; }, lo: [-r, -r], hi: [r, r], name }; }
      case "extrude": return node({ op: "product", of: [n.of, { op: "interval", h: n.h }] });
      case "product": { const [A, B] = kids, da = A.dim, d = da + B.dim; if (d > 4) throw new Error("a product past four dimensions");
        const sh = ["", "p.yzw, 0.0", "p.zw, 0.0, 0.0", "p.w, 0.0, 0.0, 0.0"][da];
        emit(`float a = ${A.name}(p), b = ${B.name}(vec4(${sh})); return min(max(a, b), 0.0) + length(max(vec2(a, b), 0.0));`);
        const fa = A.f, fb = B.f, f = (x, y, z, w) => { const a = fa(x, y, z, w), b = da === 1 ? fb(y, z, w, 0) : da === 2 ? fb(z, w, 0, 0) : fb(w, 0, 0, 0); return Math.min(Math.max(a, b), 0) + Math.hypot(Math.max(a, 0), Math.max(b, 0)); };
        return { dim: d, f, lo: [...A.lo, ...B.lo], hi: [...A.hi, ...B.hi], name }; }
      case "revolve": { const A = kids[0], da = A.dim, k = n.axis || 0; if (da >= 4) throw new Error("nothing to revolve into"); const c = "xyzw";
        emit(`vec4 q = p; q.${c[k]} = length(vec2(p.${c[k]}, p.${c[da]})); q.${c[da]} = 0.0; return ${A.name}(q);`);
        const fa = A.f, f = (x, y, z, w) => { const v = [x, y, z, w]; v[k] = Math.hypot(v[k], v[da]); v[da] = 0; return fa(v[0], v[1], v[2], v[3]); };
        const R = Math.max(Math.abs(A.lo[k]), Math.abs(A.hi[k])), lo = [...A.lo, -R], hi = [...A.hi, R]; lo[k] = -R; hi[k] = R;
        return { dim: da + 1, f, lo, hi, name }; }
      case "union": case "intersect": case "cut": { const d = Math.max(...kids.map((q) => q.dim)), r = n.r ? N(n.r) : 0, sign = n.op === "union" ? 1 : -1;
        // (a smooth blend of radius r: the polynomial smooth-min; for cut and intersect, the same on −f)
        const terms = kids.map((q, i) => (n.op === "cut" && i > 0 ? `-${q.name}(p)` : `${q.name}(p)`));
        const comb = n.op === "union" ? "min" : "max";
        if (r > 0) emit(`float d = ${terms[0]}, k = ${GN(n.r)}; ${terms.slice(1).map((t) => `{ float e = ${t}, h = max(k - abs(d - e), 0.0) / k; d = ${comb}(d, e) ${n.op === "union" ? "-" : "+"} h * h * k * 0.25; }`).join(" ")} return d;`);
        else emit(`float d = ${terms[0]}; ${terms.slice(1).map((t) => `d = ${comb}(d, ${t});`).join(" ")} return d;`);
        const fs = kids.map((q) => q.f), cutting = n.op === "cut";
        const f = (x, y, z, w) => { let dd = fs[0](x, y, z, w); for (let i = 1; i < fs.length; i++) { let e = fs[i](x, y, z, w); if (cutting) e = -e;
          if (r > 0) { const h = Math.max(r - Math.abs(dd - e), 0) / r; dd = (sign > 0 ? Math.min(dd, e) - h * h * r * 0.25 : Math.max(dd, e) + h * h * r * 0.25); } else dd = sign > 0 ? Math.min(dd, e) : Math.max(dd, e); } return dd; };
        const pad = (q) => ({ lo: [...q.lo, ...Array(d - q.dim).fill(-INF)], hi: [...q.hi, ...Array(d - q.dim).fill(INF)] }), bs = kids.map(pad); let lo, hi;
        if (n.op === "union") { lo = bs[0].lo.map((_, i) => Math.min(...bs.map((b) => b.lo[i]))); hi = bs[0].hi.map((_, i) => Math.max(...bs.map((b) => b.hi[i]))); }
        else if (n.op === "intersect") { lo = bs[0].lo.map((_, i) => Math.max(...bs.map((b) => b.lo[i]))); hi = bs[0].hi.map((_, i) => Math.min(...bs.map((b) => b.hi[i]))); }
        else ({ lo, hi } = bs[0]);
        return { dim: d, f, lo, hi, name }; }
      case "move": { const A = kids[0], by = [0, 0, 0, 0]; n.by.forEach((v, i) => (by[i] = N(v))); const d = Math.max(A.dim, n.by.length), g = [0, 1, 2, 3].map((i) => (n.by[i] !== undefined ? GN(n.by[i]) : "0.0"));
        emit(`return ${A.name}(p - vec4(${g.join(", ")}));`); const fa = A.f;
        const lo = [...A.lo, ...Array(d - A.dim).fill(-INF)].map((v, i) => (fin(v) ? v + by[i] : v)), hi = [...A.hi, ...Array(d - A.dim).fill(INF)].map((v, i) => (fin(v) ? v + by[i] : v));
        return { dim: d, f: (x, y, z, w) => fa(x - by[0], y - by[1], z - by[2], w - by[3]), lo, hi, name }; }
      case "rotate": { const A = kids[0], [i, j] = n.plane, th = (N(n.deg) * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th), d = Math.max(A.dim, i + 1, j + 1), cc = "xyzw";
        // (the point is turned back by the angle: the shape turns forward, coordinate i toward j)
        emit(`float t = radians(${GN(n.deg)}), c = cos(t), s = sin(t); vec4 q = p; q.${cc[i]} = c * p.${cc[i]} + s * p.${cc[j]}; q.${cc[j]} = -s * p.${cc[i]} + c * p.${cc[j]}; return ${A.name}(q);`);
        const fa = A.f, f = (x, y, z, w) => { const v = [x, y, z, w], a = v[i], b = v[j]; v[i] = c * a + s * b; v[j] = -s * a + c * b; return fa(v[0], v[1], v[2], v[3]); };
        const lo = [...A.lo, ...Array(d - A.dim).fill(-INF)], hi = [...A.hi, ...Array(d - A.dim).fill(INF)];
        if (fin(lo[i]) && fin(hi[i]) && fin(lo[j]) && fin(hi[j])) { const ci = (lo[i] + hi[i]) / 2, cj = (lo[j] + hi[j]) / 2, ei = (hi[i] - lo[i]) / 2, ej = (hi[j] - lo[j]) / 2, mi = c * ci - s * cj, mj = s * ci + c * cj, ri = Math.abs(c) * ei + Math.abs(s) * ej, rj = Math.abs(s) * ei + Math.abs(c) * ej; lo[i] = mi - ri; hi[i] = mi + ri; lo[j] = mj - rj; hi[j] = mj + rj; }
        else { lo[i] = lo[j] = -INF; hi[i] = hi[j] = INF; }
        return { dim: d, f, lo, hi, name }; }
      case "scale": { const A = kids[0], k = N(n.k); emit(`return ${A.name}(p / ${GN(n.k)}) * ${GN(n.k)};`); const fa = A.f; return { dim: A.dim, f: (x, y, z, w) => fa(x / k, y / k, z / k, w / k) * k, lo: A.lo.map((v) => v * k), hi: A.hi.map((v) => v * k), name }; }
      case "round": { const A = kids[0], r = N(n.r); emit(`return ${A.name}(p) - ${GN(n.r)};`); const fa = A.f; return { dim: A.dim, f: (x, y, z, w) => fa(x, y, z, w) - r, lo: A.lo.map((v) => v - r), hi: A.hi.map((v) => v + r), name }; }
      case "shell": { const A = kids[0], t = N(n.t) / 2; emit(`return abs(${A.name}(p)) - ${GN(n.t)} * 0.5;`); const fa = A.f; return { dim: A.dim, f: (x, y, z, w) => Math.abs(fa(x, y, z, w)) - t, lo: A.lo.map((v) => v - t), hi: A.hi.map((v) => v + t), name }; }
      default: throw new Error(`unknown op ${n.op}`);
    }
  };
  /* show: a part, or a list of parts (an assembly: their union, each also kept on its own so a viewer can tell them apart) */
  const show = tree.show !== undefined ? tree.show : tree, list = Array.isArray(show) ? show : null;
  const root = node(list ? { op: "union", of: list } : show), each = list ? list.map(node) : [root];
  const head = order.length ? `uniform float uP[${order.length}];\n` : "", tail = each.map((q, i) => `float part${i}(vec4 p) { return ${q.name}(p); }`).join("\n");
  return { dim: root.dim, sdf: root.f, bbox: { lo: root.lo, hi: root.hi }, glsl: `${head}${glsl.join("\n")}\n${tail}\nfloat sdf(vec4 p) { return ${root.name}(p); }`, parts: each.map((q, i) => ({ name: list && typeof list[i] === "string" ? list[i] : `part ${i}`, dim: q.dim, sdf: q.f, bbox: { lo: q.lo, hi: q.hi } })), params, order };
}

/* ---------------------------------------------------------------- measure
   Over the bounding box, on a grid of n cells along the longest side. A cell whose middle is further from the surface
   than the surface could reach into it is all in or all out (the function never changes faster than distance, so
   that test is safe); the rest are cut `sub` ways along every axis and each piece counted by how much of it is
   inside, from the distance at its middle. That gives the volume (4-volume in 4D), the centroid and the second
   moments about it; the boundary's measure is the same sum with a hat on |f| two pieces wide (a width that is a
   whole number of samples, so a flat face on the grid is counted exactly). `sharp` counts a piece only if its middle is
   inside (for overlaps: two parts a hair apart must read as exactly nothing). `least` is the lowest value met.
   A shape marked `grad` (a slice: its function is a distance in 4D, shallower along the cut) has its hat weighted by |∇f|. */
export function measure(shape, n = [0, 4000, 400, 96, 32][shape.dim], sub = 3, sharp = false) {
  const d = shape.dim, { lo, hi } = shape.bbox, f = shape.sdf; if (!lo.every(fin) || !hi.every(fin)) throw new Error("the part is unbounded (a lower-dimensional shape needs a product, an extrude or an intersect to close it)");
  const L = lo.map((v, i) => hi[i] - v), h = Math.max(...L, 1e-9) / n, cnt = [1, 1, 1, 1], o = [0, 0, 0, 0], sb = [1, 1, 1, 1];
  for (let i = 0; i < d; i++) { cnt[i] = Math.max(1, Math.ceil(L[i] / h - 1e-9)) + 2; o[i] = (lo[i] + hi[i]) / 2 - (cnt[i] * h) / 2 + h / 2; sb[i] = sub; }
  const hs = h / sub, eps = 2 * hs, thr = (h * Math.sqrt(d) / 2) * (1 - 1 / sub) + eps, ws = 1 / sub ** d, so = -h / 2 + hs / 2;
  const c = [0, 0, 0, 0], M = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; let V = 0, S = 0, least = Infinity;
  const add = (m, x, y, z, w) => { V += m; c[0] += m * x; c[1] += m * y; c[2] += m * z; c[3] += m * w; M[0] += m * x * x; M[1] += m * x * y; M[2] += m * x * z; M[3] += m * x * w; M[5] += m * y * y; M[6] += m * y * z; M[7] += m * y * w; M[10] += m * z * z; M[11] += m * z * w; M[15] += m * w * w; };
  for (let l = 0; l < cnt[3]; l++) { const pw = d > 3 ? o[3] + l * h : 0; for (let k = 0; k < cnt[2]; k++) { const pz = d > 2 ? o[2] + k * h : 0; for (let j = 0; j < cnt[1]; j++) { const py = d > 1 ? o[1] + j * h : 0; for (let i = 0; i < cnt[0]; i++) { const px = o[0] + i * h;
    const dist = f(px, py, pz, pw); if (dist < least) least = dist; if (dist > thr) continue; if (dist < -thr) { add(1, px, py, pz, pw); continue; }
    for (let e = 0; e < sb[3]; e++) { const qw = d > 3 ? pw + so + e * hs : 0; for (let g = 0; g < sb[2]; g++) { const qz = d > 2 ? pz + so + g * hs : 0; for (let b = 0; b < sb[1]; b++) { const qy = d > 1 ? py + so + b * hs : 0; for (let a = 0; a < sb[0]; a++) { const qx = px + so + a * hs;
      const ds = f(qx, qy, qz, qw); if (ds < least) least = ds; if (ds >= eps) continue;
      if (ds > -eps) { let g = 1; if (shape.grad) { const e = hs * 0.25, gx = f(qx + e, qy, qz, qw) - ds, gy = d > 1 ? f(qx, qy + e, qz, qw) - ds : 0, gz = d > 2 ? f(qx, qy, qz + e, qw) - ds : 0, gw = d > 3 ? f(qx, qy, qz, qw + e) - ds : 0; g = Math.hypot(gx, gy, gz, gw) / e; } S += ((1 - Math.abs(ds) / eps) / eps) * ws * g; }
      const occ = sharp ? (ds < 0 ? 1 : 0) : ds < -hs ? 1 : ds > hs ? 0 : 0.5 - ds / (2 * hs); if (occ > 0) add(occ * ws, qx, qy, qz, qw); } } } } } } } }
  const cell = h ** d, cen = c.slice(0, d).map((v) => v / (V || 1)), mom = Array.from({ length: d }, (_, a) => Array.from({ length: d }, (_, b) => (M[4 * Math.min(a, b) + Math.max(a, b)] / (V || 1) - cen[a] * cen[b]) * V * cell));
  return { dim: d, volume: V * cell, boundary: S * cell, centroid: cen, moments: mom, bbox: { lo: lo.slice(), hi: hi.slice() }, h: hs, least };
}
/* the moment of inertia for turning in the plane of axes i and j (about the centroid, unit density): in 4D a rotation
   has a plane, not an axis, and there are six of them */
export const inertia = (m, i, j) => m.moments[i][i] + m.moments[j][j];

/* ---------------------------------------------------------------- slice, mesh, STL */
/* a 3D cross-section of a 4D part: the part's function along the 3-flat through `origin` spanned by three orthonormal
   directions E (default: x, y, z at w = origin's w); with a bounding box in the slice's own coordinates */
export function slice(shape, origin = [0, 0, 0, 0], E = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]) {
  const f = shape.sdf, { lo, hi } = shape.bbox, O = origin, c = lo.map((v, i) => (v + hi[i]) / 2), R = Math.hypot(...lo.map((v, i) => (hi[i] - v) / 2));
  const cs = E.map((e) => e.reduce((s, v, i) => s + v * (c[i] - O[i]), 0));
  return { dim: 3, grad: true, sdf: (x, y, z) => f(O[0] + x * E[0][0] + y * E[1][0] + z * E[2][0], O[1] + x * E[0][1] + y * E[1][1] + z * E[2][1], O[2] + x * E[0][2] + y * E[1][2] + z * E[2][2], O[3] + x * E[0][3] + y * E[1][3] + z * E[2][3]), bbox: { lo: cs.map((v) => v - R), hi: cs.map((v) => v + R) } };
}
/* a 3D shape's boundary as triangles (marching tetrahedra: each grid cube cut into six, each tetrahedron's crossing a
   triangle or two, corners placed by linear interpolation; wound outward). Returns positions (9 numbers a triangle)
   and the enclosed volume and area the triangles themselves give */
export function mesh(shape3, n = 56) {
  const { lo, hi } = shape3.bbox, f = shape3.sdf, L = lo.map((v, i) => hi[i] - v), h = Math.max(...L) / n, cnt = L.map((v) => Math.max(1, Math.ceil(v / h)) + 2), o = lo.map((v) => v - h);
  const nx = cnt[0] + 1, ny = cnt[1] + 1, nz = cnt[2] + 1, val = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) val[i + nx * (j + ny * k)] = f(o[0] + i * h, o[1] + j * h, o[2] + k * h, 0);
  const tri = [], TETS = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]], CORN = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const P = new Float64Array(24), D = new Float64Array(8); let vol = 0, area = 0;
  const emit = (a, b, c, inside) => { // wind the triangle so its normal points away from the inside corner
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; let nxv = uy * vz - uz * vy, nyv = uz * vx - ux * vz, nzv = ux * vy - uy * vx;
    if (nxv * (inside[0] - a[0]) + nyv * (inside[1] - a[1]) + nzv * (inside[2] - a[2]) > 0) { const t = b; b = c; c = t; nxv = -nxv; nyv = -nyv; nzv = -nzv; }
    tri.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); area += 0.5 * Math.hypot(nxv, nyv, nzv); vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; };
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let any = 0; for (let q = 0; q < 8; q++) { const [a, b, c] = CORN[q]; D[q] = val[i + a + nx * (j + b + ny * (k + c))]; P[3 * q] = o[0] + (i + a) * h; P[3 * q + 1] = o[1] + (j + b) * h; P[3 * q + 2] = o[2] + (k + c) * h; if (D[q] < 0) any |= 1; else any |= 2; }
    if (any !== 3) continue;
    for (const t of TETS) { const ins = t.filter((q) => D[q] < 0), out = t.filter((q) => D[q] >= 0); if (!ins.length || !out.length) continue;
      const X = (a, b) => { const u = D[a] / (D[a] - D[b]); return [P[3 * a] + u * (P[3 * b] - P[3 * a]), P[3 * a + 1] + u * (P[3 * b + 1] - P[3 * a + 1]), P[3 * a + 2] + u * (P[3 * b + 2] - P[3 * a + 2])]; }, pt = (q) => [P[3 * q], P[3 * q + 1], P[3 * q + 2]];
      if (ins.length === 1) emit(X(ins[0], out[0]), X(ins[0], out[1]), X(ins[0], out[2]), pt(ins[0]));
      else if (ins.length === 3) { const a = X(ins[0], out[0]), b = X(ins[1], out[0]), c = X(ins[2], out[0]), far = pt(out[0]), m = [2 * a[0] - far[0], 2 * a[1] - far[1], 2 * a[2] - far[2]]; emit(a, b, c, m); }
      else { const a = X(ins[0], out[0]), b = X(ins[0], out[1]), c = X(ins[1], out[1]), e = X(ins[1], out[0]), inn = pt(ins[0]); emit(a, b, c, inn); emit(a, c, e, inn); } }
  }
  return { tri: Float32Array.from(tri), count: tri.length / 9, volume: Math.abs(vol), area, h };
}
/* binary STL of a mesh (a Uint8Array) */
export function stl(m, name = "cad4 slice") {
  const n = m.count, buf = new ArrayBuffer(84 + 50 * n), dv = new DataView(buf), u8 = new Uint8Array(buf); for (let i = 0; i < Math.min(79, name.length); i++) u8[i] = name.charCodeAt(i) & 127;
  dv.setUint32(80, n, true);
  for (let t = 0; t < n; t++) { const o = 84 + 50 * t, p = m.tri.subarray(9 * t, 9 * t + 9), ux = p[3] - p[0], uy = p[4] - p[1], uz = p[5] - p[2], vx = p[6] - p[0], vy = p[7] - p[1], vz = p[8] - p[2]; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true); for (let q = 0; q < 9; q++) dv.setFloat32(o + 12 + 4 * q, p[q], true); }
  return u8;
}

/* ---------------------------------------------------------------- assemblies: interference, and through a motion */
/* how two parts of one tree fit, with parameters overridden: the volume they share (counted sharply: nothing means no
   sample of the grid is inside both, so an overlap thinner than `h` can hide), and, when they share nothing, the gap
   between them (twice the least of max(fa, fb), which is met midway between two parts; good to about h) */
export function fit(tree, a, b, overrides = {}, n) {
  const s = compile({ ...tree, show: { op: "intersect", of: [a, b] } }, overrides); if (s.bbox.lo.some((v, i) => v >= s.bbox.hi[i])) return { overlap: 0, gap: Infinity, h: 0 };
  const g = 0.25, big = { ...s, bbox: { lo: s.bbox.lo.map((v) => v - g), hi: s.bbox.hi.map((v) => v + g) } }, m = measure(big, n ?? [0, 2000, 240, 64, 24][s.dim], 3, true);
  return { overlap: m.volume, gap: m.volume > 0 ? 0 : Math.max(0, 2 * m.least), h: m.h };
}
export const interference = (tree, a, b, overrides, n) => fit(tree, a, b, overrides, n).overlap;
/* the same through a motion: either one parameter stepped from `from` to `to`, or a path (a list of overrides, each leg
   walked in `steps`); returns every step's overlap and the worst */
export function sweep(tree, a, b, param, from, to, steps = 12, n) {
  const path = Array.isArray(param) ? param : [{ [param]: from }, { [param]: to }], legs = Array.isArray(param) ? (from ?? 6) : steps, nn = Array.isArray(param) ? to : n, out = [];
  for (let s = 0; s + 1 < path.length; s++) for (let k = s ? 1 : 0; k <= legs; k++) { const at = {}; for (const key of Object.keys(path[s + 1])) { const u = path[s][key] ?? (tree.params || {})[key]; at[key] = u + ((path[s + 1][key] - u) * k) / legs; }
    out.push({ ...at, overlap: interference(tree, a, b, { ...path[s], ...at }, nn) }); }
  return { steps: out, worst: Math.max(...out.map((q) => q.overlap)) };
}
