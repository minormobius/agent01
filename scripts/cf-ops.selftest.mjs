#!/usr/bin/env node
// cf-ops.selftest.mjs — the delete-worker guards, as a pure function. No network.
import { deleteWorkerGuards } from './cf-ops.mjs';

let failures = 0;
const check = (name, ok) => { if (!ok) { failures++; console.error(`  FAIL  ${name}`); } else console.log(`  ok    ${name}`); };
const clean = { exists: true, domains: [], routes: [], durableObjects: [], configuredIn: [] };

check('an orphan with nothing pointing at it may go', deleteWorkerGuards('x', clean).ok === true);
check('a worker already gone is skipped, not failed', deleteWorkerGuards('x', { ...clean, exists: false }).skip === true);
check('a worker serving a custom domain is refused', deleteWorkerGuards('x', { ...clean, domains: ['x.mino.mobi'] }).ok === false);
check('a worker a route points at is refused', deleteWorkerGuards('x', { ...clean, routes: ['x.mino.mobi/*'] }).ok === false);
check('a worker owning Durable Objects is refused (their data goes with it)', deleteWorkerGuards('x', { ...clean, durableObjects: ['Room'] }).ok === false);
check('a worker the repo still configures is refused', deleteWorkerGuards('x', { ...clean, configuredIn: ['x/wrangler.jsonc'] }).ok === false);
check('every reason is reported, not just the first', deleteWorkerGuards('x', { ...clean, domains: ['a'], routes: ['b'] }).why.length === 2);

console.log(failures ? `cf-ops selftest: ${failures} FAILURE(S)` : 'cf-ops selftest: PASS');
process.exit(failures ? 1 : 0);
