// worker.js — grows a whole town off the page's thread: the ground (packages/morph/ground.js), the
// settlement field on it (../field.js: ~7 s of land market, lanes, walls, bridges), then morph's
// blocks, plots and buildings read off the field. Posts progress, then the city with its functions
// stripped (structured clone) and the ground as its heightfield.
import { Ground } from './ground.js';
import { generate, envelope } from './morph.js';
import { transport } from './mobility.js';
import { growCity } from '../field.js';

self.onmessage = (e) => {
  const { seed, plotScale = 1, streetScale = 1, heightScale = 1, wallsAt = 60, peak = 70000 } = e.data;
  const say = (stage, extra = {}) => self.postMessage({ stage, ...extra });
  try {
    let t = performance.now();
    say('ground');
    const ground = Ground(seed);
    const tg = performance.now() - t; t = performance.now();
    say('field');
    const field = growCity(`${seed}:polis`, { sampler: ground.sampler(), riverPath: ground.riverPathKm(), river: ground.hasRiver, wallsAt, popSeries: envelope(240, peak), agentCap: 6000 });
    const tf = performance.now() - t; t = performance.now();
    say('plan');
    const city = generate({ seed, field, ground, plotScale, streetScale, heightScale });
    const tm = performance.now() - t; t = performance.now();
    say('transport');
    transport(city);                           // who lives and works where, and the railway, trams, buses and cars, era by era
    const tt = performance.now() - t;
    const events = field.events.filter((x) => ['founded', 'walls', 'spill', 'displace', 'immigrant', 'bridge', 'mech', 'sack'].includes(x.type) || /bridge/.test(x.note || '')).map((x) => ({ year: city.yearOf(x.t), type: x.type, text: x.note }));
    delete city.ground; delete city.rentOf; delete city.yearOf; delete city._index;
    const g = { n: ground.n, size: ground.size, cell: ground.cell, h: ground.h, relief: ground.relief, soil: ground.soil.label, coast: ground.coast, river: ground.river ? { path: ground.river.path, width: ground.river.width } : null };
    self.postMessage({ stage: 'done', city, ground: g, events, ms: { ground: tg, field: tf, plan: tm, transport: tt } });
  } catch (err) {
    self.postMessage({ stage: 'error', message: String(err && err.stack || err) });
  }
};
