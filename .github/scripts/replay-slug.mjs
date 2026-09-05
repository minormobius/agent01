/**
 * Buy a slug of the Jetstream archive and run bsky.mino.mobi's real rule on it.
 *
 * Mirrors lib/archive.js's fetchSlug() exactly — plan first, budget in BYTES,
 * stream and discard — and deliberately supplies the BROWSER shims rather than
 * the SDK's node defaults, because the node defaults (node:zlib, node:crypto)
 * are precisely what a browser does not have. Verifying those would prove
 * nothing about the page.
 */
import { readFileSync } from 'node:fs';
import { Jetstream } from '@bsky/jetstream';
import * as zstd from '@bokuweb/zstd-wasm';
import { compile, PRESETS } from '../../bsky/lib/rulefeed.js';
import { sha256 } from '../../bsky/lib/sha256.js';

const SERVICE = 'https://jetstream.us-east.bsky.network';
const KEY = process.env.JETSTREAM_KEY;
const BUDGET = Math.max(1, Number(process.env.BUDGET_MB) || 50) * 1024 * 1024;
const BUF = Math.max(1 << 20, Math.floor(BUDGET / 8));

if (!KEY) { console.error('no JETSTREAM_KEY in the environment'); process.exit(1); }

const n = (x) => Number(x).toLocaleString();
const mb = (x) => `${(x / 1048576).toFixed(1)} MB`;

// ── 1. plan, authenticated ───────────────────────────────────────
async function plan(body) {
  const res = await fetch(`${SERVICE}/xrpc/network.bsky.jetstream.planSnapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`planSnapshot ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

console.log('═══ 1. the key ═══');
const tipPlan = await plan({ collections: ['app.bsky.feed.post'], kinds: ['commit'] });
console.log(`  authenticated planSnapshot: OK`);
console.log(`  sealedTipSeq  ${n(tipPlan.sealedTipSeq)}`);

const TIP = tipPlan.sealedTipSeq;

/**
 * Pick a window the planner will serve as BLOCKS.
 *
 * This is the lesson of the previous run and it is the whole usability story
 * for replay. A plan entry in `segment` mode is a ~262 MB atomic download: a
 * byte budget cannot subdivide it, so a 12 MB cap simply aborts after the
 * Content-Length arrives and nothing is decoded at all. Only where a BLOCK
 * INDEX exists can the archive be read a piece at a time — and for
 * app.bsky.feed.post that is a small minority of segments.
 *
 * So rather than choosing a seq range and hoping, plan the whole archive once
 * (metadata, cheap) and pick a segment that actually has an index.
 */
console.log('\n═══ 2. find a window the planner will serve as BLOCKS ═══');
const full = await plan({ collections: ['app.bsky.feed.post'], kinds: ['commit'] });
const indexed = (full.segments || []).filter((s) => s.mode === 'blocks' && (s.blocks || []).length);
console.log(`  archive       ${n(full.segments.length)} segments, ${n(indexed.length)} with a block index `
  + `(${(indexed.length / Math.max(full.segments.length, 1) * 100).toFixed(1)}%)`);

if (!indexed.length) { console.error('  no block-indexed segment anywhere — cannot buy a bounded slug'); process.exit(1); }

/**
 * Walk the newest indexed segments, newest first, until the budget is spent.
 *
 * One segment's post blocks turned out to be ~12 MB, so a single segment cannot
 * fill a 50 MB slug. Spanning them with one wide afterSeq/beforeSeq would drag
 * in the un-indexed segments BETWEEN them — each a ~262 MB atomic download — so
 * instead each indexed segment is its own bounded snapshot and the budget is
 * carried across them. This is also the right shape for the browser: a slug is
 * a sequence of small, individually abortable downloads.
 */
const targets = indexed.slice(-12).reverse();
console.log(`  candidates    ${targets.length} newest indexed segments`);

// ── 2. the browser shims, against the real dictionary ────────────
console.log('\n═══ 3. the BROWSER shims (not node:zlib / node:crypto) ═══');
await zstd.init();
const dictRes = await fetch(`${SERVICE}/xrpc/network.bsky.jetstream.getZstdDictionary`);
console.log(`  dictionary    HTTP ${dictRes.status}, auth sent: no`);
const dict = new Uint8Array(await dictRes.arrayBuffer());
console.log(`  dictionary    ${n(dict.length)} bytes`);
const dctx = zstd.createDCtx();

let frames = 0, framesIn = 0, framesOut = 0;
const decompressor = {
  decompress(frame, maxDecodedBytes) {
    const out = zstd.decompressUsingDict(dctx, frame, dict);
    frames++; framesIn += frame.length; framesOut += out.length;
    if (maxDecodedBytes && out.length > maxDecodedBytes) {
      throw new Error(`decoded ${out.length} > cap ${maxDecodedBytes}`);
    }
    return out;
  },
};
// Prove the sync sha256 shim before handing it to the SDK.
const probe = sha256(new TextEncoder().encode('abc'));
const hex = [...probe].map((b) => b.toString(16).padStart(2, '0')).join('');
const KNOWN = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
console.log(`  sha256("abc") ${hex === KNOWN ? 'matches the NIST vector' : 'WRONG: ' + hex}`);

// ── 3. buy the slug ──────────────────────────────────────────────
console.log(`\n═══ 4. download, budget ${mb(BUDGET)}, prefetch buffer ${mb(BUF)} ═══`);
const rule = PRESETS[0];
const m = compile(rule);

let bytes = 0, requests = 0, scanned = 0, matched = 0, segmentsRead = 0;
let oldest = null, newest = null, yielded = 0;
const quota = {};
const shapes = new Map();
const kept = [];
const seen = new Set();
const t0 = Date.now();
let stopped = 'ran out of indexed segments';

for (const seg of targets) {
  if (bytes >= BUDGET) { stopped = `stopped at the ${mb(BUDGET)} budget`; break; }
  const ctl = new AbortController();
  let over = false;

  const js = new Jetstream({
    service: SERVICE,
    apiKey: KEY,
    decompressor,
    sha256,
    snapshotBufferBytes: BUF,
    blockConcurrency: 2,
    fetchImpl: async (input, opts) => {
      const res = await fetch(input, opts);
      requests++;
      for (const [k, v] of res.headers) if (k.startsWith('headwind-quota')) quota[k] = v;
      const len = Number(res.headers.get('content-length') || 0);
      if (len) {
        bytes += len;
        if (bytes >= BUDGET && !over) { over = true; ctl.abort(); }
      }
      return res;
    },
  });

  segmentsRead++;
  try {
    for await (const evt of js.snapshot({
      collections: ['app.bsky.feed.post'], kinds: ['commit'],
      afterSeq: seg.minSeq - 1, beforeSeq: seg.maxSeq, signal: ctl.signal,
    })) {
      yielded++;
      const c = evt.kind && evt.kind !== 'commit' ? null : evt.commit;
      const key = `${evt.kind ?? '?'}/${c?.operation ?? '?'}`;
      shapes.set(key, (shapes.get(key) || 0) + 1);
      if (!c || c.collection !== 'app.bsky.feed.post') continue;
      if (c.operation === 'delete') continue;
      const rec = c.record;
      if (!rec || typeof rec.text !== 'string') continue;
      scanned++;
      if (oldest == null || evt.seq < oldest) oldest = evt.seq;
      if (newest == null || evt.seq > newest) newest = evt.seq;
      const hits = m.why(rec);
      if (!hits.length) continue;
      // Dedup by at:// URI. The first successful run showed the same paper
      // twice; delivery is at-least-once and mirror accounts repost verbatim.
      const uri = `at://${evt.did}/${c.collection}/${c.rkey}`;
      if (seen.has(uri)) continue;
      seen.add(uri);
      matched++;
      if (kept.length < 25) kept.push({ text: rec.text.replace(/\s+/g, ' ').slice(0, 110), hits });
    }
  } catch (err) {
    if (over) { stopped = `stopped at the ${mb(BUDGET)} budget`; break; }
    console.error(`  segment ${seg.name} failed: ${err?.message || err}`);
  }
}

const secs = (Date.now() - t0) / 1000;
console.log(`  segments read ${segmentsRead} of ${targets.length}`);
console.log(`  events seen   ${n(yielded)}   shapes ${[...shapes.entries()].map(([k, v]) => `${k}:${v}`).join(' ')}`);
console.log(`  requests      ${n(requests)}`);
console.log(`  wire bytes    ${mb(bytes)}   ${(bytes / secs / 1048576).toFixed(1)} MB/s`);
console.log(`  zstd frames   ${n(frames)}   ${mb(framesIn)} in -> ${mb(framesOut)} out `
  + `(${framesIn ? (framesOut / framesIn).toFixed(1) : 0}x)`);
console.log(`  posts scanned ${n(scanned)}   in ${secs.toFixed(1)}s   (${n(Math.round(scanned / Math.max(secs, 0.1)))}/s)`);
console.log(`  seq range     ${oldest == null ? '—' : `${n(oldest)} .. ${n(newest)}`}`);
console.log(`  stopped       ${stopped}`);
console.log(`  quota headers ${JSON.stringify(quota)}`);

console.log(`\n═══ 5. the rule, over replayed archive data ═══`);
console.log(`  matched       ${n(matched)}  (${scanned ? (matched / scanned * 100).toFixed(3) : 0}% of posts)`);
console.log(`  bytes/match   ${matched ? mb(bytes / matched) : '—'}`);
for (const k of kept) console.log(`  · ${k.text}\n      ${k.hits.join(', ')}`);

if (!scanned) {
  console.error('\nZero posts decoded. That is a failure, not a rate of zero.');
  process.exit(1);
}
