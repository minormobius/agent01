// eval/craft-arena.mjs — the league. Every policy plays every other (and
// itself) on every tiling and seed, once from each side, headless and free.
//
//   node mega/jev/eval/craft-arena.mjs [--seeds 1,2,3] [--shapes hex,grid] [--policies baseline,rusher,turtle,random]
//                                      [--per-side 1] [--out mega/jev/lab/craft-arena.json]
//
// What it reports, and why each is there:
//   score       wins + half the draws, per pairing, with a Wilson interval: the
//               direct measurement head to head buys
//   rating      Bradley-Terry strengths fitted to every result, on the Elo
//               scale (400·log10), anchored so random = 0. One number per
//               policy that uses every game, not just its own pairings
//   side bias   how often side 0 wins mirror matches: fairness of the map and
//               the scheduler, which have to be near 50% before anything else
//               means anything
//   faults      the commonest macro failures, because every league so far has
//               found a harness fault before it found a result
import { playMatch, ARENA_POLICIES } from '../craft/arena.mjs';
import { SHAPES } from '../craft/tiling.mjs';
import { writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const seeds = arg('seeds', '1,2,3').split(',').map(Number);
const shapes = arg('shapes', SHAPES.join(',')).split(',');
const names = arg('policies', Object.keys(ARENA_POLICIES).join(',')).split(',');
const perSide = +arg('per-side', 1), out = arg('out', null), quiet = process.argv.includes('--quiet');

export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [+((c - h) / d).toFixed(3), +((c + h) / d).toFixed(3)];
}
// Bradley-Terry by minorisation-maximisation; a draw counts half a win each way
export function bradleyTerry(games, players, iters = 500) {
  const s = Object.fromEntries(players.map((p) => [p, 1]));
  for (let it = 0; it < iters; it++) {
    const next = {};
    for (const i of players) {
      let w = 0, den = 0;
      for (const g of games) {
        if (g.a !== i && g.b !== i) continue;
        const j = g.a === i ? g.b : g.a;
        if (j === i) continue;
        w += g.a === i ? g.sa : 1 - g.sa;
        den += 1 / (s[i] + s[j]);
      }
      next[i] = den ? Math.max(1e-6, (w + 0.5) / (den + 1 / s[i])) : s[i];   // +0.5: a prior so a clean sweep stays finite
    }
    Object.assign(s, next);
  }
  const anchor = s.random ?? s[players[0]];
  return Object.fromEntries(players.map((p) => [p, Math.round(400 * Math.log10(s[p] / anchor))]));
}

const games = [], faults = {}, t0 = performance.now();
let mirrors = 0, mirrorSide0 = 0;
for (const shape of shapes) for (const seed of seeds) for (let i = 0; i < names.length; i++) for (let j = i; j < names.length; j++) {
  for (const flip of i === j ? [false] : [false, true]) {
    const pa = flip ? names[j] : names[i], pb = flip ? names[i] : names[j];
    const r = playMatch({ seed, shape, perSide, policies: [pa, pb] });
    const w = r.result.winner;
    const g = { shape, seed, side0: pa, side1: pb, winnerSide: w, winner: w == null ? null : w === 0 ? pa : pb, reason: r.result.reason, ticks: r.result.tick, beds: r.result.beds, kills: r.result.kills };
    games.push(g);
    if (pa === pb) { mirrors++; if (w === 0) mirrorSide0++; else if (w == null) mirrorSide0 += 0.5; }
    for (const [k, n] of Object.entries(r.fails)) { const key = k.replace(/\(.*$/, '').trim(); faults[key] = (faults[key] || 0) + n; }
    if (!quiet) console.log(`${shape.padEnd(9)} ${seed} ${pa.padEnd(8)} v ${pb.padEnd(8)} -> ${g.winner ?? 'draw'} (${g.reason}, ${g.ticks} ticks, kills ${g.kills.join('-')})`);
  }
}
// pairings (from the first-named policy's point of view)
const pairs = {};
for (const g of games) {
  if (g.side0 === g.side1) continue;
  const [a, b] = [g.side0, g.side1].sort((x, y) => names.indexOf(x) - names.indexOf(y));
  const p = pairs[`${a} v ${b}`] ||= { a, b, n: 0, wins: 0, draws: 0, losses: 0 };
  p.n++;
  if (g.winner === a) p.wins++; else if (g.winner == null) p.draws++; else p.losses++;
}
for (const p of Object.values(pairs)) { p.score = +((p.wins + p.draws / 2) / p.n).toFixed(3); p.ci = wilson(p.wins + p.draws / 2, p.n); }
const btGames = games.filter((g) => g.side0 !== g.side1).map((g) => ({ a: g.side0, b: g.side1, sa: g.winner == null ? 0.5 : g.winner === g.side0 ? 1 : 0 }));
const rating = bradleyTerry(btGames, names);
const summary = {
  games: games.length, seconds: +((performance.now() - t0) / 1000).toFixed(1),
  rating, pairs: Object.values(pairs),
  mirror_side0: mirrors ? +(mirrorSide0 / mirrors).toFixed(3) : null, mirrors,
  draws: games.filter((g) => g.winner == null).length,
  median_ticks: games.map((g) => g.ticks).sort((a, b) => a - b)[Math.floor(games.length / 2)],
  faults: Object.entries(faults).sort((a, b) => b[1] - a[1]).slice(0, 12),
};
console.log('\nrating (Elo scale, random = 0):', JSON.stringify(rating));
for (const p of summary.pairs) console.log(`  ${p.a.padEnd(8)} v ${p.b.padEnd(8)} ${p.wins}-${p.draws}-${p.losses}  score ${p.score}  95% [${p.ci.join(', ')}]  n ${p.n}`);
console.log(`mirror matches won by side 0: ${summary.mirror_side0} (n ${mirrors}); draws ${summary.draws}/${games.length}; median ${summary.median_ticks} ticks; ${summary.seconds}s`);
console.log('faults:', summary.faults.map(([k, n]) => `${n}× ${k}`).join(' | '));
if (out) writeFileSync(out, JSON.stringify({ ran: new Date().toISOString(), seeds, shapes, policies: names, perSide, summary, games }, null, 1));
