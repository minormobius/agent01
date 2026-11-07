// R0=<first rep> node desk-long.mjs (quench.mjs with TS to 64000) <abs clone.mjs> <p> <s> <h> <L> <reps>   start from a full random 50/50 mix on the kit's ground for that seed
const [,, kit, P, S, H, L, REPS] = process.argv;
const { sim, seedOf, rng } = await import(kit);
const TS = [100, 1000, 2000, 4000, 8000, 16000, 32000, 64000];
for (let r = +(process.env.R0 || 1); r <= +REPS; r++) {
  const g0 = sim([+P, +S, +H], seedOf(r), { L: +L }), N = g0.gen.length, R = rng((seedOf(r) * 31 + 5) >>> 0), seeds = [];
  for (let i = 0; i < N; i++) seeds.push([i, R() < 0.5 ? 1 + Math.floor(R() * 25) : 26 + Math.floor(R() * 25)]);
  const m = sim([+P, +S, +H], seedOf(r), { L: +L, graph: g0.graph, land: { good: g0.good, p: +P, seeds } }), g = m.gen, { off, nb } = m.graph;
  for (const T of TS) { while (m.t < T) m.step();
    let ns = 0, ni = 0, pairs = 0, het = 0;
    for (let i = 0; i < N; i++) { if (!g[i]) continue; g[i] <= 25 ? ns++ : ni++;
      for (let e = off[i]; e < off[i + 1]; e++) { const j = nb[e]; if (j <= i || !g[j]) continue; pairs++; if ((g[i] <= 25) !== (g[j] <= 25)) het++; } }
    console.log(JSON.stringify({ p: +P, s: +S, L: +L, r, T, ns, ni, rho: +(het / pairs).toFixed(5) })); if (!ns || !ni) break; } }
