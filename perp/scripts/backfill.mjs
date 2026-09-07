#!/usr/bin/env node
// Backfill the two series the page draws.
//
//   1. BTC-USD spot candles from Coinbase Exchange  (public, no key, CORS *)
//   2. BTC perp hourly premium + funding from Hyperliquid (public, no key, CORS *)
//
// Both sources cap a single response, so both need pagination — that is most of
// what this file is. Output is column-oriented integer JSON in ../data/.
//
//   node scripts/backfill.mjs            # incremental: fetch only what's missing
//   node scripts/backfill.mjs --full     # ignore existing files, refetch everything
//
// Incremental is what the cron runs; --full is for when the encoding changes.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FULL = process.argv.includes('--full');
const HOUR = 3600e3, DAY = 86400e3;

// Hyperliquid BTC funding starts here; Coinbase BTC-USD starts 2015-07-20.
const HL_GENESIS = Date.UTC(2023, 4, 12);
const CB_GENESIS = Date.UTC(2015, 6, 20);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every request goes through here. Public endpoints rate-limit and occasionally
// drop a connection; without the retry a 3-year backfill fails about half the time.
async function req(url, opts = {}, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.status === 429) { await sleep(2000 * (i + 1)); continue; }
      const text = await r.text();
      if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 160)}`);
      return JSON.parse(text);
    } catch (e) {
      if (i === tries - 1) throw new Error(`${url} failed after ${tries}: ${e.message}`);
      await sleep(500 * 2 ** i);
    }
  }
}

const hl = (body) => req('https://api.hyperliquid.xyz/info', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

// ---------------------------------------------------------------- coinbase ---
// GET /products/BTC-USD/candles returns at most 300 aggregations, newest first,
// as [time, low, high, open, close, volume] with time in SECONDS.
const CB_MAX = 300;

async function coinbaseCandles(granularity, from, to) {
  const step = granularity * 1000;
  const out = new Map();
  // Walk forward in 300-candle windows.
  for (let cursor = from; cursor < to; cursor += step * CB_MAX) {
    const end = Math.min(cursor + step * CB_MAX, to);
    const url = `https://api.exchange.coinbase.com/products/BTC-USD/candles`
      + `?granularity=${granularity}`
      + `&start=${new Date(cursor).toISOString()}&end=${new Date(end).toISOString()}`;
    const rows = await req(url, { headers: { 'User-Agent': 'mino-perp-backfill/1.0' } });
    for (const [t, low, high, open, close] of rows) out.set(t * 1000, [open, high, low, close]);
    process.stdout.write(`\r  coinbase ${granularity}s: ${out.size} candles…`);
    await sleep(160); // stay well under the public rate limit
  }
  process.stdout.write('\n');
  return [...out.entries()].sort((a, b) => a[0] - b[0]);
}

// ------------------------------------------------------------- hyperliquid ---
// fundingHistory returns at most 500 rows from startTime, oldest first, with
// premium and fundingRate as decimal-string FRACTIONS (1e-4 == 1bp).
async function hyperliquidFunding(from, to) {
  const out = new Map();
  let cursor = from;
  while (cursor < to) {
    const page = await hl({ type: 'fundingHistory', coin: 'BTC', startTime: cursor });
    if (!page.length) break;
    for (const r of page) out.set(Math.round(r.time / HOUR) * HOUR, [+r.premium, +r.fundingRate]);
    const last = page.at(-1).time;
    if (last <= cursor) break; // no forward progress — we are at the head
    cursor = last + 1;
    process.stdout.write(`\r  hyperliquid funding: ${out.size} hours…`);
    await sleep(120);
  }
  process.stdout.write('\n');
  return [...out.entries()].sort((a, b) => a[0] - b[0]);
}

// ---------------------------------------------------------------- encoding ---
// Column arrays, integers only, timestamps delta-encoded against a base. A
// float-per-field object form of the hourly series is ~6x this on the wire.
function encodeCandles(rows) {
  const t0 = rows.length ? rows[0][0] : 0;
  const enc = { t0, dt: [], o: [], h: [], l: [], c: [] };
  let prev = t0;
  for (const [t, [o, h, l, c]] of rows) {
    enc.dt.push(t - prev); prev = t;
    enc.o.push(Math.round(o * 100)); enc.h.push(Math.round(h * 100));
    enc.l.push(Math.round(l * 100)); enc.c.push(Math.round(c * 100));
  }
  return enc; // prices are integer CENTS
}

function encodeFunding(rows) {
  const t0 = rows.length ? rows[0][0] : 0;
  const enc = { t0, dt: [], p: [], f: [] };
  let prev = t0;
  for (const [t, [p, f]] of rows) {
    enc.dt.push(t - prev); prev = t;
    enc.p.push(Math.round(p * 1e8)); // premium in units of 1e-8 (0.0001 bp)
    enc.f.push(Math.round(f * 1e8)); // funding  in units of 1e-8
  }
  return enc;
}

function decodeTimes(enc) {
  const out = []; let t = enc.t0;
  for (const d of enc.dt) { t += d; out.push(t); }
  return out;
}

// Merge freshly-fetched rows over whatever is already on disk. The last few
// candles/hours of a previous run are always refetched, because the most recent
// bucket was still open when we saved it.
function load(name) {
  const path = join(DIR, name);
  if (FULL || !existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function save(name, payload) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, name), JSON.stringify(payload));
  const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0);
  console.log(`  → data/${name}  ${kb} KB`);
}

async function series({ name, granularity, genesis, fetcher, encode, decodeRows }) {
  const existing = load(name);
  const now = Date.now();
  let rows = new Map();
  let from = genesis;

  if (existing?.dt?.length) {
    const times = decodeTimes(existing);
    rows = new Map(decodeRows(existing, times));
    // Refetch the trailing 3 buckets: the newest one was mid-formation last time.
    from = times.at(-1) - granularity * 3;
    console.log(`  resuming from ${new Date(from).toISOString()} (${times.length} on disk)`);
  }

  for (const [t, v] of await fetcher(from, now)) rows.set(t, v);
  const sorted = [...rows.entries()].sort((a, b) => a[0] - b[0]);
  save(name, { ...encode(sorted), source: name.startsWith('btc') ? 'coinbase' : 'hyperliquid', updated: new Date().toISOString() });
  return sorted;
}

const candleRows = (enc, times) => times.map((t, i) => [t, [enc.o[i] / 100, enc.h[i] / 100, enc.l[i] / 100, enc.c[i] / 100]]);
const fundingRows = (enc, times) => times.map((t, i) => [t, [enc.p[i] / 1e8, enc.f[i] / 1e8]]);

console.log(FULL ? 'FULL backfill\n' : 'incremental backfill\n');

console.log('BTC-USD spot, daily (Coinbase, from 2015-07-20):');
await series({ name: 'btc-1d.json', granularity: DAY, genesis: CB_GENESIS,
  fetcher: (f, t) => coinbaseCandles(86400, f, t), encode: encodeCandles, decodeRows: candleRows });

console.log('\nBTC-USD spot, 6-hourly (Coinbase, from 2021):');
await series({ name: 'btc-6h.json', granularity: 6 * HOUR, genesis: Date.UTC(2021, 0, 1),
  fetcher: (f, t) => coinbaseCandles(21600, f, t), encode: encodeCandles, decodeRows: candleRows });

console.log('\nBTC-USD spot, hourly (Coinbase, from HL genesis so the two series overlap):');
await series({ name: 'btc-1h.json', granularity: HOUR, genesis: HL_GENESIS,
  fetcher: (f, t) => coinbaseCandles(3600, f, t), encode: encodeCandles, decodeRows: candleRows });

console.log('\nHyperliquid BTC perp premium + funding, hourly (from 2023-05-12):');
const f = await series({ name: 'hl-btc-funding.json', granularity: HOUR, genesis: HL_GENESIS,
  fetcher: hyperliquidFunding, encode: encodeFunding, decodeRows: fundingRows });

console.log(`\ndone — funding spans ${new Date(f[0][0]).toISOString().slice(0,10)} → ${new Date(f.at(-1)[0]).toISOString().slice(0,10)}, ${f.length} hours`);
