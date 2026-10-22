/* PLATEAU, checked: the craft stays a rigid frame however it's flown, the coupling tips the nose
   into w by exactly what it says, the foam's seeds agree with a brute-force search and with the
   shader's hashing, the clearance is a true distance (never more than the wall, never jumping more
   than you moved), the cell you're in is never solid, the phases are continuous, and the board's
   speed limit is the game's.
     node games/plateau/test/plateau.selftest.mjs   (a few s) */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const FL = await import(path.join(here, "../js/flight.js"));
const SC = await import(path.join(here, "../js/score.js"));
const { Foam, Craft, clearance, fieldAt, speedAt, phaseAt, PHASES, RATES, R_EDGE } = FL;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const NEIGH4 = []; for (let k = 0; k < 81; k++) if (k !== 40) NEIGH4.push([k % 3 - 1, ((k / 3) | 0) % 3 - 1, ((k / 9) | 0) % 3 - 1, ((k / 27) | 0) - 1]);
const dirs4 = () => { const o = []; for (let i = 0; i < 50; i++) o.push([0, 1, 2, 3].map(() => Math.floor(rnd() * 40) - 20)); return o; };
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

{
  let good = true;
  for (const f of fs.readdirSync(path.join(here, "../js"))) {
    const r = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: fs.readFileSync(path.join(here, "../js", f)), encoding: "utf8" });
    if (r.status !== 0) { good = false; console.error(f, r.stderr); }
  }
  ok(good, "every script in js/ parses");
}

/* the craft */
{
  const c = new Craft([0, 0, 0, 0]);
  for (let i = 0; i < 20000; i++) c.steer(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1, 1 / 60);
  const B = [c.R, c.U, c.F, c.N]; let worst = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) worst = Math.max(worst, Math.abs(dot(B[i], B[j]) - (i === j ? 1 : 0)));
  ok(worst < 1e-12, `after 20000 random turns the frame is still orthonormal (worst ${worst.toExponential(1)})`);
  const z = new Craft([0, 0, 0, 0]);
  for (let i = 0; i < 5000; i++) z.steer(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1, 1 / 60, 0);
  ok(Math.abs(z.N[3] - 1) < 1e-12 && [z.R, z.U, z.F].every((v) => Math.abs(v[3]) < 1e-12), "at coupling 0 you never leave your slice: N stays w");
  const th = 0.3, dt = th / RATES.roll;
  const r = new Craft([0, 0, 0, 0]); r.steer(1, 0, 0, dt);
  ok(Math.abs(r.wNose - Math.sin(FL.COUPLING * th)) < 1e-12, `a roll of θ tips the nose sin(kθ) into w (${r.wNose.toFixed(4)})`);
  const p = new Craft([0, 0, 0, 0]); p.steer(0, 1, 0, th / RATES.pitch);
  ok(Math.abs(p.wNose) < 1e-12 && Math.abs(p.R[3] - Math.sin(FL.COUPLING * th)) < 1e-12 && Math.abs(p.F[2] - Math.sin(th)) < 1e-12, "a pitch lifts the nose and tips the wings into w, not the nose");
  const y = new Craft([0, 0, 0, 0]); y.steer(0, 0, 1, th / RATES.yaw);
  ok(Math.abs(y.wNose) < 1e-12 && Math.abs(y.U[3] - Math.sin(FL.COUPLING * th)) < 1e-12 && Math.abs(y.F[0] - Math.sin(th)) < 1e-12, "a yaw swings the nose right and tips up into w");
  const f = new Craft([1, 2, 3, 4]); f.F = [0.6, 0, 0, 0.8]; f.fly(2, 0.5);
  ok(f.P.every((v, i) => Math.abs(v - [1.6, 2, 3, 4.8][i]) < 1e-12), "you fly along your nose, through w as much as it points there");
}

/* the foam: nearest seed against brute force, and the shader's hash */
{
  const foam = new Foam(12345); let good = true;
  for (const d of [0, 200, 700, 1500]) {
    const F = fieldAt(d);
    for (let i = 0; i < 150; i++) {
      const p = [0, 1, 2, 3].map(() => (rnd() * 6 - 3) * F.scale), g = foam.nearest(p, F);
      const g0 = p.map((v) => Math.floor(v / F.scale)); let bd = Infinity, bg = null;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) for (let e = -2; e <= 2; e++) {
        const h = [g0[0] + a, g0[1] + b, g0[2] + c, g0[3] + e], s = foam.pos(h, F), dd = s.reduce((t, v, k) => t + (v - p[k]) ** 2, 0);
        if (dd < bd) { bd = dd; bg = h; }
      }
      if (FL.key(bg) !== FL.key(g)) good = false;
    }
  }
  ok(good, "the nearest seed from the 81 cells round you is the nearest of 625, in every phase");
  ok(dirs4().every((g) => { const r = foam.rand(g), F = fieldAt(400), p = foam.pos(g, F); return p.every((v, k) => Math.abs(v - F.scale * (g[k] + 0.5 + F.jitter * (r[k] - 0.5))) < 1e-12) && foam.solid(g, { ...F, solid: r[4] + 1e-9 }) && !foam.solid(g, { ...F, solid: r[4] }); }),
    "a cell's seed and its turning solid are its five random numbers (Foam.rand) and the field, nothing else");
  ok(fieldAt(1e6).jitter <= 0.5 + 1e-12, "jitter never passes half a cell (where the 80 seeds round a cell are all its possible neighbours)");
}

/* the renderer's seed texture: a 24⁴ window of grid cells round you, addressed by g mod 24, refilled a strip
   at a time as you move. Run against a stand-in for WebGL that keeps what's uploaded: after every move, every
   cell a ray can reach (within ±10 of yours) holds its own five numbers from flight.js */
{
  const { Renderer, M } = await import(path.join(here, "../js/render.js"));
  const store = new Map(); let bound = null;
  const gl = { TEXTURE0: 0, TEXTURE1: 1, TEXTURE_2D: 1, RGBA: 4, RED: 1, FLOAT: 0, activeTexture() {}, bindTexture(_, t) { bound = t; },
    texSubImage2D(_, __, X0, Y0, w, h, fmt, ___, data) { const a = store.get(bound) || store.set(bound, new Float32Array(M * M * M * M * fmt)).get(bound); for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) for (let c = 0; c < fmt; c++) a[((Y0 + j) * M * M + X0 + k) * fmt + c] = data[(j * w + k) * fmt + c]; } };
  const R = Object.create(Renderer.prototype); Object.assign(R, { gl, randTex: "rand", solidTex: "solid", lo: null, seed: null });
  const foam = new Foam(31337), mod = (v) => ((v % M) + M) % M;
  let gc = [5, -3, 0, 12], good = true, strips = 0, fills = 0, checked = 0;
  const count = { rect: R.rect }; R.rect = function (...a) { if (a[3] === M * M && a[4] === M * M) fills++; else strips++; return count.rect.apply(this, a); };
  for (let step = 0; step < 60 && good; step++) {
    const k = step % 4; gc = gc.map((v, i) => v + (i === k ? (step % 7 === 3 ? -2 : 1) : 0));
    if (step === 40) gc = gc.map((v) => v + 30); // a jump: the whole window again
    R.sync(foam, gc);
    for (let i = 0; i < 300; i++) {
      const g = gc.map((v) => v + Math.floor(rnd() * 21) - 10), r = foam.rand(g), X = mod(g[0]) + M * mod(g[1]), Y = mod(g[2]) + M * mod(g[3]), at = Y * M * M + X;
      const t4 = store.get("rand"), t1 = store.get("solid");
      if (![0, 1, 2, 3].every((c) => t4[at * 4 + c] === Math.fround(r[c])) || t1[at] !== Math.fround(r[4])) good = false;
      checked++;
    }
  }
  // and what reach is: the shader's march, run here, through the far fog in every direction, never reads a cell further
  let reach = 0;
  for (const d of [0, 200, 450, 800, 1500]) {
    const F = fieldAt(d), far = 7 * F.scale;
    for (let i = 0; i < 6; i++) {
      const c = new Craft([0, 1, 2, 3].map(() => rnd() * 20 - 10)); for (let k = 0; k < 20; k++) c.steer(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1, 0.2);
      const g0 = c.P.map((v) => Math.floor(v / F.scale)), here = foam.nearest(c.P, F);
      for (let r = 0; r < 40; r++) {
        const u = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], ul = Math.hypot(...u), d4 = [0, 1, 2, 3].map((k) => (u[0] * c.R[k] + u[1] * c.U[k] + u[2] * c.F[k]) / ul);
        let g = here, t = 0;
        for (let step = 0; step <= 30; step++) {
          const sd = foam.pos(g, F); let best = Infinity, bg = null;
          for (const o of NEIGH4) {
            const gn = g.map((v, k) => v + o[k]); reach = Math.max(reach, ...gn.map((v, k) => Math.abs(v - g0[k])));
            const sn = foam.pos(gn, F), n = sn.map((v, k) => v - sd[k]), den = dot(d4, n), v0 = 0.5 * (dot(sn, sn) - dot(sd, sd)) - dot(c.P, n);
            if (den > 1e-7 && v0 / den > t + 1e-5 && v0 / den < best) { best = v0 / den; bg = gn; }
          }
          if (!bg || best > far) break;
          g = bg; t = best;
        }
      }
    }
  }
  ok(reach <= 10, `a ray's march through the fog reads no cell more than 10 from yours (furthest ${reach})`);
  ok(good, `every cell within reach of a ray holds its own numbers, through 60 moves and a jump (${checked} cells checked)`);
  ok(fills === 2 && strips > 0, `a run fills the window once, a jump once more, and moving refills strips (${fills} fills, ${strips} strips)`);
}

/* clearance */
{
  const foam = new Foam(777); let lower = true, lip = true, finite = true, solidWall = true, worst = 0, n = 0;
  for (const d of [0, 250, 650]) {
    const F = fieldAt(d);
    for (let i = 0; i < 40; i++) {
      const c = new Craft([0, 1, 2, 3].map(() => rnd() * 4 * F.scale));
      for (let k = 0; k < 30; k++) c.steer(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1, 0.1);
      const a = clearance(foam, F, c);
      if (!(a.edge < Infinity)) finite = false;
      // the edges lie on the cell's walls, so the nearest edge is no nearer than the nearest wall
      const g = foam.nearest(c.P, F), s = foam.pos(g, F); let wall = Infinity;
      for (let a1 = -1; a1 <= 1; a1++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) for (let f = -1; f <= 1; f++) {
        if (!a1 && !b && !e && !f) continue;
        const t = foam.pos([g[0] + a1, g[1] + b, g[2] + e, g[3] + f], F), nv = t.map((v, k) => v - s[k]);
        const n3 = [dot(nv, c.R), dot(nv, c.U), dot(nv, c.F)], L = Math.hypot(...n3); if (L < 1e-12) continue;
        wall = Math.min(wall, (0.5 * (dot(t, t) - dot(s, s)) - dot(c.P, nv)) / L);
      }
      if (a.edge < wall - 1e-9) lower = false;
      // a true distance: moving δ in your slice moves it by at most |δ|
      const step = 0.004 + 0.02 * rnd(), u = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], ul = Math.hypot(...u);
      const c2 = new Craft(c.P.map((v, k) => v + step * (u[0] * c.R[k] + u[1] * c.U[k] + u[2] * c.F[k]) / ul)); Object.assign(c2, { R: c.R, U: c.U, F: c.F, N: c.N });
      const b2 = clearance(foam, F, c2), jump = Math.abs(b2.edge - a.edge) - step;
      if (Math.min(a.edge, b2.edge) < 3 * R_EDGE) { n++; worst = Math.max(worst, jump); if (jump > 1e-9) lip = false; }
      // every neighbour solid: the solid wall is exactly the cell's nearest wall, and the cell you're in is not solid
      const all = clearance(foam, { ...F, solid: 1 }, c);
      if (!(all.solid > 0) || Math.abs(all.solid - wall) > 1e-9) solidWall = false;
    }
  }
  ok(finite, "an edge is always in reach of the clearance box");
  ok(lower, "the nearest edge is never nearer than the nearest wall of your cell");
  ok(lip && n > 10, `near the edges (${n} cases), the edge distance moves no more than you do (worst excess ${worst.toExponential(1)})`);
  ok(solidWall, "with every cell solid, the solid wall is your cell's nearest wall, and your own cell isn't solid");
}

/* the solid clearance against rays: march out from P in many directions; the first point in a solid cell is
   never nearer than the clearance says (a solid cell meeting yours only at a corner counts; one did not, once,
   and a face opening between them brought its wall from nowhere) */
{
  const foam = new Foam(4242), F = { ...fieldAt(700), solid: 0.3 };
  let safe = true, tight = 0, n = 0, worst = 0;
  const dirs = []; for (let i = 0; i < 300; i++) { const z = 1 - (2 * (i + 0.5)) / 300, r = Math.sqrt(1 - z * z), a = i * 2.39996323; dirs.push([r * Math.cos(a), r * Math.sin(a), z]); }
  for (let i = 0; i < 14; i++) {
    const c = new Craft([0, 1, 2, 3].map(() => rnd() * 5));
    for (let k = 0; k < 30; k++) c.steer(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1, 0.1);
    const here = FL.key(foam.nearest(c.P, F)), cl = clearance(foam, F, c);
    const inSolid = (t, u) => { const g = foam.nearest(c.P.map((v, k) => v + t * (u[0] * c.R[k] + u[1] * c.U[k] + u[2] * c.F[k])), F); return FL.key(g) !== here && foam.solid(g, F); };
    let ray = Infinity;
    for (const u of dirs) {
      let t = 0; while (t < 0.6 && !inSolid(t + 0.02, u)) t += 0.02;
      if (t >= 0.6) continue;
      let lo = t, hi = t + 0.02; for (let b = 0; b < 12; b++) { const m = (lo + hi) / 2; if (inSolid(m, u)) hi = m; else lo = m; }
      ray = Math.min(ray, hi);
    }
    if (cl.solid > ray + 1e-6) { safe = false; worst = Math.max(worst, cl.solid - ray); }
    if (ray < 0.6) { n++; if (ray - cl.solid < 0.03) tight++; }
  }
  ok(safe, `no solid cell is ever nearer than the clearance says${safe ? "" : ` (off by ${worst.toFixed(3)})`}`);
  ok(n >= 5 && tight >= n - 1, `and it's tight: within 0.03 of the nearest a ray finds (${tight} of ${n})`);
}

/* the phases */
{
  let cont = true, mono = true, prev = fieldAt(0);
  for (let d = 0.5; d <= 3000; d += 0.5) {
    const f = fieldAt(d);
    if (Math.abs(f.jitter - prev.jitter) > 0.01 || Math.abs(f.solid - prev.solid) > 0.01 || Math.abs(f.scale - prev.scale) > 0.01 || Math.abs(speedAt(d) - speedAt(d - 0.5)) > 0.01) cont = false;
    if (f.jitter < prev.jitter || f.solid < prev.solid || f.scale > prev.scale || f.solid >= 0.5 || f.scale <= 0) mono = false;
    prev = f;
  }
  ok(cont, "the foam changes continuously with distance: nothing jumps");
  ok(mono, "and only one way: more jitter, more solid, smaller cells");
  ok(PHASES.every((p, i) => !i || p.from > PHASES[i - 1].from) && PHASES.every((p) => phaseAt(p.from) === p && phaseAt(p.from + 1) === p), "the phases are in order, each from where it says");
  ok(fieldAt(0).solid === 0 && fieldAt(0).jitter < 0.15, "the crystal starts with nothing solid, nearly regular");
}

/* the board */
{
  let fast = 0; for (let d = 0; d < 1e6; d += 37) fast = Math.max(fast, speedAt(d));
  ok(SC.VMAX === FL.VMAX && fast <= FL.VMAX, `the board's speed limit is the game's (fastest ${fast.toFixed(2)} ≤ ${FL.VMAX} cells a second)`);
  const day = "2026-10-22", rec = { ...SC.record({ cells: 123.4, time: 40, seed: SC.dailySeed(day), phase: "melt" }), site: "plateau", game: SC.dailyId(day), createdAt: new Date().toISOString() };
  ok(rec.value === 1234 && SC.accept(rec), "a real run's record is accepted (123.4 cells is 1234 m)");
  ok(!SC.accept({ ...rec, value: Math.ceil(FL.VMAX * 10 * 40.1) + 2 }), "a run faster than the craft can fly is refused");
  ok(!SC.accept({ ...rec, game: "daily-v0-2026-10-22" }) && !SC.accept({ ...rec, site: "molt" }) && !SC.accept({ ...rec, value: 12.5 }) && !SC.accept({ ...rec, detail: "seed=1" }), "wrong rules version, wrong site, a fraction, no time: all refused");
  const offer = /b\.offer\(\{([^\n]*)\}\);/.exec(fs.readFileSync(path.join(here, "../js/main.js"), "utf8"));
  ok(offer && /\bvalue:/.test(offer[1]), "the page offers the board a value (the kit formats it while it posts: without one, Safari's 'undefined is not an object')");
  ok(SC.dailySeed(day) === SC.dailySeed(day) && SC.dailySeed(day) !== SC.dailySeed("2026-10-23"), "today's foam is one seed for everyone, new each day");
}

console.log(fails ? `\n✗ ${fails} of ${checks} plateau checks failed` : `plateau: ${checks} checks\n\n✓ plateau selftest passed`);
process.exit(fails ? 1 : 0);
