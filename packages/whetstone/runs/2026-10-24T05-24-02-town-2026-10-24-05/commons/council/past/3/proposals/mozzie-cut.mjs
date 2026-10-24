#!/usr/bin/env node
// mozzie-cut.mjs: tape's first box, with the radio taken out.
//
// Part 1 reads tape's parts.json (read-only) and prices the wave-1 order: the parts that run off
//        USB. Tape already splits its order this way; this proposal makes wave 1 the product.
// Part 2 runs the v1 box in des: no WiFi, audio arrives by microSD, a folder is a title, and a new
//        card binds itself to the first unbound folder the moment it is put on the box. It checks
//        three properties over random household months and over a power cut at every write step:
//          P1 a bound card never changes what it plays (only a person with the SD in a computer can)
//          P2 the box writes nothing under /tape/audio
//          P3 after a power cut at any point, the box boots with the old bindings or the new ones
//        Two mutants are the negative controls: "bind-any" (a bound card rebinds) and "in-place"
//        (cards.json written directly, no .new file). Both must be caught.
// Household rates are invented and stated. The point is the properties, not the rates.
//
//   node proposals/mozzie-cut.mjs
import { readFileSync } from 'node:fs';
import { Sim } from '../tools/des/des.mjs';

// ------------------------------------------------------------- part 1: the order ----------
const parts = JSON.parse(readFileSync(new URL('../refs/tape/parts.json', import.meta.url))).parts;
// usd / usdGeneric are per line (tags are a 100-pack at 12; the pair of buttons is 3). Read that
// way, waves 1+2 come to tape's own quoted $69 / $145, which is the check.
const line = (p, k) => p[k];
const sum = (w, k) => parts.filter((p) => p.wave === w).reduce((n, p) => n + line(p, k), 0);
console.log('Part 1, the order (refs/tape/parts.json, prices unverified as that file says)');
for (const w of [1, 2]) {
  const ids = parts.filter((p) => p.wave === w).map((p) => p.id).join(' ');
  console.log(`  wave ${w}: $${sum(w, 'usdGeneric')} unbranded / $${sum(w, 'usd')} as linked   [${ids}]`);
}
console.log('  v1 orders wave 1 only. A phone charger it plugs into is already in the house.');

// ------------------------------------------------------------- part 2: the box ------------
const AUDIO = '/tape/audio/', CARDS = '/tape/cards.json', NEW = '/tape/cards.new';
const CHUNK = 64;            // bytes per write step; a cut can land between any two

class PowerCut extends Error {}

// The SD card: a Map of path to string. Every mutation is a step; `cutAt` kills the box at step n.
function makeSD(files = {}) {
  const sd = { files: new Map(Object.entries(files)), steps: 0, cutAt: Infinity, touched: new Set() };
  const step = () => { if (++sd.steps >= sd.cutAt) throw new PowerCut(); };
  sd.write = (path, text) => {             // chunked: a cut leaves a prefix
    sd.touched.add(path); sd.files.set(path, '');
    for (let i = 0; i < text.length; i += CHUNK) { step(); sd.files.set(path, text.slice(0, i + CHUNK)); }
    if (text.length === 0) step();
  };
  sd.remove = (path) => { step(); sd.touched.add(path); sd.files.delete(path); };
  sd.rename = (a, b) => { step(); sd.touched.add(a); sd.touched.add(b); sd.files.set(b, sd.files.get(a)); sd.files.delete(a); };
  sd.append = (path, text) => { step(); sd.touched.add(path); sd.files.set(path, (sd.files.get(path) || '') + text); };
  sd.folders = () => [...new Set([...sd.files.keys()].filter((p) => p.startsWith(AUDIO))
    .map((p) => p.slice(AUDIO.length).split('/')[0]))].sort();
  return sd;
}
const parse = (s) => { try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : null; } catch { return null; } };

// The firmware's store logic, as the C will have it. `mutant` switches in a known-wrong rule.
function makeBox(sd, mutant = null) {
  const box = { cards: {}, log: [] };
  box.boot = () => {
    const cur = sd.files.has(CARDS) ? parse(sd.files.get(CARDS)) : null;
    const nxt = sd.files.has(NEW) ? parse(sd.files.get(NEW)) : null;
    if (cur) { box.cards = cur; if (sd.files.has(NEW)) sd.remove(NEW); }      // a .new beside a good file is a torn write
    else if (nxt) { box.cards = nxt; sd.rename(NEW, CARDS); }                  // cut between remove and rename
    else box.cards = {};
  };
  box.save = () => {
    const text = JSON.stringify(box.cards);
    if (mutant === 'in-place') { sd.write(CARDS, text); return; }
    sd.write(NEW, text); sd.remove(CARDS); sd.rename(NEW, CARDS);
  };
  // A card lands (after the watcher's debounce, which is Modulo's leaf and not modelled here).
  box.place = (card) => {
    const bound = box.cards[card];
    const free = sd.folders().filter((f) => !Object.values(box.cards).includes(f));
    if (bound && !(mutant === 'bind-any' && free.length)) return { play: bound };
    if (free.length) { box.cards[card] = free[0]; box.save(); return { play: free[0], bound: true }; }
    sd.append('/tape/unknown.txt', card + '\n');
    return { play: null, cue: 'nothing on this card' };
  };
  return box;
}

// A household month in des. Invented: 30 evenings, 1-3 cards an evening, a new folder copied on
// about every 7th day (box unplugged, SD out, SD in, boot), a fresh card from the deck 15% of the
// time, and a power cut on 1 evening in 20 at a uniformly random SD step.
function month(seed, mutant) {
  const sim = new Sim({ seed });
  const sd = makeSD({ [AUDIO + 'gran-gruffalo/01.m4a']: 'audio' });
  const audioBefore = () => [...sd.files].filter(([p]) => p.startsWith(AUDIO)).map(([p, v]) => p + v).join();
  let box = makeBox(sd, mutant); box.boot();
  let deck = 0, nextFolder = 0;
  const firstBinding = {}, violations = [];
  const note = () => { for (const [c, f] of Object.entries(box.cards)) {
    if (!(c in firstBinding)) firstBinding[c] = f;
    else if (firstBinding[c] !== f) violations.push(`P1 card ${c} moved ${firstBinding[c]} -> ${f}`);
  } };
  sim.process(function* () {
    for (let day = 0; day < 30; day++) {
      yield sim.timeout(1);
      if (sim.random() < 1 / 7) {
        sd.files.set(`${AUDIO}book-${String(++nextFolder).padStart(2, '0')}/01.m4a`, 'audio');
        box = makeBox(sd, mutant); box.boot(); note();
      }
      if (sim.random() < 1 / 20) sd.cutAt = sd.steps + 1 + Math.floor(sim.uniform(0, 12));
      const before = audioBefore();
      try {
        const n = 1 + Math.floor(sim.uniform(0, 3));
        for (let i = 0; i < n; i++) {
          const fresh = sim.random() < 0.15 || deck === 0;
          box.place(fresh ? `C${++deck}` : `C${1 + Math.floor(sim.uniform(0, deck))}`);
          note();
        }
      } catch (e) {
        if (!(e instanceof PowerCut)) throw e;
        sd.cutAt = Infinity; box = makeBox(sd, mutant); box.boot();
        if (Object.keys(firstBinding).some((c) => !(c in box.cards))) violations.push('P3 bindings lost after a cut');
        note();
      }
      sd.cutAt = Infinity;
      if (audioBefore() !== before || [...sd.touched].some((p) => p.startsWith(AUDIO))) violations.push('P2 audio touched');
    }
  });
  sim.run();
  return violations;
}

// Exhaustive: one bind, with the power cut at every step it takes. P3 must hold at each.
function everyCut(mutant) {
  const failures = [];
  for (let cut = 1; cut < 40; cut++) {
    const sd = makeSD({ [AUDIO + 'a/01.m4a']: 'x', [AUDIO + 'b/01.m4a']: 'x' });
    const b0 = makeBox(sd, mutant); b0.boot(); b0.place('OLD');            // OLD -> a, saved cleanly
    const old = JSON.stringify(b0.cards);
    sd.cutAt = sd.steps + cut;
    let finished = true;
    try { b0.place('NEW'); } catch (e) { if (!(e instanceof PowerCut)) throw e; finished = false; }
    sd.cutAt = Infinity;
    const b1 = makeBox(sd, mutant); b1.boot();
    const got = JSON.stringify(b1.cards);
    if (got !== old && got !== JSON.stringify({ ...JSON.parse(old), NEW: 'b' })) failures.push(`cut at ${cut}: ${got}`);
    if (finished) break;
  }
  return failures;
}

console.log('\nPart 2, the v1 box in des');
for (const mutant of [null, 'bind-any', 'in-place']) {
  let bad = 0, kinds = new Set();
  for (let seed = 1; seed <= 200; seed++) { const v = month(seed, mutant); if (v.length) bad++; v.forEach((x) => kinds.add(x.slice(0, 2))); }
  const cuts = everyCut(mutant);
  const name = mutant ? `mutant ${mutant}` : 'v1 rule';
  console.log(`  ${name.padEnd(17)} months violating P1-P3: ${String(bad).padStart(3)}/200 ${[...kinds].join(' ') || ''}`.trimEnd()
    + `   cut-at-every-step failures: ${cuts.length}`);
}
