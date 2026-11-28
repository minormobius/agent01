#!/usr/bin/env node
// morphyx-keeper.mjs: who may destroy a recording, in tape as written and under the keeper rule.
//
// Part 1 uses tape's own lib/catalog.js (read-only) to show the arrangement as it stands.
// Part 2 runs a household year in des: recordings arrive, cards get re-pointed, enrolment is
// armed, and somebody on a phone tidies up. Rates are invented and stated; the point is the
// rule, not the rates. Every op arrives over the wire (no auth: any phone on the box's AP).
//
//   node proposals/morphyx-keeper.mjs            (seeds 1..20)
import * as cat from '../refs/tape/lib/catalog.js';
import { Sim } from '../tools/des/des.mjs';

// ---------------------------------------------------------------- part 1: as written ----
const m = cat.emptyManifest();
cat.addTitle(m, { id: 'gran-gruffalo', title: 'The Gruffalo', reader: 'Gran', tracks: [{ seconds: 410 }] });
cat.addTitle(m, { id: 'dad-gruffalo', title: 'The Gruffalo', reader: 'Dad', tracks: [{ seconds: 380 }] });
cat.bindCard(m, 'K7Q2', ['gran-gruffalo'], { label: 'Gruffalo' });
const before = cat.orphanTitles(m);
cat.bindCard(m, 'K7Q2', ['dad-gruffalo'], { label: 'Gruffalo' });   // one PUT /api/card/K7Q2
const after = cat.orphanTitles(m);
console.log('Part 1, tape as written');
console.log(`  orphans before re-pointing the card: ${JSON.stringify(before)}`);
console.log(`  orphans after one PUT:               ${JSON.stringify(after)}   (catalog.js calls these "dead weight")`);
console.log(`  history of what K7Q2 used to play:   none kept; bindCard overwrites`);
console.log(`  hours of speech a 32 GiB SD holds:   ${cat.hoursPerCard(32).toFixed(0)} h at 64 kbps, so sweeping frees nothing anyone needs`);

// ---------------------------------------------------------------- the two rules --------
// A box is the arrangement: the manifest plus a rule for what a wire request may do.
function makeBox(rule) {
  const box = {
    titles: new Set(), cards: new Map(), everBound: new Set(), archive: new Set(),
    lost: [], refusals: 0, rule,
    addTitle(id) { box.titles.add(id); },
    bind(card, title) { box.cards.set(card, title); box.everBound.add(title); },
    // An enrol request writes "the next tag on the pad". As written (protocol.js) that is any
    // tag; firmware/ says "the next blank tag". The keeper takes firmware's word and makes it law.
    enrolTag(card, isBlank, title) {
      if (rule === 'keeper' && !isBlank) { box.refusals++; return 'refused: not blank'; }
      box.bind(card, title); return 'bound';
    },
    // DELETE /api/title from any phone. physical = the box's button held during the request.
    del(title, physical = false) {
      if (!box.titles.has(title)) return;
      if (rule === 'keeper') {
        if (box.everBound.has(title) && !physical) { box.refusals++; return; }
        box.titles.delete(title); box.archive.add(title);   // even then, moved, not erased
        return;
      }
      box.titles.delete(title);
      if (box.everBound.has(title)) box.lost.push(title);    // a recording someone once played
    },
    orphans() { const r = new Set(box.cards.values()); return [...box.titles].filter((t) => !r.has(t)); },
  };
  return box;
}

// ---------------------------------------------------------------- part 2: a year -------
// Invented household rates, per year: 40 recordings, 12 deliberate re-points ("Dad's version
// is better"), 30 enrolments of which 10% get a bound card put on the pad by a child inside
// the 60 s window, and a phone tidy-up of orphans every 2 months.
function year(seed, rule) {
  const sim = new Sim({ seed });
  const box = makeBox(rule);
  const DAY = 1, YEAR = 365;
  let nT = 0, nC = 0;
  sim.process(function* () {                       // recordings, each enrolled on a new card
    for (;;) {
      yield sim.timeout(sim.exponential(40 / YEAR));
      const t = `t${nT++}`; box.addTitle(t);
      const childPutsBoundCard = nC > 0 && sim.random() < 0.10;
      if (childPutsBoundCard) box.enrolTag(`c${Math.floor(sim.random() * nC)}`, false, t);
      else box.enrolTag(`c${nC++}`, true, t);
    }
  });
  sim.process(function* () {                       // deliberate re-points to a newer recording
    for (;;) {
      yield sim.timeout(sim.exponential(12 / YEAR));
      if (nC && nT) box.bind(`c${Math.floor(sim.random() * nC)}`, `t${nT - 1}`);
    }
  });
  sim.process(function* () {                       // the tidy-up: delete every orphan, from a phone
    for (;;) {
      yield sim.timeout(60 * DAY);
      for (const t of box.orphans()) box.del(t, false);
    }
  });
  sim.run({ until: YEAR });
  return box;
}

console.log('\nPart 2, one simulated household year, seeds 1..20 (invented rates, see header)');
for (const rule of ['as-written', 'keeper']) {
  let lost = 0, refused = 0, worst = 0;
  for (let s = 1; s <= 20; s++) {
    const b = year(s, rule);
    lost += b.lost.length; refused += b.refusals; worst = Math.max(worst, b.lost.length);
  }
  console.log(`  ${rule.padEnd(10)} once-played recordings destroyed: ${(lost / 20).toFixed(1)}/year (worst seed ${worst});  wire requests refused: ${(refused / 20).toFixed(1)}/year`);
}

// ---------------------------------------------------------------- property + control ---
// Random op sequences from the wire only. Keeper: zero once-bound titles may leave `titles`
// except into `archive`. Negative control: the as-written box must fail the same property.
function fuzz(rule, seed) {
  const sim = new Sim({ seed }); const b = makeBox(rule);
  for (let i = 0; i < 300; i++) {
    const r = sim.random(), t = `t${Math.floor(sim.random() * 12)}`, c = `c${Math.floor(sim.random() * 6)}`;
    if (r < 0.3) b.addTitle(t);
    else if (r < 0.55) { if (b.titles.has(t)) b.bind(c, t); }
    else if (r < 0.7) { if (b.titles.has(t)) b.enrolTag(c, sim.random() < 0.5, t); }
    else b.del(t, false);
  }
  return [...b.everBound].every((t) => b.titles.has(t) || b.archive.has(t));
}
let keeperOk = 0, controlCaught = 0;
for (let s = 1; s <= 200; s++) { if (fuzz('keeper', s)) keeperOk++; if (!fuzz('as-written', s)) controlCaught++; }
console.log(`\nProperty: no once-played recording leaves the box over the wire`);
console.log(`  keeper holds on ${keeperOk}/200 random sequences; negative control (as written) caught on ${controlCaught}/200`);
process.exitCode = keeperOk === 200 && controlCaught > 0 ? 0 : 1;
