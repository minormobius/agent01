// node mix.mjs <abs clone.mjs> <p> <s> <h> <reps> <T...>   prints M, Mg, Mgood, Mbadgood at each T while both alive
const [,, kit, P, S, H, REPS, ...TS] = process.argv;
const { sim, seedOf } = await import(kit);
for (let r = 1; r <= +REPS; r++) {
  const m = sim([+P, +S, +H], seedOf(r)), g = m.gen, gd = m.good, { off, nb } = m.graph, N = g.length;
  for (const T of TS.map(Number)) { while (m.t < T) m.step();
    const n = [[0, 0], [0, 0]]; // n[ground][0 split,1 integ]
    for (let i = 0; i < N; i++) if (g[i]) n[gd[i]][g[i] <= 25 ? 0 : 1]++;
    const ns = n[0][0] + n[1][0], ni = n[0][1] + n[1][1]; if (!ns || !ni) { console.log(JSON.stringify({ r, T, ns, ni, gone: true })); break; }
    const ps = [n[0][0] / (n[0][0] + n[0][1] || 1), n[1][0] / (n[1][0] + n[1][1] || 1)];
    let pairs = 0, het = 0, Eg = 0, gp = 0, gh = 0, gE = 0;
    const fs = ns / (ns + ni);
    for (let i = 0; i < N; i++) { if (!g[i]) continue;
      for (let e = off[i]; e < off[i + 1]; e++) { const j = nb[e]; if (j <= i || !g[j]) continue;
        const h = (g[i] <= 25) !== (g[j] <= 25) ? 1 : 0, a = ps[gd[i]], b = ps[gd[j]], ex = a * (1 - b) + (1 - a) * b;
        pairs++; het += h; Eg += ex;
        if (gd[i] && gd[j]) { gp++; gh += h; gE += ex; } } }
    console.log(JSON.stringify({ r, T, ns, ni, splitOnGood: +(n[1][0] / ns).toFixed(3), M: +(het / pairs / (2 * fs * (1 - fs))).toFixed(3), Mg: +(het / Eg).toFixed(3), Mgood: +(gh / gE).toFixed(3), goodPairs: gp }));
  }
}
