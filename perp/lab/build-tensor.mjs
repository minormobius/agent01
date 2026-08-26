#!/usr/bin/env node
// Build the killifish-shaped tensor for BTC: features x hour-of-day x day.
//
//   node lab/build-tensor.mjs        # writes lab/tensor.json (gitignored, ~30MB)
//
// Hyperliquid's candleSnapshot retains only ~5000 candles PER INTERVAL whatever
// the interval (1h reaches back ~7 months, 1d covers everything), so hourly
// OHLCV over the full span has to come from Coinbase. fundingHistory has no such
// cap and paginates back to 2023-05-12, which sets the tensor's start.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOUR = 3600e3, DAY = 86400e3;
const START = Date.UTC(2023, 4, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(u, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'mino-perp-lab/1.0' } });
      if (r.status === 429) { await sleep(1500 * (i + 1)); continue; }
      const t = await r.text();
      if (!r.ok) throw new Error(t.slice(0, 120));
      return JSON.parse(t);
    } catch (e) { if (i === tries - 1) throw e; await sleep(400 * 2 ** i); }
  }
}

const CANDLES = join(HERE, 'cb-1h-ohlcv.json');
let cb;
if (existsSync(CANDLES)) cb = JSON.parse(readFileSync(CANDLES, 'utf8'));
else {
  const out = new Map();
  for (let c = START; c < Date.now(); c += HOUR * 300) {      // Coinbase caps at 300
    const e = Math.min(c + HOUR * 300, Date.now());
    const rows = await req(`https://api.exchange.coinbase.com/products/BTC-USD/candles`
      + `?granularity=3600&start=${new Date(c).toISOString()}&end=${new Date(e).toISOString()}`);
    for (const [t, low, high, open, close, vol] of rows) out.set(t * 1000, [open, high, low, close, vol]);
    process.stdout.write(`\r  coinbase ${out.size} hours…`);
    await sleep(150);
  }
  cb = [...out.entries()].sort((a, b) => a[0] - b[0]);
  writeFileSync(CANDLES, JSON.stringify(cb));
  console.log('');
}

// premium/funding come from the surface's own committed series
const dec = (e) => { let t = e.t0; const o = []; for (const d of e.dt) { t += d; o.push(t); } return o; };
const fj = JSON.parse(readFileSync(join(HERE, '..', 'data', 'hl-btc-funding.json'), 'utf8'));
const ft = dec(fj);
const prem = new Map(ft.map((t, i) => [t, fj.p[i] / 1e8]));
const fund = new Map(ft.map((t, i) => [t, fj.f[i] / 1e8]));

// Seven per-hour measurements. `ret` and `closepos` are directional; the rest
// are activity. That split turns out to matter — see README.
export const FEAT = ['ret', 'absret', 'parkinson', 'logvol', 'closepos', 'premium', 'funding'];

const rows = [];
for (let i = 1; i < cb.length; i++) {
  const [t, [o, h, l, c, v]] = cb[i], prevC = cb[i - 1][1][3];
  if (cb[i][0] - cb[i - 1][0] !== HOUR) continue;
  if (!(o > 0 && h > 0 && l > 0 && c > 0 && prevC > 0 && v >= 0)) continue;
  const p = prem.get(t), f = fund.get(t);
  if (p === undefined || f === undefined) continue;
  rows.push({ t,
    ret: Math.log(c / prevC),
    absret: Math.abs(Math.log(c / prevC)),
    parkinson: Math.log(h / l),
    logvol: Math.log1p(v),
    closepos: h > l ? (c - l) / (h - l) - 0.5 : 0,
    premium: p, funding: f });
}

const byDay = new Map();
for (const r of rows) {
  const d = Math.floor(r.t / DAY);
  if (!byDay.has(d)) byDay.set(d, new Array(24).fill(null));
  byDay.get(d)[new Date(r.t).getUTCHours()] = r;
}
const dayKeys = [...byDay.keys()].sort((a, b) => a - b).filter((d) => byDay.get(d).every(Boolean));

writeFileSync(join(HERE, 'tensor.json'), JSON.stringify({ FEAT, rows }));
console.log(`${rows.length} aligned hours; ${dayKeys.length} complete days `
  + `(${new Date(dayKeys[0] * DAY).toISOString().slice(0, 10)} -> ${new Date(dayKeys.at(-1) * DAY).toISOString().slice(0, 10)})`);
console.log('wrote lab/tensor.json');
