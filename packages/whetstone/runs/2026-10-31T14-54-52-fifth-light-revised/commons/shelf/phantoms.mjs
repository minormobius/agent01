// phantoms.mjs — `node shelf/phantoms.mjs [DIR=.] [P=0.01] [EVENINGS=120]` (Morphyx, tape day 4)
// DIR holds tape1.mjs, fakesd.mjs, tape-lib/. 12 written cards, 40 books, 8 thirty-second sittings an
// evening at 20 Hz, 20% misses, each read torn (tape record cut short) with probability P.
// Counts phantom `uid:` books bound and placements that started a phantom's book. Exit 1 if any.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = pathToFileURL(resolve(process.argv[2] || '.')).href, P = +(process.argv[3] || 0.01), EVENINGS = +(process.argv[4] || 120);
const { boot } = await import(dir + '/tape1.mjs');
const { makeSD, makeFlash } = await import(dir + '/fakesd.mjs');
const { ndefRecords, base32Encode } = await import(dir + '/tape-lib/tag.js');
let a = 7; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
let wrong = 0;
const files = {}; for (let i = 0; i < 40; i++) files[`/tape/audio/b${String(i).padStart(2,'0')}/01.mp3`] = 'x';
const sd = makeSD(files), flash = makeFlash();
const cards = Array.from({ length: 12 }, (_, n) => ({ uid: 'AB' + n.toString(16).padStart(6, '0').toUpperCase(), records: ndefRecords({ id: base32Encode(Uint8Array.from({ length: 8 }, (_, i) => (n * 37 + i * 11) & 255)) }) }));
const tear = (c) => ({ uid: c.uid, records: c.records.map((r) => ({ ...r, data: r.data.slice(0, 3) })) });
let t = 0, phantom = 0, placements = 0;
for (let ev = 0; ev < EVENINGS; ev++) {
  const box = await boot({ sd, flash, t });
  for (let k = 0; k < 8; k++) {           // 8 placements an evening, 30 s each
    const c = cards[Math.floor(rnd() * cards.length)]; placements++;
    for (let i = 0; i < 600; i++) { t += 0.05; await box.poll(t, rnd() < 0.2 ? null : rnd() < P ? tear(c) : c); }
    t += 3; await box.poll(t, null);
  }
  wrong += box.events.filter((e) => e.type === "play" && e.card.startsWith("uid:")).length;
  phantom += box.events.filter((e) => e.type === 'bound' && e.card.startsWith('uid:')).length;
  t += 3600;
}
console.log(`torn ${P}: ${placements} placements, phantom books bound: ${phantom}, wrong-book starts: ${wrong}`);
process.exitCode = phantom + wrong ? 1 : 0;
