// node house/api/jams.test.mjs : no network. Modulo, 2026-10-13.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import handler, { gen, score, rack, genre, arrange, tuneFrom } from './jams.mjs';

// 1. The twin writes the same bytes as the score wasm. Pinned from www/jams/score/wasm.js
//    (sha 6ea9e7d7…), seeds 1..20000, buf bytes then '|', per mode.
const PIN = { false: 'f15b6c4d3656d2ae10858b14ad315972d005bb525bde46c16bbef88833532ead', true: 'fcebe279b1d65157b5a563a53582c74fc4cd68694bed33613d14a6685bfc4c22' };
for (const rem of [false, true]) {
  const h = createHash('sha256');
  for (let s = 1; s <= 20000; s++) { h.update(Uint8Array.from(gen(s, rem).flatMap(([d, l]) => [d + 2, l]))); h.update('|'); }
  assert.equal(h.digest('hex'), PIN[rem], 'twin drifted from the wasm, remember=' + rem);
}
// 2. If the pages sit beside us (they do in the commons), check against them directly.
const www = new URL('../../www/jams/', import.meta.url);
if (existsSync(new URL('score/wasm.js', www))) {
  const W = await import(new URL('score/wasm.js', www));
  const s = (await WebAssembly.instantiate(Uint8Array.from(atob(W.WASM_B64), c => c.charCodeAt(0)))).instance.exports;
  for (let seed = 1; seed <= 3000; seed++) for (const rem of [false, true]) {
    const n = rem ? s.generate2(seed) : s.generate(seed), m = [...new Uint8Array(s.memory.buffer, s.buf(), 2 * n)];
    assert.deepEqual(gen(seed, rem).flatMap(([d, l]) => [d + 2, l]), m, 'seed ' + seed);
  }
  const G = await import(new URL('genre/genre.js', www));
  const pasted = readFileSync(new URL('./jams.mjs', import.meta.url), 'utf8').split('(www/jams/genre/genre.js, verbatim) ----\n')[1].split('// ---- GENRE END ----')[0];
  assert.equal(pasted, readFileSync(new URL('genre/genre.js', www), 'utf8'), 'genre.js changed: rerun shelf/jams/build-route.mjs');
  for (const st of ['jazz', 'electronica']) for (let seed = 1; seed <= 300; seed++)
    assert.deepEqual(arrange(st, tuneFrom(s, seed), seed), G.arrange(st, G.tuneFrom(s, seed), seed), st + ' ' + seed);
  // the route's copy of the rack's parts must still be the page's lines
  const rk = readFileSync(new URL('rack/rack.js', www), 'utf8');
  for (const line of ['b === 3 || b === 6 ? 43 : 36', 'length: 16 }, (_, i) => [4 * i, 1, 33]', 'n.at % 8 === 0).map(n => [n.at, 2, midi(n.d) + 12]', 'T.map(n => [n.at, n.len, midi(n.d - 2)])']) assert.ok(rk.includes(line), 'rack.js changed: ' + line);
  console.log('checked against the pages: 6000 tunes, 600 arrangements');
}
// 3. Shapes. Seed 5 is the board's seed: bar 4 is C G.
const o = score(5);
assert.equal(o.notes.length, 28); assert.equal(o.text.split(' | ')[3], 'C4 G4');
assert.equal(o.notes.reduce((a, n) => a + n.len, 0), 32);
assert.ok(o.abc.startsWith('X:5\n') && o.abc.trim().endsWith('C8 |]'));
assert.equal(score(5).text.split(' | ')[4].split(' ')[0], 'A4');                // C G A as written
assert.equal(score(5, true).text.split(' | ')[4].split(' ')[0], 'F4');          // C G F, remembering the leap
for (let s = 1; s <= 2000; s++) { // every ABC bar holds 8 eighths
  const body = score(s).abc.split('K:C\n')[1].replace('|]', '|');
  for (const bar of body.split('|').map(x => x.trim()).filter(Boolean)) assert.equal(bar.split(/\s+/).reduce((a, t) => a + (+(t.match(/\d+$/) || [1])[0]), 0), 8, 'seed ' + s + ': ' + bar);
}
const r = rack(5); assert.deepEqual(Object.keys(r.parts), ['melody', 'third', 'bass', 'beat', 'bells']); assert.equal(r.parts.beat.notes.length, 16);
assert.deepEqual(r.parts.bass.notes.map(n => n.midi), [36, 36, 36, 43, 36, 36, 43, 36]); // C pedal, G in bars 4 and 7
assert.deepEqual(r.parts.bells.notes.map(n => n.midi), score(5).notes.filter(n => n.beat === 1).map(n => n.midi + 12));
assert.deepEqual(r.parts.third.notes.map(n => n.midi).slice(0, 5), [64, 60, 59, 57, 55]); // G E D C B, a third below: E C B A G
const g = genre('jazz', 5); assert.equal(g.parts.bass.notes.length, 32); assert.equal(g.parts.bass.instrument, 'organ');
// 4. The handler.
const call = async (p, q = '') => handler(new Request('https://miniphim.minomobi.com/api/jams/' + p + q), { path: p, params: new URLSearchParams(q) });
assert.equal((await call('')).status, 200);
assert.equal((await (await call('score/5')).json()).seed, 5);
assert.match(await (await call('score/5', '?format=abc')).text(), /^X:5/);
assert.equal((await call('genre/electronica/7')).status, 200);
assert.equal((await call('genre/jazz/7', '?ride=9')).status, 400);
for (const bad of ['score/0', 'score/-1', 'score/abc', 'score/99999999999', 'score/4294967296']) assert.equal((await call(bad)).status, 400, bad);
for (const nope of ['wander/1', 'genre/polka/1', 'score/1/2', 'x']) assert.equal((await call(nope)).status, 404, nope);
console.log('jams route: all pass');
