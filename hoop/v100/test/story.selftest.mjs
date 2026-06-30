// story.selftest.mjs — the small-task story changes: hoopy's new export schema,
// reputation gating OFF, and exploration-driven tier leveling.
//
//   node hoop/v096/test/story.selftest.mjs

import { importRecord, importWorldExport, expandRoomBundle, expandWanderer, servePool } from '../story/import.js';
import { MemoryStore, interact, talk, meetsState, exploreTierForXp } from '../story/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

// ── 1. the NEW keyed-object schema: nested content{}, integer tiers on our own axes ──
const NEW = {
  id: 'u-1', type: 'npc',
  content: { name: 'Kael Kest', description: 'A salt-merchant of the Nave.', revelation_hint: 'The Ordinary',
    dialogue: { nodes: { greet: { says: 'What currency do you bring?', choices: [{ id: 'leave', text: 'None.', effects: { end: true } }] } } } },
  tags: ['market'], requires: {}, revelation_tier: 2, narrative_tier: 3, power_tier: 1, approved: true,
};
const ci = importRecord(NEW);
ok(ci.id === 'u-1' && ci.type === 'npc', 'new: id + type carried');
ok(ci.content.name === 'Kael Kest' && /salt-merchant/.test(ci.content.description), 'new: name + description lifted from content{}');
ok(ci.revelation_tier === 2 && ci.narrative_tier === 3 && ci.power_tier === 1, 'new: integer tiers read directly (no AXIS_MAP remap)');
ok(!!ci.content.dialogue && !!ci.revelation_hint, 'new: dialogue + revelation_hint carried');

// ── 2. the OLD flat schema still maps (AXIS_MAP: power→revelation, plot→power) ──
const OLD = { name: 'Pumice-wriggler', type: 'creature', description: 'Armored hexapods.', power_tier: 'r3', narrative_tier: 'n2', plot_tier: 'p1', status: 'approved' };
const oc = importRecord(OLD);
ok(oc.revelation_tier === 3 && oc.narrative_tier === 2 && oc.power_tier === 1, 'old: r/n/p strings remap to the right axes');
ok(oc.content.name === 'Pumice-wriggler' && oc.id === 'pumice-wriggler', 'old: flat name + slugged id');

// ── 3. importWorldExport accepts the keyed object ──
const exp = { 0: NEW, 1: { ...NEW, id: 'u-2' }, meta: 'ignored-non-record' };
const { content } = importWorldExport(exp);
ok(content.length === 2, 'keyed-object export → records (non-record values dropped)');

// ── 4. reputation gating is OFF: min_rep never blocks ──
ok(meetsState({ facts: {}, items: new Set() }, { min_rep: { drift: 5 } }) === true, 'min_rep does not block');
ok(meetsState({ facts: { 'flag.x': true }, items: new Set() }, { facts: { 'flag.x': true } }) === true, 'facts still gate (true case)');
ok(meetsState({ facts: {}, items: new Set() }, { facts: { 'flag.x': true } }) === false, 'facts still gate (false case)');

// a dialogue choice gated ONLY on min_standing is shown (standing starts at 0)
{
  const npc = { id: 'n1', type: 'npc', approved: true, status: 'active', revelation_tier: 1, narrative_tier: 1, power_tier: 1,
    content: { name: 'Gatekeeper', dialogue: { start: 'g', nodes: { g: { says: 'hm', choices: [
      { id: 'rep', text: 'rep-gated', requires: { min_standing: 3 } },
      { id: 'open', text: 'open' },
    ] } } } } };
  const s = new MemoryStore([npc], { features: [] });
  const t = talk(s, 'p', 'n1');
  ok(t.choices.length === 2 && t.choices.some((c) => c.id === 'rep'), 'min_standing-gated choice is shown anyway');
}

// ── 5. exploration drives REVELATION only; narrative is hoopybot's (story spine) ──
ok(exploreTierForXp(0) === 1 && exploreTierForXp(30) === 2 && exploreTierForXp(250) === 5, 'exploreTierForXp steps with xp');
{
  const pool = [];
  for (let i = 0; i < 6; i++) pool.push({ id: 'lf' + i, type: 'lore_fragment', approved: true, status: 'active', revelation_tier: 1, narrative_tier: 1, power_tier: 1, tags: [], content: { name: 'frag ' + i, description: 'a thing' } });
  const s = new MemoryStore(pool, { features: [] });
  for (let i = 0; i < 6; i++) { s.addFeature({ key: 'f' + i, type: 'lore_fragment' }); interact(s, 'p', 'f' + i); }
  const p1 = s.getPlayerState('p');
  ok(p1.revelation_tier >= 2, `exploring lifts revelation tier (rev ${p1.revelation_tier})`);
  ok(p1.narrative_tier === 1, 'narrative tier stays 1 under exploration — it is hoopybot-gated, not XP-gated');
}

// ── 6. SERVING RULES for hoopy's 2026-06 live repo (room_bundle / wanderer / retired tombstones) ──
{
  const bundle = {
    id: 'rb-vesper', type: 'room_bundle', status: 'active', revelation_tier: 1, narrative_tier: 2, power_tier: 1,
    tags: ['upper_rind', 'mercury', 'move'],
    content: { name: 'The Arterial Line', zone: 'upper_rind', faction: 'mercury', nave_faction: 'drift', verb: 'move',
      lore: 'The carts do not wait for ghosts.', description: 'a transit chamber',
      npc: { name: 'Vesper Lin', voice: 'brisk', dialogue: { start: 'greet', nodes: { greet: { says: 'You block the line.', choices: [{ id: 'q', goto: 'greet', text: 'Sorry.' }] } } } } },
  };
  const exploded = expandRoomBundle(bundle);
  ok(exploded.length === 2, 'room_bundle explodes into two items');
  const bn = exploded.find((x) => x.type === 'npc'), bl = exploded.find((x) => x.type === 'lore_fragment');
  ok(bn && bn.content.name === 'Vesper Lin' && bn.content.dialogue.nodes.greet, 'bundle → npc with its dialogue tree');
  ok(bl && /carts do not wait/.test(bl.content.description), 'bundle → lore_fragment from content.lore');
  ok(bn.tags.includes('drift') && bn.tags.includes('upper_rind') && bn.tags.includes('move'), 'bundle npc lifts nave_faction/zone/verb into tags');

  const wand = { id: 'wanderer-x', type: 'wanderer', status: 'active', revelation_tier: 1, narrative_tier: 1, power_tier: 1, tags: [],
    content: { name: 'Varn Dax', line: 'The ink dries before the thought remembers its shape.', verb: 'learn', zone: 'commons', faction: 'neutral', description: 'drifts toward the market' } };
  const [wn] = expandWanderer(wand);
  ok(wn.type === 'npc' && wn.content.ambient === true, 'wanderer → ambient npc');
  ok(wn.content.dialogue && /ink dries/.test(wn.content.dialogue.nodes.greet.says), 'wanderer line wraps into a one-node dialogue');
  ok(wn.tags.includes('commons') && wn.tags.includes('learn'), 'wanderer lifts zone/verb into tags');
  const t = talk(new MemoryStore([wn], { features: [] }), 'p', 'wanderer-x');
  ok(t.ambient === true && /ink dries/.test(t.says) && t.choices.length === 0, 'talk(wanderer) is an ambient one-liner with no choices');

  // servePool: drop retired tombstones, explode bundles, map wanderers, pass engine-shaped records verbatim
  const retired = { id: 'old-npc', type: 'npc', status: 'retired', revelation_tier: 1, narrative_tier: 1, power_tier: 1, content: { name: 'ghost' } };
  const beat = { id: 'pb-1', type: 'plot_beat', status: 'active', revelation_tier: 1, narrative_tier: 1, power_tier: 1, content: { name: 'The Closed Channel', conclusion: { tone: 'quiet', tree: { nodes: {} } } } };
  const served = servePool([bundle, wand, retired, beat]);
  ok(!served.some((c) => c.status === 'retired') && !served.some((c) => c.id === 'old-npc'), 'servePool drops retired tombstones');
  ok(!served.some((c) => c.type === 'room_bundle' || c.type === 'wanderer'), 'servePool leaves no raw room_bundle/wanderer');
  ok(served.filter((c) => c.type === 'npc').length === 2, 'servePool yields the bundle npc + the wanderer npc');
  ok(served.find((c) => c.type === 'plot_beat').content.conclusion, 'servePool passes plot_beat through verbatim (conclusion preserved)');
  ok(servePool(served).length === served.length, 'servePool is idempotent on an already-served pool');
}

console.log(`\nstory.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
