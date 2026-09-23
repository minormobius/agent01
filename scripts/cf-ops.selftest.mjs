#!/usr/bin/env node
// cf-ops.selftest.mjs — the delete-worker guards, as a pure function. No network.
import { deleteWorkerGuards, convertGuards } from './cf-ops.mjs';

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

const f = { workerExists: true, customDomain: 'zoom', routeWorker: null, zoneId: 'z' };
check('convert: a host held by the named worker may convert', convertGuards('zoom.mino.mobi', 'zoom', f).ok === true);
check('convert: a host held by ANOTHER worker is refused', convertGuards('zoom.mino.mobi', 'zoom', { ...f, customDomain: 'other' }).ok === false);
check('convert: already a route to this worker is skipped', convertGuards('zoom.mino.mobi', 'zoom', { ...f, customDomain: null, routeWorker: 'zoom' }).skip === true);
check('convert: a route to another worker is refused', convertGuards('zoom.mino.mobi', 'zoom', { ...f, routeWorker: 'other' }).ok === false);
check('convert: a missing worker is refused', convertGuards('zoom.mino.mobi', 'zoom', { ...f, workerExists: false }).ok === false);

console.log(failures ? `cf-ops selftest: ${failures} FAILURE(S)` : 'cf-ops selftest: PASS');
process.exit(failures ? 1 : 0);
