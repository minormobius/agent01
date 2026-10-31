// node shelf/rcpm-oracle.mjs [path/to/des.mjs] [cases]
// simulateProject() vs a list scheduler written from SPEC M5's text alone, WITH resources.
// Random DAGs, shuffled listing, integer durations incl. zeros, 1–3 resources of small capacity.
// Checks start/end of every task, the finish, and the critical set. Exit 1 on any mismatch.
// It shares no code with des.mjs. Its one reading of the spec beyond the text: a zero-duration
// task holds its units until the scan it started in is over, then releases them and triggers
// another scan at the same instant (README decision 9). (Morphyx)
import { pathToFileURL } from 'node:url';
const { simulateProject, makeRng } = await import(pathToFileURL(process.argv[2] || './des.mjs').href);
const CASES = +(process.argv[3] || 3000);

function oracle(tasks, resources, dur) {
  const n = tasks.length, byId = new Map(tasks.map((t, i) => [t.id, i]));
  const free = { ...resources }, start = Array(n), end = Array(n), done = Array(n).fill(false);
  const fits = (i) => Object.entries(tasks[i].uses).every(([r, u]) => free[r] >= u);
  let t = 0, left = n;
  while (left) {
    // release everything that finishes now (all of them, before the scan)
    for (let i = 0; i < n; i++) if (start[i] !== undefined && !done[i] && end[i] === t) {
      done[i] = true; left--; for (const [r, u] of Object.entries(tasks[i].uses)) free[r] += u;
    }
    let startedZero = false;
    for (let i = 0; i < n; i++) {
      if (start[i] !== undefined) continue;
      if (!tasks[i].deps.every((d) => done[byId.get(d)])) continue;
      if (!fits(i)) continue;
      start[i] = t; end[i] = t + dur[i];
      for (const [r, u] of Object.entries(tasks[i].uses)) free[r] -= u;
      if (dur[i] === 0) startedZero = true;
    }
    if (startedZero) continue;            // same instant, release the zeros, scan again
    const next = Math.min(...end.filter((e, i) => e !== undefined && !done[i]));
    if (!isFinite(next)) { if (left === 0) break; throw new Error('oracle stuck'); };
    t = next;
  }
  const finish = Math.max(0, ...end);
  const crit = new Set(); for (let i = 0; i < n; i++) if (end[i] === finish) crit.add(i);
  const shares = (a, b) => Object.keys(tasks[a].uses).some((r) => tasks[a].uses[r] > 0 && (tasks[b].uses[r] || 0) > 0);
  let grew = true;
  while (grew) { grew = false;
    for (const y of [...crit]) for (let x = 0; x < n; x++) {
      if (crit.has(x) || end[x] !== start[y]) continue;
      if (tasks[y].deps.includes(tasks[x].id) || shares(x, y)) { crit.add(x); grew = true; }
    }
  }
  return { finish, start, end, crit };
}

const r = makeRng(7); let bad = 0; const shown = [];
for (let k = 0; k < CASES; k++) {
  const nr = 1 + Math.floor(r() * 3), resources = {};
  for (let j = 0; j < nr; j++) resources['R' + j] = 1 + Math.floor(r() * 3);
  const n = 1 + Math.floor(r() * 10), tasks = [];
  for (let i = 0; i < n; i++) {
    const deps = []; for (let j = 0; j < i; j++) if (r() < 0.25) deps.push('t' + j);
    const uses = {}; for (const R in resources) if (r() < 0.5) uses[R] = Math.floor(r() * (resources[R] + 1)); // may be 0
    tasks.push({ id: 't' + i, duration: Math.floor(r() * 5), deps, uses });
  }
  const listed = [...tasks]; for (let i = listed.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [listed[i], listed[j]] = [listed[j], listed[i]]; }
  const dur = listed.map((t) => t.duration);
  const o = oracle(listed, resources, dur);
  const s = simulateProject({ tasks: listed, resources }, dur);
  const sc = new Set(listed.map((_, i) => i).filter((i) => s.critical[i]));
  const ok = s.finish === o.finish && listed.every((_, i) => s.start[i] === o.start[i] && s.end[i] === o.end[i])
    && sc.size === o.crit.size && [...sc].every((i) => o.crit.has(i));
  if (!ok) { bad++; if (shown.length < 2) shown.push({ listed, resources, oracle: o, des: s, crit: [...o.crit] }); }
}
for (const x of shown) console.log(JSON.stringify(x));
console.log('mismatches', bad, 'of', CASES, 'cases'); process.exit(bad ? 1 : 0);
