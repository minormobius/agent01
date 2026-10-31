/* Tessera's laws: the tiling of the torus stays a tiling however it morphs.
   Cells never appear or vanish, every wall is one curve shared by two cells,
   V − E + F = 0, every point of the board belongs to exactly one cell, area
   moves only as a flux, and a neighbour is gained or lost only where a wall
   passes through zero length.
     node games/tessera/test/tessera.selftest.mjs   (~1 s) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const { Tiling, morph, FIGURES, MODES, T_, arc } = await import(path.join(here, "../js/tiling.js"));
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const randomise = (T, fig) => {
  T.fig1 = FIGURES[fig];
  for (let i = 0; i < T.N; i++) { T.h[i] = (2 * rnd() - 1) * T_.HMAX; T.phiA[i] = rnd(); T.phiB[i] = rnd(); }
};
const allSimple = (T) => { for (let i = 0; i < T.N; i++) if (!T.simple(i)) return false; return true; };

/* ---- every page script parses as a module */
{
  const js = fs.readdirSync(path.join(here, "../js")).filter((f) => f.endsWith(".js"));
  const bad = js.filter((f) => spawnSync(process.execPath, ["--input-type=module", "--check"], { input: fs.readFileSync(path.join(here, "../js", f)) }).status !== 0);
  ok(js.length >= 2 && !bad.length, "every page script parses (" + js.length + " files" + (bad.length ? "; broken: " + bad.join(", ") : "") + ")");
}

/* ---- the two pure states */
const T = new Tiling(12, 10);
{
  T.h.fill(0);
  const c = T.census();
  ok(c.chi === 0 && c.fbar === 4 && c.vbar === 4 && c.amin === 1 && c.amax === 1, "squares: V − E + F = " + c.V + " − " + c.E + " + " + c.F + " = 0, four neighbours, four cells at a corner, every cell area 1");
  for (const h of [T_.HMAX, -T_.HMAX]) {
    T.h.fill(h);
    const c = T.census(), L = T.sides(0).map((s) => Math.hypot(s.Q[0] - s.P[0], s.Q[1] - s.P[1]));
    ok(c.chi === 0 && c.fbar === 6 && c.vbar === 3 && Math.abs(c.amax - 1) < 1e-12 && Math.abs(c.amin - 1) < 1e-12 && L.every((l) => Math.abs(l - L[0]) < 1e-12),
      "hexagons leaning " + (h > 0 ? "up" : "down") + ": six neighbours, three cells at a corner, six walls of one length (" + L[0].toFixed(4) + ")");
  }
}

/* ---- any morph at all: random corners, random wall shapes */
{
  let euler = true, ident = true, area = true, simple = true, nb = true, sym = true, shared = true;
  for (let r = 0; r < 12; r++) {
    randomise(T, ["fish", "bulge", "plain"][r % 3]);
    const c = T.census();
    if (c.chi !== 0) euler = false;
    if (Math.abs(1 / c.fbar + 1 / c.vbar - 0.5) > 1e-12 || c.fbar > 6) ident = false;
    if (Math.abs(c.atot - T.N) > 1e-9) area = false;
    if (!allSimple(T)) simple = false;
    for (let i = 0; i < T.N; i++) {
      const sd = T.sides(i), [x, y] = T.xy(i);
      if (sd.length < 4 || sd.length > 8) nb = false;
      for (const s of sd) {
        // the neighbour sees the same wall, walked the other way, one step across
        const back = T.sides(s.nb).find((o) => o.id === s.id && o.dx === -s.dx && o.dy === -s.dy);
        if (!back) { sym = false; continue; }
        const [nx, ny] = T.xy(s.nb), ex = x + s.dx - nx, ey = y + s.dy - ny;   // where the neighbour's frame sits in ours
        const mine = arc(s.P0, s.Q0, s.c, 12), theirs = arc(back.P0, back.Q0, back.c, 12);
        if (back.rev === s.rev || mine.some((p, k) => Math.abs(p[0] - theirs[k][0] - ex) > 1e-12 || Math.abs(p[1] - theirs[k][1] - ey) > 1e-12)) shared = false;
      }
    }
  }
  ok(euler, "V − E + F = 0 on every morph, counted from the walls themselves");
  ok(ident, "1/f̄ + 1/v̄ = 1/2 exactly on every morph, and no board averages more than six neighbours");
  ok(nb, "every cell has between four and eight neighbours");
  ok(sym, "neighbourhood is symmetric: if a touches b, b touches a, across the same wall");
  ok(shared, "every wall is one curve: both cells draw exactly the same points");
  ok(area, "the board's total area is exactly " + T.N + " on every morph");
  ok(simple, "the demo wall shapes never cross themselves or each other, on random corners");
}

/* ---- coverage: every point belongs to exactly one cell */
{
  randomise(T, "fish");
  const outs = Array.from({ length: T.N }, (_, i) => T.outline(i, 16));
  const inside = (pts, u, v) => {
    let s = false;
    for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) {
      const a = pts[k], b = pts[j];
      if ((a[1] > v) !== (b[1] > v) && u < ((b[0] - a[0]) * (v - a[1])) / (b[1] - a[1]) + a[0]) s = !s;
    }
    return s;
  };
  let good = 0;
  const M = 4000;
  for (let m = 0; m < M; m++) {
    const u = rnd() * T.W, v = rnd() * T.H;
    let hits = 0;
    for (let i = 0; i < T.N; i++) {
      const [x, y] = T.xy(i);
      for (const a of [-T.W, 0, T.W]) for (const b of [-T.H, 0, T.H]) {
        const pu = u + a, pv = v + b;
        if (pu < x - 1.5 || pu > x + 2.5 || pv < y - 1.5 || pv > y + 2.5) continue;
        if (inside(outs[i], pu, pv)) hits++;
      }
    }
    if (hits === 1) good++;
  }
  ok(good === M, good + " of " + M + " random points lie in exactly one cell: no gaps, no overlaps");
}

/* ---- area is a flux */
{
  const sampled = (i) => { const p = T.outline(i, 400); let a = 0; for (let k = 0; k < p.length; k++) { const q = p[(k + 1) % p.length]; a += p[k][0] * q[1] - q[0] * p[k][1]; } return a / 2; };
  randomise(T, "bulge");
  ok([0, 7, 33, 90].every((i) => Math.abs(T.area(i) - sampled(i)) < 2e-4), "the exact area (corners plus c₁ of each wall) matches the drawn outline");
  const spread = () => { const c = T.census(); return [c.amax - c.amin, c.atot]; };
  T.h.fill(0.17); T.fig1 = FIGURES.bulge; T.phiA.fill(0.6); T.phiB.fill(0.6);
  ok(spread()[0] < 1e-12, "a uniform morph keeps every cell at area 1, even with walls that bulge");
  T.fig1 = FIGURES.fish; for (let i = 0; i < T.N; i++) { T.phiA[i] = rnd(); T.phiB[i] = rnd(); }
  ok(spread()[0] < 1e-12, "S-curves with no c₁ can vary wall by wall, and every cell keeps area 1");
  T.fig1 = FIGURES.bulge;
  const [sb, tb] = spread();
  ok(sb > 0.05 && Math.abs(tb - T.N) < 1e-9, "bulging walls that vary move area: cells spread over " + sb.toFixed(3) + ", the total stays " + T.N);
  T.fig1 = FIGURES.plain;
  let wave = 0, ripple = 0, tot = 0;
  for (let t = 0; t < 12; t += 0.5) {
    morph(T, "wave", t); wave = Math.max(wave, spread()[0]);
    morph(T, "ripple", t); const [s, a] = spread(); ripple = Math.max(ripple, s); tot = Math.max(tot, Math.abs(a - T.N));
  }
  ok(wave < 1e-12, "a straight front (the corners vary along x only) keeps every cell at area 1");
  ok(ripple > 0.1 && tot < 1e-9, "a curved front moves area between cells (up to " + ripple.toFixed(3) + "); the total holds");
}

/* ---- topology changes only where a wall has no length */
{
  for (const mode of ["breathe", "wave"]) {
    let prev = null, prevH = null, joins = 0, pinches = 0, worst = 0, consistent = true;
    for (let t = 0; t < 24; t += 0.01) {
      morph(T, mode, t);
      const s = T.states();
      if (prev) for (let k = 0; k < T.N; k++) if (s[k] !== prev[k]) {
        if (prev[k]) pinches++; if (s[k]) joins++;
        worst = Math.max(worst, 2 * Math.SQRT2 * Math.max(Math.abs(T.h[k]), Math.abs(prevH[k])));
      }
      if (prev) {
        const was = prev.reduce((a, v) => a + (v !== 0), 0), now = s.reduce((a, v) => a + (v !== 0), 0);
        const gained = s.reduce((a, v, k) => a + (v && !prev[k] ? 1 : 0), 0), lost = s.reduce((a, v, k) => a + (!v && prev[k] ? 1 : 0), 0);
        if (now - was !== gained - lost) consistent = false;
      }
      prev = s; prevH = Float64Array.from(T.h);
    }
    ok(joins > 0 && pinches > 0 && consistent && worst < 0.03, mode + ": " + joins + " joins and " + pinches + " pinches over two cycles, every one where the wall was under " + worst.toFixed(3) + " long");
  }
}

/* ---- the demos */
{
  let clean = true, tangles = 0;
  for (const fig of ["plain", "fish", "bulge"]) for (const mode of Object.keys(MODES)) {
    T.fig1 = FIGURES[fig];
    for (let t = 0; t < 34; t += 0.7) { morph(T, mode, t); if (!allSimple(T)) clean = false; }
  }
  T.fig1 = FIGURES.tangle;
  for (let t = 0; t < 34; t += 1) { morph(T, "wave", t); for (let i = 0; i < T.N; i++) if (!T.simple(i)) tangles++; }
  ok(clean, "plain, fish and bulge stay untangled through every mode");
  ok(tangles > 0, "tangle tangles (" + tangles + " cell-frames), so the check that catches it is live");
}

console.log(fails ? `tessera: ${fails} of ${checks} checks FAILED` : `tessera: all ${checks} checks ok`);
process.exit(fails ? 1 : 0);
