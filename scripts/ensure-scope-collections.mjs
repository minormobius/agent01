#!/usr/bin/env node
// ensure-scope-collections.mjs — add collections to the auth worker's scope
// ceiling, without touching anything else in the file.
//
//   node scripts/ensure-scope-collections.mjs --check com.minomobi.lab.doc …
//   node scripts/ensure-scope-collections.mjs --write com.minomobi.lab.doc …
//
// WHY NOT JUST COPY THE FILE ACROSS. workers/auth is owned by a different
// branch, and that branch's scope.ts has genuinely diverged from this one — it
// predates the narrow-per-site scope model, so its header prose is different
// and its collection list is five entries behind. Copying either direction
// silently reverts the other side's work. Measured before writing this: the
// files differ by 66 lines.
//
// So this INSERTS, and only inserts. It appends missing NSIDs into the
// WRITE_COLLECTIONS array under a labelled group and leaves every other byte
// alone, which makes it safe to run against a file it has never seen and safe
// to run twice.
//
// THE CEILING ONLY EVER WIDENS. METADATA_SCOPE is what client-metadata.json
// declares, and the auth server grants nothing a site did not declare — so a
// missing collection means a site's login asks for a scope that is refused,
// while an extra one costs a line in a file. Adding is cheap; forgetting is a
// site that silently cannot write. Removal is deliberately not implemented:
// dropping a collection breaks whichever site still writes it, and this script
// cannot know which.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MARKER = '  // added by scripts/ensure-scope-collections.mjs';

export function addCollections(src, wanted) {
  const open = src.indexOf('const WRITE_COLLECTIONS = [');
  if (open === -1) throw new Error('no WRITE_COLLECTIONS array in that file');
  const close = src.indexOf('\n];', open);
  if (close === -1) throw new Error('WRITE_COLLECTIONS is not closed');

  const body = src.slice(open, close);
  // Line-anchored: the header prose quotes NSIDs in backticks and in comments,
  // and counting those as present would skip a collection that is genuinely
  // missing — the failure would be invisible until a login was refused.
  const have = new Set([...body.matchAll(/^\s*'([^']+)',/gm)].map((m) => m[1]));
  const missing = wanted.filter((n) => !have.has(n));
  if (!missing.length) return { src, added: [], have: have.size };

  const block = src.includes(MARKER)
    ? missing.map((n) => `  '${n}',`).join('\n')
    : `${MARKER}\n${missing.map((n) => `  '${n}',`).join('\n')}`;
  const at = src.includes(MARKER) ? src.indexOf(MARKER) + MARKER.length : close;
  return {
    src: src.slice(0, at) + (src.includes(MARKER) ? `\n${block}` : `\n${block}`) + src.slice(at),
    added: missing,
    have: have.size,
  };
}

// The CLI runs only when this file IS the entry point — the selftest imports
// addCollections, and a module that runs its own argv parsing on import would
// print a usage error and exit before a single assertion executed.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const file = (args.find((a) => a.startsWith('--file=')) ?? '--file=workers/auth/src/oauth/scope.ts').slice(7);
  const nsids = args.filter((a) => !a.startsWith('--'));

  if (!nsids.length) {
    console.error('usage: node scripts/ensure-scope-collections.mjs [--check|--write] [--file=PATH] <nsid> …');
    process.exit(2);
  }
  for (const n of nsids) {
    if (!/^[a-z][a-z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*){2,}$/.test(n)) {
      console.error(`not an NSID: ${JSON.stringify(n)}`);
      process.exit(2);
    }
  }

  const before = readFileSync(file, 'utf8');
  const { src: after, added, have } = addCollections(before, nsids);

  console.log(`${file}: ${have} collection(s) present`);
  if (!added.length) {
    console.log(`  ✓ all ${nsids.length} already in the ceiling — nothing to do`);
    process.exit(0);
  }
  for (const n of added) console.log(`  + ${n}`);

  if (!write) {
    console.log('\n--check only. Pass --write to apply.');
    process.exit(0);
  }
  writeFileSync(file, after);
  console.log(`\nwrote ${file} (+${added.length})`);
}
