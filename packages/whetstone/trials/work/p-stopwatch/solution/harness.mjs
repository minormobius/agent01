// harness.mjs — reference: record a model under runRealtime with a fake clock, replay under run().
import { Sim } from './tools/des/des.mjs';

function fakeClock(injections, scale, simRef) {
  const pending = injections.map((x) => ({ ...x, wall: x.at * scale })).sort((a, b) => a.wall - b.wall);
  const c = { t: 0, now: () => c.t, async sleep(ms) {
    const target = c.t + ms;
    const p = pending[0];
    if (p && p.wall <= target) { pending.shift(); c.t = p.wall; simRef.sim.inject(p.name, p.value); simRef.log.push({ t: p.at, kind: 'inject', data: { name: p.name, value: p.value } }); }
    else c.t = target;
  } };
  return c;
}

export async function record(model, { seed = 1, until, scale = 1, injections = [] } = {}) {
  const ref = { sim: null, log: [] };
  const sim = new Sim({ seed, clock: fakeClock(injections, scale, ref) });
  ref.sim = sim;
  sim.decide = (kind, data) => ref.log.push({ t: sim.now, kind, data });
  model(sim);
  await sim.runRealtime({ until, scale });
  return ref.log;
}

export function replay(model, log, { seed = 1, until } = {}) {
  const sim = new Sim({ seed });
  const got = [];
  sim.decide = (kind, data) => got.push({ t: sim.now, kind, data });
  for (const e of log.filter((x) => x.kind === 'inject')) {
    sim.schedule(e.t, () => { got.push({ t: sim.now, kind: 'inject', data: e.data }); sim.inject(e.data.name, e.data.value); });
  }
  model(sim);
  sim.run({ until });
  const mismatches = [];
  const n = Math.max(got.length, log.length);
  for (let i = 0; i < n; i++) if (JSON.stringify(got[i]) !== JSON.stringify(log[i])) mismatches.push({ index: i, expected: log[i], got: got[i] });
  return { ok: mismatches.length === 0, mismatches };
}
