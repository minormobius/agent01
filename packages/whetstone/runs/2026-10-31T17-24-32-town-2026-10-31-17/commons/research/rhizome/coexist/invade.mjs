// Mutual invasibility on the rhizome kit. node invade.mjs <abs path to clone.mjs> <p> <s> <h> <reps> [burn=500] [after=1000]
// resident alone for `burn` steps; then 25 invader genets, one plant each, on random empty squares; run `after` more.
// Prints one JSON line per (resident, rep): invader plants at +0,+100,+300,+after, resident plants at end.
const [,, kit, P, S, H, REPS, BURN = '500', AFTER = '1000'] = process.argv;
const { sim, rng, seedOf } = await import(kit);
const cs = [+P, +S, +H], burn = +BURN, after = +AFTER;
for (const res of ['split', 'integ']) for (let r = 1; r <= +REPS; r++) {
  const m = sim(cs, seedOf(r)), g = m.gen, N = g.length;
  const isRes = x => res === 'split' ? x >= 1 && x <= 25 : x >= 26;
  for (let i = 0; i < N; i++) if (g[i] && !isRes(g[i])) g[i] = 0;
  while (m.t < burn) m.step();
  const count = f => { let n = 0; for (let i = 0; i < N; i++) if (g[i] && f(g[i])) n++; return n; };
  const resAtBurn = count(isRes);
  const R = rng((seedOf(r) * 7919 + 13) >>> 0), empty = [];
  for (let i = 0; i < N; i++) if (!g[i] && !m.rock[i]) empty.push(i);
  const base = res === 'split' ? 26 : 1;
  for (let k = 0; k < 25 && k < empty.length; k++) { const j = k + Math.floor(R() * (empty.length - k)); [empty[k], empty[j]] = [empty[j], empty[k]]; g[empty[k]] = base + k; }
  const inv = x => !isRes(x), traj = { 0: count(inv) };
  while (m.t < burn + after) { m.step(); const d = m.t - burn; if (d === 100 || d === 300 || d === after) traj[d] = count(inv); }
  console.log(JSON.stringify({ p: +P, s: +S, h: +H, res, r, resAtBurn, inv: traj, resEnd: count(isRes) }));
}
