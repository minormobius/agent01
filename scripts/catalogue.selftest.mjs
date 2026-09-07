#!/usr/bin/env node
// catalogue.selftest.mjs — the catalogue layer's load-bearing pieces.
//
//   node scripts/catalogue.selftest.mjs
//
// WHAT IS ACTUALLY AT RISK HERE. catalogue.json is the source of truth for
// what a person can visit, and five generated artefacts hang off it — the
// landing page's `var P`, the search catalogue, the stumble portal, the office
// map and the orrery. Two things in this file decide whether any of that is
// trustworthy:
//
//   pathGlob   — the matcher behind the coverage gate's `notListed` rules. Its
//                first implementation matched NOTHING for trailing `**`, so the
//                gate passed while checking nothing. A gate that cannot fail is
//                worse than no gate, because it is believed.
//   orderEntry — every script that edits an entry writes the file back. If
//                field order isn't canonical, two scripts touching the same
//                entry produce spurious diffs forever.
//
// Plus the invariant that matters most: the catalogue's `surface` keys are
// foreign keys into deploy-registry.json, which owns the deploy pipeline. The
// catalogue must never be able to invent a surface.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathGlob, orderEntry, loadCatalogue, loadRegistry, CATALOGUE_KEYS } from './lib/landing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ck = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error(`  ✗ ${msg}`); } };
const eq = (a, b, msg) => ck(a === b, `${msg}\n      expected: ${JSON.stringify(b)}\n      actual:   ${JSON.stringify(a)}`);
const hit = (glob, path) => ck(pathGlob(glob).test(path), `${glob} should match ${path}`);
const miss = (glob, path) => ck(!pathGlob(glob).test(path), `${glob} should NOT match ${path}`);

// --- pathGlob: the case that was silently broken ----------------------------
// Trailing `**` must match one or more segments below the prefix. The flat
// string-replace version returned a regex that matched nothing at all here.
hit('bakeoff/results/**', 'bakeoff/results/race-01/arena');
hit('bakeoff/results/**', 'bakeoff/results/race-01/arena/play/claude__s1');
hit('bakeoff/results/**', 'bakeoff/results/x');
miss('bakeoff/results/**', 'bakeoff/results');          // needs at least one segment below
miss('bakeoff/results/**', 'bakeoff/other/race-01');

// --- pathGlob: `**` in the middle, and as a bare prefix ---------------------
hit('**/public', 'photo/public');
hit('**/public', 'public');                              // zero segments before
hit('**/public/**', 'os/public/arena/race-01');
hit('**/docs', 'splice/docs');
hit('**/docs', 'tide/case/docs');
miss('**/docs', 'splice/docs/intro');                    // `docs` must be the last segment

// --- pathGlob: single `*` stays inside one segment --------------------------
hit('hoop/v*', 'hoop/v110');
miss('hoop/v*', 'hoop/v110/arena');                      // `*` must not cross a slash
hit('hoop/v*/**', 'hoop/v110/arena');
hit('fifty/c/*', 'fifty/c/42');
miss('fifty/c/*', 'fifty/c/42/notes');

// --- pathGlob: literals are escaped, not treated as regex -------------------
hit('ai-edu/dev', 'ai-edu/dev');
miss('ai-edu/dev', 'aiXedu/dev');                        // the '-' is literal
miss('a.c', 'abc');                                      // the '.' is literal

// --- orderEntry: canonical field order, nothing dropped ---------------------
{
  const messy = { surface: 'poll', k: 75, n: 'poll', u: 'https://poll.mino.mobi', c: 'bluesky' };
  const keys = Object.keys(orderEntry(messy));
  eq(keys.join(','), 'n,u,c,k,surface', 'orderEntry sorts into canonical order');
  eq(orderEntry(messy).n, 'poll', 'orderEntry preserves values');
}
{
  // an unrecognised field must survive rather than be silently dropped
  const withExtra = { n: 'x', u: 'https://x', future: 'keep me' };
  eq(orderEntry(withExtra).future, 'keep me', 'orderEntry keeps unknown fields');
}
ck(CATALOGUE_KEYS.includes('surface'), 'surface is part of the canonical key order');

// --- the real catalogue: the registry foreign key ---------------------------
{
  const cat = loadCatalogue(ROOT);
  const reg = loadRegistry(ROOT);
  const known = new Set(reg.surfaces.map((s) => s.surface));

  ck(cat.entries.length > 0, 'catalogue has entries');
  const dangling = cat.entries.filter((e) => e.surface && !known.has(e.surface));
  eq(dangling.length, 0, `every surface key resolves (dangling: ${dangling.map((e) => e.n).join(', ')})`);

  const unkeyed = cat.entries.filter((e) => !e.surface);
  eq(unkeyed.length, 0, `every entry names a surface (missing: ${unkeyed.map((e) => e.n).join(', ')})`);

  // Entry order is the on-screen order of the landing page, and section markers
  // index into it — an out-of-range marker would emit a comment in the wrong
  // place or not at all.
  for (const s of cat.sections || []) {
    ck(s.before >= 0 && s.before <= cat.entries.length,
      `section marker "${s.label}" points inside the entry list (before=${s.before})`);
  }

  // notListed rules must be well-formed: the coverage gate trusts `kind` to
  // decide whether something is a backlog item or a deliberate omission.
  const KINDS = new Set(['internal', 'content', 'pending']);
  for (const r of cat.notListed || []) {
    ck(typeof r.glob === 'string' && r.glob.length > 0, 'every notListed rule has a glob');
    ck(KINDS.has(r.kind), `notListed rule "${r.glob}" has a known kind (got ${JSON.stringify(r.kind)})`);
    ck(typeof r.reason === 'string' && r.reason.length > 0, `notListed rule "${r.glob}" gives a reason`);
  }
}

console.log(`catalogue.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
