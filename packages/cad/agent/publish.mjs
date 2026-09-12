#!/usr/bin/env node
// publish.mjs — put the bench parts and assemblies into a repo as files.
//
//   node agent/publish.mjs --check                  # plan only; no login, no writes
//   node agent/publish.mjs --write                  # publish to the service account
//   node agent/publish.mjs --write --drive f.json   # or into a local JSON-file repo
//
// BLUESKY_BOT_HANDLE / BLUESKY_BOT_APP_PASSWORD are the service account (the
// one that owns minomobi.com and holds the lab lexicons; the same identity
// the publish-lexicons workflow writes as). Optional BLUESKY_PDS overrides
// https://bsky.social.
//
// WHAT IT WRITES. Each bench part becomes a file at parts/<name>; each bench
// assembly becomes a file at its own name (clock, train). An assembly's
// `parts` map is rewritten from `bench:<name>` to the AT URI of the published
// part head — so the record graph on the PDS references itself, and the page
// resolves `at://` refs through its gateway without needing this site's bench
// directory at all. A sub-assembly that is inline stays inline.
//
// IDEMPOTENT. A file whose head revision holds the same tree (canonical JSON)
// is skipped, so a re-run writes nothing and the history stays honest: one
// revision per real change. A changed tree gets a new revision whose parent
// is the old head — the same thing the files tab does.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Drive, MemoryBackend, SessionBackend, canonical, PART } from '../lib/drive.js';
import { kernels } from './common.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const write = args.includes('--write');
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const driveFile = opt('--drive');
const bench = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'bench', n + '.json'), 'utf8'));

// the manifest: what goes where. Order matters — parts before the assemblies that reference them.
const PARTS = ['gear', 'arbor', 'plate', 'escape', 'case', 'case-fillet', 'cam', 'pinion', 'pallet', 'balance', 'hand', 'dial'];
const ASSEMBLIES = ['train', 'clock', 'crank', 'lift'];
const pathOf = (name, isAsm) => (isAsm ? name : `parts/${name}`);

async function open() {
  if (!write) return null;
  if (driveFile) {
    const records = fs.existsSync(driveFile) ? JSON.parse(fs.readFileSync(driveFile, 'utf8')) : {};
    return new Drive(new MemoryBackend('did:local', { records, persist: async (r) => fs.writeFileSync(driveFile, JSON.stringify(r)) }));
  }
  const handle = process.env.BLUESKY_BOT_HANDLE, pw = process.env.BLUESKY_BOT_APP_PASSWORD;
  if (!handle || !pw) { console.error('BLUESKY_BOT_HANDLE and BLUESKY_BOT_APP_PASSWORD are required for --write'); process.exit(2); }
  const b = await SessionBackend.login(handle, pw, { entry: process.env.BLUESKY_PDS || 'https://bsky.social' });
  console.log(`signed in as ${handle} did=${b.did}`);
  return new Drive(b);
}

const drive = await open();
const uris = new Map(); // bench name → AT URI of the part head
let wrote = 0, kept = 0;

async function publish(name, tree, isAsm) {
  const p = pathOf(name, isAsm);
  if (!drive) { console.log(`  plan  ${p}${isAsm ? `  parts → ${Object.keys(tree.parts || {}).join(', ')}` : ''}`); return; }
  const existing = await drive.get(p);
  if (existing && canonical(existing.revision.tree) === canonical(tree)) {
    kept++; uris.set(name, existing.uri);
    console.log(`  same  ${p}  ${existing.uri}`); return;
  }
  // the exact build's invariants ride on the revision, so agent/audit.mjs can rebuild every head later and diff them
  let judged = {};
  if (!isAsm) { const { engine } = await kernels(); const b = engine.build(JSON.stringify(tree), { kernel: 'truck' }); if (b.ok) judged = { kernel: { id: 'truck', version: String(engine.version ?? '') }, invariants: { ...b.report.invariants, faces: b.report.faces.length } }; }
  const r = await drive.put(p, tree, { message: existing ? `bench update from ${name}.json` : `published from bench/${name}.json`, kind: isAsm ? 'assembly' : 'part', ...judged });
  wrote++; uris.set(name, r.uri);
  console.log(`  ${existing ? 'new revision' : 'created'}  ${p}  ${r.uri}`);
}

console.log(write ? 'publishing' : 'plan (no writes)');
for (const n of PARTS) await publish(n, bench(n), false);
for (const n of ASSEMBLIES) {
  const tree = bench(n);
  // bench:<name> → the published part's AT URI; nested inline assemblies get the same treatment
  const rewrite = (a) => {
    for (const [k, v] of Object.entries(a.parts || {})) if (typeof v === 'string' && v.startsWith('bench:')) { const u = uris.get(v.slice(6)); if (u) a.parts[k] = u; else if (drive) throw new Error(`${n}: ${v} was not published`); }
    for (const c of a.components || []) if (c.assembly && typeof c.assembly === 'object') rewrite(c.assembly);
  };
  rewrite(tree);
  await publish(n, tree, true);
}
if (drive) {
  console.log(`\n${wrote} written, ${kept} unchanged, in ${drive.did}`);
  for (const n of ASSEMBLIES) console.log(`  https://cad.mino.mobi/?at=${encodeURIComponent(uris.get(n))}`);
  const first = await drive.list();
  console.log(`  ${first.length} files under at://${drive.did}/${PART}/`);
}
