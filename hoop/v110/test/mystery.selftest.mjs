// mystery.selftest.mjs — THE TIER-2 CASE, pinned. Keeper-only cast (every clue-holder provably
// placeable), the deductive-closure oracle converges on exactly the culprit, the weave is additive
// (dialogue spliced, victim retired, anchor gated), and a full engine playthrough closes the case
// with a real accusation.
import { buildFixturePool } from './fixtures/weavepool.mjs';
import { servePool } from '../story/import.js';
import { anchorChain, gateSetters, advanceState } from '../story/anchors.js';
import { proveProgression } from '../story/solvable.js';
import { castSpine, weaveCast, weaveWorld } from '../story/weave.js';
import { buildMystery, weaveMystery, mysteryProgress, clueTargets, MYSTERY_GATE } from '../story/mystery.js';
import { MemoryStore, talk, choose } from '../story/engine.js';

let n = 0, bad = 0;
const ok = (cond, msg) => { n++; if (!cond) { bad++; console.error('  ✗', msg); } };

const served = servePool(buildFixturePool());
const SEED = 7;
const cast = castSpine(served, SEED);
const wovenCast = weaveCast(served, cast, SEED);
const m = buildMystery(wovenCast, cast, SEED);

// ── the case itself ──
ok(!!m, 'buildMystery: a case exists for the fixture pool');
ok(m.gate === MYSTERY_GATE, 'the case closes the mystery gate');
ok(m.suspects.length >= 3, `a real board (${m.suspects.length} suspects)`);
ok(m.suspects.every((s) => s.id !== m.caseGiver.id), 'the case-giver is never a suspect');
ok(m.suspects.every((s) => s.id !== m.victim.id) && m.caseGiver.id !== m.victim.id, 'the victim is nobody in play');
ok(m.suspects.some((s) => s.id === m.truth.culpritId), 'the culprit sits on the board');
{ // v107: the case surfaces only at the END of Solen's tier — the case-giver is the LAST cast keeper of
  // the tier-2 anchor (was the first — the first Factor Solen keeper offered the murder), so meeting the
  // earlier keepers can't open the case.
  const t2 = anchorChain(wovenCast).find((a) => a.tier === 2);
  const legal = t2.gates.filter((g) => { const e = cast.byGate[g]; return e && e.keeperId && !e.briefing; });
  ok(m.caseGiver.gate === legal[legal.length - 1], 'the case-giver is the LAST keeper Solen names');
}
{ // the deductive closure converges on exactly the culprit (replayed cold, like the kernel's oracle)
  const alive = new Set(m.suspects.map((s) => s.id));
  for (const c of m.clues) for (const id of c.eliminates) { alive.delete(id); if (id === m.truth.culpritId) bad++; }
  ok(alive.size === 1 && alive.has(m.truth.culpritId), 'closure: eliminations converge on exactly the culprit');
}
{ // every clue-holder is provably placeable: a cast gate keeper, the case-giver, or a requiredIds extra
  const placeable = new Set([m.caseGiver.id, ...m.suspects.map((s) => s.id)]);
  ok(m.clues.every((c) => placeable.has(c.holderId)), 'every clue is held by a placed keeper (case-giver or suspect)');
  const gateKeepers = new Set(cast.plan.map((e) => e.keeperId));
  ok(m.suspects.every((s) => gateKeepers.has(s.id) || m.requiredIds.includes(s.id)), 'every suspect is a gate keeper or rides requiredIds (the seating contract)');
}
ok(JSON.stringify(buildMystery(wovenCast, cast, SEED)) === JSON.stringify(m), 'buildMystery: deterministic per (pool, seed)');
{ const m2 = buildMystery(wovenCast, cast, SEED + 1);
  ok(m2 && (m2.victim.id !== m.victim.id || m2.truth.culpritId !== m.truth.culpritId || m2.caseGiver.id !== m.caseGiver.id), 'a different seed casts a different case'); }

// ── the weave ──
const woven = weaveMystery(wovenCast, m);
const anchor2 = anchorChain(woven).find((a) => a.tier === 2);
ok(anchor2.gates.includes(MYSTERY_GATE) && anchor2.gates[anchor2.gates.length - 1] === MYSTERY_GATE, 'the anchor gains the mystery gate LAST (the final subquest)');
ok(gateSetters(woven)[MYSTERY_GATE] && gateSetters(woven)[MYSTERY_GATE].contentId === m.caseGiver.id, 'the accusation makes the case-giver the gate’s setter');
ok(woven.find((c) => c.id === m.victim.id).status === 'retired', 'the victim’s bundle is retired — the dead are never seated');
ok(wovenCast.find((c) => c.id === m.victim.id).status !== 'retired', 'immutability: the input pool is untouched');
ok(proveProgression(woven, { forcePlaced: true }).solvable, 'the WOVEN pool (cast + mystery) proves progressable');

// ── the playthrough: open → canvass → wrong accusation → right accusation → turn-in opens ──
{
  const store = new MemoryStore(woven, { features: [] });
  const P = 'p';
  // the case is sealed until the case-giver's own charge is heard
  ok(!talk(store, P, m.caseGiver.id).choices.some((c) => c.id === 'q_case_open'), 'the case is hidden before the charge');
  // the ◇'s clue chase (clueTargets): case-giver → unheard-clue holders → case-giver (the accusation)
  ok(JSON.stringify(clueTargets(m, store.getFacts(P))) === JSON.stringify([m.caseGiver.id]), 'clue chase: the case-giver first (hear the case)');
  store.setFact(P, m.caseGiver.gate, true);
  const t0 = talk(store, P, m.caseGiver.id);
  ok(t0.choices.some((c) => c.id === 'q_case_open'), 'the case opens once the charge is done');
  // walk the three-beat briefing — every fact sets on the choice that REVEALS it (the Havel-bug rule),
  // so opening the case already counts, and abandoning the panel mid-briefing loses nothing heard.
  let t = choose(store, P, m.caseGiver.id, 'q_case_open');
  ok(store.getFact(P, 'case.opened') === true, 'opening the case counts immediately (fact on the ask)');
  t = choose(store, P, m.caseGiver.id, t.choices[0].id);   // who wanted this? (reveals the board → rumor clue)
  t = choose(store, P, m.caseGiver.id, t.choices[0].id);   // what killed them? (reveals the finding → means clue)
  const progMid = mysteryProgress(m, store.getFacts(P));
  ok(progMid.found >= 3, `the briefing's clues are heard by the reveal, before any goodbye (${progMid.found}/${progMid.total})`);
  t = choose(store, P, m.caseGiver.id, t.choices[0].id);   // I will ask around. (ends)
  const prog0 = mysteryProgress(m, store.getFacts(P));
  ok(prog0.opened && prog0.found >= 3, `the briefing hands over the first clues (${prog0.found}/${prog0.total})`);
  ok(prog0.heard.length === prog0.found && prog0.heard.every((c) => c.text && c.title), 'the journal accumulates the heard clues verbatim');
  { // mid-case, the ◇ chases the holders of UNHEARD clues — never someone with nothing left to say
    const mid = clueTargets(m, store.getFacts(P));
    const remainingHolders = new Set(mysteryProgress(m, store.getFacts(P)).remaining.map((c) => c.holderId));
    ok(mid.length > 0 && mid.every((id) => remainingHolders.has(id)), 'clue chase: mid-case targets are exactly the unheard-clue holders');
  }
  { // all clues heard → the chase returns to the case-giver for the accusation
    const all = {}; for (const c of m.clues) all['case.clue.' + c.id] = true;
    ok(JSON.stringify(clueTargets(m, { 'case.opened': true, ...all })) === JSON.stringify([m.caseGiver.id]), 'clue chase: every clue heard → back to the case-giver to accuse');
  }
  // canvass a suspect who actually holds a clue (one eliminated pre-canvass may have nothing to add)
  const holderIds = new Set(m.clues.map((c) => c.holderId));
  const s0 = m.suspects.find((s) => holderIds.has(s.id));
  const ts = talk(store, P, s0.id);
  const ask = ts.choices.find((c) => /q_case_w_\d+_ask/.test(c.id));
  ok(!!ask, 'a suspect offers their account once the case is open');
  let tw = choose(store, P, s0.id, ask.id);
  ok(mysteryProgress(m, store.getFacts(P)).found > prog0.found, 'ASKING a suspect yields their clues at once (walking away loses nothing)');
  while ((tw.choices || []).length && !tw.ended) tw = choose(store, P, s0.id, tw.choices[0].id);
  // accuse wrong, then right
  let ta = choose(store, P, m.caseGiver.id, 'q_case_name');
  const wrongIdx = m.suspects.findIndex((s) => s.id !== m.truth.culpritId);
  ta = choose(store, P, m.caseGiver.id, 'q_case_pick_' + wrongIdx);
  ok(store.getFact(P, 'case.missed') === true && store.getFact(P, MYSTERY_GATE) == null, 'a wrong accusation is rebuffed (gate unset)');
  while ((ta.choices || []).length && !ta.ended) ta = choose(store, P, m.caseGiver.id, ta.choices[0].id);
  ta = choose(store, P, m.caseGiver.id, 'q_case_name');
  const rightIdx = m.suspects.findIndex((s) => s.id === m.truth.culpritId);
  ta = choose(store, P, m.caseGiver.id, 'q_case_pick_' + rightIdx);
  ok(store.getFact(P, MYSTERY_GATE) === true && store.getFact(P, 'case.solved') === true, 'the true accusation closes the case');
  ok(mysteryProgress(m, store.getFacts(P)).solved, 'mysteryProgress reads the close');
  // the anchor turn-in now needs the mystery gate — set the ward gates and check advanceState
  for (const g of anchor2.gates) if (g !== MYSTERY_GATE) store.setFact(P, g, true);
  const st = advanceState(anchorChain(woven), store.getFacts(P), 2);
  ok(st.allGatesSet, 'with wards known AND the case closed, Solen’s turn-in opens');
}

// ── weaveWorld carries the case end-to-end + the sweep certifies every seed's case ──
{
  const w = weaveWorld(served, SEED);
  ok(w.mystery && w.mystery.truth && w.content.some((c) => c.id === w.mystery.victim.id && c.status === 'retired'), 'weaveWorld: the case rides the one entry point');
  let certified = 0, eyewitnessed = 0; const SWEEP = 150;
  for (let s = 1; s <= SWEEP; s++) {
    const ww = weaveWorld(served, s);
    if (!ww.mystery) continue;
    const alive = new Set(ww.mystery.suspects.map((x) => x.id));
    for (const c of ww.mystery.clues) for (const id of c.eliminates) alive.delete(id);
    if (alive.size === 1 && alive.has(ww.mystery.truth.culpritId)) certified++;
    if (ww.mystery.usedEyewitness) eyewitnessed++;
  }
  ok(certified === SWEEP, `sweep: ${certified}/${SWEEP} seeds certify closure on exactly the culprit`);
  console.log(`  (eyewitness closer used on ${eyewitnessed}/${SWEEP} seeds)`);
}

// ── THE REACTION TABLE, SPENT IN THE SCENE (v110) ────────────────────────────────────────────────
// Six of hoopy's twelve slots are mystery beats. These pin that they actually reach the dialogue,
// that an authored line is never displaced by a derived one, and that the scene stays readable.
{
  const woven = weaveMystery(wovenCast, m);
  const byId = new Map(woven.map((c) => [c.id, c]));
  const nodesOf = (id) => (byId.get(id) && byId.get(id).content && byId.get(id).content.dialogue && byId.get(id).content.dialogue.nodes) || {};
  const allSays = [];
  for (const id of [m.caseGiver.id, ...m.suspects.map((s) => s.id)])
    for (const nd of Object.values(nodesOf(id))) if (nd && nd.says) allSays.push(nd.says);

  ok(allSays.length > 0, 'reactions: the case weaves dialogue onto the cast');
  ok(!allSays.some((t) => /\{\w+\}/.test(t)), 'reactions: no woven line ships an unfilled placeholder');
  ok(!allSays.some((t) => /[.!?]\s+[a-z]/.test(t)), 'reactions: every woven line is sentence-cased');
  ok(!allSays.some((t) => /\s{2,}/.test(t)), 'reactions: no doubled whitespace where a reaction was joined on');

  // the canvass: every suspect answers being questioned, and names themselves.
  m.suspects.forEach((s, i) => {
    const nd = nodesOf(s.id)['q_case_w_' + i];
    ok(!!nd && !!nd.says, `reactions: ${s.name} has a canvass node`);
    if (nd) ok(nd.says.length > 20, `reactions: ${s.name}'s account is not the old two-word stub`);
  });

  // pressing the culprit is gated on the naming clue, and offered to the culprit ALONE.
  const ci = m.suspects.findIndex((s) => s.id === m.truth.culpritId);
  const cNodes = nodesOf(m.truth.culpritId);
  const press = cNodes['q_case_w_' + ci + '_press'];
  ok(!!press, 'reactions: the culprit has a caught-in-a-lie node');
  const pressChoice = (cNodes['q_case_w_' + ci].choices || []).find((c) => /_press$/.test(c.id));
  ok(!!pressChoice && !!(pressChoice.requires && pressChoice.requires.facts), 'reactions: the press choice is fact-gated, not free');
  m.suspects.forEach((s, i) => {
    if (s.id === m.truth.culpritId) return;
    ok(!nodesOf(s.id)['q_case_w_' + i + '_press'], `reactions: innocent ${s.name} gets no press node`);
  });

  // a wrong accusation is answered per-suspect, not by one shared line.
  const cgNodes = nodesOf(m.caseGiver.id);
  const wrongs = Object.keys(cgNodes).filter((k) => /^q_case_wrong_/.test(k));
  ok(wrongs.length === m.suspects.length - 1, `reactions: one wrong-accusation node per innocent (${wrongs.length})`);
  ok(!cgNodes.q_case_wrong, 'reactions: the old shared q_case_wrong node is gone');
  ok(new Set(wrongs.map((k) => cgNodes[k].says)).size === wrongs.length, 'reactions: each accused answers differently');
  ok(wrongs.every((k) => /clues close on exactly one soul/.test(cgNodes[k].says)), 'reactions: the wrong-name steer survives');
  // every wrong pick routes to its own node, and the culprit pick still closes the case.
  const accuse = cgNodes.q_case_accuse.choices.filter((c) => /^q_case_pick_/.test(c.id));
  ok(accuse.every((c) => c.goto === 'q_case_closed' || cgNodes[c.goto]), 'reactions: every accusation goto resolves to a real node');

  // determinism — the same world interrogates the same people the same way.
  const again = weaveMystery(wovenCast, m);
  ok(JSON.stringify(again) === JSON.stringify(woven), 'reactions: weaveMystery is deterministic');

  // AUTHORED ALWAYS WINS, in the scene as everywhere else.
  {
    const MARK = 'A line hoopy wrote himself, verbatim.';
    const withTables = wovenCast.map((c) => (c.type === 'npc'
      ? { ...c, content: { ...c.content, reactions: { questioned: MARK, accused: MARK } } } : c));
    const m2 = buildMystery(withTables, cast, SEED);
    ok(!!m2, 'reactions: a case still builds when the pool carries reaction tables');
    const b2 = new Map(weaveMystery(withTables, m2).map((c) => [c.id, c]));
    const n2 = (id) => (b2.get(id) && b2.get(id).content.dialogue.nodes) || {};
    const canvass = m2.suspects.map((s, i) => n2(s.id)['q_case_w_' + i]).filter(Boolean);
    ok(canvass.every((nd) => nd.says.includes(MARK)), 'reactions: an authored `questioned` reaches every canvass node verbatim');
    const cg2 = n2(m2.caseGiver.id);
    const wrong2 = Object.keys(cg2).filter((k) => /^q_case_wrong_/.test(k));
    ok(wrong2.every((k) => cg2[k].says.includes(MARK)), 'reactions: an authored `accused` reaches the wrong-accusation nodes');
  }
}


console.log(bad === 0 ? `✓ mystery.selftest — ${n} checks passed` : `✗ mystery.selftest — ${bad}/${n} FAILED`);
if (bad) process.exit(1);
