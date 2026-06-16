// v094.selftest.mjs — pins the Chapter One OPENING chunk (hoop/v094 pool + world) end to end.
//   node hoop/test/v094.selftest.mjs
// Proves: the authored content is clean (trees valid, no orphan gates); the authored-placement pin
// crystallizes the exact principal (Olo at the cradle, not a roll); the opening quest chain closes
// THROUGH the engine and the §4 milestone advances narrative 1→2; and the Tabard terminal's borges
// page (n=71, "The Fixed Hour", told by Luna) carries the resonance the chunk is built on.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { MemoryStore, flattenPool, interact, take, talk, choose } from '../story/engine.js';
import { validateTree, errors } from '../story/validate.js';
import { analyzePool, orphans } from '../story/gates.js';
import { checkAdvance } from '../story/advance.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const POOL = JSON.parse(readFileSync(join(HERE, '../v094/pool.json'), 'utf8'));
const WORLD = JSON.parse(readFileSync(join(HERE, '../v094/world.json'), 'utf8'));
const content = flattenPool(POOL);
const newStore = () => new MemoryStore(content, WORLD);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } };

// 1. pool sanity — Tabard canon, tier-1 Arrival, every world feature type covered
ok('pool flattened', content.length >= 9);
ok('all tier-1 approved+active', content.every((c) => c.approved && c.status === 'active' && (c.revelation_tier || 1) === 1 && (c.narrative_tier || 1) === 1));
const poolTypes = new Set(content.map((c) => c.type)), worldTypes = new Set(WORLD.features.map((f) => f.type));
ok('pool covers every world feature type', [...worldTypes].every((t) => poolTypes.has(t)));
ok('the Keeper canon is gone', !content.some((c) => (c.tags || []).includes('keeper') || /keeper/i.test((c.content || {}).name || '')));

// 2. every NPC dialogue tree is clean (no validator ERRORs)
{
  const bad = [];
  for (const ci of content.filter((c) => c.type === 'npc' && c.content.dialogue)) {
    const e = errors(validateTree(ci.content.dialogue));
    if (e.length) bad.push(ci.id + ': ' + e.map((x) => x.code).join(','));
  }
  ok('all NPC trees validate clean', bad.length === 0);
  if (bad.length) console.log('     ' + bad.join(' | '));
}

// 3. no orphan gates — every authored quest chain can close
{
  const issues = analyzePool(content, WORLD.features);
  ok('zero orphan gates', orphans(issues).length === 0);
  if (orphans(issues).length) console.log('     ' + orphans(issues).map((i) => i.message).join(' | '));
}

// 4. AUTHORED PLACEMENT — a pinned feature crystallizes the EXACT principal, not a dispatch roll
{
  const s = newStore();
  const r = interact(s, 'p', 'bay14.olo');
  ok('pinned feature crystallizes Olo exactly', r.status === 'crystallized' && r.item.content_item_id === 'np-olo');
  ok('pinned recall is stable', interact(s, 'p', 'bay14.olo').item.content_item_id === 'np-olo');
  ok('the terminal pins the borges lore', interact(s, 'p', 'nave.terminal').item.content_item_id === 'lo-terminal');
}

// 5. THE OPENING CHAIN closes through the engine → the milestone fires (narrative 1→2)
{
  const s = newStore(), P = 'hero';
  // examine the stencil → your apparatus records it (the client `take`s the trace)
  interact(s, P, 'bay14.stencil'); take(s, P, 'it-stenciltrace');
  // meet Olo
  interact(s, P, 'bay14.olo'); talk(s, P, 'np-olo'); choose(s, P, 'np-olo', 'ready');
  ok('Olo sets flag.met_olo', s.getFact(P, 'flag.met_olo') === true);
  ok('Olo hands you the cord', s.listInventoryRows(P).some((r) => r.content_item_id === 'it-cord'));
  // read the terminal (client sets read-facts on crystallize; modelled here)
  interact(s, P, 'nave.terminal'); s.setFact(P, 'flag.read_terminal', true); s.setFact(P, 'flag.heard_luna', true);
  // Sevin: the stencil-gated choice is ONLY available because you carry the trace (tag "notation")
  interact(s, P, 'margin.sevin');
  const t = talk(s, P, 'np-sevin'); choose(s, P, 'np-sevin', 'down');
  const why = talk(s, P, 'np-sevin');
  ok('Sevin choice gated on the trace is available', why.choices.some((c) => c.id === 'stencil'));
  choose(s, P, 'np-sevin', 'stencil');
  ok('Sevin believes you', s.getFact(P, 'flag.sevin_believes') === true);
  ok('rind-walker rep granted', (+s.getFact(P, 'rep.rindwalkers', 0)) === 1);
  // the milestone: met_olo + read_terminal + sevin_believes → narrative 1→2
  ok('narrative tier still 1 before check', s.getPlayerState(P).narrative_tier === 1);
  const adv = checkAdvance(s, P);
  ok('milestone advances narrative 1→2', adv.length === 1 && adv[0].axis === 'narrative_tier' && adv[0].to === 2);
  ok('tier persisted', s.getPlayerState(P).narrative_tier === 2);
}

// 5b. the gate is real — without the trace, Sevin's choice never opens (the chunk can't be skipped)
{
  const s = newStore(), P = 'nogate';
  interact(s, P, 'margin.sevin'); talk(s, P, 'np-sevin'); choose(s, P, 'np-sevin', 'down');
  ok('no trace → stencil choice withheld', !talk(s, P, 'np-sevin').choices.some((c) => c.id === 'stencil'));
}

// 6. THE BORGES PAGE — the terminal's mythograph (the Seven post to the Tabard intranet). Pin the
//    resonance so a borges lexicon change can't silently drift the chapter's keystone post.
{
  const term = content.find((c) => c.id === 'lo-terminal');
  ok('terminal references borges page 71', (term.content.borges || {}).n === 71);
  ok('terminal carries the hero-name stencil', typeof term.content.hero_stencil === 'string' && term.content.hero_stencil.length > 0);

  const ctx = {}; ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['prng.js', 'tellers.js', 'lexicon.js', 'generate.js'])
    vm.runInContext(readFileSync(join(HERE, '../../borges/js/', f), 'utf8'), ctx);
  const tale = ctx.BORGES.generate(71);
  ok('page 71 is told by Luna', tale.teller.name === 'Luna');
  const moveNames = (tale.propp.moves || []).map((m) => m.name);
  ok('page 71 carries Recognition (Luna knows your name)', moveNames.includes('Recognition'));
  ok('page 71 carries Branding (the hero is marked)', moveNames.includes('Branding'));
  const motifCodes = (tale.motifs.list || []).map((m) => m.code);
  ok('page 71 carries the cradle-doom motif M341', motifCodes.includes('M341'));

  // the FROZEN artifact the client renders must match the live engine (drift guard)
  const baked = JSON.parse(readFileSync(join(HERE, '../v094/terminal-71.json'), 'utf8'));
  const heroLive = (tale.characters.cast.find((c) => c.role === 'hero') || {}).name;
  ok('baked terminal-71 is page 71', baked.n === 71 && baked.permalink === '/t/71');
  ok('baked hero name matches the live engine', baked.heroName === heroLive);
  ok('baked moves match the live engine', baked.propp.moves.map((m) => m.name).join('|') === moveNames.join('|'));
  ok('baked motifs match the live engine', baked.motifs.list.map((m) => m.code).join('|') === motifCodes.join('|'));
}

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
