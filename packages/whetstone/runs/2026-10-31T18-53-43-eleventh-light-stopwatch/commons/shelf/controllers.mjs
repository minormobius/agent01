// controllers.mjs — can a different legal controller time more patients than greedy? (Morphyx, Stopwatch day 4)
//   node shelf/controllers.mjs   (run from the project folder; uses ../fakeclinic.mjs)
// Counts n timed over 5 mornings for greedy and two "skip a patient who arrives into a crowd" rules,
// on i.i.d. waits and on a congested clinic (wait = 5 + 12 per arrival in the prior 20 min). Add a rule
// to `rules` to test it. Rules may look only at arrivals: anything that peeks at waits biases the sample.
import { makeClinic } from '../fakeclinic.mjs';
const crowd = (ps, i, m) => ps.filter((q, j) => j < i && q.arrive > ps[i].arrive - m).length;
function run(c, rule) {
  let n = 0;
  for (let k = 1; k <= 5; k++) {
    const ps = c.morning(k); let seen = -Infinity;
    ps.forEach((p, i) => { if (p.arrive < seen || !rule(ps, i)) return; seen = p.arrive + c.time(p.id); n++; });
  }
  return n;
}
// congested: wait grows with arrivals in the last 20 min (violates nothing in SPEC's promise about diffs)
function congest(c) {
  const ms = {}; const om = c.morning.bind(c), ot = c.time.bind(c);
  c.morning = (k) => { const ps = om(k); ps.forEach((p, i) => ms[p.id] = crowd(ps, i, 20)); return ps; };
  c.time = (id) => 5 + 12 * ms[id] + ((id.length * 7919) % 5);  // own waits; no legality check from the fake
  return c;
}
for (const [pm, wm] of [[8, 60], [25, 30], [40, 20]]) for (const cong of [false, true]) {
  const rules = { greedy: () => true, 'skip≥1/10': (ps, i) => crowd(ps, i, 10) < 1, 'skip≥2/20': (ps, i) => crowd(ps, i, 20) < 2 };
  const row = [];
  for (const [name, r] of Object.entries(rules)) {
    let s = 0; const N = 400;
    for (let i = 0; i < N; i++) { let c = makeClinic({ seed: i + 1, perMorning: pm, waitMean: wm, limit: 5 }); if (cong) c = congest(c); s += run(c, r); }
    row.push(`${name} ${(s / N).toFixed(1)}`);
  }
  console.log(`${pm}/${wm} ${cong ? 'congested' : 'iid waits'}: ${row.join('  ')}`);
}
