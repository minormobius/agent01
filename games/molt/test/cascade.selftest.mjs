/* Cascade's laws: every snake is a tube with the world's own tiled skin,
   laid on the one before, a third the size, and the zoom falls towards a
   point because the heads close in on one.
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

/* the cascade's game: the world exactly as long as you, and a head whose ground goes slides to the world's new end */
const states = [];
{
  let sized = true, fell = 0, slid = 0, ticks = 0;
  for (let s = 1; s <= 6; s++) {
    const g = new Ouro(s * 6151, { shrink: "body", fall: "slide", bite: "die" });
    for (let t = 0; t < 500 && g.alive; t++) {
      autopilot(g, rnd); g.tick(); ticks++;
      if (g.events.some((e) => e.why === "slide")) slid++;
      if (g.alive && g.world.L !== Math.max(2, g.body.length)) sized = false;
      if (g.alive && g.body.length > 2 && t % 60 === 30) states.push({ W: g.world, body: g.body.slice() });
    }
    if (g.cause === "fell") fell++;
  }
  ok(sized && fell === 0, ticks + " steps with the world shrinking when you're cut: it is always exactly as long as you, and nobody falls (" + slid + " slid down to the world's new tail end instead)");
}

/* the layers */
{
  let exact = 0, tight = 0, scaled = true, ortho = true, onIt = 0, cells = 0, logRatio = 0, ratios = 0, worse = 0;
  for (const { W, body } of states) {
    const coords = K.tubeCoords(W), st = K.buildStack(W, body, 4, coords), C = W.C, G = C + 1, line = D.centreline(W);
    // layer 0 is Molt's rounded tube, point for point
    W.faces.forEach((F, f) => { for (let i = 0; i <= C; i++) for (let j = 0; j <= C; j++) { const [p] = D.roundPoint(line, F.k, D.cellPoint(W, f * C * C, i, j), K.K_.R0), id = ((f * G + i) * G + j) * 3, q = st.layers[0].pts; exact = Math.max(exact, dist(p, [q[id], q[id + 1], q[id + 2]])); } });
    // every layer watertight: a corner two cells share lands in one place
    for (const L of st.layers) {
      const at = new Map();
      W.faces.forEach((F, f) => { for (let i = 0; i <= C; i++) for (let j = 0; j <= C; j++) { const key = D.cellPoint(W, f * C * C, i, j).map((v) => Math.round(v * 1e6)).join(), id = ((f * G + i) * G + j) * 3, p = [L.pts[id], L.pts[id + 1], L.pts[id + 2]]; if (at.has(key)) tight = Math.max(tight, dist(p, at.get(key)) / L.r); else at.set(key, p); } });
      if (Math.abs(L.r - K.K_.R0 / C ** L.j) > 1e-12) scaled = false;
      for (let k = 0; k < L.spine.n; k++) for (const t of [0, 0.37, 1]) { const { T, U } = L.spine.at(k, t); if (Math.abs(Math.hypot(...T) - 1) > 1e-9 || Math.abs(Math.hypot(...U) - 1) > 1e-9 || Math.abs(T[0] * U[0] + T[1] * U[1] + T[2] * U[2]) > 1e-9) ortho = false; }
    }
    // each snake lies on the one before: its spine runs a radius above the skin, through the middle of each cell it lies on
    for (let j = 0; j + 1 < st.layers.length; j++) {
      const A = st.layers[j], B = st.layers[j + 1], n = body.length;
      body.forEach((c, i) => {
        const k = n - 1 - i, p = B.spine.at(k, k === 0 ? 0 : k === n - 1 ? 1 : 0.5).p, m = [A.mid[c * 3], A.mid[c * 3 + 1], A.mid[c * 3 + 2]], d = dist(p, m) / B.r;
        cells++; if (d >= 0.5 && d <= 1.5) onIt++;
      });
    }
    // the heads close in, a third as far each layer down
    for (let j = 2; j < st.heads.length; j++) { const a = dist(st.heads[j], st.heads[j - 1]), b = dist(st.heads[j - 1], st.heads[j - 2]); logRatio += Math.log(a / b); ratios++; if (a > b) worse++; }
  }
  ok(states.length >= 20, states.length + " game states from play, each built into a stack of four layers");
  ok(exact < 1e-9, "layer 0 is Molt's rounded world tube, point for point (largest difference " + exact.toExponential(1) + ")");
  ok(tight < 1e-9 && scaled, "every layer is watertight, and each is a third the size of the one before");
  ok(ortho, "every spine carries an honest frame: the way ahead and the snake's up, unit and square to each other");
  ok(onIt / cells >= 0.95, "each snake lies on the one before: its spine runs within half a radius of one radius above the middle of " + (100 * onIt / cells).toFixed(1) + "% of the cells its body covers (the rest are where a body crosses a slot, two coils of the world pressed together)");
  const mean = Math.exp(logRatio / ratios);
  ok(mean < 0.5 && worse / ratios < 0.05, "the heads close in on one point, each step on average " + mean.toFixed(2) + " of the last (a third would be exact self-similarity; " + worse + " of " + ratios + " steps grew), so the zoom has somewhere to fall");
}

/* the frames the camera turns between: a turn of zero is zero, and a frame turned onto itself */
{
  const T = [1, 0, 0], U = [0, 0, 1], R = K.frameTurn(T, U, T, U), q = K.frameTurn(T, U, [0, 1, 0], [1, 0, 0]);
  const T1 = K.rotate(T, q.axis, q.ang), U1 = K.rotate(U, q.axis, q.ang);
  ok(R.ang === 0 && dist(T1, [0, 1, 0]) < 1e-9 && dist(U1, [1, 0, 0]) < 1e-9, "the camera's turn from one snake's frame to the next is the rotation that carries one onto the other (" + (q.ang * 180 / Math.PI).toFixed(0) + "° for a cube's pitch-and-yaw)");
}

console.log(fails ? `cascade: ${fails} of ${checks} checks FAILED` : `cascade: all ${checks} checks ok`);
process.exit(fails ? 1 : 0);
