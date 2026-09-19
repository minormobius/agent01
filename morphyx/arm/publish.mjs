#!/usr/bin/env node
// publish.mjs — put the arm's parts and both documents into an ATProto repo as
// cad.mino.mobi files (com.minomobi.cad.part heads over immutable revisions).
//
//   node publish.mjs --cad /path/to/cad-package [--reports DIR] [--write]
//
// Paths: arm/parts/<name>, arm/assembly, arm/pour. Each assembly's `parts` map
// is rewritten from inline trees to the AT URIs of the published part
// REVISIONS, recursively through the nested sub-assemblies — so a document
// revision rebuilds the same way forever and a part can be forked on its own.
// Same shape as ../gripper/publish.mjs, which is the one that has been run.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parts, assembly, wrist, robot } from './arm.mjs';
import { parts as gParts } from '../gripper/gripper.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const write = args.includes('--write');
const cad = opt('--cad'); if (!cad) { console.error('--cad <dir> is required (a checkout of the cad package)'); process.exit(2); }
const reports = opt('--reports');
const { Drive, SessionBackend, canonical } = await import(pathToFileURL(path.join(cad, 'lib', 'drive.js')).href);

const report = (name) => { if (!reports) return null; const p = path.join(reports, `${name}.json`); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
async function open() {
  if (!write) return null;
  const handle = process.env.CAD_HANDLE, pw = process.env.CAD_APP_PASSWORD;
  if (!handle || !pw) { console.error('--write needs CAD_HANDLE and CAD_APP_PASSWORD in the environment'); process.exit(2); }
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
  const f = await drive.put(p, tree, { kind, description: tree._, message: existing ? `arm: ${name} updated` : `arm: ${name}`, kernel: r?.kernel, invariants: r?.invariants });
  wrote++; uris.set(name, f.uri); revs.set(name, f.revision.uri);
  console.log(`  ${existing ? 'new revision' : 'created'}  ${p}  ${f.uri}`);
}
console.log(write ? 'publishing the arm' : 'plan, no writes');
const RETIRED = {
  v1: ['wrist-housing', 'wrist-yoke', 'roll-tube'],

  // v2: the pocket. The blade swallowed the gripper's motor and the flange
  // with it, so both of these are gone — 54 mm of tool length and 360 g at
  // the very tip, which is the worst place on the machine to spend either.
  v2: ['tool-adapter', 'tool-flange'],
};   // roll-tube -> roll-drum, which now houses the J5 motor; wrist-housing/-yoke were the implied joint, two parts touching in mid-air
for (const [ver, names] of Object.entries(RETIRED)) for (const name of names) {
  if (name in parts) continue;
  if (!drive) { console.log(`  plan  arm/parts/${name} → arm/${ver}/${name} (if present)`); continue; }
  if (await drive.find(`arm/parts/${name}`)) { await drive.rename(`arm/parts/${name}`, `arm/${ver}/${name}`); console.log(`  moved  arm/parts/${name} → arm/${ver}/${name}`); }
}
for (const [name, tree] of Object.entries(parts)) await publish(`arm/parts/${name}`, tree, { kind: 'part', name });
// The gripper's parts are already published under gripper/parts/ by its own
// workflow; the robot document must reference THOSE, not copies. Resolve them
// off the live repo so the record graph has one gripper, not two.
if (drive) for (const name of Object.keys(gParts)) {
  const f = await drive.get(`gripper/parts/${name}`);
  if (!f) throw new Error(`gripper/parts/${name} is not published \u2014 run the gripper workflow first`);
  revs.set(name, f.revision.uri);
  console.log(`  reuse gripper/parts/${name}  ${f.revision.uri}`);
}
// recursive: every sub-assembly carries its own parts map, so every level is rewritten
const rewrite = (a) => {
  for (const k of Object.keys(a.parts || {})) { const u = revs.get(k); if (u) a.parts[k] = u; else if (drive) throw new Error(`${k} was not published`); }
  for (const c of a.components || []) if (c.assembly && typeof c.assembly === 'object') rewrite(c.assembly);
};
for (const [pathName, asm, name] of [['arm/assembly', assembly('inputs'), 'assembly'], ['arm/pour', assembly('demo'), 'pour'], ['arm/wrist', wrist(), 'wrist'], ['arm/robot', robot(), 'robot'], ['arm/robot-pour', robot('demo'), 'robot-pour']]) {
  rewrite(asm); await publish(pathName, asm, { kind: 'assembly', name });
}
if (drive) {
  console.log(`\n${wrote} written, ${kept} unchanged, in ${drive.did}`);
  console.log(`  arm:  https://cad.mino.mobi/?at=${encodeURIComponent(uris.get('assembly'))}`);
  console.log(`  pour: https://cad.mino.mobi/?at=${encodeURIComponent(uris.get('pour'))}`);
  console.log(`  wrist: https://cad.mino.mobi/?at=${encodeURIComponent(uris.get('wrist'))}`);
}
