// palm/build-baseline.mjs — build the reference distribution. NODE ONLY, RUN BY HAND.
//
// A raw reading means nothing on its own. "Your burstiness is 0.70" is not a
// fact anyone can act on, and calibrating it to an absolute probability of
// machine authorship would need the paired-corpus training loop that commercial
// detectors run — which we do not have and should not pretend to. So the dial is
// a COMPARISON: where you sit among other real accounts.
//
// The pool is drawn from the seed account's own reply partners. That is a
// deliberate bias and worth stating plainly: it is a sample of people who post
// enough to be replied to repeatedly, not a sample of Bluesky. It makes the
// reading "among the people you talk to", which is the only population the card
// can honestly claim to have measured.
//
// Every pool member is measured EXACTLY as the subject is — full repo via CAR,
// same axis code, same fixed budgets — because a percentile against a
// differently-computed population is a lie with a number attached.
//
//   node b/palm/build-baseline.mjs <posts.json> [--out b/palm/baseline.json] [--pool 80]
//
// Output is a small quantile table, committed. The browser never does any of this.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createReader } from './car-stream.js';
import { readings, AXES } from './axes.js';

const args = process.argv.slice(2);
const postsPath = args[0];
const out = argOf('--out') || 'b/palm/baseline.json';
const poolSize = parseInt(argOf('--pool') || '80', 10);
const concurrency = parseInt(argOf('--concurrency') || '5', 10);
const MAX_CAR = 250 * 1024 * 1024;       // refuse a repo too big to stream politely

function argOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
if (!postsPath) {
  console.error('usage: node b/palm/build-baseline.mjs <posts.json> [--out f] [--pool n]');
  process.exit(2);
}

// ── the pool ─────────────────────────────────────────────────────────────────
const seedPosts = JSON.parse(readFileSync(postsPath, 'utf8'));
const freq = new Map();
for (const p of seedPosts) if (p.replyTo) freq.set(p.replyTo, (freq.get(p.replyTo) || 0) + 1);
const candidates = [...freq].sort((a, b) => b[1] - a[1]).map(([did]) => did);
console.log(`${candidates.length} reply partners; taking up to ${poolSize} that qualify`);

// ── one account ──────────────────────────────────────────────────────────────
async function resolvePds(did) {
  const url = did.startsWith('did:plc:')
    ? `https://plc.directory/${did}`
    : `https://${did.slice(8).replace(/:/g, '/')}/.well-known/did.json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`plc ${r.status}`);
  const doc = await r.json();
  const svc = (doc.service || []).find((s) => s.type === 'AtprotoPersonalDataServer' || s.id === '#atproto_pds');
  if (!svc) throw new Error('no pds');
  return svc.serviceEndpoint;
}

// Pass --cache <dir> and each account's reduced posts are kept on disk. The
// download is the entire cost of this script; changing an axis and re-running
// should not pay it again. Reduced posts only — the CARs are never kept.
const cacheDir = argOf('--cache');
if (cacheDir && !existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
const cachePath = (did) => `${cacheDir}/${did.replace(/[^a-z0-9]/gi, '_')}.json`;

async function fetchPosts(did) {
  if (cacheDir && existsSync(cachePath(did))) {
    const c = JSON.parse(readFileSync(cachePath(did), 'utf8'));
    return { posts: c.posts, mb: c.mb, cached: true };
  }
  const pds = await resolvePds(did);
  const res = await fetch(`${pds.replace(/\/$/, '')}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`);
  if (!res.ok) throw new Error(`getRepo ${res.status}`);

  const reader = createReader();
  let bytes = 0;
  for await (const chunk of res.body) {
    bytes += chunk.length;
    if (bytes > MAX_CAR) throw new Error('repo too large');
    reader.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length));
  }
  const { posts } = reader.finish();
  const mb = +(bytes / 1048576).toFixed(1);
  if (cacheDir) writeFileSync(cachePath(did), JSON.stringify({ mb, posts }));
  return { posts, mb, cached: false };
}

async function measure(did) {
  const { posts, mb, cached } = await fetchPosts(did);
  if (posts.length < 500) throw new Error(`only ${posts.length} posts`);
  const r = readings(posts, did);
  return { did, posts: posts.length, mb, cached, axes: r.axes, meta: r.meta };
}

// ── run the pool ─────────────────────────────────────────────────────────────
const results = [];
let cursor = 0, done = 0;

async function worker() {
  for (;;) {
    if (results.length >= poolSize || cursor >= candidates.length) return;
    const did = candidates[cursor++];
    try {
      const r = await measure(did);
      // Every axis must have fired and neither budgeted axis may be short, or
      // this account is measuring something different from the others.
      const usable = AXES.every((a) => r.axes[a.key].raw !== null)
        && !r.axes.lexicon.short && !r.axes.drift.short;
      if (usable) { results.push(r); console.log(`  ✓ ${results.length}/${poolSize} ${did} ${r.posts} posts ${r.mb}MB`); }
      else console.log(`  · skip ${did} (too little to measure)`);
    } catch (e) {
      console.log(`  · skip ${did} (${e.message})`);
    }
    done++;
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
console.log(`measured ${results.length} accounts out of ${done} attempted`);
if (results.length < 20) { console.error('pool too small to make a quantile table'); process.exit(1); }

// ── quantiles ────────────────────────────────────────────────────────────────
// 101 points, so a browser lookup is an index rather than an interpolation
// search. Small enough to ship: six axes x 101 floats.
const quantiles = {};
for (const a of AXES) {
  const xs = results.map((r) => r.axes[a.key].raw).filter((x) => x !== null).sort((x, y) => x - y);
  quantiles[a.key] = Array.from({ length: 101 }, (_, i) => {
    const pos = (i / 100) * (xs.length - 1);
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return +(xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)).toFixed(6);
  });
}

// ── the composite table ──────────────────────────────────────────────────────
// A SECOND pass, and the reason is in baseline.js: the mean of six near-uniform
// percentiles clusters hard around 50, so without this the dial only ever uses
// its middle and two of the seven bands are unreachable. Each pool member is
// scored against the per-axis tables just built, and the distribution of THEIR
// means becomes the table the composite is read against.
//
// It is deliberately circular — the pool is normalised against itself — which is
// exactly what makes the output uniform. Anything else would need a second
// population nobody has.
const composites = [];
for (const r of results) {
  const usable = AXES
    .map((a) => quantilePct(r.axes[a.key].raw, quantiles[a.key]))
    .filter((p) => p !== null);
  if (usable.length) composites.push(usable.reduce((s, p) => s + p, 0) / usable.length);
}
composites.sort((a, b) => a - b);
quantiles.__composite = Array.from({ length: 101 }, (_, i) => {
  const pos = (i / 100) * (composites.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return +(composites[lo] + (composites[hi] - composites[lo]) * (pos - lo)).toFixed(6);
});

function quantilePct(raw, table) {
  if (raw === null || raw === undefined) return null;
  if (raw <= table[0]) return 0;
  if (raw >= table[100]) return 100;
  for (let i = 1; i <= 100; i++) {
    if (raw <= table[i]) {
      const span = table[i] - table[i - 1];
      return (i - 1) + (span === 0 ? 0 : (raw - table[i - 1]) / span);
    }
  }
  return 100;
}

// ── how orthogonal are these really? ─────────────────────────────────────────
// "Six orthogonal readings" is a claim, so measure it rather than assert it.
// Pearson r between every pair of axes across the pool, shipped with the table
// so the surface can be honest about which lines are secretly the same line.
const corr = {};
for (let i = 0; i < AXES.length; i++) {
  for (let j = i + 1; j < AXES.length; j++) {
    const a = AXES[i].key, b = AXES[j].key;
    const xs = results.map((r) => r.axes[a].raw), ys = results.map((r) => r.axes[b].raw);
    const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
    const my = ys.reduce((s, y) => s + y, 0) / ys.length;
    let num = 0, dx = 0, dy = 0;
    for (let k = 0; k < xs.length; k++) {
      num += (xs[k] - mx) * (ys[k] - my);
      dx += (xs[k] - mx) ** 2; dy += (ys[k] - my) ** 2;
    }
    corr[`${a}~${b}`] = +(num / Math.sqrt(dx * dy)).toFixed(3);
  }
}

writeFileSync(out, JSON.stringify({
  builtFrom: 'reply partners of the seed account',
  n: results.length,
  medianPosts: results.map((r) => r.posts).sort((a, b) => a - b)[results.length >> 1],
  quantiles,
  correlations: corr,
}, null, 1) + '\n');

console.log(`\nwrote ${out} (n=${results.length})`);
console.log('axis correlations (|r| > 0.7 means two lines are one line):');
for (const [k, v] of Object.entries(corr).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))) {
  console.log(`  ${Math.abs(v) > 0.7 ? '!' : ' '} ${k.padEnd(20)} ${v >= 0 ? ' ' : ''}${v}`);
}
