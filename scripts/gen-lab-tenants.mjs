#!/usr/bin/env node
// gen-lab-tenants.mjs — build the tenant manifest a lab slot's landing page reads.
//
// A slot (lab/alph, lab/beta, lab/gamm) holds up to 100 tenant sites, one per
// subdirectory. The landing page renders its 10x10 grid from ./tenants.json,
// which this script writes by listing those subdirectories.
//
// tenants.json is a BUILD ARTEFACT, not a committed file — the deploy workflow
// runs this immediately before `wrangler deploy`, so the grid can never drift
// from what is actually on disk, and an agent adding a tenant never has to
// remember to regenerate anything. It is gitignored for the same reason.
//
//   node scripts/gen-lab-tenants.mjs            # every slot
//   node scripts/gen-lab-tenants.mjs lab/alph   # one slot
//
// Ordering is oldest-first by directory name so the grid is stable between
// deploys; the recycling policy (docs/LAB-FACTORY.md) evicts from the front.

import { readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SLOT_CAPACITY = 100;

// A tenant slug must be a plain lowercase token — the same shape the landing
// page interpolates into a relative href. Anything else is not ours.
const SLUG = /^[a-z0-9][a-z0-9-]{0,30}$/;

function slotsFrom(args) {
  if (args.length) return args;
  if (!existsSync('lab')) return [];
  return readdirSync('lab')
    .map((d) => join('lab', d))
    .filter((p) => statSync(p).isDirectory());
}

let wrote = 0;
for (const slot of slotsFrom(process.argv.slice(2))) {
  if (!existsSync(slot)) {
    console.log(`  ! ${slot}: no such directory`);
    continue;
  }

  const tenants = readdirSync(slot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && SLUG.test(e.name))
    .map((e) => e.name)
    .sort();

  if (tenants.length > SLOT_CAPACITY) {
    // Over capacity means the recycler did not run. Say so loudly rather than
    // silently truncating — a dropped tenant would look identical to an evicted
    // one, and the grid would quietly disagree with the filesystem.
    console.log(`  ! ${slot}: ${tenants.length} tenants exceeds capacity ${SLOT_CAPACITY}`);
    process.exitCode = 1;
  }

  writeFileSync(
    join(slot, 'tenants.json'),
    JSON.stringify({ capacity: SLOT_CAPACITY, tenants }, null, 2) + '\n',
  );
  console.log(`  ✓ ${slot}/tenants.json — ${tenants.length}/${SLOT_CAPACITY} leased`);
  wrote++;
}

if (!wrote) console.log('  (no lab slots found)');
