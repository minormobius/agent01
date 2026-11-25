#!/usr/bin/env node
// Download every input listed in sources.json into data/raw/ and pin what we got.
//
//   node fetch.mjs                 # everything missing from data/raw/
//   node fetch.mjs mprop qcew      # only these source ids
//   node fetch.mjs --verify        # re-hash data/raw/ against the lock, download nothing
//
// data/raw/ is gitignored and .assetsignored: it is ~6 GB of public data that any
// session can re-fetch. What IS committed is data/sources.lock.json — the sha256 and
// size of every file as we used it — so a later run can tell when a publisher has
// revised a file under us (that is reported as DRIFT, never silently absorbed).
//
// Zipped sources carry an `extract` substring: only matching members are kept (the
// QCEW national zips are ~100 MB each to get one 600 KB county file).

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, createReadStream, rmSync, renameSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RAW = join(ROOT, 'data/raw');
const LOCK = join(ROOT, 'data/sources.lock.json');
const { sources } = JSON.parse(readFileSync(join(ROOT, 'sources.json'), 'utf8'));
const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : {};

const args = process.argv.slice(2);
const verify = args.includes('--verify');
const only = args.filter(a => !a.startsWith('--'));
const CONCURRENCY = 4;

const sha256 = p => new Promise((res, rej) => {
  const h = createHash('sha256');
  createReadStream(p).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
});

function curl(url, out) {
  // curl, not fetch(): it honours the sandbox proxy and CA bundle with no setup.
  const r = spawnSync('curl', ['-sSL', '--fail', '--retry', '4', '--retry-delay', '3', '-m', '900',
    '-A', 'planner-research-harness', '-o', out, url], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`curl ${r.status}: ${(r.stderr || '').trim()}`);
}

async function getOne(src, f) {
  const dest = join(RAW, f.key);
  if (verify || existsSync(dest)) {
    if (!existsSync(dest)) return { key: f.key, status: 'absent' };
    const h = await sha256(dest);
    const prev = lock[f.key];
    if (!prev) { lock[f.key] = { sha256: h, bytes: statSync(dest).size, url: f.url, fetched: null }; return { key: f.key, status: 'pinned' }; }
    return { key: f.key, status: prev.sha256 === h ? 'ok' : 'DRIFT' };
  }
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  const isZip = /\.zip(\?|$)/i.test(f.url) && !f.keepZip;
  const dl = isZip ? tmp + '.zip' : tmp;
  curl(f.url, dl);
  if (isZip) {
    const list = spawnSync('unzip', ['-Z1', dl], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout.split('\n');
    const hits = list.filter(n => n.includes(f.extract) && !n.endsWith('/'));
    // the MSA/CSA files also contain "Milwaukee"; we want exactly one member
    const pick = hits.filter(n => !/ (C|CS)\d+ /.test(n.replace(f.extract, '')));
    if (pick.length !== 1) { rmSync(dl, { force: true }); throw new Error(`extract "${f.extract}" matched ${pick.length}: ${pick.join(' | ')}`); }
    const r = spawnSync('unzip', ['-p', dl, pick[0]], { maxBuffer: 1 << 30 });
    if (r.status !== 0) throw new Error('unzip failed');
    writeFileSync(tmp, r.stdout);
    rmSync(dl, { force: true });
    f._member = pick[0];
  }
  renameSync(tmp, dest);
  const h = await sha256(dest);
  const prev = lock[f.key];
  lock[f.key] = { sha256: h, bytes: statSync(dest).size, url: f.url, ...(f._member ? { member: f._member } : {}), fetched: new Date().toISOString().slice(0, 10) };
  return { key: f.key, status: prev && prev.sha256 !== h ? 'DRIFT (refetched)' : 'fetched' };
}

const jobs = [];
for (const s of sources) {
  if (only.length && !only.includes(s.id)) continue;
  for (const f of s.files) jobs.push([s, f]);
}

const results = [];
let i = 0;
async function worker() {
  while (i < jobs.length) {
    const [s, f] = jobs[i++];
    try { results.push(await getOne(s, f)); }
    catch (e) { results.push({ key: f.key, status: 'FAILED', error: e.message }); }
    const r = results.at(-1);
    if (r.status !== 'ok') console.log(`${r.status.padEnd(18)} ${r.key}${r.error ? '  ' + r.error : ''}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const sorted = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })));
writeFileSync(LOCK, JSON.stringify(sorted, null, 1) + '\n');

const tally = results.reduce((m, r) => (m[r.status.split(' ')[0]] = (m[r.status.split(' ')[0]] || 0) + 1, m), {});
console.log('\n' + Object.entries(tally).map(([k, v]) => `${k}: ${v}`).join('  '));
if (results.some(r => r.status === 'DRIFT')) process.exitCode = 2;
if (results.some(r => r.status === 'FAILED')) process.exitCode = 1;
