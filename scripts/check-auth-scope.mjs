#!/usr/bin/env node
// check-auth-scope.mjs — refuse to deploy an auth worker that would NARROW the
// live OAuth scope ceiling.
//
// WHY THIS EXISTS. auth.mino.mobi declares, in client-metadata.json, the set of
// collections any mino.mobi site may request. The authorization server grants
// nothing outside it, so a collection that silently drops out of the ceiling
// does not fail loudly — it fails as "PAR request failed: invalid_scope" in
// somebody else's app, hours later, on a site whose author has no idea a deploy
// happened.
//
// That is not hypothetical. On 2026-07-29 auth run #38 deployed from a branch
// whose workers/ was months behind, and the ceiling went from 66 collections to
// 61: board, aub's autosave, two of hoop's story collections and all four of
// rant's went away in one green build. Four sites broke; the build was green.
//
// Several branches can deploy this worker (the trigger list lives in the
// workflow file on whichever branch is pushed), so the durable protection is
// not ownership — it is this check, comparing what is about to ship against
// what is actually live.
//
// Usage:
//   node scripts/check-auth-scope.mjs            # compare tree vs production
//   node scripts/check-auth-scope.mjs --url URL  # compare against another host
//
// Exit 1 if the deploy would drop a live scope. Exit 0 otherwise, listing the
// additions. If production cannot be reached at all it warns and exits 0 —
// a network blip should not wedge every deploy, and with no data we cannot
// claim a regression.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.indexOf('--url');
const METADATA_URL = argUrl > -1
  ? process.argv[argUrl + 1]
  : 'https://auth.mino.mobi/client-metadata.json';

/** The collections this working tree would declare. */
export function treeCollections(root = ROOT) {
  const src = readFileSync(join(root, 'workers/auth/src/oauth/scope.ts'), 'utf8');
  const block = /const WRITE_COLLECTIONS = \[([\s\S]*?)\n\];/.exec(src);
  if (!block) throw new Error('could not find WRITE_COLLECTIONS in scope.ts');
  // Strip line comments first: the prose in this file contains apostrophes
  // ("a player's repo"), which otherwise swallow the next real entry.
  const clean = block[1].split('\n').map((l) => l.split('//')[0]).join('\n');
  return [...clean.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** The collections production currently declares. */
async function liveCollections(url) {
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  const meta = await res.json();
  return String(meta.scope || '')
    .split(/\s+/)
    .filter((t) => t.startsWith('repo:'))
    .map((t) => t.slice(5));
}

const fail = (msg) => { console.error(`✗ ${msg}`); process.exitCode = 1; };

async function main() {
  const tree = treeCollections();
  const dupes = tree.filter((c, i) => tree.indexOf(c) !== i);
  if (dupes.length) fail(`duplicate collections in WRITE_COLLECTIONS: ${[...new Set(dupes)].join(', ')}`);

  let live;
  try {
    live = await liveCollections(METADATA_URL);
  } catch (e) {
    console.warn(`⚠ could not read the live ceiling (${e.message}) — skipping the narrowing check.`);
    console.warn('  This deploy is NOT verified against production. Check by hand if it matters.');
    return;
  }

  const treeSet = new Set(tree);
  const dropped = live.filter((c) => !treeSet.has(c));
  const added = tree.filter((c) => !live.includes(c));

  console.log(`live ceiling: ${live.length} collections · this tree: ${treeSet.size}`);
  if (added.length) console.log(`adding: ${added.join(', ')}`);

  if (dropped.length) {
    fail(`this deploy would REMOVE ${dropped.length} collection(s) from the live ceiling:`);
    for (const c of dropped) console.error(`    - ${c}`);
    console.error('\n  Every site writing one of those would start failing PAR with');
    console.error('  invalid_scope, and the build would still be green.');
    console.error('\n  Your branch is probably behind. Merge the current workers/auth,');
    console.error('  or add the missing collections back — this list only ever grows.');
    return;
  }
  console.log('✓ no live scope would be dropped');
}

// Only run when invoked directly — treeCollections() is imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
