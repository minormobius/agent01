#!/usr/bin/env node
// rota-stress.mjs — judge a rota program against POLICY.md on random teams, and measure drift.
//   node shelf/rota-stress.mjs <dir> stress SEED COUNT     random teams: made / refused (by reason) / gave up / UNLAWFUL, worst ms
//   node shelf/rota-stress.mjs <dir> drift PERIODS          clinic people.json, no leave, consecutive 28-day periods:
//                                                           cumulative (shifts − share) per person, totals and weekends
//   node shelf/rota-stress.mjs <dir> clinic START DAYS      people.json: breaches + share vs got, per person
// <dir> holds lib/assign.mjs (makeRota), lib/policy.mjs (checkRota, shares), lib/people.mjs.
// Made by Morphyx (rota, third time). Re-derived three times by hand before it was shelved.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [dir = '.', mode = 'stress', a, b] = process.argv.slice(2);
const lib = (f) => import(pathToFileURL(resolve(dir, 'lib', f)).href);
const { makeRota } = await lib('assign.mjs');
const { checkRota, shares, tally } = await lib('policy.mjs');
const { loadPeople } = await lib('people.mjs');

function mulberry32(s) { return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const addDays = (s, k) => new Date(Date.parse(`${s}T00:00:00Z`) + k * 864e5).toISOString().slice(0, 10);

export function randomTeam(rnd) {
  const n = rnd() < 0.2 ? 60 + Math.floor(rnd() * 306) : 7 + Math.floor(rnd() * 50);
  const start = addDays('2026-01-01', Math.floor(rnd() * 365));
  const k = 3 + Math.floor(rnd() * 10);
  const people = Array.from({ length: k }, (_, i) => {
    const leave = new Set();
    for (let j = Math.floor(rnd() * 4); j > 0; j--) { const s = Math.floor(rnd() * n), L = 1 + Math.floor(rnd() * 10); for (let x = 0; x < L; x++) leave.add(addDays(start, s + x)); }
    return { name: `P${i}`, role: i === 0 || rnd() < 0.5 ? 'nurse' : 'aide', fte: rnd() < 0.6 ? 1 : Math.round((0.2 + rnd() * 0.8) * 10) / 10, leave };
  });
  return { people, start, n };
}

if (mode === 'stress') {
  const rnd = mulberry32(Number(a ?? 1)), count = Number(b ?? 200);
  const res = { made: 0, unlawful: 0, gaveUp: 0, refused: {} }; let worst = 0, worstCase = '';
  for (let c = 0; c < count; c++) {
    const { people, start, n } = randomTeam(rnd);
    const t0 = performance.now();
    try {
      const r = makeRota(people, start, n);
      const bad = checkRota(people, start, n, r);
      if (bad.length) { res.unlawful++; console.log('UNLAWFUL', start, n, bad.slice(0, 3)); } else res.made++;
    } catch (e) {
      if (/search steps/.test(e.message)) { res.gaveUp++; console.log('GAVE UP', start, n, JSON.stringify(people.map((p) => ({ ...p, leave: [...p.leave].sort() })))); }
      else {
        if (/exhaustive/.test(e.message) || process.env.SHOW_REFUSED) console.log('REFUSED', start, n, JSON.stringify(people.map((p) => ({ ...p, leave: [...p.leave].sort() }))), '\n ', e.message);
        const key = e.message.replace(/\d{4}-\d{2}-\d{2}/g, 'D').replace(/\d+/g, 'N'); res.refused[key] = (res.refused[key] || 0) + 1; }
    }
    const ms = performance.now() - t0; if (ms > worst) { worst = ms; worstCase = `${start} ${n}d ${people.length}p`; }
  }
  console.log(JSON.stringify(res, null, 1)); console.log(`worst ${worst.toFixed(0)} ms (${worstCase})`);
} else if (mode === 'drift') {
  const P = Number(a ?? 26);
  const people = loadPeople(resolve(dir, 'people.json')).map((p) => ({ ...p, leave: new Set() }));
  const acc = Object.fromEntries(people.map((p) => [p.name, { t: 0, w: 0 }]));
  for (let q = 0; q < P; q++) {
    const start = addDays('2026-11-02', 28 * q), r = makeRota(people, start, 28), t = tally(people, r);
    if (checkRota(people, start, 28, r).length) console.log('UNLAWFUL period', q);
    for (const s of shares(people, start, 28)) { acc[s.name].t += t[s.name].total - s.total; acc[s.name].w += t[s.name].weekend - s.weekend; }
  }
  for (const [k, v] of Object.entries(acc)) console.log(k.padEnd(8), 'total', v.t.toFixed(2).padStart(7), ' weekend', v.w.toFixed(2).padStart(7));
} else if (mode === 'clinic') {
  const people = loadPeople(resolve(dir, 'people.json')), start = a ?? '2026-11-02', n = Number(b ?? 28);
  const r = makeRota(people, start, n), t = tally(people, r);
  console.log('breaches:', checkRota(people, start, n, r));
  for (const s of shares(people, start, n)) console.log(s.name.padEnd(8), 'share', s.total.toFixed(2), 'got', t[s.name].total, ' wk share', s.weekend.toFixed(2), 'got', t[s.name].weekend);
}
