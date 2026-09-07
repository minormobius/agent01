// statblock.selftest.mjs — the rolled NPC character, and the reaction table it backfills.
//
//   node hoop/v110/test/statblock.selftest.mjs
//
// The load-bearing invariants: determinism across worlds and machines (invariant 1), authored
// content is NEVER overwritten, every slot always resolves, and the verb→vocation seam is an
// identity rather than a mapping that can drift.

import { readFileSync } from 'node:fs';
import {
  REACTION_SLOTS, VERB_PROPS, hash32, statSeed, shortName, verbOf,
  rollStatBlock, reactionFor, resolveReactions, reactionCoverage,
} from '../story/statblock.js';
import { hash32 as weaveHash32 } from '../story/weave.js';
import { VOCATIONS, VOCATION_ORDER } from '../stats.js';
import { importWorldExport } from '../story/import.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const doc = JSON.parse(readFileSync(new URL('./fixtures/content-rev-2026-08.json', import.meta.url), 'utf8'));
const { content } = importWorldExport(doc);
const npcs = content.filter((c) => c.type === 'npc');
ok(npcs.length === 16, `fixture yields 16 npcs (got ${npcs.length})`);

// ── the checked duplicate ────────────────────────────────────────────────────────────────────
for (const probe of [['a'], ['statblock', '7', 'shaban-hosubara'], ['', ''], ['x', 1, true]]) {
  eq(hash32(...probe), weaveHash32(...probe), `hash32 matches weave.js for ${JSON.stringify(probe)}`);
}

// ── the verb ⇄ vocation seam ─────────────────────────────────────────────────────────────────
// stats.js keys VOCATIONS by the thirteen civic verbs and a room_bundle carries `verb`. If that
// stops being an identity the whole "vocation is free" claim collapses silently, so pin it.
eq(VOCATION_ORDER.length, 13, 'VOCATIONS has thirteen entries (the thirteen verbs)');
for (const v of VOCATION_ORDER) ok(VERB_PROPS[v], `VERB_PROPS covers the '${v}' vocation`);
eq(Object.keys(VERB_PROPS).length, 13, 'VERB_PROPS has no props for a verb that is not a vocation');
for (const c of npcs) {
  const v = verbOf(c);
  ok(v == null || !!VOCATIONS[v], `verbOf('${c.id}') is a real vocation or null`);
}

// ── determinism (invariant 1) ────────────────────────────────────────────────────────────────
const a1 = rollStatBlock(npcs[0], { worldSeed: 7 });
const a2 = rollStatBlock(npcs[0], { worldSeed: 7 });
eq(JSON.stringify(a1), JSON.stringify(a2), 'the same (world, npc) rolls the identical block');
const b1 = rollStatBlock(npcs[0], { worldSeed: 8 });
ok(a1.n !== b1.n, 'a different world seed rolls a different person');
ok(rollStatBlock(npcs[1], { worldSeed: 7 }).n !== a1.n, 'a different npc rolls a different person');
eq(statSeed(7, 'x'), statSeed(7, 'x'), 'statSeed is stable');
ok(statSeed(7, 'x') !== statSeed(7, 'y'), 'statSeed separates ids');
// reactions must be deterministic too — they are what the player actually sees.
eq(JSON.stringify(resolveReactions(a1, null)), JSON.stringify(resolveReactions(a2, null)),
   'derived reactions are deterministic');

// ── the vocation comes from the room's verb ──────────────────────────────────────────────────
for (const c of npcs) {
  const v = verbOf(c);
  if (!v) continue;
  eq(rollStatBlock(c, { worldSeed: 7 }).vocation, v, `'${c.id}' takes its vocation from verb '${v}'`);
}

// ── authored always wins ─────────────────────────────────────────────────────────────────────
const withTables = npcs.filter((c) => c.content.reactions);
eq(withTables.length, 16, 'expandRoomBundle carries the reaction table through import');
for (const c of withTables) {
  const b = rollStatBlock(c, { worldSeed: 7 });
  const R = resolveReactions(b, c.content.reactions);
  for (const s of REACTION_SLOTS) {
    const authored = c.content.reactions[s];
    if (typeof authored === 'string' && authored.trim()) {
      eq(R[s].source, 'authored', `${c.id}.${s} is marked authored`);
      eq(R[s].text, authored.trim(), `${c.id}.${s} is hoopy's text verbatim`);
    }
  }
}

// ── every slot always resolves, however partial the table ────────────────────────────────────
const AUTHORED_STUB = 'The tally goes unfinished.';
for (const partial of [null, {}, { grief: AUTHORED_STUB }, { grief: '   ' }, { grief: AUTHORED_STUB, nonsense: 'y' }]) {
  const R = resolveReactions(a1, partial);
  eq(Object.keys(R).length, REACTION_SLOTS.length, `all 12 slots resolve for ${JSON.stringify(partial)}`);
  for (const s of REACTION_SLOTS) ok(R[s] && R[s].text && R[s].text.length > 10, `${s} has real text`);
}
eq(resolveReactions(a1, { grief: '   ' }).grief.source, 'derived', 'a whitespace-only slot derives rather than shipping blank');
eq(reactionFor(a1, 'not_a_slot'), null, 'an unknown slot is null, not invented');
eq(reactionFor(null, 'grief'), null, 'no block → no reaction');

// ── derived text is filled, never left with raw placeholders ─────────────────────────────────
for (const c of npcs) {
  const b = rollStatBlock(c, { worldSeed: 11 });
  for (const s of REACTION_SLOTS) {
    const t = resolveReactions(b, null)[s].text;
    ok(!/\{\w+\}/.test(t), `${c.id}.${s} has no unfilled placeholder — "${t.slice(0, 48)}"`);
    ok(t.includes(b.short), `${c.id}.${s} names the keeper`);
  }
}

// ── the collision floor: derived lines must not read as boilerplate ──────────────────────────
// Two keepers sharing a dominant domain used to print identical lines; a zone routinely seats two.
{
  const seen = new Set(); let dup = 0, total = 0;
  for (const c of npcs) {
    const R = resolveReactions(rollStatBlock(c, { worldSeed: 7 }), null);
    for (const s of REACTION_SLOTS) { total++; const k = s + '|' + R[s].text; if (seen.has(k)) dup++; seen.add(k); }
  }
  eq(total, 192, 'the fixture yields 192 derived lines');
  eq(dup, 0, `no two keepers print the same derived line (got ${dup} duplicates)`);
}

// ── the escape hatch: content.stats pins what the roll would otherwise decide ─────────────────
{
  const pinned = { ...npcs[0], content: { ...npcs[0].content, stats: { triad: { flesh: 0, chassis: 1, anima: 0 }, vocation: 'govern' } } };
  const b = rollStatBlock(pinned, { worldSeed: 7 });
  eq(b.vocation, 'govern', 'content.stats.vocation overrides the room verb');
  eq(b.cast.dominant, 'chassis', 'content.stats.triad pins the temperament');
  ok(b.pinned.includes('triad') && b.pinned.includes('vocation'), 'the block reports what was pinned');
  ok(b.triad.flesh > 0, 'the triad floor still applies — no domain is ever truly absent');
  eq(rollStatBlock(npcs[0], { worldSeed: 7 }).vocation, 'grow', 'pinning one npc does not leak into another roll');
}

// ── bond ─────────────────────────────────────────────────────────────────────────────────────
{
  const b = rollStatBlock(npcs[0], { worldSeed: 7, peers: npcs });
  ok(b.bond && b.bond.to && b.bond.to !== npcs[0].id, 'a bond points at someone else');
  ok(npcs.some((c) => c.id === b.bond.to), 'the bond target is in the pool');
  ok(!/\{\w+\}/.test(b.bond.text), 'bond text has no unfilled placeholder');
  ok(b.bond.text.startsWith(b.short), 'bond text is a whole sentence with the keeper as subject');
  ok(/^[A-Z]/.test(b.bond.text) && !/[.!?]\s+[a-z]/.test(b.bond.text), 'bond text is sentence-cased');
  ok(b.bond.text.includes(shortName(b.bond.toName)), 'bond text names the other party');
  eq(rollStatBlock(npcs[0], { worldSeed: 7, peers: [] }).bond, null, 'no peers → no bond, not a broken one');
  eq(rollStatBlock(npcs[0], { worldSeed: 7, peers: [npcs[0]] }).bond, null, 'an npc is never bonded to itself');
  ok(typeof b.omen === 'string' && b.omen.length > 10, 'every keeper carries an omen');
}

// ── coverage reporting ───────────────────────────────────────────────────────────────────────
{
  const cov = reactionCoverage(content);
  eq(cov.npcs, 16, 'coverage counts npcs only');
  eq(cov.slots, 192, 'coverage counts 12 slots per npc');
  eq(cov.authored, 192, 'the 2026-08 rev authored every slot');
  eq(cov.pct, 100, 'coverage percentage');
  const stripped = content.map((c) => (c.type === 'npc' ? { ...c, content: { ...c.content, reactions: { grief: 'g' } } } : c));
  eq(reactionCoverage(stripped).authored, 16, 'coverage tracks a partial table');
  eq(reactionCoverage([]).pct, 0, 'an empty pool is 0%, not NaN');
}

// ── shortName ────────────────────────────────────────────────────────────────────────────────
eq(shortName('Shaban Hosubara'), 'Shaban', 'shortName takes the given name');
eq(shortName('Tzitlil the Twice-Burned'), 'Tzitlil', 'shortName stops before an epithet');
eq(shortName('Factor Merid Solen'), 'Merid', 'shortName steps over a title');
eq(shortName(''), 'they', 'shortName degrades to a pronoun');
eq(shortName('  Nolana   Krosttyalich '), 'Nolana', 'shortName tolerates loose whitespace');

// ── the bundle's three prose fields all survive the explode ──────────────────────────────────
// A room_bundle carries the ROOM's description, the NPC's own description, and a voice line. The
// explode used to keep only the first, so the figure was described by the floor they stood on.
{
  const raw = doc.content_pool.items;
  for (const r of raw) {
    const served = content.find((c) => c.type === 'npc' && c.roomName === r.content.name);
    if (!served || !r.content.npc) continue;
    if (r.content.description) eq(served.content.description, r.content.description, `${served.id} keeps the ROOM prose in description`);
    if (r.content.npc.description) eq(served.content.figure, r.content.npc.description, `${served.id} keeps the NPC prose in figure`);
    if (r.content.npc.voice) eq(served.content.voice, r.content.npc.voice, `${served.id} keeps the voice line`);
    ok(served.content.figure !== served.content.description || !r.content.npc.description,
       `${served.id}: figure and description are not the same string`);
  }
  eq(content.filter((c) => c.type === 'npc' && c.content.figure).length, 16, 'every npc in the rev has a figure line');
}

// ── scene de-duplication (`avoid`) ───────────────────────────────────────────────────────────
// A canvass lists every suspect in one screen. With two phrasings per cell, three keepers sharing
// a dominant domain used to answer identically — the first bench run printed one tail clause three
// times in a single interrogation. `avoid` makes each keeper take a phrasing (and a tint) nobody
// else in the scene has used.
{
  const scene = npcs.slice(0, 6).map((c) => rollStatBlock(c, { worldSeed: 7, peers: npcs }));
  // WITHOUT avoid: shapes may repeat.
  const bare = scene.map((b) => reactionFor(b, 'questioned', null).text.split(' ').slice(1).join(' '));
  // WITH avoid: they must not.
  const seen = new Set();
  const deduped = scene.map((b) => reactionFor(b, 'questioned', null, { avoid: seen }).text.split(' ').slice(1).join(' '));
  eq(new Set(deduped).size, deduped.length, 'no two keepers in a scene share a phrasing');
  ok(new Set(bare).size <= new Set(deduped).size, 'de-duplication never makes a scene MORE repetitive');
  // the tint is de-duplicated too — one string per cast, so it repeats even when cells differ.
  const TINTS = [/The will decides[^.]*\./, /It passes through[^.]*\./, /They set their feet[^.]*\./,
                 /The body catches up[^.]*\./, /Nothing about the posture[^.]*\./];
  const tails = deduped.map((t) => { for (const re of TINTS) { const m = t.match(re); if (m) return m[0]; } return null; }).filter(Boolean);
  eq(new Set(tails).size, tails.length, 'no tail clause repeats within a scene');
  // authored still wins, and is never consumed from the avoid pool
  const A = 'An authored line.';
  const s2 = new Set();
  eq(reactionFor(scene[0], 'questioned', { questioned: A }, { avoid: s2 }).source, 'authored', 'avoid does not displace an authored line');
  eq(s2.size, 0, 'an authored line adds nothing to the scene pool');
  // determinism holds with avoid, given the same order
  const runA = scene.map((b) => reactionFor(b, 'grief', null, { avoid: new Set() }).text);
  const runB = scene.map((b) => reactionFor(b, 'grief', null, { avoid: new Set() }).text);
  eq(JSON.stringify(runA), JSON.stringify(runB), 'de-duplicated output is deterministic');
  // resolveReactions threads it through
  const shared = new Set();
  resolveReactions(scene[0], null, { avoid: shared });
  ok(shared.size > 0, 'resolveReactions feeds the scene pool');
}


console.log(`\nstatblock: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
