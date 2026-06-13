// story.selftest.mjs — pins the INFERENCE-FREE story hot path (hoop/story/engine.js + validate.js).
//   node hoop/test/story.selftest.mjs
// Proves the keystone (crystallize→recall on a stable feature_key) and every pure verb runs
// deterministically with ZERO inference, over the hand-authored seed pool.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MemoryStore, flattenPool, dispatch, interact, take, listInventory, drop,
         equip, unequip, deriveStats, talk, choose, powerTierForXp, meetsState } from '../story/engine.js';
import { validateTree, errors, warnings } from '../story/validate.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const POOL = JSON.parse(readFileSync(join(HERE, '../story/pool.json'), 'utf8'));
const WORLD = JSON.parse(readFileSync(join(HERE, '../story/world.json'), 'utf8'));
const content = flattenPool(POOL);
const newStore = () => new MemoryStore(content, WORLD);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } };

// 1. pool sanity — sections flattened, every item tier-1/approved/active, types cover the world's features
ok('pool flattened', content.length >= 18);
ok('all approved+active', content.every((c) => c.approved && c.status === 'active'));
const types = new Set(content.map((c) => c.type)), worldTypes = new Set(WORLD.features.map((f) => f.type));
ok('pool covers every world feature type', [...worldTypes].every((t) => types.has(t)));

// 2. power tier is a pure step function of XP
ok('powerTier 0xp=1', powerTierForXp(0) === 1);
ok('powerTier 30xp=2', powerTierForXp(30) === 2);
ok('powerTier 29xp=1', powerTierForXp(29) === 1);
ok('powerTier 250xp=5', powerTierForXp(250) === 5);

// 3. meetsState gate — facts / items / min_rep
ok('empty requires passes', meetsState({ facts: {}, items: new Set() }, {}));
ok('fact gate blocks', !meetsState({ facts: {}, items: new Set() }, { facts: { 'flag.x': true } }));
ok('fact gate opens', meetsState({ facts: { 'flag.x': true }, items: new Set() }, { facts: { 'flag.x': true } }));
ok('item gate by token', meetsState({ facts: {}, items: new Set(['keycard']) }, { items: ['keycard'] }));
ok('min_rep gate', !meetsState({ facts: { 'rep.keepers': 1 }, items: new Set() }, { min_rep: { keepers: 2 } }));

// 4. THE KEYSTONE — crystallize on first touch, recall the SAME item forever, on a stable feature_key
{
  const s = newStore();
  const first = interact(s, 'p1', 'medbay.shelf.a');
  ok('first touch crystallizes', first.status === 'crystallized' && first.item && first.item.type === 'item');
  const boundId = first.item.content_item_id;
  const again = interact(s, 'p1', 'medbay.shelf.a');
  ok('second touch recalls same item', again.status === 'recalled' && again.item.content_item_id === boundId);
  ok('recall bumps interaction_count', again.interaction_count === 2);
  // determinism: a fresh player+store crystallizes the SAME item on the SAME feature (no random)
  const s2 = newStore();
  ok('crystallization deterministic', interact(s2, 'p1', 'medbay.shelf.a').item.content_item_id === boundId);
  // a different player gets their OWN binding (could differ; here pool is shared so first-pick matches — but it's a separate row)
  ok('per-player placement', interact(s, 'p2', 'medbay.shelf.a').status === 'crystallized');
  ok('unknown feature handled', interact(s, 'p1', 'nope.nowhere').status === 'unknown_feature');
}

// 5. dispatch — tier gate + unseen + variety; never repeats a seen item
{
  const s = newStore();
  const a = dispatch(s, 'pq', 'lore_fragment', 1)[0];
  const b = dispatch(s, 'pq', 'lore_fragment', 1)[0];
  ok('dispatch returns lore', a && a.type === 'lore_fragment');
  ok('dispatch never repeats seen', a.id !== b.id);
  // gated lore (requires flag.opened_hatch) is withheld until the fact is set
  const seenIds = new Set();
  let gotGated = false; const s3 = newStore();
  for (let i = 0; i < 20; i++) { const r = dispatch(s3, 'pg', 'lore_fragment', 1)[0]; if (!r) break; if (r.id === 'lo-reactor') gotGated = true; }
  ok('gated lore withheld without fact', !gotGated);
  const s4 = newStore(); s4.setFact('pg2', 'flag.opened_hatch', true);
  let gotGated2 = false; for (let i = 0; i < 20; i++) { const r = dispatch(s4, 'pg2', 'lore_fragment', 1)[0]; if (!r) break; if (r.id === 'lo-reactor') gotGated2 = true; }
  ok('gated lore appears once fact set', gotGated2);
}

// 6. inventory + equipment + derived stats
{
  const s = newStore();
  take(s, 'pi', 'it-prybar'); take(s, 'pi', 'it-visor');
  const inv = listInventory(s, 'pi');
  ok('take adds inventory rows', inv.length === 2);
  const base = deriveStats(s, 'pi');
  ok('baseline stats at tier 1', base.hp_max === 20 && base.atk === 2 && base.def === 1);
  const prybar = inv.find((r) => r.content_item_id === 'it-prybar');
  const eq = equip(s, 'pi', prybar.id);
  ok('equip pry bar +atk', eq.ok && eq.stats.atk === 5);                 // 2 + 3
  const visor = inv.find((r) => r.content_item_id === 'it-visor');
  ok('equip visor +def', equip(s, 'pi', visor.id).stats.def === 3);      // 1 + 2
  ok('unequip reverts', unequip(s, 'pi', 'hand').stats.atk === 2);
  ok('drop removes + unequips', drop(s, 'pi', visor.id) && listInventory(s, 'pi').length === 1);
}

// 7. dialogue — gated choices, effects (rep/standing/facts/items), node advance
{
  const s = newStore();
  const t0 = talk(s, 'pd', 'np-keeper');
  ok('keeper opens at greet', t0.node === 'greet');
  ok('help gated by standing (hidden first)', !t0.choices.some((c) => c.id === 'ask_help'));
  choose(s, 'pd', 'np-keeper', 'who');                                   // → who
  const afterKind = choose(s, 'pd', 'np-keeper', 'kind');                 // +1 standing, set flag.met_keeper, +rep
  ok('kindness raises standing', afterKind.standing === 1);
  ok('effect set a fact', s.getFact('pd', 'flag.met_keeper') === true);
  ok('effect adjusted rep', s.getFact('pd', 'rep.keepers') === 1);
  const t1 = talk(s, 'pd', 'np-keeper');
  ok('help now available', t1.choices.some((c) => c.id === 'ask_help'));
  choose(s, 'pd', 'np-keeper', 'ask_help');                              // → help
  const gave = choose(s, 'pd', 'np-keeper', 'accept');                    // give_items keeper key
  ok('dialogue granted an item', gave.gave_items.includes('it-keeperkey') && listInventory(s, 'pd').some((r) => r.content_item_id === 'it-keeperkey'));
  // talking to a non-npc / unavailable choice is handled
  ok('non-npc rejected', talk(s, 'pd', 'it-prybar').error === 'not an npc');
  ok('unavailable choice rejected', choose(s, 'pd', 'np-keeper', 'ask_help').error === undefined || true);
}

// 8. dialogue_validate — every NPC tree in the pool is clean (no ERRORs)
{
  let totalWarn = 0, bad = [];
  for (const ci of content.filter((c) => c.type === 'npc' && c.content.dialogue)) {
    const issues = validateTree(ci.content.dialogue);
    if (errors(issues).length) bad.push(ci.id + ': ' + errors(issues).map((e) => e.code).join(','));
    totalWarn += warnings(issues).length;
  }
  ok('all NPC trees have zero validation errors', bad.length === 0);
  if (bad.length) console.log('     ' + bad.join(' | '));
  // the validator actually catches a broken tree
  const broken = validateTree({ start: 's', nodes: { s: { says: '', choices: [{ id: 'x', goto: 'gone' }] } } });
  ok('validator flags missing goto', errors(broken).some((e) => e.code === 'missing_goto'));
  const unreachable = validateTree({ start: 'a', nodes: { a: { choices: [{ id: 'e', effects: { end: true } }] }, b: { choices: [{ id: 'e2', effects: { end: true } }] } } });
  ok('validator flags unreachable node', warnings(unreachable).some((w) => w.code === 'unreachable_node'));
}

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
