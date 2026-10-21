/* Foam⁴'s geometry, checked: the four species are what they say, the nearest-seed walk agrees with
   brute force, every slice is an exact partition of its box, the random foam's slices obey Plateau's
   topology, the 4D Kelvin foam sliced square to w is Kelvin's 3D foam, and the events run backwards
   when the slice does.
     node games/foam4/test/foam4.selftest.mjs   (a few s) */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const { SPECIES, nearest, seedOf, slice, frame, events, faceKinds } = await import(path.join(here, "../js/foam.js"));
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

{
  let good = true;
  for (const f of fs.readdirSync(path.join(here, "../js"))) {
    const r = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: fs.readFileSync(path.join(here, "../js", f)), encoding: "utf8" });
    if (r.status !== 0) { good = false; console.error(f, r.stderr); }
  }
  ok(good, "every script in js/ parses");
}

/* the species */
const det = (m) => { const d3 = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]); let d = 0; for (let c = 0; c < 4; c++) d += (c % 2 ? -1 : 1) * m[0][c] * d3([1, 2, 3].map((r) => m[r].filter((_, j) => j !== c))); return d; };
for (const [k, n] of [["a4", 30], ["d4", 24], ["z4", 8]]) {
  const sp = SPECIES[k];
  ok(Math.abs(Math.abs(det(sp.B)) - 1) < 1e-9, `${sp.name}: one seed per unit of 4D volume`);
  ok(sp.rel.length === n && sp.relK.every((v, i) => seedOf(sp, v).every((x, j) => Math.abs(x - sp.rel[i][j]) < 1e-9)), `${sp.name}: ${n} relevant vectors, each a lattice vector`);
}
/* nearest: the descent agrees with brute force */
for (const [k, sp] of Object.entries(SPECIES)) {
  let bad = 0;
  for (let t = 0; t < 200; t++) {
    const p = [0, 1, 2, 3].map(() => (rnd() - 0.5) * 8), n = nearest(sp, p), dn = Math.hypot(...p.map((v, i) => v - n.s[i]));
    let bd = Infinity;
    const base = sp.kind === "lattice" ? sp.coords(p).map(Math.round) : p.map(Math.floor), R = sp.kind === "lattice" ? 3 : 2;
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let c = -R; c <= R; c++) for (let d = -R; d <= R; d++) { const s = seedOf(sp, [base[0] + a, base[1] + b, base[2] + c, base[3] + d]); bd = Math.min(bd, Math.hypot(...p.map((v, i) => v - s[i]))); }
    if (dn > bd + 1e-9) bad++;
  }
  ok(!bad, `${k}: the nearest seed, found by walking the neighbours, is the nearest by brute force (200 points)`);
}
/* every slice partitions its box exactly */
for (const [k, sp] of Object.entries(SPECIES)) {
  let worst = 0;
  for (let t = 0; t < 4; t++) {
    const S = slice(sp, { C: [0, 1, 2, 3].map(() => rnd() * 9), F: frame(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5), B: 1.1 });
    worst = Math.max(worst, Math.abs(S.cells.reduce((s, c) => s + c.volume, 0) / 2.2 ** 3 - 1));
  }
  ok(worst < 1e-9, `${k}: the slice's cells fill its box exactly, tilted any way (worst ${worst.toExponential(1)})`);
}
/* the random foam is generic: its slices obey Plateau's topology */
{
  const S = slice(SPECIES.random, { C: [3.3, 1.7, 2.9, 0.41], F: frame(0.3, -0.2, 0.1), B: 1.4 });
  const vtx = new Map(), edg = new Map(), K = (p) => p.map((v) => v.toFixed(6)).join(",");
  for (const c of S.cells) {
    const vs = new Set(), es = new Set();
    for (const f of c.poly) for (let i = 0; i < f.pts.length; i++) { const a = K(f.pts[i]), b = K(f.pts[(i + 1) % f.pts.length]); vs.add(a); es.add(a < b ? a + "|" + b : b + "|" + a); }
    for (const v of vs) vtx.set(v, (vtx.get(v) || 0) + 1);
    for (const e of es) edg.set(e, (edg.get(e) || 0) + 1);
  }
  const B = 1.4 - 1e-6, inside = (k) => k.split(",").every((x) => Math.abs(+x) < B);
  const vIn = [...vtx].filter(([k]) => inside(k)), eIn = [...edg].filter(([k]) => k.split("|").every(inside));
  ok(vIn.length > 20 && vIn.every(([, n]) => n === 4), `random: every vertex inside the box is shared by exactly 4 cells (${vIn.length} of them)`);
  ok(eIn.length > 40 && eIn.every(([, n]) => n === 3), `random: every edge inside the box by exactly 3 (${eIn.length})`);
}
/* the 4D Kelvin foam, sliced square to w, is Kelvin's; the tesseract foam is cubes */
{
  const S = slice(SPECIES.a4, { C: [0.37, 0.21, 0.13, 0], F: frame(), B: 1.3 }), k = S.focus && faceKinds(S.focus);
  ok(k && k[4] === 6 && k[6] === 8 && Object.keys(k).length === 2, "A₄* square to w at w = 0: truncated octahedra (6 squares, 8 hexagons), Kelvin's foam");
  const Z = slice(SPECIES.z4, { C: [0.37, 0.21, 0.13, 0.3], F: frame(), B: 1.3 }), z = Z.focus && faceKinds(Z.focus);
  ok(z && z[4] === 6 && Object.keys(z).length === 1 && Math.abs(Z.focus.volume - 1) < 1e-9, "Z⁴ square to w: unit cubes");
}
/* events: sweep w forward, then back; what was born going one way dies going the other */
{
  const F = frame(0.11, -0.07, 0.05), at = (w) => slice(SPECIES.random, { C: [0.37, 0.21, 0.13, 0].map((v, i) => v + w * F.N[i]), F, B: 1.2 });
  const ws = []; for (let w = 0; w <= 0.6 + 1e-9; w += 0.02) ws.push(+w.toFixed(4));
  const fwd = { births: 0, deaths: 0, opened: 0, closed: 0 }, back = { ...fwd };
  let prev = null; for (const w of ws) { const S = at(w), e = events(prev, S); for (const x in fwd) fwd[x] += e[x].length; prev = S; }
  prev = null; for (const w of ws.slice().reverse()) { const S = at(w), e = events(prev, S); for (const x in back) back[x] += e[x].length; prev = S; }
  ok(fwd.births + fwd.deaths + fwd.opened + fwd.closed > 0, `a sweep through the random foam sees events (${JSON.stringify(fwd)})`);
  ok(fwd.births === back.deaths && fwd.deaths === back.births && fwd.opened === back.closed && fwd.closed === back.opened, "and sweeping back runs every one of them backwards");
}

console.log(fails ? `\n✗ ${fails} of ${checks} foam4 checks failed` : `foam4: ${checks} checks\n\n✓ foam4 selftest passed`);
process.exit(fails ? 1 : 0);
