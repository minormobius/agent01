// node shelf/cpm-oracle.mjs [path/to/des.mjs] [cases] — forecast() vs an independent CPM on random DAGs (no resources, fixed durations)
import { pathToFileURL } from 'node:url';
const { forecast, makeRng } = await import(pathToFileURL(process.argv[2] || './des.mjs').href);
const CASES = +(process.argv[3] || 2000);
const r = makeRng(42); let bad = 0, critBad = 0;
for (let k = 0; k < CASES; k++) {
  const n = 1 + Math.floor(r() * 12), tasks = [];
  for (let i = 0; i < n; i++) { const deps = []; for (let j = 0; j < i; j++) if (r() < 0.3) deps.push('t' + j); tasks.push({ id: 't' + i, duration: Math.floor(r() * 6), deps }); }
  // shuffle listing order
  const listed = [...tasks].sort(() => r() - 0.5);
  const ef = {}; const get = (id) => ef[id] ??= (tasks.find(t => t.id === id).duration + Math.max(0, ...tasks.find(t => t.id === id).deps.map(get)));
  const cp = Math.max(0, ...tasks.map(t => get(t.id)));
  const f = forecast({ tasks: listed, resources: {} }, { runs: 3 });
  if (f.p50 !== cp || f.p95 !== cp || f.mean !== cp) bad++;
  // criticality, no resources: X critical iff on a zero-slack chain ending at finish (classic CPM with ES)
  const es = {}; for (const t of tasks) es[t.id] = get(t.id) - t.duration;
  const crit = new Set(tasks.filter(t => get(t.id) === cp).map(t => t.id));
  let grew = true; while (grew) { grew = false; for (const y of tasks) if (crit.has(y.id)) for (const d of y.deps) if (!crit.has(d) && get(d) === es[y.id]) { crit.add(d); grew = true; } }
  for (const t of tasks) if ((f.criticality[t.id] === 1) !== crit.has(t.id)) critBad++;
}
console.log('percentile mismatches', bad, 'criticality mismatches', critBad, 'of', CASES, 'cases'); process.exit(bad || critBad ? 1 : 0);
