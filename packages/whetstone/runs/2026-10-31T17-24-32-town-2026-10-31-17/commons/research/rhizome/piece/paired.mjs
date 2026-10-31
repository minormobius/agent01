// Paired difference (piece - genet) in integrator cover, same seed, clamp. node paired.mjs [runs]
const K = await import(new URL('./clone-piece.mjs', import.meta.url)); const runs = +(process.argv[2] || 20);
for (const cs of Object.keys(K.CASES)) { const d = [];
  for (let r = 0; r < runs; r++) { const a = K.run(cs, K.seedOf(r), { pool: 'genet' }), b = K.run(cs, K.seedOf(r), { pool: 'piece' }); d.push((b.ig + b.ib) - (a.ig + a.ib)); }
  const m = d.reduce((x, y) => x + y) / runs, se = Math.sqrt(d.reduce((x, y) => x + (y - m) ** 2, 0) / (runs - 1) / runs);
  console.log(`${cs.padEnd(3)} integrator piece-genet ${m >= 0 ? '+' : ''}${m.toFixed(1)} ± ${se.toFixed(1)} (s.e., ${runs} paired seeds)`); }
