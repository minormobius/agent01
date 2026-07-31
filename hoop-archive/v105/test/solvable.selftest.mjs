// solvable.selftest.mjs — the quest solvability oracle (story/solvable.js).
//   node hoop/v105/test/solvable.selftest.mjs
//
// Two halves:
//   1. SYNTHETIC: every defect class the oracle claims to catch, proven to fire (and a clean chain
//      proven to PASS) — the same fixture shapes anchors.selftest uses.
//   2. THE LIVE PIN: a frozen slice of the real morphyx pool (fixtures/live-chain.json — the 4 anchors,
//      every gate setter, one conclusion beat, as raw records through servePool). The oracle must find
//      EXACTLY the known defects — the Kaelen Voss tier-1 soft-lock the playtest hit, two more
//      tier-invisible setters at tier 3, and two gates with no setter at all (tiers 3 & 4). When hoopy
//      repairs the pool, re-freeze the slice and this list shrinks — that's the point of the pin.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { proveProgression, requiredKeeperIds, waivableGates, canReachFlag, ZONE_TIER } from '../story/solvable.js';
import { anchorChain, gateSetters } from '../story/anchors.js';
import { servePool, isTombstoned, dedupeRawIds } from '../story/import.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const codes = (rep, lvl) => rep.issues.filter((i) => !lvl || i.level === lvl).map((i) => i.code);

// ── fixture builders (anchors.selftest shapes) ──
const anchor = (id, name, tier, zone, gates, clearedDeck) => ({
  id, type: 'npc', status: 'active', tags: [zone, 'load_bearing'],
  content: {
    name: 'Room of ' + name, zone, load_bearing: { tier, gates },
    npc: { name, dialogue: { start: 'greet', nodes: {
      greet: { says: 'hm', choices: [
        { id: 'ack', text: 'later', effects: { end: true } },
        { id: 'turnin', goto: 'turnin', text: 'ready', requires: { facts: Object.fromEntries(gates.map((g) => [g, true])) } },
      ] },
      turnin: { says: 'go', choices: [{ id: 'fin', text: 'done', effects: { end: true, set_facts: { ['flag.deck.' + clearedDeck + '.cleared']: true } } }] },
    } } },
  },
});
const keeper = (id, name, zone, flag, extra = {}) => ({
  id, type: 'npc', status: 'active', tags: [zone], narrative_tier: extra.narTier || 1,
  requires: extra.requires || null,
  content: { name: 'Room ' + id, zone, ...(extra.ambient ? { ambient: true } : {}),
    npc: { name, dialogue: { start: 'g', nodes: { g: { says: 'hi', choices: [
      { id: 'done', goto: 'done', text: 'I see.', effects: { end: true, set_facts: { [flag]: true } } },
    ] } } } } },
  ...(extra.status ? { status: extra.status } : {}),
});
const conclusion = { id: 'pb-end', type: 'plot_beat', status: 'active', tags: ['conclusion', 'drift', 'answer'], content: { name: 'An Ending' } };

// ── 1. a clean two-tier chain PASSES ──
{
  const content = [
    anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x'], 'commons'),
    anchor('a2', 'Solen', 2, 'wards', ['flag.ward.y'], 'wards'),
    keeper('k1', 'Kip', 'commons', 'flag.commons.x'),
    keeper('k2', 'Rue', 'wards', 'flag.ward.y'),
    conclusion,
  ];
  const rep = proveProgression(content);
  ok(rep.solvable && rep.verdict === 'PASS' && rep.errors.length === 0, `a clean chain PASSES (${rep.verdict}: ${codes(rep, 'error').join(',')})`);
}

// ── 2. every defect class fires ──
{
  const rep = proveProgression([]);
  ok(!rep.solvable && codes(rep).includes('no_anchors'), 'an empty pool is no campaign (no_anchors)');
}
{
  // the Kaelen Voss class: a tier-2 keeper setting a tier-1 gate is invisible to the placement pool
  const content = [anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x'], 'commons'),
    keeper('k1', 'Kaelen', 'commons', 'flag.commons.x', { narTier: 2 }), conclusion];
  const rep = proveProgression(content);
  ok(!rep.solvable && codes(rep, 'error').includes('setter_invisible'), 'a keeper above the anchor tier is caught (setter_invisible — the Kaelen Voss soft-lock)');
  const rep2 = proveProgression(content, { forcePlaced: true });
  ok(rep2.solvable && codes(rep2, 'warn').includes('setter_invisible'), 'with the requiredKeeperIds bypass wired, the same pool is solvable (WARN, not ERROR)');
}
{
  const content = [anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x'], 'commons'), conclusion];
  const rep = proveProgression(content);
  ok(codes(rep, 'error').includes('gate_no_setter'), 'a gate no one sets is caught (gate_no_setter)');
}
{
  const content = [anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x'], 'commons'),
    keeper('k1', 'Ghost', 'commons', 'flag.commons.x', { ambient: true }), conclusion];
  ok(codes(proveProgression(content), 'error').includes('setter_ambient'), 'an ambient (wanderer) setter is caught (setter_ambient)');
}
{
  const content = [anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x'], 'commons'),
    keeper('k1', 'Kip', 'commons', 'flag.commons.x', { status: 'retired' }), conclusion];
  ok(codes(proveProgression(content), 'error').includes('setter_unservable'), 'a retired setter is caught (setter_unservable)');
}
{
  // v105 RUNTIME-BOUNDARY NUANCE: "unearnable" now means gated on a flag the pool PRODUCES but only at a
  // LATER tier — a fact NOTHING produces is the runtime boundary (worldExternal) and is assumed game-set
  // (the mythograph's terminal read). So the tier-1 setter here waits on a tier-2 gate flag: still an error.
  const content = [anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x'], 'commons'),
    anchor('a2', 'Solen', 2, 'wards', ['flag.ward.later'], 'wards'),
    keeper('k1', 'Kip', 'commons', 'flag.commons.x', { requires: { facts: { 'flag.ward.later': true } } }),
    keeper('k2', 'Lorn', 'wards', 'flag.ward.later', { narTier: 2 }), conclusion];
  ok(codes(proveProgression(content, { forcePlaced: true }), 'error').includes('setter_gated'), 'a setter gated on a later-tier flag is caught (setter_gated)');
  // and the boundary itself: a fact nothing in the pool produces is assumed RUNTIME-SET, not a block.
  const content2 = [anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x'], 'commons'),
    keeper('k1', 'Kip', 'commons', 'flag.commons.x', { requires: { facts: { 'flag.game.sets.this': true } } }), conclusion];
  ok(proveProgression(content2).solvable, 'a setter gated on a runtime (never-produced) fact passes — the worldExternal boundary');
}
{
  // a tier-1 gate whose keeper sits in the upper rind (deck opens at tier 3) can't be reached
  const content = [anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x'], 'commons'),
    keeper('k1', 'Deep', 'upper_rind', 'flag.commons.x'), conclusion];
  ok(codes(proveProgression(content), 'error').includes('setter_zone_locked'), 'a setter seated behind a locked deck is caught (setter_zone_locked)');
  ok(ZONE_TIER.upper_rind === 3 && ZONE_TIER.lower_rind === 4, 'zone thresholds mirror the game (rind 3, lower rind 4)');
}
{
  const content = [anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x'], 'commons'),
    anchor('a3', 'Sevin', 3, 'upper_rind', ['flag.rind.z'], 'upper_rind'),
    keeper('k1', 'Kip', 'commons', 'flag.commons.x'), keeper('k3', 'Rue', 'upper_rind', 'flag.rind.z', { narTier: 3 }), conclusion];
  ok(codes(proveProgression(content), 'error').includes('chain_gap'), 'a missing rung in the ladder is caught (chain_gap)');
}
{
  const noTurnin = anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x'], 'commons');
  noTurnin.content.npc.dialogue.nodes.turnin.choices = [{ id: 'fin', text: 'done', effects: { end: true } }];
  const rep = proveProgression([noTurnin, keeper('k1', 'Kip', 'commons', 'flag.commons.x'), conclusion]);
  ok(codes(rep, 'error').includes('anchor_no_turnin'), 'an anchor whose turn-in clears nothing is caught (anchor_no_turnin)');
}

// ── 2c. DIALOGUE REACHABILITY (v105): a set_facts parked where play can't reach is NOT a setter ──
// The v101 oracle trusted set_facts anywhere in the tree; a flag on an orphaned node (or behind a
// choice gated on an unearnable fact) passed the proof and soft-locked the game anyway.
{
  const k = keeper('k1', 'Kip', 'commons', 'flag.commons.x');
  k.content.npc.dialogue.nodes = {
    g: { says: 'hi', choices: [{ id: 'bye', text: 'later', effects: { end: true } }] },
    orphan: { says: 'secret', choices: [{ id: 'done', text: 'take it', effects: { end: true, set_facts: { 'flag.commons.x': true } } }] },
  };
  const rep = proveProgression([anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x'], 'commons'), k, conclusion]);
  ok(!rep.solvable && codes(rep, 'error').includes('setter_flag_unreachable'), 'a flag on an ORPHANED dialogue node is caught (setter_flag_unreachable)');
}
{
  const k = keeper('k1', 'Kip', 'commons', 'flag.commons.x');
  k.content.npc.dialogue.nodes.g.choices[0].requires = { facts: { 'flag.never.earned': true } };
  const rep = proveProgression([anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x'], 'commons'), k, conclusion]);
  ok(codes(rep, 'error').includes('setter_flag_unreachable'), 'a setting choice gated on an UNEARNABLE fact is caught (setter_flag_unreachable)');
}
{
  // a talk-twice tree — the deep node is gated on a fact another choice in the SAME tree sets — must
  // still prove out (the fixpoint), and a choice gated on a SIBLING GATE of the same anchor is fine.
  const k = keeper('k1', 'Kip', 'commons', 'flag.commons.x');
  k.content.npc.dialogue = { start: 'g', nodes: {
    g: { says: 'hi', choices: [
      { id: 'warm', goto: 'g', text: 'listen', effects: { set_facts: { 'flag.kip.warm': true } } },
      { id: 'deep', goto: 'deep', text: 'go on', requires: { facts: { 'flag.kip.warm': true } } },
    ] },
    deep: { says: 'truth', choices: [{ id: 'done', text: 'I see', effects: { end: true, set_facts: { 'flag.commons.x': true } } }] },
  } };
  const rep = proveProgression([anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x'], 'commons'), k, conclusion]);
  ok(rep.solvable, `a talk-twice tree (self-earned facts) proves out via the fixpoint (${codes(rep, 'error').join(',')})`);
  ok(canReachFlag(k, 'flag.commons.x', []) === true, 'canReachFlag walks facts the dialogue itself sets');
  ok(canReachFlag(k, 'flag.not.here', []) === false, 'canReachFlag is honest about a flag the tree never sets');
}

// ── 2d. waivableGates (v105): the runtime waiver's shopping list ──
// Only provably-dead gates at the asked tier; setter_invisible is NOT waivable (force-place handles it).
{
  const content = [
    anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x', 'flag.commons.y'], 'commons'),
    anchor('a2', 'Solen', 2, 'wards', ['flag.ward.z'], 'wards'),
    keeper('k2', 'Rue', 'commons', 'flag.commons.y', { narTier: 2 }),   // invisible → force-placeable, NOT waived
    // flag.commons.x has no setter at all → waivable at tier 1; flag.ward.z none either → waivable at tier 2
    conclusion,
  ];
  const rep = proveProgression(content, { forcePlaced: true });
  ok(JSON.stringify(waivableGates(rep, 1)) === '["flag.commons.x"]', `tier 1 waives only the setter-less gate — got ${JSON.stringify(waivableGates(rep, 1))}`);
  ok(JSON.stringify(waivableGates(rep, 2)) === '["flag.ward.z"]', 'tier 2 waives its own dead gate, not tier 1\'s');
  ok(!waivableGates(rep, 1).includes('flag.commons.y'), 'a tier-invisible (force-placeable) gate is never waived');
}

// ── 2b. TOMBSTONES ARE NEVER REFERENCED (the "flagging a retired NPC" bug) ──
// hoopy soft-deletes in place: a nuked record STAYS in listRecords with status:'retired'. Every read
// path must drop it, or a tombstoned NPC/gate gets flagged as live (a keeper you're told to find who no
// longer exists). isTombstoned is the single predicate; servePool applies it before anything else sees
// the pool. Pinned across every tombstone convention so a future form can't leak.
{
  ok(isTombstoned({ status: 'retired' }) && isTombstoned({ status: 'tombstoned' }) && isTombstoned({ status: 'deleted' }), 'retired/tombstoned/deleted statuses are tombstones');
  ok(isTombstoned({ tombstone: true }) && isTombstoned({ deleted: true }) && isTombstoned({ deletedAt: '2026-07-01' }), 'explicit tombstone flags/timestamps are tombstones');
  ok(!isTombstoned({ status: 'active' }) && !isTombstoned({}), 'active (and status-less) records are live');
  // a tombstoned keeper — even one that sets a live gate — must NOT survive serving, so the oracle/game
  // can never name it. (Kaelen Voss ships as an ACTIVE room_bundle; a stray retired npc copy is dropped.)
  const live = anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x'], 'commons');
  const deadKeeper = { ...keeper('k-dead', 'Ghost of Kaelen', 'commons', 'flag.commons.x'), status: 'retired' };
  const liveKeeper = keeper('k-live', 'Kip', 'commons', 'flag.commons.x');
  const served = servePool([live, deadKeeper, liveKeeper]);
  ok(!served.some((c) => c.id === 'k-dead'), 'servePool drops a tombstoned keeper before the pool is ever gated');
  ok(gateSetters(served)['flag.commons.x']?.name === 'Kip', 'the gate resolves to the LIVE keeper, never the tombstoned one');
  // and if the tombstone were the ONLY setter, the gate is honestly reported dead (not silently satisfied)
  const orphaned = servePool([live, deadKeeper]);
  ok(proveProgression([...orphaned, conclusion]).errors.some((i) => i.code === 'gate_no_setter'),
    'a gate whose only setter is tombstoned is reported dead, not falsely closed');
}

// ── 3. requiredKeeperIds — the runtime bypass list ──
{
  const content = [
    anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x', 'flag.commons.y'], 'commons'),
    keeper('k1', 'Kaelen', 'commons', 'flag.commons.x', { narTier: 2 }),   // invisible to the tier filter — exactly who this list is for
    keeper('k2', 'Rue', 'commons', 'flag.commons.y'),
    conclusion,
  ];
  const chain = anchorChain(content), setters = gateSetters(content);
  ok(JSON.stringify(requiredKeeperIds(chain, setters, {}, 1)) === '["k1","k2"]', 'fresh player at tier 1 → both gate setters required, in gate order');
  ok(JSON.stringify(requiredKeeperIds(chain, setters, { 'flag.commons.x': true }, 1)) === '["k2"]', 'a met gate drops its keeper from the required list');
  ok(requiredKeeperIds(chain, setters, { 'flag.commons.x': true, 'flag.commons.y': true }, 1).length === 0, 'all gates met → nothing required');
  ok(requiredKeeperIds(chain, setters, {}, 5).length === 0, 'a tier with no anchor requires nothing');
}

// ── 4. THE LIVE PIN: the frozen real chain (morphyx pool, 2026-07-01) ──
{
  const raw = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/live-chain.json'), 'utf8'));
  const served = servePool(raw);
  const chain = anchorChain(served);
  ok(chain.length === 4 && chain.map((a) => a.tier).join(',') === '1,2,3,4', 'the live chain: four anchors, tiers 1..4 (Olo → Solen → Sevin → Luna)');

  // THE KAELEN VOSS ROOT CAUSE (the playtest soft-lock): the pool ships TWO distinct "Kaelen Voss"
  // room_bundles — "The Rivet Chancel" (tier-1, sets the tier-1 gate flag.commons.rindwalker_face) and
  // "The Fulcrum Cell" (tier-2, sets flag.ward.rindwalker_known). Both slugged to `kaelen-voss` and
  // COLLIDED in the store's contentById Map, so the tier-2 one shadowed the tier-1 keeper — talking to the
  // placed Kaelen set the wrong flag and the tier-1 gate never fired. servePool's dedupeRawIds now gives
  // each a STABLE unique id, so gateSetters, requiredKeeperIds and the store all resolve the right keeper.
  const setters = gateSetters(served);
  const byId = new Map(served.map((c) => [c.id, c]));
  const kaeIds = served.filter((c) => c.type === 'npc' && (c.content || {}).name === 'Kaelen Voss').map((c) => c.id);
  ok(kaeIds.length === 2 && new Set(kaeIds).size === 2, `the two Kaelen Voss keepers get distinct ids — got ${JSON.stringify(kaeIds)}`);
  const kaeFace = byId.get(setters['flag.commons.rindwalker_face'] && setters['flag.commons.rindwalker_face'].contentId);
  ok(kaeFace && (kaeFace.content || {}).name === 'Kaelen Voss' && (kaeFace.narrative_tier || 1) === 1,
    'flag.commons.rindwalker_face is set by the tier-1 Rivet Chancel Kaelen (no longer shadowed by the tier-2 Fulcrum Cell)');

  // with de-collided ids every keeper sits at its OWN narrative_tier, so NONE is tier-invisible — the three
  // former setter_invisible WARNs (Kaelen, Tamsin Rook, Joran Vell) were pure collision artifacts (the tier-2
  // twin's tier bled onto the tier-1 gate). What remains BLOCKing is pure content: two gates no one sets.
  const rep = proveProgression(served, { forcePlaced: true });
  const warns = rep.issues.filter((i) => i.level === 'warn' && i.code === 'setter_invisible').map((i) => i.gate).sort();
  ok(warns.length === 0, `no keeper is tier-invisible after de-collision — got ${JSON.stringify(warns)}`);
  const errs = rep.errors.map((i) => i.tier + ':' + i.code + ':' + (i.gate || '')).sort();
  ok(JSON.stringify(errs) === JSON.stringify([
    '3:gate_no_setter:flag.rind.rindwalker_scale_a',
    '4:gate_no_setter:flag.signal.chamber_key',
  ]), `the live pool's remaining BLOCKs are the two setter-less gates (hoopy's to fill) — got ${JSON.stringify(errs)}`);

  // and WITHOUT the force-place bypass the pool is solvable to those same content gaps — tier 1 no longer
  // BLOCKs, because the tier-1 gate's setter is genuinely a tier-1 keeper (not a shadowed tier-2 twin).
  const bare = proveProgression(served);
  ok(!bare.errors.some((i) => i.tier === 1), 'tier 1 no longer BLOCKs — the Kaelen Voss soft-lock is gone even without the bypass');

  // the runtime list a fresh player needs at tier 1 still names all three commons keepers, Kaelen included.
  const req = requiredKeeperIds(chain, setters, {}, 1);
  ok(req.length === 3 && req.some((id) => /Kaelen Voss/.test(((byId.get(id) || {}).content || {}).name || '')),
    'requiredKeeperIds at tier 1 lists all three commons keepers, Kaelen Voss included');
}

// ── 5. dedupeRawIds — the stability contract (atproto permalinks depend on it) ──
{
  // two room_bundles with the same npc name but different content → same base id, must split.
  const mk = (room, zone, tier) => ({ type: 'room_bundle', narrative_tier: tier, status: 'active',
    content: { name: room, zone, npc: { name: 'Kaelen Voss', dialogue: { start: 'g', nodes: { g: { says: room, choices: [] } } } } } });
  const a = mk('The Rivet Chancel', 'commons', 1), b = mk('The Fulcrum Cell', 'wards', 2), lone = mk('Alone', 'commons', 1);
  lone.content.npc.name = 'Solene';

  const d1 = dedupeRawIds([a, b, lone]);
  ok(d1[0].id && d1[1].id && d1[0].id !== d1[1].id, 'two colliding records get DISTINCT ids');
  ok(!d1[2].id || d1[2].id === undefined, 'a non-colliding record is left untouched (no forced id)');
  ok(d1[0].id.startsWith('kaelen-voss-') && d1[1].id.startsWith('kaelen-voss-'), 'colliding ids keep the readable base + a hash suffix');

  // ORDER-INDEPENDENCE: the id a record gets depends only on its own content, not pool order.
  const d2 = dedupeRawIds([b, lone, a]);
  const idOf = (arr, room) => arr.find((r) => r.content.name === room).id;
  ok(idOf(d1, 'The Rivet Chancel') === idOf(d2, 'The Rivet Chancel')
    && idOf(d1, 'The Fulcrum Cell') === idOf(d2, 'The Fulcrum Cell'), 'reordering the pool does NOT change any id (order-independent / atproto-stable)');

  // an EXPLICIT id is authoritative — never rewritten even under collision.
  const withId = { ...mk('The Rivet Chancel', 'commons', 1), id: 'kaelen-voss' };
  const d3 = dedupeRawIds([withId, b]);
  ok(d3[0].id === 'kaelen-voss', 'an explicit id is never rewritten (it may be a cross-ref target)');

  // IDEMPOTENCE: running it again on the deduped set is a no-op (served pools re-serve unchanged).
  const withIds = d1.map((r, i) => r.id ? r : { ...r, id: 'lone-' + i });
  const d4 = dedupeRawIds(withIds);
  ok(withIds.every((r, i) => r.id === d4[i].id), 'dedupeRawIds is idempotent on an already-unique pool');
}

console.log(`solvable.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
