// morphyx-adopt.mjs — Morphyx, council 3 round 2.
// Modulo's parses+gen boot (proposals/modulo-torn.mjs, copied) accepts a hand-written cards.json
// (no _gen) but then (a) resets its counter to 0 and (b) leaves the flash mirror holding the
// pre-edit bindings until the next bind. Two sequences, 200 households each, 8 books:
//   reset  : box binds 8 cards (gen 8); laptop keeps a copy at gen 4. Grown-up hand-edits
//            cards.json (drops _gen, swaps two cards on purpose). Child binds one new card (gen 1).
//            The gen-4 copy is dragged back: 4 > 1, so it decides.
//   undo   : grown-up hand-edits (swaps two cards). Before any bind, cards.json goes missing.
//            The mirror still holds the pre-edit deck and restores it: the edit is silently undone.
// Score: cards that don't play what the grown-up last decided.
//   gen    : Modulo's rule as written.
//   adopt  : on accepting a file the box did not write at its current gen, the box adopts it:
//            gen = mirror gen + 1, mirror rewritten, cards.json rewritten with that gen.
//   node proposals/morphyx-adopt.mjs
import { Sim } from '../tools/des/des.mjs';
const AUDIO = '/tape/audio/', CARDS = '/tape/cards.json';
const parse = (s) => { try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : null; } catch { return null; } };
function makeSD(B) {
  const files = new Map(); for (let i = 0; i < B; i++) files.set(`${AUDIO}book-${String(i).padStart(2, '0')}/001.m4a`, 'x');
  return { files, folders: () => [...new Set([...files.keys()].filter((p) => p.startsWith(AUDIO)).map((p) => p.slice(AUDIO.length).split('/')[0]))].sort() };
}
function makeBox(sd, rule, nvs) {
  const box = { cards: {}, gen: 0 };
  const save = () => { sd.files.set(CARDS, JSON.stringify({ ...box.cards, _gen: box.gen })); nvs.cards = { ...box.cards }; nvs.gen = box.gen; };
  box.boot = () => {
    const cur = sd.files.has(CARDS) ? parse(sd.files.get(CARDS)) : null;
    const restore = () => { box.cards = { ...nvs.cards }; box.gen = nvs.gen; box.restored = true; };
    if (cur && nvs.cards && cur._gen !== undefined && cur._gen < nvs.gen) return restore();
    if (cur) {
      const { _gen, ...c } = cur; box.cards = c; box.gen = _gen ?? 0;
      if (rule === 'adopt' && (nvs.gen === undefined || _gen !== nvs.gen)) { box.gen = (nvs.gen ?? 0) + 1; save(); box.adopted = true; }
      return;
    }
    if (nvs.cards) return restore();
    box.cards = {};
  };
  box.place = (card) => {
    if (box.cards[card]) return box.cards[card];
    const free = sd.folders().filter((f) => !Object.values(box.cards).includes(f));
    if (!free.length) return null;
    box.cards[card] = free[0]; box.gen++; save(); return free[0];
  };
  return box;
}
function shuffle(a, sim) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(sim.uniform(0, i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function handEdit(sd, sim) { // grown-up swaps two cards' books and saves without _gen
  const { _gen, ...c } = parse(sd.files.get(CARDS)); const k = shuffle(Object.keys(c), sim).slice(0, 2);
  [c[k[0]], c[k[1]]] = [c[k[1]], c[k[0]]]; sd.files.set(CARDS, JSON.stringify(c));
}
function trial(rule, seq, sim, B) {
  const sd = makeSD(B), nvs = {}; let box = makeBox(sd, rule, nvs), old = null; box.boot();
  for (let i = 0; i < B; i++) { box.place(`C${i}`); if (i === B / 2 - 1) old = sd.files.get(CARDS); }
  handEdit(sd, sim); box = makeBox(sd, rule, nvs); box.boot();
  if (seq === 'reset') { sd.files.set(`${AUDIO}book-new/001.m4a`, 'x'); box.place('CN'); }
  const decided = { ...box.cards };
  if (seq === 'reset') sd.files.set(CARDS, old); else sd.files.delete(CARDS);
  box = makeBox(sd, rule, nvs); box.boot();
  let wrong = 0; for (const c of shuffle(Object.keys(decided), sim)) if (box.place(c) !== decided[c]) wrong++;
  return wrong;
}
const sim = new Sim({ seed: 11 }), B = 8;
console.log(`${B} books, 200 households: decks not as the grown-up last decided / mean wrong cards`);
for (const seq of ['reset', 'undo']) {
  let line = `  ${seq.padEnd(6)}`;
  for (const rule of ['gen', 'adopt']) {
    let hit = 0, w = 0; for (let k = 0; k < 200; k++) { const r = trial(rule, seq, sim, B); w += r; if (r) hit++; }
    line += `  ${rule}: ${String(hit).padStart(3)}/200 ${(w / 200).toFixed(1)}`;
  }
  console.log(line);
}
for (const rule of ['gen', 'adopt']) { // the deliberate clear must still win
  const sd = makeSD(1), nvs = {}; let box = makeBox(sd, rule, nvs); box.boot(); box.place('C0');
  sd.files.set(CARDS, '{}'); box = makeBox(sd, rule, nvs); box.boot();
  console.log(`  ${rule.padEnd(5)} bare {} clear: ${JSON.stringify(box.cards)} restored: ${!!box.restored}`);
}
