// morphyx-absence.mjs — Morphyx, council 3 round 1.
//
// Question: in TAPE1 (SD-only, no radio), can the keeper property still break?
// Mozzie's boot rule (proposals/mozzie-cut.mjs, makeBox.boot): if neither cards.json nor cards.new
// parses, the box starts with no bindings. The cut model reaches that state only through power
// cuts, which the .new/rename dance closes. But the SD goes through a laptop every fortnight. If
// the file comes back missing (fresh or reformatted card, /tape dragged over from an old copy,
// file deleted or corrupted by a desktop OS), every card in the deck reads as fresh. Each one
// binds to the first free folder in the order the child happens to put them down.
//
// Two rules, same box logic otherwise (copied from mozzie-cut.mjs, which doesn't export it):
//   as-written : missing file  => bindings = {}
//   mirror     : the box also keeps bindings in its own flash (ESP32 NVS). A file that is
//                *present* governs (a grown-up who writes {} has cleared the deck on purpose).
//                A file that is *absent* restores from the mirror and logs it. Absence is not a decision.
//
//   node proposals/morphyx-absence.mjs
import { Sim } from '../tools/des/des.mjs';

const AUDIO = '/tape/audio/', CARDS = '/tape/cards.json';
function makeSD(files) {
  const sd = { files: new Map(Object.entries(files)) };
  sd.folders = () => [...new Set([...sd.files.keys()].filter((p) => p.startsWith(AUDIO))
    .map((p) => p.slice(AUDIO.length).split('/')[0]))].sort();
  return sd;
}
const parse = (s) => { try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : null; } catch { return null; } };

function makeBox(sd, rule, nvs) {
  const box = { cards: {} };
  box.boot = () => {
    const cur = sd.files.has(CARDS) ? parse(sd.files.get(CARDS)) : null;
    if (cur) box.cards = cur;
    else if (rule === 'mirror' && !sd.files.has(CARDS) && nvs.cards) { box.cards = { ...nvs.cards }; box.restored = true; }
    else box.cards = {};
  };
  box.place = (card) => {
    if (box.cards[card]) return box.cards[card];
    const free = sd.folders().filter((f) => !Object.values(box.cards).includes(f));
    if (!free.length) return null;
    box.cards[card] = free[0];
    sd.files.set(CARDS, JSON.stringify(box.cards));
    nvs.cards = { ...box.cards };
    return free[0];
  };
  return box;
}

// One household: B books bound, one card each, in the order they arrived. Then the SD comes back
// from the laptop without cards.json (plus one new book copied on). The child puts cards down
// over the next evenings in whatever order. Count cards that now play a different book.
function trial(rule, sim, B) {
  const books = Array.from({ length: B }, (_, i) => `book-${String(i).padStart(2, '0')}`);
  const files = {}; for (const b of books) files[`${AUDIO}${b}/001.m4a`] = 'x';
  const sd = makeSD(files), nvs = {};
  let box = makeBox(sd, rule, nvs); box.boot();
  books.forEach((_, i) => box.place(`C${i}`));
  const before = { ...box.cards };
  sd.files.delete(CARDS);                                   // the one event
  sd.files.set(`${AUDIO}book-new/001.m4a`, 'x');            // the reason the SD went to the laptop
  box = makeBox(sd, rule, nvs); box.boot();
  const order = Object.keys(before);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(sim.uniform(0, i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let wrong = 0; for (const c of order) if (box.place(c) !== before[c]) wrong++;
  return { wrong, B };
}

const sim = new Sim({ seed: 7 });
console.log('SD returns without cards.json; deck replayed in random order (200 households each)');
for (const B of [3, 8, 15]) {
  for (const rule of ['as-written', 'mirror']) {
    let wrong = 0, hit = 0;
    for (let k = 0; k < 200; k++) { const r = trial(rule, sim, B); wrong += r.wrong; if (r.wrong) hit++; }
    console.log(`  ${B.toString().padStart(2)} books  ${rule.padEnd(10)}  households with a scrambled deck ${String(hit).padStart(3)}/200   cards on the wrong book, mean ${(wrong / 200).toFixed(1)} of ${B}`);
  }
}
console.log('Present-but-empty file under mirror: a deliberate clear, honoured (not restored).');
{
  const sd = makeSD({ [`${AUDIO}a/1`]: 'x' }), nvs = { cards: { C0: 'a' } };
  sd.files.set(CARDS, '{}'); const box = makeBox(sd, 'mirror', nvs); box.boot();
  console.log(`  bindings after boot: ${JSON.stringify(box.cards)}  restored: ${!!box.restored}`);
}
