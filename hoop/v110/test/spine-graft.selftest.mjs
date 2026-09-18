// spine-graft.selftest.mjs — THE SPINE GRAFT (story/import.js graftSpineAnchors + story/spine-anchors.js).
//   node hoop/v110/test/spine-graft.selftest.mjs
//
// The 2026-09-16 content run regenerated 781 keepers — every gate flag in the world — and tombstoned the
// four LOAD-BEARING anchors without republishing them, leaving a pool with no campaign in it. servePool
// grafts the carried anchors back. What must hold:
//   • grafted only when the run brought none (hoopy's own spine always wins),
//   • re-gated against the gates THIS run sets, not the list the anchor was authored with,
//   • a scope the run sets nothing in keeps its authored gates, so the oracle reports the hole,
//   • our old `seed-anchor-briefings` splices (the anchor setting its own gate) retire themselves,
//   • pure: SPINE_ANCHORS is never mutated, and servePool stays idempotent.

import { servePool, graftSpineAnchors, spineAnchorsFor, liveGatesByScope, hasLoadBearing } from '../story/import.js';
import { SPINE_ANCHORS, SPINE_PROVENANCE } from '../story/spine-anchors.js';
import { anchorChain } from '../story/anchors.js';
import { proveProgression } from '../story/solvable.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const clone = (x) => JSON.parse(JSON.stringify(x));

// ── fixtures: a run's keeper, shaped like a real room_bundle record ──
const ZONE_TIER = { commons: 1, wards: 2, upper_rind: 3, lower_rind: 4 };
const keeper = (id, name, zone, flag) => ({
  id, type: 'room_bundle', status: 'active', tags: [zone], approved: true,
  narrative_tier: ZONE_TIER[zone], revelation_tier: ZONE_TIER[zone], power_tier: 1,
  content: {
    name: 'Room of ' + name, zone, verb: 'dwell', faction: 'neutral', nave_faction: 'neutral',
    description: 'a room', lore: { name: name + "'s ground", description: 'some ground' },
    npc: { name, voice: 'flat', dialogue: { start: 'greet', nodes: {
      greet: { says: 'hm', choices: [{ id: 'learn', text: 'tell me', effects: { set_facts: { [flag]: true } } }] },
    } } },
  },
});
// every gate the carried anchors want, with TWO fungible setters each (the live run authors six).
const GATES = SPINE_ANCHORS.flatMap((a) => a.content.load_bearing.gates.map((g) => [g, a.content.zone]));
const run = GATES.flatMap(([g, zone], i) => [keeper('k' + i + 'a', 'Keeper ' + i + 'A', zone, g), keeper('k' + i + 'b', 'Keeper ' + i + 'B', zone, g)]);
const conclusion = { id: 'end1', type: 'plot_beat', status: 'active', approved: true, tags: ['conclusion', 'drift', 'answer'], narrative_tier: 4, revelation_tier: 4, power_tier: 1, content: { name: 'An Ending', description: 'it ends', conclusion: { tone: 'still', tree: { start: 'a', nodes: { a: { says: 'so', choices: [{ id: 'x', text: 'end', effects: { end: true } }] } } } } } };

// ── 1. the carried spine ──────────────────────────────────────────────────────────────────────────
ok(SPINE_ANCHORS.length === 4, 'four anchors are carried');
ok(SPINE_ANCHORS.every((a) => a.id && a.content && a.content.load_bearing), 'every carried anchor has an id and a load_bearing block');
ok(SPINE_ANCHORS.map((a) => a.content.load_bearing.tier).join() === '1,2,3,4', 'the carried chain is tiers 1..4 in order');
ok(SPINE_ANCHORS.every((a) => a.status === 'active'), 'carried anchors are servable (status active), whatever their status upstream');
ok(SPINE_PROVENANCE.service && SPINE_PROVENANCE.anchors.length === 4, 'provenance names the service repo and all four records');

// ── 2. the graft fires on a run with no spine ─────────────────────────────────────────────────────
const raw = [...run, conclusion];
ok(!hasLoadBearing(raw), 'the fixture run carries no load-bearing anchor (the live case)');
const served = servePool(raw);
const chain = anchorChain(served);
ok(chain.length === 4, 'servePool grafts the spine: four anchors in the served pool');
ok(chain.map((a) => a.tier).join() === '1,2,3,4', 'the grafted chain is contiguous t1..t4');
ok(chain.every((a) => a.clearedFlag), 'every grafted anchor kept its turn-in (flag.deck.*.cleared)');
const rep = proveProgression(served, { forcePlaced: true });
ok(rep.verdict === 'PASS', 'the run + the graft is provably progressable — ' + rep.issues.filter((i) => i.level === 'error').map((i) => i.code + ' ' + (i.gate || '')).join(', '));

// ── 3. hoopy's own spine wins ─────────────────────────────────────────────────────────────────────
const ownAnchor = clone(SPINE_ANCHORS[0]);
ownAnchor.id = 'their-own-anchor';
ownAnchor.content.npc.name = 'Someone Else';
const withOwn = graftSpineAnchors([...raw, ownAnchor]);
ok(withOwn.length === raw.length + 1, 'a run that brings its own anchor is left alone — nothing grafted');
ok(anchorChain(servePool([...raw, ownAnchor])).length === 1, 'the served chain is the run’s anchor only');

// ── 4. re-gated against THIS run ──────────────────────────────────────────────────────────────────
const extra = keeper('kx', 'New Scale Keeper', 'upper_rind', 'flag.rind.drift_scale_d');   // a gate the anchors never knew
const t3 = anchorChain(servePool([...raw, extra])).find((a) => a.tier === 3);
ok(t3.gates.includes('flag.rind.drift_scale_d'), 'a gate the run ADDS is picked up by the tier-3 anchor');
const sets = (r, g) => JSON.stringify(r).includes('"' + g + '"');
const dropped = raw.filter((r) => !sets(r, 'flag.rind.drift_scale_c'));
const t3b = anchorChain(servePool(dropped)).find((a) => a.tier === 3);
ok(!t3b.gates.includes('flag.rind.drift_scale_c'), 'a gate the run DROPS leaves the tier-3 anchor');
ok(proveProgression(servePool(dropped), { forcePlaced: true }).verdict === 'PASS', 'dropping a gate keeps the campaign solvable (no stale gate to soft-lock on)');

// the turn-in requires exactly the re-gated set — an anchor gated on a flag it no longer lists is a lock.
const servedT3 = servePool([...raw, extra]).find((c) => c.id === SPINE_ANCHORS[2].id);
const turnin = Object.values(servedT3.content.dialogue.nodes).flatMap((n) => n.choices || [])
  .find((ch) => ch.requires && ch.requires.facts);
ok(turnin && Object.keys(turnin.requires.facts).sort().join() === t3.gates.slice().sort().join(), 'the turn-in requires exactly the re-gated flags');

// ── 5. a scope with no live gates keeps its authored gates (the hole stays visible) ───────────────
const noSignal = raw.filter((r) => !String(JSON.stringify(r)).includes('flag.signal.'));
const repHole = proveProgression(servePool(noSignal), { forcePlaced: true });
ok(repHole.verdict === 'BLOCK' && repHole.issues.some((i) => i.code === 'gate_no_setter'),
  'a tier whose gates nothing sets reports gate_no_setter rather than a free turn-in');

// ── 6. the briefing splices retire themselves ────────────────────────────────────────────────────
// the anchors.js taxonomy: a GATE is flag.<scope>.* excluding the deck-clear and the two choice flags.
const isGate = (k) => /^flag\.(commons|ward|rind|signal)\./.test(k)
  && !/^flag\.deck\./.test(k) && !/^flag\.chose\./.test(k) && k !== 'flag.signal.disposition';
const anchorsSetOwnGate = servePool(raw).filter((c) => (SPINE_ANCHORS.some((a) => a.id === c.id)))
  .some((c) => Object.values((c.content.dialogue || {}).nodes || {})
    .flatMap((n) => n.choices || [])
    .some((ch) => Object.keys((ch.effects && ch.effects.set_facts) || {}).some(isGate)));
ok(!anchorsSetOwnGate, 'no grafted anchor sets one of its own gates (the seed-anchor-briefings splices stand down)');
// every grafted anchor's dialogue nodes are reachable from start (a dropped splice took its node with it)
for (const a of servePool(raw).filter((c) => SPINE_ANCHORS.some((s) => s.id === c.id))) {
  const dlg = a.content.dialogue, nodes = Object.keys(dlg.nodes);
  const reached = new Set([dlg.start || 'greet']);
  for (const n of Object.values(dlg.nodes)) for (const ch of (n.choices || [])) if (ch.goto) reached.add(ch.goto);
  ok(nodes.every((id) => reached.has(id)), `${(a.content.name)}: no orphaned dialogue node left behind`);
}

// ── 6b. what scripts/reactivate-anchors.mjs publishes IS what the graft serves ───────────────────
// The two mechanisms must never disagree: reactivation writes spineAnchorsFor() upstream, and once
// those records are live the graft no-ops. If these drifted apart, reactivating would change the world.
ok(JSON.stringify(graftSpineAnchors(raw)) === JSON.stringify([...raw, ...spineAnchorsFor(raw)]),
  'graftSpineAnchors(x) is exactly x + spineAnchorsFor(x) — the records reactivation would publish');
const reactivated = [...raw, ...spineAnchorsFor(raw)];   // as if they were live upstream
ok(spineAnchorsFor(reactivated).length === 0, 'once those records are live upstream the graft adds nothing');
ok(JSON.stringify(servePool(reactivated)) === JSON.stringify(servePool(raw)),
  'reactivating upstream changes NOTHING about the served world');

// ── 7. purity + idempotency ──────────────────────────────────────────────────────────────────────
const before = JSON.stringify(SPINE_ANCHORS);
servePool([...raw, extra]); graftSpineAnchors(raw);
ok(JSON.stringify(SPINE_ANCHORS) === before, 'SPINE_ANCHORS is never mutated by a graft');
ok(servePool(servePool(raw)).length === servePool(raw).length, 'servePool stays idempotent with the graft in it');
ok(graftSpineAnchors([]).length === 0, 'an empty pool grafts nothing (no gates → nothing to anchor)');
ok(Object.keys(liveGatesByScope(raw)).sort().join() === 'commons,rind,signal,ward', 'liveGatesByScope buckets the run’s gates by scope');

console.log((fail ? '✗ ' : '✓ ') + 'spine-graft.selftest — ' + pass + '/' + (pass + fail) + ' checks');
process.exit(fail ? 1 : 0);
