// v095story.selftest.mjs — pins the Tabard story layer brought into v093's infrastructure.
//   node hoop/v095/test/v095story.selftest.mjs
// Proves: clean trees + no orphan gates; the procedural crowd has role coverage (every v093 econ role
// has a tagged NPC, so a resident always crystallizes a fitting figure); the PRINCIPALS carry no econ
// role (so they never hijack a random resident — they're prologue-pinned via content_id); the opening
// chain closes through the engine and the milestone advances narrative 1→2; and the terminal's frozen
// borges page 71 matches the live engine.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { MemoryStore, flattenPool, interact, take, talk, choose } from '../story/engine.js';
import { validateTree, errors } from '../story/validate.js';
import { analyzePool, orphans } from '../story/gates.js';
import { checkAdvance } from '../story/advance.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const POOL = JSON.parse(readFileSync(join(HERE, '../story/pool.json'), 'utf8'));
const content = flattenPool(POOL);
const newStore = () => new MemoryStore(content, { features: [] });

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } };
const byId = (id) => content.find((c) => c.id === id);
const tagsOf = (id) => (byId(id) || {}).tags || [];

// 1. Tabard canon, tier-1, clean
ok('all tier-1 approved+active', content.every((c) => c.approved && c.status === 'active' && (c.revelation_tier || 1) === 1 && (c.narrative_tier || 1) === 1));
ok('the Keeper canon is gone', !content.some((c) => (c.tags || []).includes('keeper') || /keeper/i.test((c.content || {}).name || '')));
{
  const bad = [];
  for (const ci of content.filter((c) => c.type === 'npc' && c.content.dialogue)) { const e = errors(validateTree(ci.content.dialogue)); if (e.length) bad.push(ci.id); }
  ok('all NPC trees validate clean', bad.length === 0);
  ok('zero orphan gates', orphans(analyzePool(content, [])).length === 0);
}

// 2. ROLE COVERAGE — every v093 econ role (npc.js WORK/THIRD roles + dwell) has a tagged NPC, so the
//    role→tag dispatch always finds a fitting figure (the crowd stays rich, not 3 repeated principals)
{
  const ROLES = ['make', 'mend', 'trade', 'grow', 'serve', 'heal', 'learn', 'store', 'move', 'govern', 'play', 'worship', 'dwell'];
  const npcTags = new Set(content.filter((c) => c.type === 'npc').flatMap((c) => c.tags || []));
  const missing = ROLES.filter((r) => !npcTags.has(r));
  ok('every econ role has a tagged crowd NPC', missing.length === 0);
  if (missing.length) console.log('     uncovered roles: ' + missing.join(', '));
}

// 3. PRINCIPALS are isolated from the crowd — no econ-role tag, so dispatch never crystallizes them onto
//    a random resident; they appear only where the authored prologue pins content_id.
{
  const ECON = new Set(['make', 'mend', 'trade', 'grow', 'serve', 'heal', 'learn', 'store', 'move', 'govern', 'play', 'worship', 'dwell']);
  for (const pid of ['np-olo', 'np-sevin', 'np-solen'])
    ok(`${pid} carries no econ-role tag (prologue-pinned only)`, !tagsOf(pid).some((t) => ECON.has(t)));
  // a govern-role resident must crystallize the generic overseer, NOT Factor Solen
  const s = newStore(); s.addFeature({ key: 'res:govern:x', type: 'npc', tag: 'govern' });
  ok('govern resident → generic overseer, not Solen', interact(s, 'p', 'res:govern:x').item.content_item_id === 'np-cont-overseer');
}

// 4. THE OPENING CHAIN closes through the engine → milestone advances narrative 1→2
{
  const s = newStore(), P = 'hero';
  take(s, P, 'it-stenciltrace');
  talk(s, P, 'np-olo'); choose(s, P, 'np-olo', 'ready');
  ok('Olo sets met_olo + grants cord', s.getFact(P, 'flag.met_olo') === true && s.listInventoryRows(P).some((r) => r.content_item_id === 'it-cord'));
  s.setFact(P, 'flag.read_terminal', true);   // client sets this when the terminal mythograph is read
  talk(s, P, 'np-sevin'); choose(s, P, 'np-sevin', 'down');
  ok('Sevin stencil choice available with the trace', talk(s, P, 'np-sevin').choices.some((c) => c.id === 'stencil'));
  choose(s, P, 'np-sevin', 'stencil');
  ok('Sevin believes', s.getFact(P, 'flag.sevin_believes') === true);
  const adv = checkAdvance(s, P);
  ok('milestone advances narrative 1→2', adv.some((a) => a.axis === 'narrative_tier' && a.to === 2) && s.getPlayerState(P).narrative_tier === 2);
}

// 5. the terminal's frozen borges page 71 matches the live engine (drift guard)
{
  const term = byId('lo-terminal');
  ok('terminal references borges page 71 + stencil', (term.content.borges || {}).n === 71 && typeof term.content.hero_stencil === 'string');
  const ctx = {}; ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['prng.js', 'tellers.js', 'lexicon.js', 'generate.js']) vm.runInContext(readFileSync(join(HERE, '../../../borges/js/', f), 'utf8'), ctx);
  const tale = ctx.BORGES.generate(71);
  const baked = JSON.parse(readFileSync(join(HERE, '../story/terminal-71.json'), 'utf8'));
  ok('page 71 is Luna + Recognition + Branding + M341', tale.teller.name === 'Luna'
    && tale.propp.moves.some((m) => m.name === 'Recognition') && tale.propp.moves.some((m) => m.name === 'Branding')
    && tale.motifs.list.some((m) => m.code === 'M341'));
  ok('baked terminal-71 matches the live engine', baked.n === 71
    && baked.heroName === (tale.characters.cast.find((c) => c.role === 'hero') || {}).name
    && baked.propp.moves.map((m) => m.name).join('|') === tale.propp.moves.map((m) => m.name).join('|'));
}

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
