#!/usr/bin/env node
// sync-dataviz — keep consumers' served copies of shared packages identical to
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

/** Copies that are not dataviz. Same hazard, same fix: a served static asset
 *  cannot import across directories, so it is a byte-identical copy and this is
 *  what keeps it honest.
 *
 *  lab/_kit/auth.js is the OAuth client every lab tenant links. Without it the
 *  only login the factory permits — Bluesky OAuth — was unbuildable, because a
 *  tenant site cannot reach packages/. A stale copy here is worse than a missing
 *  one: it would sign people in through last month's protocol handling on a
 *  domain full of agent-written pages. */
const EXTRA = [
  ["packages/oauth-client/auth.js", "lab/_kit/auth.js"],
  // photo/public/shop/ is served verbatim as static assets (Vite copies public/
  // into dist/ without touching it), so /shop cannot import across directories
  // any more than a lab tenant can. It needs the client to post a finished
  // picture straight to Bluesky; a stale copy would post through last month's
  // token handling.
  ["packages/oauth-client/auth.js", "photo/public/shop/js/vendor/auth.js"],
];

const args = process.argv.slice(2);
const write = args.includes("--write");
const check = args.includes("--check");

let drifted = 0, missing = 0, synced = 0, wrote = 0;

const PAIRS = [
  ...CONSUMERS.flatMap((dir) => FILES.map((f) => [join("packages", "dataviz", f), join(dir, f)])),
  ...EXTRA,
];

for (const [relFrom, relTo] of PAIRS) {
  {
    const from = join(ROOT, relFrom);
    const to = join(ROOT, relTo);
    if (!existsSync(from)) {
      console.error(`! canonical source missing: ${relFrom}`);
      process.exit(2);
    }
    const canonical = readFileSync(from, "utf8");
    const current = existsSync(to) ? readFileSync(to, "utf8") : null;

    if (current === canonical) { synced++; continue; }
    if (current === null) missing++; else drifted++;

    if (write) {
      writeFileSync(to, canonical);
      wrote++;
      console.log(`  ✓ wrote ${relTo}`);
    } else {
      console.error(`  ✗ ${relTo} ${current === null ? "is missing" : "has drifted from"} ${relFrom}`);
    }
  }
}

if (write) {
  console.log(`\n${wrote} file(s) written, ${synced} already in sync.`);
  process.exit(0);
}

const bad = drifted + missing;
if (bad === 0) {
  console.log(`✓ vendored copies in sync (${synced} file(s))`);
  process.exit(0);
}

console.error(`\n${bad} vendored copy/copies out of sync with packages/.`);
console.error("Edit the file under packages/, then run: node scripts/sync-dataviz.mjs --write");
process.exit(check ? 1 : 0);
