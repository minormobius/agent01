#!/usr/bin/env node
// drive — the file tree of CAD records, from a terminal.
//
//   node agent/drive.mjs ls   [prefix]                 --drive ~/.cad-drive.json | --at did:plc:… [--pds https://…] | --login
//   node agent/drive.mjs get  <path|at://…>            prints the tree JSON (pipe into build / check / render / export)
//   node agent/drive.mjs put  <path> <tree.json> [-m msg]
//   node agent/drive.mjs log  <path|at://…>
//   node agent/drive.mjs fork <path|at://…> <path>
//   node agent/drive.mjs push <path> --login          copy a local file and its history to your repo
//   node agent/drive.mjs rm   <path>
//
// Three repos to point at:
//   --drive FILE   a whole repo in one JSON file (did:local) — the default, ~/.cad-drive.json.
//                  The same shape the viewer keeps in IndexedDB.
//   --at WHO       anyone's public repo, read straight from their PDS, no sign-in.
//   --login        YOUR repo, with an app password: CAD_HANDLE and CAD_APP_PASSWORD
//                  in the environment (BLUESKY_HANDLE / BLUESKY_APP_PASSWORD also work).
//                  What you put here is public and yours; the viewer's files tab shows it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Drive, MemoryBackend, PublicBackend, SessionBackend, resolvePds, resolveHandle } from '../lib/drive.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const drivePath = opt('--drive', path.join(os.homedir(), '.cad-drive.json'));
const at = opt('--at'); const pds = opt('--pds'); const message = opt('-m'); const login = flag('--login');
const [cmd, a, b] = args;

function fileDrive() {
  const records = fs.existsSync(drivePath) ? JSON.parse(fs.readFileSync(drivePath, 'utf8')) : {};
  return new Drive(new MemoryBackend('did:local', { records, persist: async (r) => fs.writeFileSync(drivePath, JSON.stringify(r)) }), pds ? { pdsOf: async () => pds } : {});
}
async function loginDrive() {
  const handle = process.env.CAD_HANDLE || process.env.BLUESKY_HANDLE, pw = process.env.CAD_APP_PASSWORD || process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !pw) { console.error('--login needs CAD_HANDLE and CAD_APP_PASSWORD in the environment (an app password, not your main one)'); process.exit(2); }
  const b = await SessionBackend.login(handle, pw, pds ? { entry: pds } : {});
  console.error(`signed in as ${handle} (${b.did})`);
  return new Drive(b);
}
async function open() {
  if (login) return loginDrive();
  if (at) {
    const did = at.startsWith('did:') ? at : await resolveHandle(at);
    return new Drive(new PublicBackend(did, pds || (await resolvePds(did))));
  }
  return fileDrive();
}
const out = (v) => process.stdout.write(JSON.stringify(v, null, 2) + '\n');

const drive = await open();
switch (cmd) {
  case 'ls': { const ls = await drive.list(a); if (!ls.length) console.log('(empty)'); for (const e of ls) console.log(`${e.kind.padEnd(8)} ${e.updatedAt.slice(0, 19)}  ${e.path}\t${e.uri}`); break; }
  case 'get': { const f = await drive.get(a); if (!f) { console.error(`no file at ${a}`); process.exit(1); } out(f.revision.tree); break; }
  case 'put': { const tree = JSON.parse(fs.readFileSync(b, 'utf8')); const f = await drive.put(a, tree, { message }); console.log(`${f.path} → ${f.head.uri}`); if (drive.did !== 'did:local') console.log(`https://cad.mino.mobi/?at=${encodeURIComponent(f.uri)}`); break; }
  case 'log': { for (const r of await drive.history(a)) console.log(`${r.cid.slice(0, 22).padEnd(22)} ${(r.createdAt || '').slice(0, 19)}  ${r.message || ''}${r.did !== drive.did ? `  (${r.did})` : ''}`); break; }
  case 'fork': { const f = await drive.fork(a, b, { message }); console.log(`${f.path} ← ${a}`); break; }
  case 'push': { if (!login) { console.error('push needs --login: it copies a local file into your repo'); process.exit(2); } const r = await fileDrive().push(a, drive); console.log(`${r.path} → ${r.uri} (${r.revisions} revisions)`); console.log(`https://cad.mino.mobi/?at=${encodeURIComponent(r.uri)}`); break; }
  case 'rm': { const e = await drive.remove(a); console.log(`removed ${e.path} (revisions kept)`); break; }
  default: console.error('usage: drive ls|get|put|log|fork|push|rm … [--drive file] [--at did|handle] [--login] [--pds url] [-m msg]'); process.exit(2);
}
