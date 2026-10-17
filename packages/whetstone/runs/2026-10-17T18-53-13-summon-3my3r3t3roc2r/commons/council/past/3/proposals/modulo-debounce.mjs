// Modulo: does tape's CardWatcher debounce hold a card on the pad? Measured, not argued.
// node proposals/modulo-debounce.mjs        (runs in a few seconds)
// A card sits on the pad for 1 h. The reader is polled at 8 Hz, and each poll misses with
// some probability. We count false "gone" events. Each one means: pause, save, WiFi up,
// card re-read, WiFi down, resume. A "bedtime" card without resume would restart the book.
import { Sim } from '../tools/des/des.mjs';

function run({ N, channel, seed, hours = 1 }) {
  const sim = new Sim({ seed });
  let falseGone = 0, believed = true, misses = 0, bad = false;
  // Gilbert-Elliott channel: a 'good' state misses with pg; a 'bad' state (a child leaning,
  // the card skewed in the nest) misses with pb.
  function* reader() {
    for (;;) {
      yield sim.timeout(0.125);
      if (channel.kind === 'iid') { sim.inject('read', sim.random() >= channel.p); continue; }
      if (sim.random() < (bad ? channel.leave : channel.enter)) bad = !bad;
      sim.inject('read', sim.random() >= (bad ? channel.pb : channel.pg));
    }
  }
  function* watcher() {           // the rule as written in tape/sim: N consecutive misses = gone
    for (;;) {
      const ok = yield sim.signal('read');
      if (ok) { misses = 0; believed = true; }
      else if (believed && ++misses >= N) { falseGone++; believed = false; misses = 0; }
    }
  }
  sim.process(watcher); sim.process(reader);
  sim.run({ until: hours * 3600 });
  return falseGone;
}

const channels = [
  { name: 'iid 5%', kind: 'iid', p: 0.05 },
  { name: 'iid 10%', kind: 'iid', p: 0.10 },
  { name: 'iid 25% (sim flaky)', kind: 'iid', p: 0.25 },
  // bursts: a 2 s bad spell about once a minute, 70% misses inside it, 2% outside
  { name: 'bursty 2s@70%/min', kind: 'ge', pg: 0.02, pb: 0.70, enter: 0.125 / 60, leave: 0.125 / 2 },
];
console.log('false "gone" per hour with the card never moved (mean of seeds 1-5)');
console.log('N  latency  ' + channels.map(c => c.name.padEnd(22)).join(''));
for (const N of [2, 3, 4, 6, 8, 12]) {
  const cells = channels.map(c => {
    let s = 0; for (let seed = 1; seed <= 5; seed++) s += run({ N, channel: c, seed });
    return (s / 5).toFixed(1).padEnd(22);
  });
  console.log(`${String(N).padEnd(3)}${(N * 0.125).toFixed(2).padStart(5)} s  ${cells.join('')}`);
}
// Cross-check for iid: runs of at least N misses start at rate 8 (1-p) p^N per second.
for (const p of [0.10, 0.25]) console.log(`closed form, iid ${p * 100}%, N=3: ${(8 * 3600 * (1 - p) * p ** 3).toFixed(1)}/h`);
