const W = process.argv[2];
const { lattice, rng, sim } = await import(W + '/kit/clone.mjs'); const { life } = await import(W + '/lab/life.js');
for (const [p, s, h] of [[0.25, 2, 0.7], [0.25, 5, 0.8], [0.5, 2, 0.9]]) for (const [res, inv] of [[0, 1], [1, 0]]) {
  const out = [];
  for (const ls of [5, 6, 7, 8, 9]) {
    const graph = lattice('sq4', 100, true, rng((1007 ^ 0x2545F491) >>> 0)), m0 = sim([p, s, 0.9], 1007, { graph, L: 100 });
    const gr = { graph, good: m0.good, rock: m0.rock, p }, R = rng((ls ^ 0x51ED270B) >>> 0), used = new Set(), list = [];
    for (let c = 0; c < 25; c++) { let i; do i = Math.floor(R() * graph.N); while (used.has(i)); used.add(i); list.push([i, res]); }
    const L = life(gr, list, { seed: ls, h, arrive: { n: 25, kind: inv, at: 500 } });
    while (L.t < 1500) L.step(); const c = L.count(), mx = L.mix();
    out.push(`${Math.round((c[inv].good + c[inv].bad) * 100)}/${Math.round((c[res].good + c[res].bad) * 100)} M${isNaN(mx.M) ? '-' : mx.M.toFixed(2)}`); }
  console.log(`p${p} s${s} h${h} ${['split','integ'][inv]} into ${['split','integ'][res]}: newcomer/resident squares at 1500:`, out.join('  ')); }
