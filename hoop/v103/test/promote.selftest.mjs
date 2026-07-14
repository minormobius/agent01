// promote.selftest.mjs — the v103 EMERGENCY NPC PROMOTION kernel.
//
//   node hoop/v103/test/promote.selftest.mjs
//
// Pins: person-name discrimination (a name vs a room/abstraction/console); the promotion NAME picked from a
// thread's refs (only an ABSENT person, never a known NPC); a minted stand-in is deterministic, tier-legal,
// theme-tagged, non-ambient, clickable, and folds into the live pool so seekCandidates/discoverNpc accept it.

import { promotedId, isPromoted, namesAPerson, personRef, emergencyNpc, needsPromotion, keeperSeatChunks, needsWardReseat } from '../story/promote.js';
import { seekCandidates, questForSeed, corroborates } from '../story/quests.js';
import { MemoryStore, interact } from '../story/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

// ── 1. namesAPerson — a person is Capitalized word-tokens; rooms/abstractions/consoles are NOT ──
ok(namesAPerson('Elias Vance'), 'a two-word Capitalized name reads as a person');
ok(namesAPerson('Sevin'), 'a single Capitalized name reads as a person');
ok(namesAPerson('Taryn Solis') && namesAPerson('Olo Vashti'), 'existing cast names read as people');
ok(!namesAPerson('the Signal Chamber'), 'a place with a keyword is NOT a person');
ok(!namesAPerson('a Tabard terminal'), 'a console ref is NOT a person');
ok(!namesAPerson('the rind') && !namesAPerson('the seven'), 'abstractions are NOT people');
ok(!namesAPerson('the margin') && !namesAPerson('Bay 14'), 'a bare place / a bay is NOT a person');
ok(!namesAPerson(''), 'empty ref is not a person');

// ── 2. personRef — the NAME to promote is the first ABSENT person in the refs, never a known NPC ──
const names = new Map([['olo vashti', 'np-olo']]);
ok(personRef(['the rind', 'Elias Vance', 'a terminal'], names) === 'Elias Vance', 'personRef picks the absent person from mixed refs');
ok(personRef(['Olo Vashti', 'Elias Vance'], names) === 'Elias Vance', 'personRef skips a KNOWN npc and takes the absent one');
ok(personRef(['Olo Vashti'], names) === null, 'personRef returns null when the only person is already placed/known');
ok(personRef(['the Signal Chamber', 'the deep'], names) === null, 'personRef returns null for a room-only thread');

// ── 3. emergencyNpc — deterministic id, tier-legal, theme-tagged, non-ambient, clickable ──
const a = emergencyNpc('Elias Vance', { tags: ['route-data', 'NAVE', ''], from: 'sq:r1' });
const b = emergencyNpc('Elias Vance', { tags: ['other'] });
ok(a.id === 'npc:promoted:elias-vance' && a.id === b.id, 'same name → same stand-in id (atproto-stable), tags aside');
ok(a.id === promotedId('Elias Vance'), 'promotedId agrees with the minted id');
ok(a.type === 'npc' && a.approved && a.status === 'active', 'a stand-in is an approved, active npc');
ok(a.revelation_tier === 1 && a.narrative_tier === 1 && a.power_tier === 1, 'a stand-in is tier-1 legal (seatable at any point)');
ok(JSON.stringify(a.tags) === JSON.stringify(['route-data', 'nave']), 'tags are normalized + de-duped, blanks dropped');
ok(!a.content.ambient && isPromoted(a), 'a stand-in is non-ambient (can hold a waypoint) and flagged promoted');
ok(a.content.npc && a.content.npc.dialogue && a.content.npc.dialogue.nodes.g0, 'a stand-in carries a greet node');
ok(a.provenance.lane === 'promote' && a.provenance.from === 'sq:r1', 'provenance records the summoning objective');

// ── 4. it corroborates its thread + seekCandidates accepts it (so the ◇ resolves to this person) ──
const q = questForSeed({ id: 'r1', type: 'rumor', approved: true, status: 'active', revelation_tier: 1, narrative_tier: 1, power_tier: 1, tags: ['route-data'], content: { name: 'the route ledger', description: 'x' } });
ok(corroborates(a, q), 'the stand-in corroborates the thread it was minted for');
ok(seekCandidates(q, [a], new Set()).map((c) => c.id).join(',') === a.id, 'seekCandidates surfaces the promoted stand-in');

// ── 5. it folds into a live store + is clickable (crystallizes + a choice ENDS cleanly) ──
const store = new MemoryStore([], { features: [] });
store.addContent(a);
ok(store.contentById(a.id) === a, 'addContent folds the stand-in into the pool');
ok(store.queryContent({ type: 'npc', revTier: 1, narTier: 1, powTier: 1 }).some((c) => c.id === a.id), 'queryContent surfaces it at tier 1');
store.addFeature({ key: 'f:elias', type: 'npc', label: a.content.name, content_id: a.id });
const intro = interact(store, 'p', 'f:elias');
ok(intro && (intro.status === 'crystallized' || intro.status === 'recalled') && intro.item && intro.item.content_item_id === a.id, 'the stand-in crystallizes onto a feature when met');

// ── 6. needsPromotion — only when a person is named, unlocatable, AND unseatable ──
ok(needsPromotion({ personName: 'Elias Vance', located: false, seatable: false }), 'promote when a named person is neither placed nor seatable');
ok(!needsPromotion({ personName: 'Elias Vance', located: true, seatable: false }), 'no promotion when the person is already placed');
ok(!needsPromotion({ personName: 'Elias Vance', located: false, seatable: true }), 'no promotion when the pool can seat someone');
ok(!needsPromotion({ personName: null, located: false, seatable: false }), 'no promotion when the objective is not a person');

// ── 7. keeper-in-ward placement (the Factor Solen "waypoint in the wrong chamber" bug) ──
// a fresh keeper prefers its OWN ward's chambers when they're built…
ok(JSON.stringify(keeperSeatChunks([3, 4], [0, 5, 6])) === JSON.stringify([3, 4]), 'a keeper seats in its own ward when the ward is built');
// …and falls back to the scatter set when its ward hasn't streamed yet (so it still appears somewhere)
ok(JSON.stringify(keeperSeatChunks([], [0, 5, 6])) === JSON.stringify([0, 5, 6]), 'a keeper whose ward is not built yet falls back to the scatter chambers');
ok(JSON.stringify(keeperSeatChunks(null, [0])) === JSON.stringify([0]), 'a null ward list falls back cleanly');
// a FACTION keeper whose ward is not built passes fallback [] → DEFER (seat nowhere until the ward streams)
ok(JSON.stringify(keeperSeatChunks([], [])) === JSON.stringify([]), 'a faction keeper with no built ward and no fallback DEFERS (empty seat list)');
// a placed mobile keeper stranded in the commons (chunk 0) while its ward (3,4) is now built → RE-SEAT
ok(needsWardReseat({ mobile: true, currentChunk: 0, wardChunkIds: [3, 4] }), 'a keeper stranded in the commons after its ward opened needs a re-seat');
ok(needsWardReseat({ mobile: true, currentChunk: 5, wardChunkIds: [3, 4] }), 'a keeper stranded in the WRONG ward needs a re-seat');
ok(!needsWardReseat({ mobile: true, currentChunk: 3, wardChunkIds: [3, 4] }), 'a keeper already in its ward is left alone');
ok(!needsWardReseat({ mobile: true, currentChunk: 0, wardChunkIds: [] }), 'no re-seat while the ward has not streamed yet (nothing to move into)');
ok(!needsWardReseat({ mobile: false, currentChunk: 0, wardChunkIds: [3, 4] }), 'a pinned (non-mobile) anchor is not re-seated by this path (relocateGuidesToWards owns it)');

console.log(`\npromote.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
