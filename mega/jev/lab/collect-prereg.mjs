// collect-prereg.mjs — the node host for the forward test.
//
// All the logic lives in collect-core.mjs, which the Cloudflare cron in
// mega/worker.js runs too. This file is only the filesystem around it: read
// the record, collect, write the record. One implementation, two hosts — the
// point being that a rule which behaves differently depending on who ran it is
// not a frozen rule.
//
//   node mega/jev/lab/collect-prereg.mjs [--dry]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { collect, MEASURED_PER_DAY } from './collect-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SPEC = JSON.parse(readFileSync(join(here, 'preregister.json'), 'utf8'));
const OUT = join(here, 'prereg-results.json');
const DRY = process.argv.includes('--dry');

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const { store, added, skippedEarly, empty } = await collect(SPEC, prev);
if (empty) { console.log('no candles returned; nothing to do'); process.exit(0); }

console.log(`+${added} new prediction(s); ${skippedEarly} window(s) predate the registration and do not count`);
console.log(`total ${store.predictions.length} — ${store.verdict.status}`);
if (store.eta_days) console.log(`at the measured ${MEASURED_PER_DAY}/day that is about ${store.eta_days} more days`);
if (DRY) { console.log('(dry run, nothing written)'); process.exit(0); }
writeFileSync(OUT, JSON.stringify(store, null, 1) + '\n');
console.log(`wrote ${OUT}`);
