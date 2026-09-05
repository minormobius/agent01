/**
 * Tests the archive module's PLAN arithmetic.
 *
 *   node bsky/lib/archive.selftest.mjs
 *
 * `summarisePlan` decides what a replay will cost, and it is the number a
 * reader is shown before spending their own metered quota. Getting an inclusive
 * range off by one understates the job — which is the direction that matters,
 * because the promise being made is a spending limit.
 *
 * Importing archive.js in node takes two shims, both of which are the browser
 * showing through rather than anything wrong with the module:
 *   - its imports are ROOT-ABSOLUTE (`/lib/...`), which is right for a page
 *     served from `/` and meaningless to node's resolver;
 *   - it imports `lib/vendor/`, which is gitignored and built at deploy time by
 *     deploy-bsky.yml, so it does not exist in a checkout.
 * So the source is rewritten to relative paths and pointed at throwaway stubs.
 * Nothing here touches the network — planCost and fetchSlug are exercised live
 * instead, and the surface's notes say which parts remain unverified.
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'bsky-archive-'));
let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

try {
  mkdirSync(join(tmp, 'vendor', 'zstd'), { recursive: true });
  writeFileSync(join(tmp, 'vendor', 'jetstream.browser.js'),
    'export class Jetstream { constructor(o){ this.o = o; } }\n');
  writeFileSync(join(tmp, 'vendor', 'zstd', 'index.js'),
    'export async function init(){} export function createDCtx(){return{}}\n'
    + 'export function decompressUsingDict(){ throw new Error("stub"); }\n');
  for (const dep of ['sha256.js', 'apikey.js']) {
    writeFileSync(join(tmp, dep), readFileSync(join(here, dep)));
  }
  writeFileSync(join(tmp, 'archive.js'),
    readFileSync(join(here, 'archive.js'), 'utf8').replaceAll("from '/lib/", "from './"));

  globalThis.localStorage ??= {
    _v: {}, getItem(k) { return this._v[k] ?? null; },
    setItem(k, v) { this._v[k] = v; }, removeItem(k) { delete this._v[k]; },
  };

  const a = await import(pathToFileURL(join(tmp, 'archive.js')).href);

  console.log('summarisePlan — block ranges are INCLUSIVE at both ends');
  check('a single-block range counts 1',
    a.summarisePlan({ segments: [{ mode: 'blocks', blocks: [{ first: 7, last: 7 }] }] }).blocks, 1);
  check('10..19 counts 10',
    a.summarisePlan({ segments: [{ mode: 'blocks', blocks: [{ first: 10, last: 19 }] }] }).blocks, 10);
  check('several ranges in one segment sum',
    a.summarisePlan({ segments: [{ mode: 'blocks', blocks: [{ first: 0, last: 0 }, { first: 10, last: 19 }] }] }).blocks, 11);
  check('block-mode with no blocks array counts 0',
    a.summarisePlan({ segments: [{ mode: 'blocks' }] }).blocks, 0);

  console.log('\nwhole segments are counted separately — they are the expensive ones');
  const mixed = a.summarisePlan({
    segments: [
      { mode: 'blocks', blocks: [{ first: 0, last: 4 }] },
      { mode: 'segment' }, { mode: 'segment' },
    ],
  });
  check('blocks', mixed.blocks, 5);
  check('wholeSegments', mixed.wholeSegments, 2);
  check('segments length', mixed.segments.length, 3);
  check('an entry with an unknown mode counts as whole, not as zero',
    a.summarisePlan({ segments: [{ mode: 'something-new' }] }).wholeSegments, 1);

  console.log('\ndegenerate input does not throw');
  check('empty plan', a.summarisePlan({}).blocks, 0);
  check('null plan', a.summarisePlan(null).wholeSegments, 0);
  check('missing segments', a.summarisePlan({ stats: {} }).segments, []);

  console.log('\nthe BYO-key contract is enforced before any network call');
  let msg = '';
  try { await a.fetchSlug({ match: () => [], onMatch() {} }); } catch (e) { msg = e.message; }
  check('no key is refused', /no API key/.test(msg), true);
  a.setKey('not-a-real-key');
  msg = '';
  try { await a.fetchSlug({ onMatch() {} }); } catch (e) { msg = e.message; }
  check('a missing matcher is refused before spending a byte', /needs a match function/.test(msg), true);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failed) { console.error(`\n${failed} failure(s)`); process.exit(1); }
console.log('\narchive selftest passed');
