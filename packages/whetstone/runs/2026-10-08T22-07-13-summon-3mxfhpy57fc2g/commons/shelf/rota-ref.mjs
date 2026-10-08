// node shelf/rota-ref.mjs <dir> team.json START DAYS
// Exact referee for one team: plain DFS over lawful pairs, memo on (day, runs, totals, weekend totals),
// 40M-node budget. Prints FEASIBLE (and checkRota's verdict on what it found), IMPOSSIBLE, or budget.
// Trust "IMPOSSIBLE"; "budget" means nothing. Agreed with makeRota on 120/120 small random teams.
// Uses only <dir>/lib/{policy,calendar}.mjs, never assign.mjs. Modulo, rota 4th.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [dir, file, S, N0] = process.argv.slice(2); const N = +N0;
const { bounds, checkRota } = await import(pathToFileURL(resolve(dir, 'lib/policy.mjs')).href);
const { days, isWeekend } = await import(pathToFileURL(resolve(dir, 'lib/calendar.mjs')).href);
const P = JSON.parse(readFileSync(file, 'utf8')).map((p) => ({ ...p, leave: new Set(p.leave) }));
const ds = days(S, N), wk = ds.map(isWeekend), k = P.length;
const B = bounds(P, S, N);
const av = P.map((p) => ds.map((d) => !p.leave.has(d)));
const isN = P.map((p) => p.role === 'nurse');
const pairs = ds.map((_, d) => { const o = []; for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (av[i][d] && av[j][d] && (isN[i] || isN[j])) o.push([i, j]); return o; });
// suffix availability counts for pruning
const remAv = P.map((_, i) => { const r = new Array(N + 1).fill(0); for (let d = N - 1; d >= 0; d--) r[d] = r[d + 1] + (av[i][d] ? 1 : 0); return r; });
const remWk = P.map((_, i) => { const r = new Array(N + 1).fill(0); for (let d = N - 1; d >= 0; d--) r[d] = r[d + 1] + (av[i][d] && wk[d] ? 1 : 0); return r; });
const fail = new Set(); let nodes = 0; const LIM = 4e7;
const run = new Array(k).fill(0), t = new Array(k).fill(0), w = new Array(k).fill(0), pick = [];
function dfs(d) {
  if (++nodes > LIM) throw new Error('budget');
  if (d === N) return P.every((_, i) => t[i] >= B[i].lo && w[i] >= B[i].wlo);
  for (let i = 0; i < k; i++) if (t[i] + remAv[i][d] < B[i].lo || w[i] + remWk[i][d] < B[i].wlo) return false;
  const key = d + '|' + run.join(',') + '|' + t.join(',') + '|' + w.join(',');
  if (fail.has(key)) return false;
  for (const [a, b] of pairs[d]) {
    if (run[a] >= 5 || run[b] >= 5 || t[a] >= B[a].hi || t[b] >= B[b].hi) continue;
    if (wk[d] && (w[a] >= B[a].whi || w[b] >= B[b].whi)) continue;
    const saved = run.slice();
    for (let x = 0; x < k; x++) run[x] = (x === a || x === b) ? run[x] + 1 : 0;
    t[a]++; t[b]++; if (wk[d]) { w[a]++; w[b]++; } pick.push([a, b]);
    if (dfs(d + 1)) return true;
    pick.pop(); t[a]--; t[b]--; if (wk[d]) { w[a]--; w[b]--; } for (let x = 0; x < k; x++) run[x] = saved[x];
  }
  fail.add(key); return false;
}
const t0 = Date.now();
try {
  const ok = dfs(0);
  console.log('exact:', ok ? 'FEASIBLE' : 'IMPOSSIBLE', nodes, 'nodes', Date.now() - t0, 'ms');
  if (ok) { const r = Object.fromEntries(ds.map((d, i) => [d, pick[i].map((x) => P[x].name)])); console.log('checkRota breaches', checkRota(P, S, N, r).length); }
} catch (e) { console.log('exact:', e.message, nodes, Date.now() - t0, 'ms'); }
