#!/usr/bin/env node
// sync-dataviz — keep consumers' served copies of packages/dataviz identical to
// the canonical source.
//
// packages/dataviz/{stats,charts}.js is the single source of truth. Sites that
// serve these files as STATIC ASSETS can't import across directories (the
// browser fetches /stats.js from the site's own asset root), so they keep a
// byte-identical copy in their own directory. This script is what makes that
// safe: --check fails if any copy has drifted, --write refreshes them.
//
//   node scripts/sync-dataviz.mjs            # report status (same as --check, non-fatal)
//   node scripts/sync-dataviz.mjs --check    # exit 1 if any copy has drifted (CI)
//   node scripts/sync-dataviz.mjs --write    # copy canonical → consumers
//
// Adding a consumer: add a directory to CONSUMERS below.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "packages", "dataviz");
const FILES = ["stats.js", "charts.js"];
const CONSUMERS = ["wormhole"];

const args = process.argv.slice(2);
const write = args.includes("--write");
const check = args.includes("--check");

let drifted = 0, missing = 0, synced = 0, wrote = 0;

for (const dir of CONSUMERS) {
  for (const f of FILES) {
    const from = join(SRC, f);
    const to = join(ROOT, dir, f);
    if (!existsSync(from)) {
      console.error(`! canonical source missing: packages/dataviz/${f}`);
      process.exit(2);
    }
    const canonical = readFileSync(from, "utf8");
    const current = existsSync(to) ? readFileSync(to, "utf8") : null;

    if (current === canonical) { synced++; continue; }
    if (current === null) missing++; else drifted++;

    if (write) {
      writeFileSync(to, canonical);
      wrote++;
      console.log(`  ✓ wrote ${dir}/${f}`);
    } else {
      console.error(`  ✗ ${dir}/${f} ${current === null ? "is missing" : "has drifted from"} packages/dataviz/${f}`);
    }
  }
}

if (write) {
  console.log(`\n${wrote} file(s) written, ${synced} already in sync.`);
  process.exit(0);
}

const bad = drifted + missing;
if (bad === 0) {
  console.log(`✓ dataviz in sync (${synced} copies across ${CONSUMERS.length} consumer(s))`);
  process.exit(0);
}

console.error(`\n${bad} copy/copies out of sync with packages/dataviz.`);
console.error("Edit packages/dataviz/, then run: node scripts/sync-dataviz.mjs --write");
process.exit(check ? 1 : 0);
