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
const SEQ_BACK = Math.max(1, Number(process.env.SEQ_BACK) || 3_400_000);

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
const afterSeq = TIP - SEQ_BACK;

console.log('\n═══ 2. plan the window before paying for it ═══');
const p = await plan({ collections: ['app.bsky.feed.post'], kinds: ['commit'], afterSeq });
let blocks = 0, whole = 0;
for (const s of p.segments || []) {
  if (s.mode === 'blocks') for (const r of s.blocks || []) blocks += r.last - r.first + 1;
  else whole++;
}
console.log(`  window        afterSeq ${n(afterSeq)} (${n(SEQ_BACK)} back from the tip)`);
console.log(`  segments      ${p.segments.length}   indexed blocks ${n(blocks)}   whole segments ${whole}`);
console.log(`  stats         ${JSON.stringify(p.stats || {})}`);

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
console.log(`\n═══ 4. download, budget ${mb(BUDGET)} ═══`);
const rule = PRESETS[0];
const m = compile(rule);
const budgetCtl = new AbortController();

let bytes = 0, overBudget = false, requests = 0;
const quota = {};
const js = new Jetstream({
  service: SERVICE,
  apiKey: KEY,
  decompressor,
  sha256,
  fetch: async (input, opts) => {
    const res = await fetch(input, opts);
    requests++;
    for (const [k, v] of res.headers) if (k.startsWith('headwind-quota')) quota[k] = v;
    const len = Number(res.headers.get('content-length') || 0);
    if (len) {
      bytes += len;
      if (bytes >= BUDGET && !overBudget) { overBudget = true; budgetCtl.abort(); }
    }
    return res;
  },
});

let scanned = 0, matched = 0, oldest = null, newest = null, stopped = 'reached the end of the window';
const kept = [];
const t0 = Date.now();

try {
  for await (const evt of js.snapshot({
    collections: ['app.bsky.feed.post'], kinds: ['commit'], afterSeq, signal: budgetCtl.signal,
  })) {
    if (evt.collection !== 'app.bsky.feed.post') continue;
    if (evt.operation === 'delete') continue;
    const rec = evt.record;
    if (!rec || typeof rec.text !== 'string') continue;
    scanned++;
    if (oldest == null || evt.seq < oldest) oldest = evt.seq;
    if (newest == null || evt.seq > newest) newest = evt.seq;
    const hits = m.why(rec);
    if (hits.length) {
      matched++;
      if (kept.length < 20) kept.push({ text: rec.text.replace(/\s+/g, ' ').slice(0, 120), hits, did: evt.did });
    }
  }
} catch (err) {
  if (overBudget) stopped = `stopped at the ${mb(BUDGET)} budget`;
  else { console.error('\nSNAPSHOT FAILED:', err?.message || err); console.error(err?.stack); process.exit(1); }
}

const secs = (Date.now() - t0) / 1000;
console.log(`  requests      ${n(requests)}`);
console.log(`  wire bytes    ${mb(bytes)}   ${(bytes / secs / 1048576).toFixed(1)} MB/s`);
console.log(`  zstd frames   ${n(frames)}   ${mb(framesIn)} in -> ${mb(framesOut)} out `
  + `(${framesIn ? (framesOut / framesIn).toFixed(1) : 0}x)`);
console.log(`  posts scanned ${n(scanned)}   in ${secs.toFixed(0)}s   (${n(Math.round(scanned / secs))}/s)`);
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
