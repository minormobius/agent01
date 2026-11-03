const K = await import(new URL('./clone-piece.mjs', import.meta.url)), O = await import(new URL('../kit/clone.mjs', import.meta.url));
let ok = 0, n = 0;
for (const cs of Object.keys(O.CASES)) for (const r of [0, 1]) { n++;
  const a = JSON.stringify(O.run(cs, O.seedOf(r), {}, 150)), b = JSON.stringify(K.run(cs, K.seedOf(r), { pool: 'genet' }, 150));
  if (a === b) ok++; else console.log('DIFF', cs, r, a, b); }
console.log(`twin: pool=genet matches the kit ${ok}/${n}`);
