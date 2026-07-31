// story.selftest.mjs — the small-task story changes: hoopy's new export schema,
// reputation gating OFF, and exploration-driven tier leveling.
//
//   node hoop/v096/test/story.selftest.mjs

import { importRecord, importWorldExport } from '../story/import.js';
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

console.log(`\nstory.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
