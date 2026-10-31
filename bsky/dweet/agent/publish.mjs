/**
 * Publish dweets headlessly, from a manifest, to a service account's repo.
 *
 *   node agent/publish.mjs <manifest.json> [--dry] [--json]
 *
 * The manifest sits next to the sources it names:
 *
 *   { "dweets": [ { "file": "train.dweet.js", "title": "gears: train",
 *                   "captureTime": 2000, "remixOf": "at://…" } ] }
 *
 * `lang` is `glsl` for a `.glsl` / `.frag` file and `js` otherwise, unless the
 * entry says. Every entry is validated with the same `validate()` the composer
 * uses, so a record this writes is one the page would have accepted.
 *
 * Credentials: DWEET_HANDLE + DWEET_PASSWORD (an app password), from the
 * environment only. They live in GitHub secrets and reach this script through
 * `publish-dweet.yml`, never through the repo or a sandbox. The browser path
 * (remix → post, scoped OAuth) is unchanged and is still how a PERSON posts;
 * this is how the house account does.
 *
 * Idempotent: the author's existing dweets are listed first and any entry
 * whose `src` + `lang` is already there is skipped, so re-running a manifest
 * (or a push that re-triggers the workflow) never double-posts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { has, positional, emit, die } from './common.mjs';
import { validate, countChars, sizeClass } from '../sandbox.js';
import { permalink } from '../share.js';
import { resolveHandle, resolvePds, PdsClient } from '../../../packages/atproto/pds.js';

const COLLECTION = 'com.minomobi.dweet.dweet';
const DRY = has('--dry');

const manifestPath = positional();
if (!manifestPath) die('usage: node agent/publish.mjs <manifest.json> [--dry]');
let manifest;
try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
catch (err) { die(`cannot read manifest: ${err.message}`); }
const dir = path.dirname(path.resolve(manifestPath));

// Build and validate every record before touching the network: one bad entry
// stops the batch rather than half-publishing it.
const entries = (manifest.dweets || []).map((e, i) => {
  if (!e.file) die(`entry ${i}: no file`);
  const src = fs.readFileSync(path.join(dir, e.file), 'utf8').replace(/\n+$/, '');
  const lang = e.lang || (/\.(glsl|frag)$/.test(e.file) ? 'glsl' : 'js');
  const v = validate({ src, lang });
  if (!v.ok) die(`${e.file}: ${v.error}`);
  if (e.title && countChars(e.title) > 64) die(`${e.file}: title over 64 graphemes`);
  if (e.captureTime != null && !(Number.isInteger(e.captureTime) && e.captureTime >= 0)) {
    die(`${e.file}: captureTime must be a non-negative integer (ms)`);
  }
  const record = { $type: COLLECTION, src, lang, createdAt: new Date().toISOString() };
  if (e.title) record.title = e.title;
  if (e.remixOf) record.remixOf = e.remixOf;
  if (e.captureTime != null) record.captureTime = e.captureTime;
  return { file: e.file, record, chars: v.chars, tier: sizeClass(src).label };
});
if (!entries.length) die('manifest lists no dweets');

const results = [];
if (DRY) {
  for (const e of entries) results.push({ file: e.file, status: 'dry', chars: e.chars, record: e.record });
} else {
  const handle = process.env.DWEET_HANDLE, password = process.env.DWEET_PASSWORD;
  if (!handle || !password) die('set DWEET_HANDLE and DWEET_PASSWORD (an app password)');
  const did = await resolveHandle(handle);
  const client = new PdsClient(await resolvePds(did));
  await client.login(handle, password);

  const existing = new Map();
  let cursor;
  do {
    const page = await client.listRecords(COLLECTION, 100, cursor);
    for (const r of page.records || []) existing.set(`${r.value.lang}\n${r.value.src}`, r.uri);
    cursor = page.cursor;
  } while (cursor);

  for (const e of entries) {
    const key = `${e.record.lang}\n${e.record.src}`;
    if (existing.has(key)) {
      results.push({ file: e.file, status: 'exists', uri: existing.get(key) });
      continue;
    }
    const res = await client.createRecord(COLLECTION, e.record);
    existing.set(key, res.uri);
    results.push({ file: e.file, status: 'created', uri: res.uri });
  }
}

emit({ results }, results.map((r) => {
  const e = entries.find((x) => x.file === r.file);
  const link = permalink('https://bsky.mino.mobi/dweet/', { ...e.record });
  return `  ${r.status.padEnd(8)} ${r.file.padEnd(18)} ${r.uri || `${e.chars} chars, ${e.tier}`}\n           ${link}`;
}).concat(DRY ? ['', '  dry run: nothing written'] : []));
