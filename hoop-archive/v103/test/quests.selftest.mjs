// quests.selftest.mjs — the deterministic side-quest generator.
//
//   node hoop/v096/test/quests.selftest.mjs
//
// Pins: rumors (not plot_beats) seed quests; themes prefer specific tags; an NPC tips you to the
// best-overlapping unopened quest; progress counts corroborating encounters and resolves at the goal;
// everything is deterministic + reward scales with tier.

import { questForSeed, buildQuestBank, questThemes, corroborates, questProgress, pickQuestForNpc, questMarker, questCounted, seekCandidates, QUEST_GOAL } from '../story/quests.js';
import { MemoryStore, interact } from '../story/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const rumor = (id, tags, tier = 1, refs = []) => ({ id, type: 'rumor', approved: true, status: 'active', revelation_tier: tier, narrative_tier: tier, power_tier: 1, tags, world_refs: refs, content: { name: 'rumor ' + id, description: 'whispers of ' + id, revelation_hint: 'the truth of ' + id } });
const npc = (id, tags) => ({ id, type: 'npc', approved: true, status: 'active', revelation_tier: 1, narrative_tier: 1, power_tier: 1, tags, content: { name: 'NPC ' + id, description: 'a person' } });

// ── 1. seeding: rumors yes, plot_beats no; themes prefer specific tags ──
ok(questForSeed(rumor('r1', ['luna', 'nave'])) !== null, 'a rumor seeds a quest');
ok(questForSeed({ id: 'b', type: 'plot_beat', content: {} }) === null, 'a plot_beat does NOT seed a side quest (it is the main spine)');
ok(JSON.stringify(questThemes(rumor('r', ['nave', 'luna', 'mythographs']))) === JSON.stringify(['luna', 'mythographs']), 'themes drop broad tags, keep specific');
ok(JSON.stringify(questThemes(rumor('r', ['nave', 'drift']))) === JSON.stringify(['nave', 'drift']), 'all-broad seed falls back to its tags');
const q1 = questForSeed(rumor('r1', ['luna'], 3));
ok(q1.id === 'sq:r1' && q1.tier === 3 && q1.reward === 6 + 3 * 4 && q1.needed === QUEST_GOAL, 'quest shape: id, tier, reward scales, goal');

// ── 2. the bank + NPC surfacing ──
const content = [rumor('luna1', ['luna', 'mythographs']), rumor('sig1', ['signal', 'anomaly']), rumor('luna2', ['luna', 'sleep'])];
const bank = buildQuestBank(content);
ok(bank.size === 3, 'bank has one quest per rumor');
const taken = new Set();
const pick = pickQuestForNpc(bank, npc('k', ['luna', 'drift']), (id) => taken.has(id));
ok(pick && pick.seedId.startsWith('luna'), 'an NPC tips you to a theme-overlapping quest');
ok(pickQuestForNpc(bank, npc('z', ['unrelated', 'tag']), () => false) === null, 'no overlap → no tip');
taken.add('luna1'); taken.add('luna2');
ok(pickQuestForNpc(bank, npc('k', ['luna']), (id) => taken.has(id)) === null, 'already-taken quests are not re-offered');

// ── 3. progress + resolution over real encounters ──
{
  const pool = [
    npc('opener', ['luna', 'drift']),        // the NPC who tips you off (shares the theme → counts as 1)
    npc('c1', ['luna', 'sleep']),            // corroboration
    rumor('luna1', ['luna', 'mythographs']),
    npc('c2', ['luna']),                     // corroboration
    npc('off', ['signal']),                  // off-theme — must NOT count
  ];
  const s = new MemoryStore(pool, { features: [] });
  const b = buildQuestBank(pool);
  const q = b.get('luna1');
  ok(corroborates(npc('x', ['luna']), q) && !corroborates(npc('y', ['signal']), q), 'corroborates: theme in / off-theme out');

  ok(questProgress(s, 'p', q).learned === 0, 'no progress before any encounter');
  for (const id of ['opener', 'off']) { s.addFeature({ key: 'f' + id, type: 'npc', content_id: id }); interact(s, 'p', 'f' + id); }
  ok(questProgress(s, 'p', q).learned === 1 && !questProgress(s, 'p', q).done, 'the tipping NPC counts; the off-theme one does not');
  for (const id of ['c1', 'c2']) { s.addFeature({ key: 'f' + id, type: 'npc', content_id: id }); interact(s, 'p', 'f' + id); }
  const pr = questProgress(s, 'p', q);
  ok(pr.learned >= QUEST_GOAL && pr.done && pr.progress === 1, `chasing the theme resolves the quest (${pr.learned}/${pr.needed})`);
}

// ── 4. determinism + marker ──
ok(JSON.stringify(questForSeed(rumor('r', ['luna']))) === JSON.stringify(questForSeed(rumor('r', ['luna']))), 'questForSeed is deterministic');
const names = new Map([['taryn solis', 'npc-taryn']]);
ok(questMarker(questForSeed(rumor('r', ['x'], 1, ['Taryn Solis'])), names).anchor === 'npc-taryn', 'marker resolves a named NPC ref');
ok(questMarker(questForSeed(rumor('r', ['x'], 1, ['The Signal Chamber'])), names).place === 'rind', 'marker routes deep refs to the rind/descent');

// ── 5. SEEK PEOPLE (v103): a thread's waypoint chases a person, not a room ──
{
  const pool = [
    npc('opener', ['luna', 'drift']),
    npc('c1', ['luna', 'sleep']),
    npc('c2', ['luna']),
    npc('off', ['signal']),
    rumor('luna1', ['luna', 'mythographs']),
  ];
  const wanderer = { ...npc('amb', ['luna']), content: { name: 'NPC amb', ambient: true } };
  const s = new MemoryStore([...pool, wanderer], { features: [] });
  const q = buildQuestBank(pool).get('luna1');

  const all = [...pool, wanderer];
  const c0 = questCounted(s, 'p', q);
  ok(c0.size === 0, 'nothing counted before any encounter');
  let seeks = seekCandidates(q, all, c0);
  ok(seeks.map((c) => c.id).join(',') === 'c1,c2,opener', 'seek candidates: every on-theme NPC, deterministic by id — off-theme and rumors excluded');
  ok(!seeks.some((c) => c.id === 'amb'), 'a wanderer (ambient) is never a seek target — an ambient voice cannot hold a waypoint');

  // meeting a corroborator counts them OUT of the seek set (the ◇ moves to the next person)
  s.addFeature({ key: 'fopener', type: 'npc', content_id: 'opener' }); interact(s, 'p', 'fopener');
  const c1 = questCounted(s, 'p', q);
  ok(c1.has('opener'), 'the met corroborator is counted');
  seeks = seekCandidates(q, all, c1);
  ok(seeks.map((c) => c.id).join(',') === 'c1,c2', 'a counted person drops out of the seek set — the waypoint moves on');

  // exhausting the theme leaves no target (the thread is resolvable/resolved — nothing to point at)
  for (const id of ['c1', 'c2']) { s.addFeature({ key: 'f' + id, type: 'npc', content_id: id }); interact(s, 'p', 'f' + id); }
  ok(seekCandidates(q, all, questCounted(s, 'p', q)).length === 0, 'a resolved theme has no one left to seek');
}

console.log(`\nquests.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
