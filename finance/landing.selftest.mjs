#!/usr/bin/env node
// finance/landing.selftest.mjs — the index must index everything.
//
// House convention: the top level of a surface is a landing page over
// everything below it, not one of the apps. That convention is easy to state
// and easy to break — a new sub-site ships, nobody touches index.html, and it
// is reachable only by someone who already knows the URL. Worse, the surface
// root is a single static page, so nothing else in the repo notices.
//
// So this asserts the invariant directly, from the two files that disagree
// when it breaks: catalogue.json (what a person can visit) and index.html
// (what the door actually offers). Run by scripts/preflight.mjs when finance/
// changes.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const catalogue = JSON.parse(readFileSync(join(ROOT, 'catalogue.json'), 'utf8'));
const landing = readFileSync(join(HERE, 'index.html'), 'utf8');

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) { failures++; console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
  else console.log(`  ok    ${name}`);
};

// Every catalogue entry on this surface, minus the door itself.
const onSurface = catalogue.entries.filter((e) => e.surface === 'finance');
const door = onSurface.find((e) => e.u.replace(/\/$/, '') === 'https://fin.mino.mobi');
const children = onSurface.filter((e) => e !== door);

check('the surface has a door at the root', !!door);
check('the door is the parent of every other entry',
  children.every((e) => e.p === door?.n),
  children.filter((e) => e.p !== door?.n).map((e) => `${e.n} p=${e.p}`).join(', '));

// Anchors only — a <link rel="stylesheet"> is not a destination.
// href="/elements/" -> "/elements"
const hrefs = new Set(
  [...landing.matchAll(/<a\b[^>]*\bhref="(\/[^"#]*)"/g)].map((m) => m[1].replace(/\/$/, '') || '/'),
);

const missing = [];
for (const e of children) {
  const path = new URL(e.u).pathname.replace(/\/$/, '') || '/';
  if (!hrefs.has(path)) missing.push(`${e.n} (${path})`);
}
check(`the index links to all ${children.length} sub-sites`, missing.length === 0,
  `not linked: ${missing.join(', ')}`);

// The reverse: a link on the door that no longer resolves to a catalogued
// destination is a dead card, which is the same bug pointing the other way.
const known = new Set(children.map((e) => new URL(e.u).pathname.replace(/\/$/, '') || '/'));
const INFRA = new Set(['/api/health', '/universe.json']);
const dangling = [...hrefs].filter(
  (h) => h !== '/' && !known.has(h) && !INFRA.has(h) && !h.startsWith('/lexicons/'),
);
check('no card points somewhere uncatalogued', dangling.length === 0, dangling.join(', '));

// The door is a door, not an app: if it ever grows a module script it has
// stopped being a cheap index and the convention has quietly lapsed.
check('the index stays a static page', !/<script\b/.test(landing));

// Each card should say something. A bare link list is not a landing page.
const blurbs = [...landing.matchAll(/<div class="blurb">([\s\S]*?)<\/div>/g)]
  .map((m) => m[1].replace(/\s+/g, ' ').trim());
check(`every card carries a blurb (${blurbs.length} found)`, blurbs.length >= children.length,
  `${blurbs.length} blurbs for ${children.length} sub-sites`);
check('no blurb is a stub', blurbs.every((b) => b.length > 80),
  blurbs.filter((b) => b.length <= 80).join(' | '));

console.log(failures === 0 ? '\nlanding selftest: PASS' : `\nlanding selftest: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
