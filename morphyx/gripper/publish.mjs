#!/usr/bin/env node
// publish.mjs — put the gripper's parts and assembly into an ATProto repo as
// cad.mino.mobi files (com.minomobi.cad.part heads over immutable revisions).
//
//   node publish.mjs --cad /path/to/cad-package [--reports DIR] [--nut 53] [--write]
//
// --cad      a checkout of the cad package: `git clone https://tangled.org/morphyxmino.bsky.social/cad`
//            (its lib/drive.js is the file tree over records; nothing else is imported).
// --reports  a directory of `<part>.json` reports from `agent/build.mjs --json`; when
//            present each revision records the kernel and the invariants it was judged by.
// --write    actually write, as CAD_HANDLE / CAD_APP_PASSWORD (an app password). Without
//            it, this prints the plan and touches nothing.
//
// Paths in the repo: gripper/parts/<name> for the parts, gripper/assembly for the
// assembly, whose `parts` map is rewritten from inline trees to the AT URIs of the
// published part REVISIONS — so the record graph references itself, an assembly
// revision always rebuilds the same way, and anyone can fork a part on its own.
// Parts an earlier version used are moved under gripper/v1/, URIs intact. Idempotent the way the bench publisher is: a file whose head holds
// the same canonical tree is left alone; a changed tree becomes one new revision whose
// parent is the old head.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parts, assembly, D } from './gripper.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const write = args.includes('--write');
const cad = opt('--cad'); if (!cad) { console.error('--cad <dir> is required (a checkout of the cad package)'); process.exit(2); }
const reports = opt('--reports'); const nut = Number(opt('--nut', D.nutRef));
const { Drive, SessionBackend, canonical } = await import(pathToFileURL(path.join(cad, 'lib', 'drive.js')).href);

const report = (name) => { if (!reports) return null; const p = path.join(reports, `${name}.json`); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
async function open() {
  if (!write) return null;
  const handle = process.env.CAD_HANDLE, pw = process.env.CAD_APP_PASSWORD;
  if (!handle || !pw) { console.error('--write needs CAD_HANDLE and CAD_APP_PASSWORD (an app password) in the environment'); process.exit(2); }
  const b = await SessionBackend.login(handle, pw, { entry: process.env.CAD_PDS || 'https://bsky.social' });
  console.log(`signed in as ${handle} did=${b.did}`);
  return new Drive(b);
}
const drive = await open();
const uris = new Map(), revs = new Map(); let wrote = 0, kept = 0;
async function publish(p, tree, { kind, name }) {
  if (!drive) { console.log(`  plan  ${p}`); return; }
  const existing = await drive.get(p);
  if (existing && canonical(existing.revision.tree) === canonical(tree)) { kept++; uris.set(name, existing.uri); revs.set(name, existing.revision.uri); console.log(`  same  ${p}  ${existing.uri}`); return; }
  const r = report(name);
  const f = await drive.put(p, tree, {
    kind, description: tree._, message: existing ? `gripper: ${name} updated` : `gripper: ${name}`,
    kernel: r?.kernel, invariants: r?.invariants,
  });
  wrote++; uris.set(name, f.uri); revs.set(name, f.revision.uri);
  console.log(`  ${existing ? 'new revision' : 'created'}  ${p}  ${f.uri}`);
}
console.log(write ? `publishing (nut at ${nut})` : `plan, no writes (nut at ${nut})`);
// parts an earlier version used and this one does not: moved under gripper/v1/ (the URI survives a rename, so
// the first assembly revision still finds them)
const RETIRED = { v1: ['base', 'bracket', 'end-block', 'rail-block', 'saddle', 'coupler', 'motor-shaft', 'nut-bracket'], v2: ['slider', 'finger'], v3: ['yoke'], v4: ['tab', 'carrier', 'pad', 'rod', 'crossbar'] };
for (const [ver, names] of Object.entries(RETIRED)) for (const name of names) {
  if (name in parts) continue;
  if (!drive) { console.log(`  plan  gripper/parts/${name} → gripper/${ver}/${name} (if present)`); continue; }
  if (await drive.find(`gripper/parts/${name}`)) { await drive.rename(`gripper/parts/${name}`, `gripper/${ver}/${name}`); console.log(`  moved  gripper/parts/${name} → gripper/${ver}/${name}`); }
}
for (const [name, tree] of Object.entries(parts)) await publish(`gripper/parts/${name}`, tree, { kind: 'part', name });
const rewrite = (a) => {
  // pinned to the REVISION each part was published as, so this assembly revision rebuilds the same way forever
  for (const k of Object.keys(a.parts || {})) { const u = revs.get(k); if (u) a.parts[k] = u; else if (drive) throw new Error(`${k} was not published`); }
  for (const c of a.components || []) if (c.assembly && typeof c.assembly === 'object') rewrite(c.assembly);
};
for (const [pathName, mode, name] of [['gripper/assembly', 'cycle', 'assembly'], ['gripper/stroke', 'stroke', 'stroke']]) {
  const asm = assembly(mode);
  rewrite(asm);
  await publish(pathName, asm, { kind: 'assembly', name });
}
if (drive) {
  console.log(`\n${wrote} written, ${kept} unchanged, in ${drive.did}`);
  console.log(`  open: https://cad.mino.mobi/?at=${encodeURIComponent(uris.get('assembly'))}`);
  console.log(`  stroke: https://cad.mino.mobi/?at=${encodeURIComponent(uris.get('stroke'))}`);
  for (const [n, u] of uris) if (n !== 'assembly' && n !== 'stroke') console.log(`  ${n}: https://cad.mino.mobi/?at=${encodeURIComponent(u)}`);
}
