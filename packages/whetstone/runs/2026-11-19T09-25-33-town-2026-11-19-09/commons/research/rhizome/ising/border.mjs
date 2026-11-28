// node border.mjs <abs clone.mjs> <p> <s> <h> <L> <reps>   one JSON line per (rep, T): rho, fraction splitter, counts
const [,, kit, P, S, H, L, REPS] = process.argv;
const { sim, seedOf } = await import(kit);
const TS = [10, 20, 50, 100, 200, 500, 1000, 2000, 4000, 8000];
for (let r = 1; r <= +REPS; r++) {
  const m = sim([+P, +S, +H], seedOf(r), { L: +L }), g = m.gen, { off, nb } = m.graph, N = g.length;
  for (const T of TS) { while (m.t < T) m.step();
    let ns = 0, ni = 0, pairs = 0, het = 0;
    for (let i = 0; i < N; i++) { if (!g[i]) continue; g[i] <= 25 ? ns++ : ni++;
      for (let e = off[i]; e < off[i + 1]; e++) { const j = nb[e]; if (j <= i || !g[j]) continue; pairs++; if ((g[i] <= 25) !== (g[j] <= 25)) het++; } }
    const line = { p: +P, s: +S, L: +L, r, T, ns, ni, rho: +(het / pairs).toFixed(5) };
    console.log(JSON.stringify(line)); if (!ns || !ni) break; } }
