// lexicon.selftest.mjs — the prose layer over the nave's verbs (what /slots hands the generating model).
//   node hoop/nave/test/lexicon.selftest.mjs
//
// Pins that the prose is COMPLETE (every verb, faction, resource covered) and that the DERIVED supply
// links + faction holds stay honest to the mechanics (econ.js ROLES / nave.js FACTIONS) — so the doc a
// model digests can never silently drift from the model it describes.

import { buildLexicon, ROLE_PROSE, FACTION_PROSE, RESOURCES, WEBS, supplyLinks, roleFaction } from '../lexicon.js';
import { ROLES, DOMAINS } from '../../v099/econ/econ.js';
import { FACTIONS, BIOMES, UNIVERSAL } from '../nave.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// 1) every verb has prose, and the prose covers EXACTLY the real role set (no stragglers, none missing)
const roleKeys = Object.keys(ROLES).sort();
ok(Object.keys(ROLE_PROSE).sort().join() === roleKeys.join(), 'ROLE_PROSE covers exactly the 13 econ roles');
for (const [role, pr] of Object.entries(ROLE_PROSE)) {
  ok(pr.gloss && pr.building && pr.activity && pr.npc && pr.society && pr.note, `${role} prose has all required fields`);
}

// 2) every faction has prose with the required fields
ok(Object.keys(FACTION_PROSE).sort().join() === Object.keys(FACTIONS).sort().join(), 'FACTION_PROSE covers exactly the 3 factions');
for (const [fk, fp] of Object.entries(FACTION_PROSE)) {
  ok(fp.tagline && fp.worldview && fp.why_exclusives && fp.why_shared && fp.web && fp.palette, `${fk} faction prose complete`);
}

// 3) the resource glossary covers every token that appears in any flow (no undefined edge labels)
const tokens = new Set();
for (const R of Object.values(ROLES)) for (const d of (R.dom ? DOMAINS : [undefined])) { const f = R.flows(d); for (const t of [...f.in, ...f.out]) tokens.add(t); }
// concrete domain raws/goods are glossed by the generic raw/good entries
const glossed = new Set([...Object.keys(RESOURCES), ...DOMAINS.flatMap((d) => [d.raw, d.good])]);
for (const t of tokens) ok(glossed.has(t), `resource token '${t}' is glossed (directly or via raw/good)`);

// 4) supplyLinks is HONEST: a feeds-link is symmetric with a needs-link (if A feeds B, B needs A)
for (const role of roleKeys) {
  for (const fed of supplyLinks(role).feeds) ok(supplyLinks(fed).needs.includes(role), `supply symmetry: ${role} feeds ${fed} ⇒ ${fed} needs ${role}`);
}
// the spine landmarks: grow is a primary producer; govern runs on the regard third-places make; make is the hinge
ok(supplyLinks('grow').needs.length === 0, 'grow needs nothing (primary producer)');
ok(supplyLinks('govern').needs.every((r) => ['serve', 'play', 'worship'].includes(r)) && supplyLinks('govern').needs.length > 0, 'govern is fed only by the regard-makers (serve/play/worship)');
ok(supplyLinks('make').needs.join() === 'grow' && supplyLinks('make').feeds.includes('dwell'), 'make: grow → … → dwell (the hinge of the material spine)');
ok(supplyLinks('dwell').feeds.includes('worship') && supplyLinks('dwell').feeds.includes('serve'), 'dwell emits people into the third places');

// 5) roleFaction matches nave.js exactly (exclusive/shared/universal/commons-only). The civic triad
// (make/serve/trade) is a SHARED role still over-biased by its faction, but held 'universal' (floored into
// every ward), so its hold reads 'universal' while `faction` still names its over-bias owner.
for (const [fk, f] of Object.entries(FACTIONS)) {
  for (const r of f.exclusives) ok(roleFaction(r).faction === fk && roleFaction(r).hold === 'exclusive', `${r} is a ${fk} exclusive`);
  for (const r of f.shared) {
    const expect = UNIVERSAL.includes(r) ? 'universal' : 'shared';
    ok(roleFaction(r).faction === fk && roleFaction(r).hold === expect, `${r} is a ${fk} ${expect} role`);
  }
}
ok(roleFaction('dwell').hold === 'universal', 'dwell is universal');
for (const u of UNIVERSAL) ok(roleFaction(u).hold === 'universal', `${u} is held universal (the civic triad)`);

// 6) buildLexicon assembles the whole thing for the page/json handoff
const lex = buildLexicon();
ok(lex.roles.length === 13 && lex.roles.every((r) => r.prose && r.glyph && r.inputs && r.outputs && Array.isArray(r.needs)), 'buildLexicon: 13 roles, each with prose + flows + derived links');
ok(Object.keys(lex.factions).length === 3 && lex.biomes.length === 6, 'buildLexicon carries factions + biomes');
ok(lex.webs.supply && lex.webs.social && lex.webs.regard, 'buildLexicon carries the three web paragraphs');
ok(JSON.stringify(buildLexicon()) === JSON.stringify(buildLexicon()), 'buildLexicon is deterministic');

console.log(`\nlexicon.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
