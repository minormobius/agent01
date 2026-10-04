import { readFileSync, writeFileSync } from 'node:fs';
import { record, replay } from './harness.mjs';
import { study } from './stopwatch.mjs';
import { stamp, filter } from './fresh.mjs';
const links = JSON.parse(readFileSync('links.json', 'utf8'));
const read = (p) => readFileSync(p, 'utf8');
const today = new Date().toISOString().slice(0, 10);
const ev = [];
const t = (check, ok) => ev.push(stamp({ check, result: ok ? 'pass' : 'fail', at: today }, links, read));
const det = (sim) => sim.process(function* () { yield sim.timeout(2); sim.decide('x', 1); });
const log = await record(det, { seed: 1, until: 5 });
t('t-replay', replay(det, log, { seed: 1, until: 5 }).ok);
const noisy = (sim) => { for (let i = 0; i < 10; i++) sim.schedule(i, () => sim.decide('c', Math.random() < 0.5)); };
t('t-catch', !replay(noisy, await record(noisy, { seed: 1, until: 12 }), { seed: 1, until: 12 }).ok);
// a tiny clinic: three patients a morning, waits of 20, tablet reads 5 long
const clinic = (limit) => { let asked = 0; const timed = []; return { asked: () => asked, timed,
  morning(k) { if (k > limit) throw new Error('limit'); asked = k; return [0, 10, 40].map((a, i) => ({ id: `${k}-${i}`, arrive: a })); },
  time(id) { timed.push(id); return 20; }, tablet() { return 25 + (timed.length % 2 ? 0.5 : -0.5); } }; };
const c = clinic(5); const r = await study(c, { seed: 1, maxMornings: 5 });
t('t-order', !c.timed.some((id) => id.endsWith('-1')));
const c3 = clinic(3); await study(c3, { seed: 1, maxMornings: 3 }); t('t-limit', c3.asked() === 3);
t('t-interval', r.lo < 5 && 5 < r.hi);
t('t-verdict', r.verdict === 'tablet reads long');
t('t-stamp', Object.keys(stamp({ check: 't-stamp' }, links, read).digests).includes('fresh.mjs'));
t('t-drop', filter([{ check: 'x', digests: { 'fresh.mjs': 'stale' } }], links, read).length === 0);
writeFileSync('evidence.json', JSON.stringify(ev, null, 1));
process.exit(ev.every((e) => e.result === 'pass') ? 0 : 1);
