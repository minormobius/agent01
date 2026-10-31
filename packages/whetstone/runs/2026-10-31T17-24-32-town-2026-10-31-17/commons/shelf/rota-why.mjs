// rota-why.mjs — node shelf/rota-why.mjs <dir> SEED:COUNT [SEED:COUNT ...]
// Pulls every exhaustive (unnamed) refusal and give-up out of rota-stress for those seeds, prints each
// team as a day grid (x work day, w weekend, . leave) with its bounds, and asks an independent memoized
// referee whether a rota exists with each rule switched off. The rules whose removal makes it feasible
// are the cause. "budget" = the referee gave up (3M nodes). Modulo, rota 4th.
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = resolve(process.argv[2] ?? '.');
const here = dirname(fileURLToPath(import.meta.url));
const { days, isWeekend } = await import(`${dir}/lib/calendar.mjs`);
const { bounds } = await import(`${dir}/lib/policy.mjs`);
const { validatePeople } = await import(`${dir}/lib/people.mjs`);
const specs = process.argv.slice(3).map((x) => x.split(':').map(Number));
if (!specs.length) { console.error('usage: node shelf/rota-why.mjs <dir> SEED:COUNT [...]'); process.exit(2); }

const teams = [];
for (const [s, c] of specs) {
  const out = spawnSync(process.execPath, [`${here}/rota-stress.mjs`, dir, 'stress', s, c], { encoding: 'utf8' }).stdout.split('\n');
  out.forEach((l, i) => {
    const m = l.match(/^(REFUSED|GAVE UP) (\S+) (\d+) (.*)$/);
    if (m && (m[1] === 'GAVE UP' || /exhaustive/.test(out[i + 1] ?? ''))) teams.push({ seed: s, kind: m[1], start: m[2], n: +m[3], people: validatePeople(JSON.parse(m[4])) });
  });
}
if (!teams.length) console.log('no exhaustive refusals or give-ups for these seeds');
{
}

// Referee: does a rota exist with the given rules on? off = set of 'r3','r4lo','r4hi','r5lo','r5hi','nurse'
function exists(P, start, n, off = new Set()) {
  const ds = days(start, n), wk = ds.map(isWeekend), B = bounds(P, start, n), k = P.length;
  const lo = B.map((b) => (off.has('r4lo') ? 0 : b.lo)), hi = B.map((b) => (off.has('r4hi') ? 1e9 : b.hi));
  const wlo = B.map((b) => (off.has('r5lo') ? 0 : b.wlo)), whi = B.map((b) => (off.has('r5hi') ? 1e9 : b.whi));
  const MR = off.has('r3') ? 1e9 : 5;
  const run = new Array(k).fill(0), tot = new Array(k).fill(0), wkc = new Array(k).fill(0);
  const failed = new Set();
  let nodes = 0;
  function go(d) {
    if (++nodes > 3e6) throw new Error('budget');
    if (d === n) return tot.every((t, i) => t >= lo[i]) && wkc.every((t, i) => t >= wlo[i]);
    for (let i = 0; i < k; i++) { const left = n - d; if (tot[i] + left < lo[i]) return false; }
    const key = `${d}|${run}|${tot}|${wkc}`;
    if (failed.has(key)) return false;
    const ok = (i) => !P[i].leave.has(ds[d]) && run[i] < MR && tot[i] < hi[i] && !(wk[d] && wkc[i] >= whi[i]);
    for (let i = 0; i < k; i++) if (ok(i)) for (let j = i + 1; j < k; j++) if (ok(j)) {
      if (!off.has('nurse') && P[i].role !== 'nurse' && P[j].role !== 'nurse') continue;
      const sr = run.slice();
      for (let x = 0; x < k; x++) run[x] = x === i || x === j ? sr[x] + 1 : 0;
      tot[i]++; tot[j]++; if (wk[d]) { wkc[i]++; wkc[j]++; }
      const r = go(d + 1);
      tot[i]--; tot[j]--; if (wk[d]) { wkc[i]--; wkc[j]--; }
      for (let x = 0; x < k; x++) run[x] = sr[x];
      if (r) return true;
    }
    failed.add(key);
    return false;
  }
  return go(0);
}

for (const t of teams) {
  const ds = days(t.start, t.n);
  console.log(`\n== ${t.kind} seed ${t.seed} ${t.start} ${t.n}d ${t.people.length}p`);
  const B = bounds(t.people, t.start, t.n);
  for (const [i, p] of t.people.entries()) console.log(`${p.name.padEnd(4)} ${p.role.padEnd(5)} ${p.fte} ${ds.map((d) => (p.leave.has(d) ? '.' : isWeekend(d) ? 'w' : 'x')).join('')}  tot ${B[i].total.toFixed(2)} [${B[i].lo},${B[i].hi}] wk ${B[i].weekend.toFixed(2)} [${B[i].wlo},${B[i].whi}]`);
  for (const off of [[], ['r3'], ['r4lo'], ['r4hi'], ['r5lo'], ['r5hi'], ['nurse']]) {
    let r; try { r = exists(t.people, t.start, t.n, new Set(off)); } catch { r = 'budget'; }
    console.log(`  off ${off.join(',') || '(none)'}: ${r}`);
  }
}
