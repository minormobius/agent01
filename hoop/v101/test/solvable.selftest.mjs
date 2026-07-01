// solvable.selftest.mjs — the quest solvability oracle (story/solvable.js).
//   node hoop/v101/test/solvable.selftest.mjs
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
import { proveProgression, requiredKeeperIds, ZONE_TIER } from '../story/solvable.js';
import { anchorChain, gateSetters } from '../story/anchors.js';
import { servePool } from '../story/import.js';

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
  const content = [anchor('a1', 'Olo', 1, 'commons', ['flag.commons.x'], 'commons'),
    keeper('k1', 'Kip', 'commons', 'flag.commons.x', { requires: { facts: { 'flag.never.set': true } } }), conclusion];
  ok(codes(proveProgression(content), 'error').includes('setter_gated'), 'a setter gated on an unearnable flag is caught (setter_gated)');
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

  // as the shipped surface runs it (requiredKeeperIds bypass wired): the tier-mismatch setters are
  // WARNs; what remains BLOCKing is pure content — two gates no one in the pool sets.
  const rep = proveProgression(served, { forcePlaced: true });
  const errs = rep.errors.map((i) => i.tier + ':' + i.code + ':' + (i.gate || '')).sort();
  ok(JSON.stringify(errs) === JSON.stringify([
    '3:gate_no_setter:flag.rind.rindwalker_scale_a',
    '4:gate_no_setter:flag.signal.chamber_key',
  ]), `the live pool's remaining BLOCKs are the two setter-less gates (hoopy's to fill) — got ${JSON.stringify(errs)}`);
  const warns = rep.issues.filter((i) => i.level === 'warn' && i.code === 'setter_invisible').map((i) => i.gate).sort();
  ok(JSON.stringify(warns) === JSON.stringify([
    'flag.commons.rindwalker_face',        // Kaelen Voss, narrative_tier 2 on the tier-1 anchor — the playtest soft-lock
    'flag.rind.continuant_scale_b',        // Tamsin Rook, tier 4 on the tier-3 anchor
    'flag.rind.rindwalker_scale_c',        // Joran Vell, tier 4 on the tier-3 anchor
  ]), `the three tier-invisible keepers are force-placed (WARN) — got ${JSON.stringify(warns)}`);

  // WITHOUT the bypass (a surface that only draws from the tier-filtered pool), tier 1 itself BLOCKs —
  // the exact bug the playtest hit: "find Kaelen Voss, keeper of the Rivet Chancel", who cannot spawn.
  const bare = proveProgression(served);
  ok(bare.errors.some((i) => i.tier === 1 && i.code === 'setter_invisible' && /Kaelen Voss/.test(i.msg)),
    'without the bypass the oracle proves tier 1 unsolvable — the Kaelen Voss / Rivet Chancel soft-lock');

  // and the runtime list a fresh player needs at tier 1 includes Kaelen Voss (the one the filter hides).
  const setters = gateSetters(served);
  const req = requiredKeeperIds(chain, setters, {}, 1);
  const byId = new Map(served.map((c) => [c.id, c]));
  ok(req.length === 3 && req.some((id) => /Kaelen Voss/.test(((byId.get(id) || {}).content || {}).npc?.name || ((byId.get(id) || {}).content || {}).name || '')),
    'requiredKeeperIds at tier 1 lists all three commons keepers, Kaelen Voss included');
}

console.log(`solvable.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
