// node house/api/play.test.mjs : the play route answers every form x genre, and the wander twin
// inside it is the one checked against the wasm (spot values pinned from the wasm, 10-13).
import route, { passage } from './play.mjs';
import assert from 'node:assert/strict';
const R = async (p) => { const r = await route(new Request('https://miniphim.minomobi.com/api/play/' + p), { path: p.split('?')[0], params: new URL('https://x/?' + (p.split('?')[1] || '')).searchParams }); return r; };
let r = await R(''); assert.equal(r.status, 200); assert.ok((await r.json()).route);
for (const f of ['track', 'wander']) for (const g of ['garden', 'jazz', 'electronica']) {
  r = await R(`${f}/${g}/5?n=3`); assert.equal(r.status, 200, f + g); const o = await r.json();
  assert.equal(o.n, f === 'track' ? 1 : 3); assert.ok(o.phrases[0].notes.length > 30, f + g);
  for (const p of o.phrases) for (const e of p.notes) { assert.ok(e.t >= 0 && e.t < 33 && e.d > 0 && e.midi > 20 && e.midi < 110, JSON.stringify(e)); }
}
// the track garden melody is the /api/jams/score tune
const { score } = await import('./jams.mjs');
const tg = passage('track', 'garden', 5).phrases[0].notes.filter(e => e.part === 'melody').map(e => e.midi);
assert.deepEqual(tg, score(5).notes.map(n => n.midi));
// the wander melody is the same in every genre (drift draws are the same in each)
const mel = g => passage('wander', g, 7, { n: 6 }).phrases.map(p => p.melody).join('|');
assert.equal(mel('garden'), mel('jazz')); assert.equal(mel('jazz'), mel('electronica'));
// from/n slices the same walk
assert.deepEqual(passage('wander', 'jazz', 3, { from: 2, n: 1 }).phrases[0], passage('wander', 'jazz', 3, { n: 3 }).phrases[2]);
// pinned from the wasm: wander seed 1, phrase 0 melody
assert.equal(passage('wander', 'garden', 1, { n: 1 }).phrases[0].melody, 'G4 B4 G4 F4 D4 B3 C4 D4 C4 D4 C4 F4 E4 D4 A3 B3 C4 C4 D4 A3 B3 C4 D4 E4 F4 G4');
for (const [p, s] of [['wander/jazz/0', 400], ['wander/jazz/5?n=65', 400], ['wander/jazz/5?from=1001', 400], ['wander/funk/5', 404], ['track/jazz/5?bass=tuba', 400], ['track/jazz/5?ride=4', 400], ['track/jazz/5?format=midi', 400]])
  assert.equal((await R(p)).status, s, p);
r = await R('wander/garden/1?n=2&format=abc'); const abc = await r.text(); assert.match(abc, /^X:1\n/); assert.match(abc, /K:C\n/);
r = await R('wander/jazz/1?n=2&format=text'); assert.equal((await r.text()).trim().split('\n').length, 2);
r = await R('wander/garden/1?bass=off&n=1'); assert.ok((await r.json()).phrases[0].notes.every(e => e.part !== 'bass'));
console.log('play route ok');
