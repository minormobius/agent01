// weave.selftest.mjs — THE SEEDED QUEST SPINE, pinned. Casting is deterministic per (pool, seed),
// varies across seeds, respects zone/faction legality, never double-books a keeper, and the WOVEN
// pool proves progressable (solvable.js) for a broad sweep of seeds. The splice is additive and the
// authored hand-off is clean (the stripped setter keeps every other effect).
import { buildFixturePool } from './fixtures/weavepool.mjs';
import { servePool } from '../story/import.js';
import { anchorChain, gateSetters, gateSettersMulti } from '../story/anchors.js';
import { proveProgression, canReachFlag } from '../story/solvable.js';
import { castSpine, weaveCast, weaveWorld, parseGateFlag, hash32 } from '../story/weave.js';
import { MemoryStore, talk, choose } from '../story/engine.js';

let n = 0, bad = 0;
const ok = (cond, msg) => { n++; if (!cond) { bad++; console.error('  ✗', msg); } };

const served = servePool(buildFixturePool());
const chain = anchorChain(served);
ok(chain.length === 4, 'fixture: four anchors derived');
ok(proveProgression(served, { forcePlaced: true }).solvable, 'fixture: the UNWOVEN pool proves (authored spine intact)');

// ── gate parsing ──
const g1 = parseGateFlag('flag.commons.rindwalker_face');
ok(g1 && g1.scope === 'commons' && g1.faction === 'rindwalker' && g1.slot === 'face', 'parseGateFlag: commons face');
const g2 = parseGateFlag('flag.signal.chamber_bearing');
ok(g2 && g2.scope === 'signal' && g2.faction === null && g2.slot === 'chamber_bearing', 'parseGateFlag: signal (no faction)');
ok(parseGateFlag('flag.deck.commons.cleared') === null, 'parseGateFlag: non-gate scope rejected');

// ── casting: determinism, variety, legality, no double-booking ──
const A = castSpine(served, 7), B = castSpine(served, 7), C = castSpine(served, 8);
ok(JSON.stringify(A.plan) === JSON.stringify(B.plan), 'castSpine: same (pool, seed) → identical plan');
ok(A.plan.length === chain.reduce((s, a) => s + a.gates.length, 0), 'castSpine: one entry per gate');
ok(A.plan.some((e, i) => !e.briefing && C.plan[i] && e.keeperId !== C.plan[i].keeperId), 'castSpine: a different seed casts differently');
ok(A.issues.length === 0, 'castSpine: fixture pool casts every gate (no fallbacks)');
{
  const seen = new Set();
  let dbl = false, illegal = false, briefings = 0;
  const byId = new Map(served.map((c) => [c.id, c]));
  for (const e of A.plan) {
    if (e.briefing) { briefings++; continue; }
    if (seen.has(e.keeperId)) dbl = true; seen.add(e.keeperId);
    const k = byId.get(e.keeperId);
    const g = parseGateFlag(e.gate);
    const kz = String(k.content.zone || '').toLowerCase();
    if (!g.zones.includes(kz)) illegal = true;
    if (g.faction && String(k.content.nave_faction || '').toLowerCase() !== g.faction) illegal = true;
    if (k.content.load_bearing) illegal = true;
  }
  ok(!dbl, 'castSpine: no keeper is cast for two gates');
  ok(!illegal, 'castSpine: every cast keeper is zone- and faction-legal, never an anchor');
  ok(briefings === 2, 'castSpine: the two anchor-briefing gates stay with their anchors');
}

// ── the weave: splice lands, authored setter hands off, oracle passes ──
const woven = weaveCast(served, A, 7);
const wSetters = gateSetters(woven), wMulti = gateSettersMulti(woven);
{
  let handoff = true, reach = true, single = true;
  for (const e of A.plan) {
    if (e.briefing) continue;
    if (!wSetters[e.gate] || wSetters[e.gate].contentId !== e.keeperId) handoff = false;
    if ((wMulti[e.gate] || []).length !== 1) single = false;               // authored stripped → exactly one satisfier
    const k = woven.find((c) => c.id === e.keeperId);
    if (!canReachFlag(k, e.gate, [])) reach = false;                       // the charge is reachable cold
  }
  ok(handoff, 'weaveCast: every gate’s setter IS the cast keeper');
  ok(single, 'weaveCast: the authored setter is stripped (one satisfier per gate)');
  ok(reach, 'weaveCast: the spliced charge is dialogue-reachable from the start node');
}
{ // the stripped authored setter keeps its prose and its other effects
  const e = A.plan.find((x) => !x.briefing && !x.authoredPick && x.authoredId);
  ok(!!e, 'fixture: at least one gate re-cast away from its authored setter');
  const before = served.find((c) => c.id === e.authoredId), after = woven.find((c) => c.id === e.authoredId);
  const flat = (c) => JSON.stringify(c.content.dialogue).replace(/"[^"]*"/g, (s) => s);
  ok(JSON.stringify(after.content.dialogue).indexOf(e.gate) === -1, 'strip: the gate key is gone from the authored setter');
  ok(Object.keys(before.content.dialogue.nodes).every((k) => after.content.dialogue.nodes[k]), 'strip: every authored node survives');
  ok(served.find((c) => c.id === e.authoredId) === before && JSON.stringify(before.content.dialogue).includes(e.gate), 'strip: the INPUT pool is untouched (immutability)');
}

// ── the engine actually plays the spliced charge ──
{
  const e = A.plan.find((x) => !x.briefing && x.tier === 1);
  const store = new MemoryStore(woven, { features: [] });
  const t0 = talk(store, 'p', e.keeperId);
  const chargeChoice = t0.choices.find((c) => /q_charge_/.test(c.id));
  ok(!!chargeChoice, 'engine: the charge choice renders on the start node');
  const t1 = choose(store, 'p', e.keeperId, chargeChoice.id);
  // THE HAVEL-BUG RULE: the gate sets the moment the keeper ANSWERS (the ask choice) — a player who
  // reads the answer and closes the panel without the goodbye has still fulfilled the quest.
  ok(store.getFact('p', e.gate) === true, 'engine: the ASK itself sets the gate flag (no goodbye required)');
  const doneChoice = (t1.choices || []).find((c) => /q_charge_.*_done/.test(c.id));
  ok(!!doneChoice, 'engine: the charge node offers its close');
  const t2 = choose(store, 'p', e.keeperId, doneChoice.id);
  ok(t2.ended === true, 'engine: the close ends the conversation cleanly');
}

// ── THE OLO FINALE (the mythograph quest): send → terminal → report → turn-in ──
{
  const { weaveWorld: ww } = await import('../story/weave.js');
  const w = ww(served, 7);
  const q = w.mythograph;
  ok(!!q, 'weaveWorld casts the mythograph finale');
  const chain2 = anchorChain(w.content);
  const olo = chain2.find((x) => x.tier === 1);
  ok(olo.gates[olo.gates.length - 1] === q.gate, 'the tier-1 anchor gains the mythograph gate LAST (the finale)');
  const lineup = anchorChain(served).find((x) => x.tier === 1).gates;
  ok(q.keeperGate === lineup[lineup.length - 1], 'the SENDER is the final person in the lineup');
  ok(gateSetters(w.content)[q.gate].contentId === q.keeperId, 'the report makes the final keeper the gate’s setter');
  ok(proveProgression(w.content, { forcePlaced: true }).solvable, 'the oracle accepts the runtime read fact (worldExternal boundary)');
  // playthrough: meet (gate auto-sets via the surface; simulate) → send → read → report
  const store = new MemoryStore(w.content, { features: [] });
  ok(!talk(store, 'p', q.keeperId).choices.some((c) => c.id === 'q_myth_send'), 'the send hides until the keeper’s own charge is heard');
  store.setFact('p', q.keeperGate, true);                                       // the surface sets this on meeting
  const t0 = talk(store, 'p', q.keeperId);
  ok(t0.choices.some((c) => c.id === 'q_myth_send'), 'the send surfaces after the charge');
  ok(!t0.choices.some((c) => c.id === 'q_myth_report'), 'the report hides until the terminal is read');
  const ts = choose(store, 'p', q.keeperId, 'q_myth_send');
  ok(store.getFact('p', q.sentFact) === true, 'taking the send marks you SENT (arms the terminal read — a prologue read can’t skip the walk)');
  choose(store, 'p', q.keeperId, ts.choices[0].id);                             // "I will find a terminal." (ends)
  store.setFact('p', q.readFact, true);                                         // openTerminal sets this in the game, only after the send
  const t1 = talk(store, 'p', q.keeperId);
  const rep = t1.choices.find((c) => c.id === 'q_myth_report');
  ok(!!rep, 'the report surfaces once the mythograph is read');
  choose(store, 'p', q.keeperId, rep.id);
  ok(store.getFact('p', q.gate) === true, 'the report ASK sets the mythograph gate (the Havel rule)');
}

// ── the sweep: the woven pool proves progressable for many seeds (mystery on) ──
{
  let pass = 0, castDiffers = 0, mysteries = 0, mythographs = 0;
  const base = JSON.stringify(castSpine(served, 1).plan.map((e) => e.keeperId));
  const SWEEP = 150;
  for (let s = 1; s <= SWEEP; s++) {
    const w = weaveWorld(served, s);
    const rep = proveProgression(w.content, { forcePlaced: true });
    if (rep.solvable) pass++;
    else if (pass === s - 1) for (const err of rep.errors.slice(0, 3)) console.error('   seed', s, err.code, err.msg);
    if (JSON.stringify(w.cast.plan.map((e) => e.keeperId)) !== base) castDiffers++;
    if (w.mystery) mysteries++;
    if (w.mythograph) mythographs++;
  }
  ok(pass === SWEEP, `sweep: ${pass}/${SWEEP} seeds prove PROVABLY PROGRESSABLE woven (mystery + mythograph included)`);
  ok(castDiffers > SWEEP * 0.9, `sweep: the cast varies across seeds (${castDiffers}/${SWEEP} differ from seed 1)`);
  ok(mysteries === SWEEP, `sweep: every seed casts a mystery (${mysteries}/${SWEEP})`);
  ok(mythographs === SWEEP, `sweep: every seed casts the mythograph finale (${mythographs}/${SWEEP})`);
}

// ── weaveWorld never throws on garbage ──
{
  const w = weaveWorld([], 7);
  ok(Array.isArray(w.content) && w.content.length === 0 && w.issues.length > 0, 'weaveWorld: an empty pool degrades with issues, never throws');
  const w2 = weaveWorld(null, 7);
  ok(w2 && (w2.content == null || Array.isArray(w2.content)), 'weaveWorld: null pool tolerated');
}

// ── hash stability (atproto permalinks depend on it) ──
ok(hash32('a', 'b') === hash32('a', 'b') && hash32('a') !== hash32('b'), 'hash32: stable + discriminating');

console.log(bad === 0 ? `✓ weave.selftest — ${n} checks passed` : `✗ weave.selftest — ${bad}/${n} FAILED`);
if (bad) process.exit(1);
