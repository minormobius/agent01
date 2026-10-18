// node long.mjs <abs clone.mjs> <p> <s> <h> <L> <reps> <T>
// Mixed start (kit planting, 25+25). Every 250 steps: splitter and integrator plants, and the mixing index
// M = (share of occupied neighbour pairs that are splitter-integrator) / (2 fs fi), fs, fi = shares of occupied squares.
// M = 1: as mixed as a random relabelling. M near 0: the two kinds touch only along a thin border.
// Stops early when a kind is gone; prints first-extinction step (or null = censored at T).
const [,, kit, P, S, H, L, REPS, T] = process.argv;
const { sim, seedOf } = await import(kit);
for (let r = 1; r <= +REPS; r++) {
  const m = sim([+P, +S, +H], seedOf(r), { L: +L }), g = m.gen, { off, nb } = m.graph, N = g.length, rows = [];
  let ext = null;
  const look = () => { let ns = 0, ni = 0, het = 0, pairs = 0;
    for (let i = 0; i < N; i++) { const a = g[i]; if (!a) continue; a <= 25 ? ns++ : ni++;
      for (let e = off[i]; e < off[i + 1]; e++) { const j = nb[e]; if (j <= i || !g[j]) continue; pairs++; if ((a <= 25) !== (g[j] <= 25)) het++; } }
    const fs = ns / (ns + ni || 1), fi = 1 - fs, M = ns && ni ? (het / pairs) / (2 * fs * fi) : null;
    rows.push([m.t, ns, ni, M === null ? null : +M.toFixed(3)]); return ns && ni; };
  look();
  while (m.t < +T) { m.step(); if (m.t % 250 === 0 || m.t === +T) { if (!look()) { ext = m.t; break; } } }
  // exact step: rerun not needed at this resolution; ext is to the nearest 250
  console.log(JSON.stringify({ p: +P, s: +S, h: +H, L: +L, r, ext, end: rows.at(-1), rows }));
}
