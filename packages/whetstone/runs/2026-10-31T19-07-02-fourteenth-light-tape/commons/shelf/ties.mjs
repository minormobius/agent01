// ties.mjs — does a record/replay harness agree when an injection lands on the same sim instant as
// model entries? (Morphyx, Stopwatch day 2)
//   node shelf/ties.mjs [harness.mjs] [cases]
// Random des models with integer times (so ties are common): entries queued at setup and from
// inside processes, zero-delay hops, decisions that read state the injection changes synchronously
// (a subscribed box) or through a signal. Each is recorded at three scales and replayed. Prints
// the first mismatches; exit 1 if any. Needs harness exports record/replay with SPEC H1's shapes.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [h = 'harness.mjs', N = 300] = process.argv.slice(2);
const { record, replay } = await import(pathToFileURL(resolve(h)).href);
function lcg(x) { return (n) => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return (x >>> 8) % n; }; }
function model(c) {
  const r = lcg(c * 2654435761 >>> 0), plan = [];
  for (let i = 0, k = 2 + r(5); i < k; i++) plan.push({ setup: r(2) === 0, at: r(6), hops: r(3), pre: r(3) });
  return (sim) => {
    const box = sim.subscribe('x'); let sig = 0, hits = 0;
    sim.process(function* () { for (;;) { yield sim.signal('x'); sig++; } });
    const look = (i) => { hits++; sim.decide('look', { i, size: box.size, sig, hits }); };
    const chain = (i, n) => (n ? sim.schedule(0, () => chain(i, n - 1)) : look(i));
    plan.forEach((p, i) => {
      if (p.setup) sim.schedule(p.at, () => chain(i, p.hops));
      else sim.process(function* () {
        const pre = p.pre && p.pre <= p.at ? p.pre : 0;
        if (pre) yield sim.timeout(pre);
        yield sim.timeout(p.at - pre);
        for (let k = 0; k < p.hops; k++) yield sim.timeout(0);
        look(i);
      });
    });
  };
}
const r = lcg(99); let bad = 0;
for (let c = 0; c < +N; c++) {
  const inj = []; for (let i = 0, k = 1 + r(4); i < k; i++) inj.push({ at: r(7), name: 'x', value: i });
  const scale = [1, 7, 0.25][c % 3], m = model(c);
  const log = await record(m, { seed: 1, until: 8, scale, injections: inj });
  const res = await replay(m, log, { seed: 1, until: 8 });
  if (!res.ok && ++bad <= 3) console.log(`case ${c} scale ${scale}:`, JSON.stringify(res.mismatches[0]));
}
console.log(`${N - bad}/${N} agree`);
process.exit(bad ? 1 : 0);
