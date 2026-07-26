#!/usr/bin/env node
// gen-lab-tenants.mjs — build the tenant manifest the lab landing page reads.
//
// Every lab site is one subdirectory of lab/www/. The landing page renders its
// listing from ./tenants.json, which this script writes by listing them.
//
// tenants.json is a BUILD ARTEFACT, not a committed file — the deploy workflow
// runs this immediately before `wrangler deploy`, so the listing can never drift
// from what is actually on disk, and an agent adding a site never has to
// remember to regenerate anything. It is gitignored for the same reason.
//
//   node scripts/gen-lab-tenants.mjs            # lab/www
//   node scripts/gen-lab-tenants.mjs <dir>      # somewhere else
//
// Sorted by name so the listing is stable between deploys. There is no capacity
// and no eviction: names are permanent (docs/LAB-FACTORY.md §11.1).

import { readdirSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';

const SITE_DIR = process.argv[2] || 'lab/www';
const KIT_SRC = 'lab/_kit';

// A site name must be a plain lowercase token — the same shape the landing page
// interpolates into a relative href, and the same shape lab-build.yml validates
// before it becomes a path segment. The leading-alphanumeric requirement also
// excludes the underscore-prefixed infrastructure dirs (_kit), which are not
// sites and must never be listed as one.
const SLUG = /^[a-z0-9][a-z0-9-]{0,30}$/;

if (!existsSync(SITE_DIR)) {
  console.error(`  ! ${SITE_DIR}: no such directory`);
  process.exit(1);
}

const tenants = readdirSync(SITE_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && SLUG.test(e.name))
  .map((e) => e.name)
  .sort();

// Copy the shared kit in. It lives once at lab/_kit/ and is served at
// minomobi.com/_kit/, so sites LINK it same-origin instead of each inlining a
// fork — one edit re-skins every site. Copied at deploy time rather than
// committed here so there is exactly one source of truth.
if (existsSync(KIT_SRC)) {
  cpSync(KIT_SRC, join(SITE_DIR, '_kit'), { recursive: true });
  console.log(`  ✓ ${SITE_DIR}/_kit — shared style guide`);
} else {
  console.log(`  ! ${KIT_SRC} missing — sites linking ../_kit/ will 404`);
  process.exitCode = 1;
}

writeFileSync(
  join(SITE_DIR, 'tenants.json'),
  JSON.stringify({ tenants }, null, 2) + '\n',
);
console.log(`  ✓ ${SITE_DIR}/tenants.json — ${tenants.length} sites`);
