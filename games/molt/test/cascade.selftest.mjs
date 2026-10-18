/* Cascade's laws: every snake is a tube with the world's own skin, laid on
   the one before, a third the size; everything slithers continuously; and
   the zoom falls towards a point because the heads close in on one.
     node games/molt/test/cascade.selftest.mjs   (~4 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const D = await import(path.join(here, "../js/duct.js"));
const { Ouro, autopilot } = await import(path.join(here, "../js/ouro.js"));
const K = await import(path.join(here, "../js/cascade.js"));
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };
let seed = 17;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const RULES = { shrink: "body", fall: "slide", bite: "die", anchor: "path" };

/* ---- the cascade's game: the world exactly as long as you, sliding instead of falling, slithering along a fixed path */
const states = [];
{
  let sized = true, fell = 0, slid = 0, ticks = 0, still = true, stepsSeen = 0;
  for (let s = 1; s <= 6; s++) {
    const g = new Ouro(s * 6151, RULES);
    for (let t = 0; t < 500 && g.alive; t++) {
      autopilot(g, rnd);
      const before = g.world.P.map((p) => p.join());
      g.tick(); ticks++;
      if (g.events.some((e) => e.why === "slide")) slid++;
      if (!g.alive) break;
      if (g.world.L !== Math.max(2, g.body.length)) sized = false;
      if (g.last.kind === "step" && !g.last.cut) { stepsSeen++; for (let k = 0; k + 1 < before.length; k++) if (g.world.P[k].join() !== before[k + 1]) still = false; }
      if (g.body.length > 2 && t % 60 === 30) states.push({ W: g.world, body: g.body.slice(), names: g.names });
    }
    if (g.cause === "fell") fell++;
  }
  ok(sized && fell === 0, ticks + " steps with the world shrinking when you're cut: it is always exactly as long as you, and nobody falls (" + slid + " slid down to the world's new tail end instead)");
  ok(still && stepsSeen > 1000, "the world slithers along a path that stays put: after each of " + stepsSeen + " steps every cube sits where the one behind it was");
}

/* ---- the layers */
{
  let molt = 0, straight = 0, tight = 0, scaled = true, ortho = true, onIt = 0, cells = 0, logRatio = 0, ratios = 0, worse = 0;
  for (const { W, body, names } of states) {
    const skin = K.skinOf(W, names), st = K.buildStack(W, body, 4, skin), line = D.centreline(W);
    // on a straight stretch layer 0 is Molt's rounded tube, cell for cell
    const L0 = st.layers[0];
    for (let c = 0; c < W.N; c++) {
      const k = skin.cube[c];
      if (k < 2 || k > W.L - 3 || [k - 1, k, k + 1].some((q) => W.din[q] !== W.dout[q])) continue;
      const [p] = D.roundPoint(line, k, D.cellPoint(W, c, 0.5, 0.5), K.K_.R0);
      molt = Math.max(molt, dist(p, [L0.mid[c * 3], L0.mid[c * 3 + 1], L0.mid[c * 3 + 2]])); straight++;
    }
    // every layer watertight: a corner two cells share (by where it is on the skin) lands in one place
    for (const L of st.layers) {
      const at = new Map();
      for (let c = 0; c < W.N; c++) for (let i = 0; i < 4; i++) {
        const k = skin.cube[c], x = skin.at[(c * 5 + i) * 3], y = skin.at[(c * 5 + i) * 3 + 1], z = skin.at[(c * 5 + i) * 3 + 2];
        const dome = (k === 0 && x < 0) || (k === W.L - 1 && x > 0), key = [dome ? "d" + k + ":" + Math.round(x * 1e6) : Math.round((k + x) * 1e6), Math.round(y * 1e6), Math.round(z * 1e6)].join();
        const p = [L.pts[c * 12 + i * 3], L.pts[c * 12 + i * 3 + 1], L.pts[c * 12 + i * 3 + 2]];
        if (at.has(key)) tight = Math.max(tight, dist(p, at.get(key)) / L.r); else at.set(key, p);
      }
      if (Math.abs(L.r - K.K_.R0 / W.C ** L.j) > 1e-12) scaled = false;
      for (let k = 0; k < L.spine.n; k++) for (const t of [0, 0.37, 1]) { const { T, U } = L.spine.at(k, t); if (Math.abs(Math.hypot(...T) - 1) > 1e-9 || Math.abs(Math.hypot(...U) - 1) > 1e-9 || Math.abs(T[0] * U[0] + T[1] * U[1] + T[2] * U[2]) > 1e-9) ortho = false; }
    }
    // each snake lies on the one before: its spine runs a radius above the middle of each cell its body covers
    for (let j = 0; j + 1 < st.layers.length; j++) {
      const A = st.layers[j], B = st.layers[j + 1], n = body.length;
      body.forEach((c, i) => {
        const k = n - 1 - i, p = B.spine.at(k, k === 0 ? 0 : k === n - 1 ? 1 : 0.5).p, d = dist(p, [A.mid[c * 3], A.mid[c * 3 + 1], A.mid[c * 3 + 2]]) / B.r;
        cells++; if (d >= 0.5 && d <= 1.5) onIt++;
      });
    }
    for (let j = 2; j < st.heads.length; j++) { const a = dist(st.heads[j], st.heads[j - 1]), b = dist(st.heads[j - 1], st.heads[j - 2]); logRatio += Math.log(a / b); ratios++; if (a > b) worse++; }
  }
  ok(states.length >= 20, states.length + " game states from play, each built into a stack of four layers");
  ok(straight > 100 && molt < 1e-9, "on a straight stretch, layer 0 is Molt's rounded world tube, cell for cell (" + straight + " cells)");
  ok(tight < 1e-9 && scaled, "every layer is watertight, and each is a third the size of the one before");
  ok(ortho, "every spine carries an honest frame: the way ahead and the snake's up, unit and square to each other");
  ok(onIt / cells >= 0.95, "each snake lies on the one before: its spine runs within half a radius of one radius above the middle of " + (100 * onIt / cells).toFixed(1) + "% of the cells its body covers (the rest are where a body crosses a slot, two coils of the world pressed together)");
  const mean = Math.exp(logRatio / ratios);
  ok(mean < 0.5 && worse / ratios < 0.05, "the heads close in on one point, each step on average " + mean.toFixed(2) + " of the last (a third would be exact self-similarity; " + worse + " of " + ratios + " steps grew), so the zoom has somewhere to fall");
}

/* ---- everything slithers continuously: part way through a step, every layer is between where it was and where it is */
{
  const g = new Ouro(3, RULES);
  for (let i = 0; i < 6; i++) g.tick();
  let prev = null, start = 0, end = 0, moved = 0, n = 0, worst = 0;
  for (let t = 0; t < 250 && g.alive; t++) {
    autopilot(g, rnd); g.tick(); if (!g.alive) break;
    const skin = K.skinOf(g.world, g.names), mo = K.motionOf(g), now = K.buildStack(g.world, g.body, 4, skin);
    if (mo && prev) {
      const at = (f) => K.buildStack(g.world, g.body, 4, skin, { ...mo, f }), s0 = at(0), s1 = at(1);
      for (let j = 0; j < 4; j++) { start = Math.max(start, dist(s0.heads[j], prev.heads[j])); const e = dist(s1.heads[j], now.heads[j]); end = Math.max(end, e); worst = Math.max(worst, e); }
      moved += dist(s0.heads[3], now.heads[3]); n++;
    }
    prev = now;
  }
  ok(n > 150 && start < 1e-9 && end < 1e-6, "every layer slithers continuously through " + n + " steps: at the start of a step each head is exactly where it was at the end of the last, and at the end exactly where the step put it (within " + end.toExponential(0) + "), though the point the zoom falls into moves " + (moved / n).toFixed(2) + " a step");
}

/* ---- the frames the camera turns between */
{
  const T = [1, 0, 0], U = [0, 0, 1], R = K.frameTurn(T, U, T, U), q = K.frameTurn(T, U, [0, 1, 0], [1, 0, 0]);
  const T1 = K.rotate(T, q.axis, q.ang), U1 = K.rotate(U, q.axis, q.ang);
  ok(R.ang === 0 && dist(T1, [0, 1, 0]) < 1e-9 && dist(U1, [1, 0, 0]) < 1e-9, "the camera's turn from one snake's frame to the next is the rotation that carries one onto the other (" + (q.ang * 180 / Math.PI).toFixed(0) + "° for a cube's pitch-and-yaw)");
}

console.log(fails ? `cascade: ${fails} of ${checks} checks FAILED` : `cascade: all ${checks} checks ok`);
process.exit(fails ? 1 : 0);
