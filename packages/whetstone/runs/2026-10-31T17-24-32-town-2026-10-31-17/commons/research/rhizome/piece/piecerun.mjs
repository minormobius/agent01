// usage: node piecerun.mjs <genet|piece> <clamp|linear> [runs] [cases]
const [pool, wmode, runsA, casesA] = process.argv.slice(2);
const K = await import(new URL('./clone-piece.mjs', import.meta.url));
const runs = +(runsA || 20), list = (casesA || Object.keys(K.CASES).join(',')).split(',');
console.log(`pool=${pool} w=${wmode} sq4 100x100 500 steps, ${runs} runs, seeds 1000r+7`);
console.log('case | splitter % | integrator % | split alive | integ alive | mean piece size (runs alive)');
for (const cs of list) {
  const rs = []; for (let r = 0; r < runs; r++) rs.push(K.run(cs, K.seedOf(r), { wmode, pool }, 500));
  const m = f => rs.reduce((a, x) => a + f(x), 0) / runs, sd = f => { const mu = m(f); return Math.sqrt(rs.reduce((a, x) => a + (f(x) - mu) ** 2, 0) / (runs - 1)); };
  const S = x => x.sg + x.sb, I = x => x.ig + x.ib;
  const al = rs.filter(x => I(x) > 0 && x.pieces);
  const ps = al.length ? (al.reduce((a, x) => a + x.ram / x.pieces, 0) / al.length).toFixed(1) : '-';
  console.log(`${cs.padEnd(4)} | ${m(S).toFixed(1).padStart(5)} ± ${sd(S).toFixed(1).padEnd(4)} | ${m(I).toFixed(1).padStart(5)} ± ${sd(I).toFixed(1).padEnd(4)} | ${rs.filter(x => S(x) > 0).length}/${runs} | ${rs.filter(x => I(x) > 0).length}/${runs} | ${pool === 'piece' ? ps : ''}`);
}
