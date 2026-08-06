#!/usr/bin/env node
// Presence check for the summon panel's wiring into plant/index.html (lp-a59b0f).
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. Same house style as
// index-level4/5/6-wiring.selftest.mjs: index.html has no DOM test, so this
// reads the file as TEXT and asserts by substring/regex that the page imports
// summon-session.mjs, drives it through start/preview/place/candidates, and
// renders what comes back. That proves the wiring exists SYNTACTICALLY. It does
// NOT prove a browser paints the plan, that a click lands where the player
// aimed, or that a pocket generates in reasonable time — all three need a
// browser and none is decidable from here.
//
// WHERE THE SENTENCES LIVE NOW (lp-250e23). The BLAME_SENTENCE table and the
// plan's coordinate map moved OUT of index.html into `../summon-view.js`,
// because the strongest thing this file could ever do about a sentence is
// assert that six of them exist and differ — it cannot assert that one of them
// is TRUE. `summon-view.selftest.mjs` drives a real session and re-extracts
// every rendered number from the verdict it came from; that check needed a
// module. So section (c) below reads `summon-view.js` rather than `index.html`,
// and section (e) is new: it asserts the move actually happened, i.e. that the
// page does NOT still carry a table of its own. Every other assertion is
// unchanged, and the page-side ones are still scoped to the summon block.
//
// THREE CHECKS ARE STRONGER THAN THE LEVEL-WIRING PRECEDENT, and deliberately,
// because "the page grepped for the word summon" is exactly the pass this
// ticket names as worthless:
//
//   · EXHAUSTIVENESS IS DERIVED, NOT LISTED. The six blame values come from
//     `BLAME`, imported from the module itself — so if the module grows a
//     seventh, this gate fails until the page has a sentence for it. A
//     hand-typed list of six here would be the same drift the check exists to
//     catch, one file over.
//   · THE SENTENCES MUST DIFFER FROM EACH OTHER. `blame:'player'` and
//     `blame:'pocket'` reading identically is the specific failure the ticket
//     calls out ("that is 1.4m from the cube you placed" versus "there is
//     already foam there"), and six entries all delegating to one generic
//     string would satisfy a mere presence check.
//   · THE PAGE MUST NOT DO PLACEMENT ITSELF. Asserted negatively: the summon
//     block may not call `legalSummon` / `summonAt` / `legalSeed` /
//     `constellation` / `reformPocket*`. Vision item 1 requires the control
//     logic to live in a module rather than in event handlers, and the only
//     machine-checkable form of that is "the page never reaches past the
//     controller".
//
// WHY THE THRESHOLD CHECK IS SCOPED TO THE SUMMON BLOCK. The ticket asks that
// no literal 1.5 / 3.2 / 2.2 appear in "the page's own script". The inspector
// at the top of the page legitimately owns `aniso: 2.2` and `r: 1.5` — they are
// the starting positions of ITS OWN sliders, whose entire subject is varying
// them, and they predate this ticket by twenty turns. Scoping the check to the
// summon block keeps it a real constraint on the code this ticket writes
// (a placement threshold re-typed beside a placement call) without failing on
// unrelated pre-existing state. If someone later wants the whole script clean,
// that is a separate ticket about the inspector, not a weaker check here.
//
// Run: node plant/test/index-summon-wiring.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BLAME } from '../summon-session.mjs';
import { SOLID_NAMES } from '../solids.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
// The renderer the page delegates to. Read as TEXT for the same reason
// index.html is: these are checks about the SHAPE of the source (a table with
// one entry per blame, six bodies that differ), not about behaviour —
// behaviour is summon-view.selftest.mjs's job and it imports the module.
const view = readFileSync(join(here, '..', 'summon-view.js'), 'utf8');

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

// The summon block: from its first import to the end of the file. Every "the
// page must not…" assertion below is scoped to it, so the check is about the
// code this ticket added rather than about the rest of the page.
//
// The anchor is deliberately PURE ASCII. The block's banner is drawn with box
// characters like every other section on this page, and anchoring on those
// would make this gate depend on two files agreeing byte-for-byte about a
// glyph nobody can see — a red gate that says nothing about the wiring. The
// banner is still asserted, by a regex that does not care which dash it is.
const at = html.indexOf('import { SummonSession');
console.log('\nthe summon block exists and is marked the way every other block on this page is');
ok('index.html imports the summon controller', at >= 0);
ok('the block carries a "Summon" banner comment, like every other section',
  /\/\/\s+\S+\s+Summon\b/.test(html));
const block = at >= 0 ? html.slice(at) : '';

console.log('\n(a) the page imports the controller and drives it — start, preview, place');
{
  ok('imports SummonSession from ./summon-session.mjs',
    /import\s*\{[^}]*\bSummonSession\b[^}]*\}\s*from\s*['"]\.\/summon-session\.mjs['"]/.test(block));
  ok('imports summonSentence from ./summon-view.js — the page writes no prose itself',
    /import\s*\{[^}]*\bsummonSentence\b[^}]*\}\s*from\s*['"]\.\/summon-view\.js['"]/.test(block));
  ok('imports planShapes from ./summon-view.js — the page draws no map itself',
    /import\s*\{[^}]*\bplanShapes\b[^}]*\}\s*from\s*['"]\.\/summon-view\.js['"]/.test(block));
  ok('the renderer imports BLAME — the enum it switches on, derived not typed',
    /import\s*\{[^}]*\bBLAME\b[^}]*\}\s*from\s*['"]\.\/summon-session\.mjs['"]/.test(view));
  ok('constructs a session', /new\s+SummonSession\s*\(/.test(block));
  ok('calls session.start(...)', /\bsession\.start\s*\(/.test(block));
  ok('calls session.preview(...) — a verdict without planting', /\bsession\.preview\s*\(/.test(block));
  ok('calls session.place(...) — the move itself', /\bsession\.place\s*\(/.test(block));
  ok('calls session.candidates(...) — where a summon would fit', /\bsession\.candidates\s*\(/.test(block));
  // hullBounds is the ONE placement import the page is allowed, and it is
  // required rather than tolerated: the plan's coordinate map has to come from
  // the kernel's own clamp, not from bounds retyped to match it.
  ok('derives the plan\'s extent from hullBounds() rather than from typed bounds',
    /import\s*\{[^}]*\bhullBounds\b[^}]*\}\s*from\s*['"]\.\/placement\.mjs['"]/.test(block)
    && /\bhullBounds\s*\(/.test(block));
}

console.log('\n(a2) …and the page does NO placement itself — handlers read, call, render');
{
  for (const fn of ['legalSummon', 'summonAt', 'legalSeed', 'constellation', 'reformPocket']) {
    ok(`the summon block never calls ${fn}(...)`, !new RegExp(`\\b${fn}\\w*\\s*\\(`).test(block));
    // The renderer is held to the same rule: moving the sentences into a module
    // would be worth nothing if the module started deciding legality too.
    ok(`summon-view.js never calls ${fn}(...)`, !new RegExp(`\\b${fn}\\w*\\s*\\(`).test(view));
  }
}

console.log('\n(b) the solid picker is built from SOLID_NAMES, not from a list that can drift');
{
  ok('the markup ships an EMPTY <select id="summonSolid">',
    /<select id="summonSolid">\s*<\/select>/.test(html));
  ok('the picker\'s options are generated from SOLID_NAMES',
    /\$\('summonSolid'\)\.innerHTML\s*=\s*SOLID_NAMES\.map\s*\(/.test(block));
  ok('the session\'s starting solid comes from SOLID_NAMES too',
    /SOLID_NAMES\[\s*0\s*\]/.test(block));
  for (const n of SOLID_NAMES) {
    ok(`no hand-typed "${n}" anywhere in the summon block`,
      !new RegExp(`['"\`]${n}['"\`]`).test(block));
  }
}

console.log('\n(c) the verdict renderer branches on EVERY blame value the module can produce');
{
  ok('BLAME is a non-empty array of strings', Array.isArray(BLAME) && BLAME.length > 0
    && BLAME.every((b) => typeof b === 'string' && /^[a-z]+$/.test(b)),
    `got ${JSON.stringify(BLAME)}`);
  ok('the renderer keys off refusal.blame — not off reason, which is the layer below',
    /BLAME_SENTENCE\s*\[\s*\w+\.blame\s*\]/.test(view));

  const tStart = view.indexOf('export const BLAME_SENTENCE = {');
  ok('a BLAME_SENTENCE table exists', tStart >= 0);
  const tEnd = tStart >= 0 ? view.indexOf('\n};', tStart) : -1;
  const table = tStart >= 0 && tEnd > tStart ? view.slice(tStart, tEnd) : '';
  ok('the table is closed', table.length > 0);

  const bodies = new Map();
  for (const b of BLAME) {
    const mm = table.match(new RegExp(`\\n\\s*${b}\\s*:\\s*(.*)`));
    ok(`blame "${b}" has its own entry in BLAME_SENTENCE`, !!mm);
    if (mm) bodies.set(b, mm[1].trim());
  }

  // Six entries all producing the same words would pass every check above and
  // throw away exactly what this ticket exists to deliver.
  const seen = new Map();
  let dup = null;
  for (const [b, body] of bodies) {
    if (seen.has(body)) dup = `${seen.get(body)} and ${b}`;
    seen.set(body, b);
  }
  ok('every blame renders a DIFFERENT sentence', dup === null, dup ? `${dup} share a body` : '');

  // 'player' and 'pocket' are the pair the ticket names explicitly: the same
  // refusal to the foam, completely different news to a player.
  const p1 = bodies.get('player') || '';
  const p2 = bodies.get('pocket') || '';
  ok('blame "player" names what the PLAYER built', /blameSolid|blameMove|blameCentre/.test(p1), p1);
  ok('blame "pocket" does NOT claim the player built it',
    p2.length > 0 && !/blameSolid|blameMove|blameCentre/.test(p2), p2);

  // Enforced at runtime as well, so a seventh blame cannot render blank.
  ok('the renderer checks BLAME exhaustively at import time',
    /for\s*\(\s*const\s+\w+\s+of\s+BLAME\s*\)/.test(view)
    && /typeof\s+BLAME_SENTENCE\[\s*\w+\s*\]\s*!==\s*'function'/.test(view));
  ok('a success reads differently from a refusal', /\bres\.ok\b/.test(view)
    && /pocketChanged/.test(view));
}

console.log('\n(d) no placement threshold is re-typed into the page OR into the renderer');
{
  // Scoped to the summon block on purpose — see the header. Lookarounds keep
  // "0.5", "320" and "-2.25" from reading as a hit.
  for (const lit of ['1.5', '2.2', '3.2']) {
    const re = new RegExp(`(?<![\\d.])${lit.replace('.', '\\.')}(?![\\d])`);
    ok(`no literal ${lit} in the summon block`, !re.test(block));
    ok(`no literal ${lit} in summon-view.js`, !re.test(view));
  }
}

console.log('\n(e) the move really happened — the page keeps NO sentence and NO coordinate map');
{
  ok('no BLAME_SENTENCE table left in the page', !/BLAME_SENTENCE\s*=/.test(html));
  ok('no WALL_WORDS table left in the page', !/WALL_WORDS\s*=/.test(html));
  // The plan's world→screen map moved with them. `toPlan` as a page-local
  // arrow is what this ticket removed; the page now asks planShapes for
  // coordinates and only chooses colours.
  ok('no page-local toPlan definition', !/(const|function)\s+toPlan\b/.test(html));
  ok('the page renders whatever planShapes returns rather than building its own list',
    /\bplanShapes\s*\([^)]*\)[\s\S]{0,80}\.map\s*\(/.test(block));
}

console.log('\nthe panel has mount points and handlers — a visitor can actually reach it');
{
  for (const id of ['plan', 'summonSolid', 'summonY', 'summonYV', 'summonGo', 'summonReset',
    'summonVerdict', 'summonPlaced']) {
    ok(`the markup carries id="${id}"`, new RegExp(`id="${id}"`).test(html));
  }
  ok('the plan is clickable — a point comes from the player, not from a default',
    /\bplan\.addEventListener\('click',/.test(block));
  ok('the summon button is wired', /\$\('summonGo'\)\.addEventListener\('click',/.test(block));
  ok('the solid picker is wired', /\$\('summonSolid'\)\.addEventListener\('change',/.test(block));
  ok('the height control is wired', /\$\('summonY'\)\.addEventListener\('input',/.test(block));
  ok('a new pocket can be started', /\$\('summonReset'\)\.addEventListener\('click',/.test(block));
}

console.log('\nlevels 1-6 have MOVED behind campaign.mjs — the summon panel is what is untouched');
{
  // THIS SECTION USED TO ASSERT SIX DIRECT LEVEL IMPORTS, and it was right to:
  // its job was to prove the summon panel disturbed nothing next to it.
  // lp-6c88fb replaced the six scrolled sections with one campaign panel, so
  // those imports are gone BY DESIGN, and asserting their presence would fail
  // correct work — a checker that does that is worse than no checker.
  //
  // Rewritten to assert the RELOCATION rather than deleted: absence at the
  // source, presence at the destination. That is a strictly stronger claim
  // than the one it replaces, because a half-done move — one section left
  // behind, or a level module still imported — now fails, where before it
  // could not be seen at all. The destination is owned in full by
  // index-campaign-wiring.selftest.mjs; this only checks that the levels left.
  ok('the page imports the campaign controller',
    /import\s*\{[^}]*\bCampaign\b[^}]*\}\s*from\s*['"]\.\/campaign\.mjs['"]/.test(html));
  ok('no LEVEL_1 import left in the page', !/\bLEVEL_1\b/.test(html));
  for (const n of [2, 3, 4, 5, 6]) {
    ok(`no direct ./levels/level${n}.mjs import left in the page`,
      !new RegExp(`levels/level${n}\\.mjs`).test(html));
  }
  ok('level-view.js is still imported — for drawLevel, by the campaign block',
    /import\s*\{[^}]*\bdrawLevel\b[^}]*\}\s*from\s*['"]\.\/level-view\.js['"]/.test(html));
  ok('the inspector\'s own SOLID_NAMES import still present',
    /import\s*\{\s*SOLID_NAMES\s*\}\s*from\s*['"]\.\/solids\.mjs['"]/.test(html));
}

console.log('');
if (failed) { console.log(`✗ index-summon-wiring selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ index-summon-wiring selftest passed\n');
