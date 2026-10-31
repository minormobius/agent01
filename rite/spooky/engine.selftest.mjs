// node rite/spooky/engine.selftest.mjs — gates the pun engine. No network.
//
// It pins the cases the tradition is named for (James L. Brooks → James Hell
// Brooks, Matt Groening → Matt Groaning), the house rules (never the name back
// unchanged, never a new ugly string, one pun per spooky word), and that the
// letter-to-sound model still hears names the way CMUdict does.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spookify, distance, sub, hear } from './engine.js';
import { pronounce } from './phones.js';
import { BANNED } from '../sharp/engine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(fs.readFileSync(path.join(HERE, 'data/g2p.json'), 'utf8'));
const vocab = JSON.parse(fs.readFileSync(path.join(HERE, 'data/spooks.json'), 'utf8'));

let failed = 0, passed = 0;
const ok = (cond, msg) => { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } };
const texts = (name, o = {}) => spookify(name, { model, vocab, ...o }).results.map((r) => r.text);

// The ear: names CMUdict knows come back as it says them.
const said = (w) => pronounce(model, w).join(' ');
ok(said('groening') === 'G R AA AH N IH NG' || said('groening').startsWith('G R'), `groening heard as ${said('groening')}`);
ok(said('simon') === 'S AY M AH N', `simon heard as ${said('simon')}`);
ok(said('kowalski') === 'K AH W AA L S K IY' || said('kowalski').endsWith('L S K IY'), `kowalski heard as ${said('kowalski')}`);
ok(said('brooks') === 'B R UH K S', `brooks heard as ${said('brooks')}`);
ok(hear(model, 'L.')[0].phones.join(' ') === 'EH L', 'an initial is heard as its letter name');

// The metric: near sounds are near.
ok(distance(['B'], ['P']) < distance(['B'], ['S']), 'b is nearer p than s');
ok(distance(['HH', 'EH', 'L'], ['EH', 'L']) < 0.5, 'a dropped h costs almost nothing');
ok(sub('AA', 'K') >= 2, 'a vowel for a consonant is not a pun');

// The tradition.
ok(texts('James L. Brooks').includes('James Hell Brooks'), `James L. Brooks: ${texts('James L. Brooks').join(' | ')}`);
ok(texts('Matt Groening').includes('Matt Groaning'), `Matt Groening: ${texts('Matt Groening').join(' | ')}`);
ok(texts('David Mirkin').includes('David Murk-in'), `David Mirkin: ${texts('David Mirkin').join(' | ')}`);
ok(texts('Al Jean').some((t) => /Halloween/.test(t)), `Al Jean: ${texts('Al Jean').join(' | ')}`);

// The house rules, over a spread of names.
const NAMES = ['Olivia Kowalski', 'Madison Garcia', 'Michael Johnson', 'Nguyen Tran', 'Emily Brown',
  "Siobhan O'Brien", 'Jaxon Miller', 'Dan Castellaneta', 'Hank Azaria', 'Julie Kavner', 'Yeardley Smith',
  'Bo', 'Mary-Kate Olsen', 'José Álvarez', 'Zbigniew Brzezinski', 'Dick Turpin', 'Titus Andronicus'];
const t0 = Date.now();
for (const n of NAMES) {
  const r = spookify(n, { model, vocab, count: 6 });
  ok(r.results.length > 0, `${n}: nothing at all`);
  ok(r.results.length <= 6, `${n}: more than asked for`);
  ok(r.results.every((x) => x.text.toLowerCase() !== n.toLowerCase()), `${n}: handed the name back unchanged`);
  const spooks = r.results.map((x) => x.spook);
  ok(new Set(spooks).size === spooks.length, `${n}: a spooky word used twice`);
  const ugly = (s) => (s.toLowerCase().replace(/[^a-z]/g, '').match(new RegExp(BANNED.source, 'g')) || []).length;
  const base = ugly(n.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  ok(r.results.every((x) => ugly(x.text) <= base), `${n}: volunteered an ugly string`);
  ok(JSON.stringify(r) === JSON.stringify(spookify(n, { model, vocab, count: 6 })), `${n}: not deterministic`);
  const seeded = spookify(n, { model, vocab, count: 6, seed: '3' });
  ok(seeded.results.length > 0, `${n}: a seeded batch came back empty`);
}
const per = (Date.now() - t0) / NAMES.length / 3;
ok(per < 600, `too slow: ${per.toFixed(0)}ms a name`);
ok(spookify('', { model, vocab }).results.length === 0, 'an empty name gives nothing');
ok(spookify('!!! 123', { model, vocab }).results.length === 0, 'a name with no letters gives nothing');

console.log(`${failed ? '✗' : '✓'} spooky engine: ${passed} passed, ${failed} failed (${per.toFixed(0)}ms a name)`);
process.exit(failed ? 1 : 0);
