#!/usr/bin/env node
// drive — the file tree of CAD records, from a terminal.
//
//   node agent/drive.mjs ls   [prefix]                 --drive ~/.cad-drive.json | --at did:plc:… [--pds https://…]
//   node agent/drive.mjs get  <path|at://…>            prints the tree JSON (pipe into cad check / render)
//   node agent/drive.mjs put  <path> <tree.json> [-m msg]
//   node agent/drive.mjs log  <path|at://…>
//   node agent/drive.mjs fork <path|at://…> <path>
//   node agent/drive.mjs rm   <path>
//
// --drive is a JSON file holding a whole repo (did:local): the same shape the
// viewer keeps in IndexedDB, so a tree an agent saves here opens in the browser
// through `#t=` today and through the files tab once it is pushed. --at reads
// anyone's public repo straight from their PDS, no sign-in. Writes to a real
// PDS go through the viewer (the shared auth worker holds the tokens).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Drive, MemoryBackend, PublicBackend, resolvePds, resolveHandle } from '../lib/drive.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const drivePath = opt('--drive', path.join(os.homedir(), '.cad-drive.json'));
const at = opt('--at'); const pds = opt('--pds'); const message = opt('-m');
const [cmd, a, b] = args;

async function open() {
  if (at) {
    const did = at.startsWith('did:') ? at : await resolveHandle(at);
    return new Drive(new PublicBackend(did, pds || (await resolvePds(did))));
  }
  const records = fs.existsSync(drivePath) ? JSON.parse(fs.readFileSync(drivePath, 'utf8')) : {};
  return new Drive(new MemoryBackend('did:local', { records, persist: async (r) => fs.writeFileSync(drivePath, JSON.stringify(r)) }), pds ? { pdsOf: async () => pds } : {});
}
const out = (v) => process.stdout.write(JSON.stringify(v, null, 2) + '\n');

const drive = await open();
switch (cmd) {
  case 'ls': { const ls = await drive.list(a); if (!ls.length) console.log('(empty)'); for (const e of ls) console.log(`${e.kind.padEnd(8)} ${e.updatedAt.slice(0, 19)}  ${e.path}\t${e.uri}`); break; }
  case 'get': { const f = await drive.get(a); if (!f) { console.error(`no file at ${a}`); process.exit(1); } out(f.revision.tree); break; }
  case 'put': { const tree = JSON.parse(fs.readFileSync(b, 'utf8')); const f = await drive.put(a, tree, { message }); console.log(`${f.path} → ${f.head.uri}`); break; }
  case 'log': { for (const r of await drive.history(a)) console.log(`${r.cid.slice(0, 22).padEnd(22)} ${(r.createdAt || '').slice(0, 19)}  ${r.message || ''}${r.did !== drive.did ? `  (${r.did})` : ''}`); break; }
  case 'fork': { const f = await drive.fork(a, b, { message }); console.log(`${f.path} ← ${a}`); break; }
  case 'rm': { const e = await drive.remove(a); console.log(`removed ${e.path} (revisions kept)`); break; }
  default: console.error('usage: drive ls|get|put|log|fork|rm … [--drive file] [--at did|handle] [--pds url] [-m msg]'); process.exit(2);
}
