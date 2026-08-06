#!/usr/bin/env node
// Presence check for campaign.mjs's wiring into plant/index.html (lp-6c88fb).
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. index.html has no DOM test, so this
// reads the file as TEXT and asserts by substring/regex that the page imports
// the campaign controller, builds its one control from the controller's own
// declared domain, and renders whatever comes back. That proves the wiring
// exists SYNTACTICALLY. It does NOT prove a browser paints the board, that the
// slider fires, or that the game is any fun — the first two need a browser and
// the third needs a person.
//
// THE PROPERTY THIS FILE COPIES FROM index-summon-wiring.selftest.mjs, and the
// reason it is worth more than a grep: EVERY EXPECTATION IS DERIVED FROM THE
// MODULE. The level ids, titles, blurbs and control bounds that may not be
// hand-typed into the page come from `LEVELS` at run time, not from a list
// copied into this file — so a seventh level, a renamed level or a retuned
// domain is covered the day it lands. A hand-typed list here would be the same
// drift the check exists to catch, one file over.
//
// THE BLOCK IS FOUND BY EXPLICIT MARKERS, NOT BY POSITION. index-summon-wiring
// finds its block positionally (`indexOf('import { SummonSession')` to end of
// file) and its own closing note admits the dependency. Restructuring the page
// around a positional anchor can fail a gate that is entirely correct, and a
// checker that fails correct work is worse than no checker. This one anchors
// on `// CAMPAIGN BLOCK BEGIN` and `// CAMPAIGN BLOCK END`, so the block may
// move anywhere in the script without touching this file.
//
// WHAT REPLACED WHAT. The page used to carry six per-level sections, each with
// its own slider, its own oracle call and its own copy of that level's bounds.
// Sections 6 and 7 below assert the DEPARTURE as well as the arrival: the six
// SVG mounts are gone, no level module is imported by the page any more, and
// the oracle is called nowhere in it. A half-done move that leaves one section
// behind fails loudly rather than passing twice.
//
// Run: node plant/test/index-campaign-wiring.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Campaign, LEVELS, ORDER, WIN_FRACTION, BANNED } from '../campaign.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\nthe campaign block is delimited by markers, so this gate does not depend on where it sits');
const B = html.indexOf('// CAMPAIGN BLOCK BEGIN');
const E = html.indexOf('// CAMPAIGN BLOCK END');
ok('an opening marker exists', B >= 0);
ok('a closing marker exists after it', E > B, `begin ${B}, end ${E}`);
const block = B >= 0 && E > B ? html.slice(B, E) : '';
ok('the block is non-trivial', block.length > 400, `${block.length} chars`);

console.log('\n(1) the page imports the controller and constructs one game');
{
  for (const name of ['Campaign', 'entryOf']) {
    ok(`imports ${name} from ./campaign.mjs`,
      new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]\\./campaign\\.mjs['"]`).test(block));
  }
  ok('constructs a Campaign', /\bnew\s+Campaign\s*\(/.test(block));
  ok('imports drawLevel from ./level-view.js — the board is drawn by the shared renderer',
    /import\s*\{[^}]*\bdrawLevel\b[^}]*\}\s*from\s*['"]\.\/level-view\.js['"]/.test(block));
}

console.log('\n(2) the handlers drive the controller — move, verdict, next, state');
{
  for (const verb of ['move', 'verdict', 'next', 'state']) {
    ok(`calls game.${verb}(...)`, new RegExp(`\\bgame\\.${verb}\\s*\\(`).test(block));
  }
  ok('draws the board the verdict came with, into the one mount point',
    /\bdrawLevel\s*\(\s*\$\('gameBoard'\)/.test(block));
  ok('renders the controller’s own sentence rather than composing one',
    /\.line\b/.test(block));
}

console.log('\n(3) …and the page decides NOTHING — no oracle, no split, no second verdict');
{
  ok('the block never calls feasible(...)', !/\bfeasible\s*\(/.test(block));
  ok('the block never mentions autoSplit', !/\bautoSplit\b/.test(block));
  ok('the block never mentions band(...) — the difficulty word is the module’s',
    !/\bband\s*\(/.test(block));
  ok('the block never calls verdictLine — campaign.mjs writes its own sentence',
    !/\bverdictLine\b/.test(block));
  for (const helper of ['withSourceRate', 'withProcessorCapacity', 'withShareA']) {
    ok(`the block never applies a level itself via ${helper}`,
      !new RegExp(`\\b${helper}`).test(block));
  }
}

console.log('\n(4) nothing about a level is hand-typed into the page — ids, titles, blurbs');
{
  for (const e of LEVELS) {
    ok(`no level id "${e.id}" in the block`, !new RegExp(`\\b${e.id}\\b`).test(block));
    ok(`no title "${e.title}" in the block`, !block.includes(e.title));
    ok(`no blurb for "${e.id}" in the block`, !block.includes(e.blurb));
  }
}

console.log('\n(5) …nor is any control bound — the domain is read, never retyped');
{
  // A "bound" is a value the page would previously have written into a slider's
  // min/max/value. For a small declared domain that is every member of it (the
  // page shows one button each); for a large one it is the two ends. Object
  // settings contribute each of their own components, because a hand-typed
  // `{miner: 10, ...}` is exactly the duplication this forbids.
  const SMALL = 12;
  const bounds = new Set();
  for (const e of LEVELS) {
    const s = e.knob.samples;
    const picks = s.length <= SMALL ? s : [s[0], s[s.length - 1]];
    for (const v of picks) {
      if (v && typeof v === 'object') for (const x of Object.values(v)) bounds.add(String(x));
      else bounds.add(String(v));
    }
  }
  ok('the forbidden set was derived from LEVELS and is non-empty',
    bounds.size > 0, `${bounds.size} literals`);

  for (const t of [...bounds].sort()) {
    // Numbers get lookarounds so that "1" inside "index + 1" is not read as a
    // hit on "10"; words are only forbidden as quoted literals, because a bare
    // word like "good" is ordinary English and forbidding it in prose would
    // fail correct work.
    const re = /^[0-9.]+$/.test(t)
      ? new RegExp(`(?<![\\w.])${t.replace(/\./g, '\\.')}(?![0-9.])`)
      : new RegExp(`['"\`]${t}['"\`]`);
    ok(`no control bound "${t}" typed into the block`, !re.test(block));
  }
}

console.log('\n(6) the control is built over knob.samples, by index');
{
  ok('reads the knob off the entry', /\.knob\b/.test(block));
  ok('reads its declared samples', /\.samples\b/.test(block));
  ok('the slider’s maximum is samples.length - 1 — a POSITION, not a value',
    /\.samples\.length\s*-\s*1/.test(block));
  ok('a move is samples[index] — so an off-grid setting is unrepresentable',
    /\bsamples\s*\[/.test(block));
  ok('membership uses the knob’s own key function', /\.key\s*\(/.test(block));
  // The markup must ship the range input BARE. A min/max/value in the HTML is
  // the second copy of a bound, and the first level shipped exactly that
  // (an opening value above its own maximum, silently clamped, for weeks).
  ok('the markup ships <input type="range" id="gameKnob"> with no bounds on it',
    /<input\s+type="range"\s+id="gameKnob"\s*>/.test(html));
  ok('the title mount point ships empty — filled from the module',
    /<h2 id="gameTitle"[^>]*><\/h2>/.test(html));
  ok('the blurb mount point ships empty — filled from the module',
    /<p id="gameBlurb"[^>]*><\/p>/.test(html));
  for (const id of ['gameBoard', 'gameLine', 'gameKnob', 'gameKnobKind', 'gameKnobV',
    'gameChoice', 'gameProgress', 'gameNext', 'gameIntro']) {
    ok(`the markup carries id="${id}"`, new RegExp(`id="${id}"`).test(html));
  }
  ok('the slider is wired', /\$\('gameKnob'\)\.addEventListener\('input',/.test(block));
  ok('the discrete control is wired', /\$\('gameChoice'\)\.addEventListener\('click',/.test(block));
  ok('the next control is wired', /\$\('gameNext'\)\.addEventListener\('click',/.test(block));
}

console.log('\n(6b) a multi-part knob gets one control PER COMPONENT, built from knob.parts');
{
  // LEVEL_3 moves two capacities at once and the page rendered that as a single
  // slider with 8281 stops sweeping the product lexicographically. `parts` is a
  // presentation of the SAME declared domain; the page iterates it and falls
  // back to the single control when a knob has none.
  const multi = LEVELS.filter((e) => e.knob.parts);
  ok('at least one level declares parts, so this section is not vacuous',
    multi.length > 0, `${multi.length}`);
  ok('…and at least one does not, so the single-control path still ships',
    LEVELS.some((e) => !e.knob.parts));

  ok('the markup carries the part container id="gameParts"', /id="gameParts"/.test(html));
  ok('…and it ships EMPTY — every part control is built from the module',
    /<div id="gameParts"><\/div>/.test(html));

  ok('the block branches on knob.parts', /\.parts\b/.test(block));
  ok('one range input per part, bounded by that PART’s own domain — not by the product',
    /max="\$\{p\.samples\.length\s*-\s*1\}"/.test(block));
  ok('each part control is labelled with the module’s own name for it', /\$\{p\.name\}/.test(block));
  ok('a part move is COMPOSED by the knob, never assembled by the page',
    /\.compose\s*\(/.test(block));
  ok('the controls open where the game is, via the knob’s own positions()',
    /\.positions\s*\(/.test(block));
  ok('the part controls are wired', /\$\('gameParts'\)\.addEventListener\('input',/.test(block));

  // Part NAMES are level knowledge exactly as ids, titles and bounds are, and
  // section (5) cannot cover them: it derives its forbidden set from sample
  // VALUES, and a part's name never appears in one.
  for (const e of multi) {
    for (const p of e.knob.parts) {
      ok(`no part name "${p.name}" typed into the block`,
        !new RegExp(`['"\`]${p.name}['"\`]`).test(block), p.name);
    }
  }

  // The reason the ticket exists, asserted rather than assumed: each control is
  // an index slider, and what makes one usable is how many stops it has.
  for (const e of multi) {
    const flat = e.knob.samples.length;
    const worst = Math.max(...e.knob.parts.map((p) => p.samples.length));
    ok(`${e.id}: the widest part control is far shorter than the flat domain (${worst} vs ${flat})`,
      worst * 4 < flat);
    ok(`${e.id}: every combination the controls can reach is a declared setting`,
      e.knob.samples.length
        === e.knob.parts.reduce((n, p) => n * p.samples.length, 1), `${flat}`);
  }
}

console.log('\n(7) the six scrolled sections are GONE — the move happened, it was not duplicated');
{
  const mounts = html.match(/id="lvl\d*"/g) || [];
  ok('no per-level SVG mount is left in the markup', mounts.length === 0, mounts.join(' '));
  for (const dead of ['ore', 'ore4', 'oreReset', 'ore4Reset', 'miner', 'smelter3',
    'shareA5', 'shareA6', 'lvl2Btns', 'lvl3Reset', 'lvl5Reset', 'lvl6Reset']) {
    ok(`no leftover control id="${dead}"`, !new RegExp(`id="${dead}"`).test(html));
  }
  for (const n of [2, 3, 4, 5, 6]) {
    ok(`the page no longer imports ./levels/level${n}.mjs directly`,
      !new RegExp(`levels/level${n}\\.mjs`).test(html));
  }
  ok('the page no longer imports LEVEL_1', !/\bLEVEL_1\b/.test(html));
  ok('the page calls the oracle nowhere at all', !/\bfeasible\s*\(/.test(html));
  const draws = html.match(/\bdrawLevel\s*\(/g) || [];
  ok('drawLevel is called exactly once — one board, one level at a time',
    draws.length === 1, `${draws.length} calls`);
}

console.log('\n(8) the first screen speaks plainly — BANNED comes from campaign.mjs, not from here');
{
  const m = html.match(/id="gameIntro"[^>]*>([\s\S]*?)<\/p>/);
  ok('an intro paragraph exists', !!m);
  const intro = m ? m[1] : '';
  ok('it is one or two sentences, not a page', intro.trim().length > 0 && intro.length < 400,
    `${intro.length} chars`);
  for (const w of BANNED) {
    ok(`the intro does not say "${w}"`, !new RegExp(`\\b${w}\\b`, 'i').test(intro));
  }
}

console.log('\n(9) a win advances and the last level ENDS — the rule the button renders');
{
  ok('the next control is shown only on a win that is not the end',
    /\bhidden\s*=\s*!\(\s*v\.won\b/.test(block));
  ok('the page reads the finished latch', /\bst\.finished\b/.test(block));

  // Behavioural, not textual, and deliberately: the button's visibility rule is
  // only meaningful if the controller really terminates. Driving the real
  // Campaign here costs nothing and pins the contract the wiring depends on.
  const game = new Campaign();
  // Deliberately NOT `state().id === ORDER[0]`: `id` is defined as
  // `ORDER[this.index]`, so that assertion is arithmetic about itself and
  // cannot fail. This pins the opening state the page actually renders — first
  // level, nothing moved yet, not finished — every part of which can.
  const open = game.state();
  ok('the game opens at the start of the order', open.index === 0);
  ok('…with no move made, so nothing is won by arriving', open.moves === 0);
  ok('…and not finished', open.finished === false);
  ok('…and the panel is told how many there are', open.total === ORDER.length);
  const visited = [open.id];
  for (let i = 1; i < ORDER.length; i++) {
    const id = game.next();
    visited.push(id);
    ok(`next() reaches ${ORDER[i]}`, id === ORDER[i], String(id));
  }
  ok('every level is visited exactly once', visited.length === ORDER.length
    && new Set(visited).size === ORDER.length);
  ok('past the last level next() returns null rather than wrapping', game.next() === null);
  ok('…and the game latches finished', game.state().finished === true);
  ok('…and stays finished on every further call', game.next() === null && game.state().finished);
}

console.log('\n(10) the control the page builds can actually be got wrong AND got right');
{
  // The page offers exactly `knob.samples`. If a level wins on every member of
  // its own domain there is nothing to get wrong, and if it wins on none it
  // cannot be finished — either way the control the page builds is not a
  // puzzle. This is the closest a text gate gets to the vision bar ("within
  // thirty seconds a stranger does something that can fail"), and it is cheap
  // because campaign.mjs computes the fractions at import anyway.
  for (const e of LEVELS) {
    const f = WIN_FRACTION[e.id];
    ok(`${e.id}: some setting the page offers LOSES`, f < 1, `win fraction ${f}`);
    ok(`${e.id}: some setting the page offers WINS`, f > 0, `win fraction ${f}`);
    ok(`${e.id}: the control offers more than one setting`, e.knob.samples.length > 1);
  }
}

console.log('');
if (failed) { console.log(`✗ index-campaign-wiring selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ index-campaign-wiring selftest passed\n');
