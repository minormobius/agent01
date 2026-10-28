/* The Cheshire cat lab's checks: the cat (js/cat.js) and the lab's turning (js/lab.js), without a browser.
     node games/cheshire/test/cheshire.selftest.mjs */
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
const here = path.dirname(fileURLToPath(import.meta.url));
const C = await import(path.join(here, "../js/cat.js")), L = await import(path.join(here, "../js/lab.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("✓ " + msg); };
const t0 = Date.now();
const sub = (a, b) => a.map((x, i) => x - b[i]), det3 = (a, b, c) => a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
const rnd = ((s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(11);

/* 1 · it stands: four feet on the floor at the corners of a real tetrahedron of the 3D floor (x, z, w), and its centre
   of mass over that tetrahedron, at every moment of its idle (breathing, the tail swaying through w) */
{
  let worst = 1, vol = 0, onFloor = true;
  for (let k = 0; k < 24; k++) {
    const P = C.pose(k * 0.37), F = C.paws(P).map((p) => [p[0], p[2], p[3]]), c = C.mass(P).c, cf = [c[0], c[2], c[3]];
    onFloor &&= C.paws(P).length === 4 && C.paws(P).every((p) => Math.abs(p[1]) < 1e-9);
    const V = det3(sub(F[1], F[0]), sub(F[2], F[0]), sub(F[3], F[0])) / 6; vol = Math.max(vol, Math.abs(V));
    for (let i = 0; i < 4; i++) { const G = F.slice(); G[i] = cf; worst = Math.min(worst, det3(sub(G[1], G[0]), sub(G[2], G[0]), sub(G[3], G[0])) / 6 / V); }
  }
  ok(onFloor && vol > 1e-3 && worst > 0.15, `it stands: four feet on the floor spanning ${(vol * 1e6).toFixed(0)} cm³ of it, its centre of mass inside (smallest barycentric weight ${worst.toFixed(2)})`);
  // and a rectangle of feet wouldn't: the same feet with the hind pair turned into z are coplanar in the floor
  const P = C.pose(0, { idle: false }), F = C.paws(P).map((p) => [p[0], Math.abs(p[2]) + Math.abs(p[3]) > 0 ? (p[2] || p[3]) : 0, 0]);
  ok(Math.abs(det3(sub(F[1], F[0]), sub(F[2], F[0]), sub(F[3], F[0]))) < 1e-12, "four feet on a rectangle span no volume of a 3D floor: no stance");
}

/* 2 · the distance is safe to march: outside the cat, where rays travel, it never changes faster than the distance
   moved (the shader steps 0.9 of it). Inside, the ellipsoids' approximate distance is steeper, which a ray never sees */
{
  const P = C.pose(1.3); let worst = 0, n0 = 0;
  for (let k = 0; k < 8000; k++) {
    const p = [-0.5 + rnd(), rnd() * 0.65, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.6], dir = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], s = 0.002 + 0.03 * rnd(), n = Math.hypot(...dir);
    const q = p.map((x, i) => x + (dir[i] / n) * s), a = C.sdf(p, P).d, b = C.sdf(q, P).d;
    if (a > 0 && b > 0) { n0++; worst = Math.max(worst, Math.abs(a - b) / s); }
  }
  ok(n0 > 4000 && worst < 1 / 0.9, `outside the cat the distance changes at most ${worst.toFixed(3)} per unit moved (marched at 0.9 a step, so it may not exceed ${(1 / 0.9).toFixed(3)})`);
}

/* 3 · Cheshire: slice by slice. The page's list of what's in your slice (cut) never misses a part that's there; at
   w = 0 the whole cat is one piece; past the tail's sway, only the grin; past the grin's reach, nothing */
{
  const P = C.pose(0, { idle: false }), n = [0, 0, 0, 1];
  const inside = (w, N = 40) => { const found = new Set(); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) { const p = [-0.52 + (0.95 * i) / (N - 1), (0.62 * j) / (N - 1), -0.32 + (0.64 * k) / (N - 1), w], s = C.sdf(p, P); if (s.d < 0) found.add(nearestGroup(p)); } return found; };
  const nearestGroup = (p) => { let best = Infinity, g = null; for (const k of P.caps) { const d = C.capD(p, k); if (d < best) { best = d; g = k.g; } } for (const e of P.ells) { const d = C.ellD(p, e); if (d < best) { best = d; g = e.g; } } return g; };
  let misses = [];
  for (const w of [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.2, 0.25]) { const cut = C.cut(P, n, w).groups; for (const g of inside(w)) if (!cut.includes(g)) misses.push(`${g}@${w}`); }
  ok(!misses.length, `the page's "in your slice" list never misses a part that's there${misses.length ? ": " + misses.join(", ") : ""}`);
  const g0 = C.cut(P, n, 0).groups, gGrin = C.cut(P, n, 0.23).groups, gNone = C.cut(P, n, C.GRIN_W + 0.012).groups;
  ok(g0.length === C.GROUPS.length && gGrin.length === 1 && gGrin[0] === "grin" && !gNone.length && [...inside(0.23, 48)].every((g) => g === "grin") && inside(0.23, 60).size === 1,
    `at w = 0 all of it; at 23 cm only the grin (sampled too); at ${((C.GRIN_W + 0.012) * 100).toFixed(1)} cm nothing`);
}

/* 4 · turning: the lab's turns are rotations, and a quarter turn in zw takes the eyes (set apart in z) out of your slice */
{
  const R = L.rotation({ zw: 0.7, xw: -0.4, yw: 0.2, xz: 1.1 }); let orth = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += R[i * 4 + k] * R[j * 4 + k]; orth = Math.max(orth, Math.abs(s - (i === j ? 1 : 0))); }
  const Q = L.rotation({ zw: Math.PI / 2 }), n = [Q[12], Q[13], Q[14], Q[15]], g = C.cut(C.pose(0, { idle: false }), n, 0).groups;
  ok(orth < 1e-12 && !g.includes("eyes") && g.includes("ears") && g.includes("grin"), "turns are rotations; a quarter turn through w takes the eyes out of your slice and keeps ears and grin");
}

/* 5 · the shader is the same cat: its joins use the materials' thresholds and the join width cat.js uses, and its
   arrays are cat.js's sizes */
{
  const src = fs.readFileSync(path.join(here, "../js/lab.js"), "utf8");
  ok(src.includes(`if (m >= ${C.MAT.pink}. || M >= ${C.MAT.pink}.)`) && src.includes("D = mix(D, d, h) - uK * h * (1. - h)") && src.includes("uniform4fv(U.uCp, f4(caps, (k) => [k.ra, k.rb, k.m, k.wx]))") && src.includes("${LIMITS.caps}"),
    "the shader joins as cat.js does (hard from skin up, smooth fur by mix), and reads the parts' fields in cat.js's order");
}

console.log(fails ? `\n✗ ${fails} of ${checks} cheshire checks failed` : `\n✓ cheshire: ${checks} checks in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fails ? 1 : 0);
