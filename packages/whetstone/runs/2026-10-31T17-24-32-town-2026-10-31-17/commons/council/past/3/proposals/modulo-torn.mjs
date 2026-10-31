// modulo-torn.mjs — Modulo, council 3 round 2.
// Same box as morphyx-absence.mjs (copied; it doesn't export), three SD events, four boot rules.
//   as-written     : file that doesn't parse  => {}
//   present        : Morphyx r1 — restore from mirror only if file absent
//   parses         : Mozzie r1 / CHOICE — restore if absent or unparseable
//   parses+gen     : also restore if the file parses but carries an older generation than the mirror
// Events: absent (file gone), torn (truncated by a desktop OS), stale (an older cards.json,
// half the bindings, dragged back from a laptop copy).
//   node proposals/modulo-torn.mjs
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
  const box = { cards: {}, gen: 0 };
  box.boot = () => {
    const has = sd.files.has(CARDS), cur = has ? parse(sd.files.get(CARDS)) : null;
    const restore = () => { box.cards = { ...nvs.cards }; box.gen = nvs.gen; box.restored = true; };
    if (cur && rule === 'parses+gen' && nvs.cards && cur._gen !== undefined && cur._gen < nvs.gen) return restore();
    // a file with no _gen was written by a person, not the box: it decides
    if (cur) { const { _gen, ...c } = cur; box.cards = c; box.gen = _gen ?? 0; return; }
    if (nvs.cards && ((rule === 'present' && !has) || rule === 'parses' || rule === 'parses+gen')) return restore();
    box.cards = {};
  };
  box.place = (card) => {
    if (box.cards[card]) return box.cards[card];
    const free = sd.folders().filter((f) => !Object.values(box.cards).includes(f));
    if (!free.length) return null;
    box.cards[card] = free[0]; box.gen++;
    sd.files.set(CARDS, JSON.stringify({ ...box.cards, _gen: box.gen }));
    nvs.cards = { ...box.cards }; nvs.gen = box.gen;
    return free[0];
  };
  return box;
}
function trial(rule, ev, sim, B) {
  const files = {}; for (let i = 0; i < B; i++) files[`${AUDIO}book-${String(i).padStart(2, '0')}/001.m4a`] = 'x';
  const sd = makeSD(files), nvs = {};
  let box = makeBox(sd, rule, nvs); box.boot();
  let old = null;
  for (let i = 0; i < B; i++) { box.place(`C${i}`); if (i === Math.floor(B / 2) - 1) old = sd.files.get(CARDS); }
  const before = { ...box.cards };
  if (ev === 'absent') sd.files.delete(CARDS);
  if (ev === 'torn') { const s = sd.files.get(CARDS); sd.files.set(CARDS, s.slice(0, Math.floor(sim.uniform(0, s.length)))); }
  if (ev === 'stale') sd.files.set(CARDS, old);
  sd.files.set(`${AUDIO}book-new/001.m4a`, 'x');
  box = makeBox(sd, rule, nvs); box.boot();
  const order = Object.keys(before);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(sim.uniform(0, i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let wrong = 0; for (const c of order) if (box.place(c) !== before[c]) wrong++;
  return wrong;
}
const sim = new Sim({ seed: 7 }), B = 8;
console.log(`${B} books, 200 households per cell: scrambled decks / mean wrong cards`);
for (const ev of ['absent', 'torn', 'stale']) {
  let line = `  ${ev.padEnd(7)}`;
  for (const rule of ['as-written', 'present', 'parses', 'parses+gen']) {
    let hit = 0, w = 0; for (let k = 0; k < 200; k++) { const r = trial(rule, ev, sim, B); w += r; if (r) hit++; }
    line += `  ${rule}: ${String(hit).padStart(3)}/200 ${(w / 200).toFixed(1)}`;
  }
  console.log(line);
}
{ // a grown-up's deliberate clear must still win under parses+gen
  const sd = makeSD({ [`${AUDIO}a/1`]: 'x' }), nvs = {};
  let box = makeBox(sd, 'parses+gen', nvs); box.boot(); box.place('C0');
  const g = JSON.parse(sd.files.get(CARDS))._gen; sd.files.set(CARDS, JSON.stringify({ _gen: g }));
  box = makeBox(sd, 'parses+gen', nvs); box.boot();
  console.log(`  deliberate clear, edited file keeps _gen: ${JSON.stringify(box.cards)} restored: ${!!box.restored}`);
  sd.files.set(CARDS, '{}'); box = makeBox(sd, 'parses+gen', nvs); box.boot();
  console.log(`  deliberate clear written as bare {}:      ${JSON.stringify(box.cards)} restored: ${!!box.restored}`);
}
