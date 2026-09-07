#!/usr/bin/env node
// Stream Binance aggTrades day by day, reduce each day to 288 five-minute slots
// of microstructure features, throw the raw away.
//
//   node lab/microstructure.mjs --days 365 --end 2026-08-25
//
// One day of BTCUSDT perp aggTrades is ~1.6M events / 134MB of CSV; a year is
// 8.4GB. Nothing is kept: each day is downloaded, reduced, and deleted, so peak
// disk stays around 50MB regardless of how many days are requested.
//
// aggTrades is the right feed for this. It carries `is_buyer_maker`, which
// gives TRUE trade signing — no Lee-Ready tick-rule inference — and that is
// what makes order-flow imbalance and Kyle's lambda honest rather than guessed.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync, existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = join(HERE, '.tmp');
const OUT = join(HERE, 'micro.json');
const SLOT_MIN = 5, SLOTS = (24 * 60) / SLOT_MIN;   // 288 five-minute slots

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = +arg('days', 365);
const END = arg('end', '2026-08-25');
const MARKET = arg('market', 'futures/um');          // or 'spot'
const SYMBOL = arg('symbol', 'BTCUSDT');

export const FEATURES = [
  'logcount',     // trade arrivals
  'logvolume',    // base volume
  'ofi',          // order-flow imbalance, signed by the maker flag
  'ofiDollar',    // same, dollar weighted
  'rvTick',       // realised vol from tick returns (includes bid-ask bounce)
  'rollSpread',   // Roll's implied spread from serial covariance of price changes
  'kyleLambda',   // price impact per unit signed volume
  'meanSize',     // mean trade size
  'sizeDisp',     // dispersion of trade size (sd/mean) — few big or many small
  'largeFrac',    // share of volume in trades >= 1 BTC
  'burstiness',   // CV of inter-arrival times; 1 = Poisson, >1 = clustered
  'ret',          // slot log return
  'amihud',       // |return| per dollar traded — illiquidity
];

function newSlot() {
  return { n: 0, vol: 0, dollar: 0, buyVol: 0, sellVol: 0, buyDol: 0, sellDol: 0,
           first: 0, last: 0, sumR2: 0, prevP: 0, prevD: 0, sDD: 0, nDD: 0,
           sx: 0, sy: 0, sxy: 0, sxx: 0, nk: 0,
           sSize: 0, sSize2: 0, bigVol: 0, prevT: 0, sGap: 0, sGap2: 0, nGap: 0 };
}

function finish(s) {
  if (!s.n) return null;
  const flow = s.buyVol + s.sellVol, flowD = s.buyDol + s.sellDol;
  const meanSize = s.vol / s.n;
  const varSize = Math.max(0, s.sSize2 / s.n - meanSize ** 2);
  const covDD = s.nDD > 1 ? s.sDD / s.nDD : 0;      // E[dP_t * dP_{t-1}]
  const meanGap = s.nGap ? s.sGap / s.nGap : 0;
  const varGap = s.nGap > 1 ? Math.max(0, s.sGap2 / s.nGap - meanGap ** 2) : 0;
  const den = s.nk * s.sxx - s.sx * s.sx;
  const ret = s.first > 0 && s.last > 0 ? Math.log(s.last / s.first) : 0;
  return {
    logcount:  Math.log1p(s.n),
    logvolume: Math.log1p(s.vol),
    ofi:       flow ? (s.buyVol - s.sellVol) / flow : 0,
    ofiDollar: flowD ? (s.buyDol - s.sellDol) / flowD : 0,
    rvTick:    Math.sqrt(s.sumR2),
    // Roll: spread = 2*sqrt(-cov) when the covariance is negative, which is the
    // bid-ask bounce. A positive covariance means trending, not spread — 0 there.
    rollSpread: covDD < 0 ? 2 * Math.sqrt(-covDD) : 0,
    kyleLambda: Math.abs(den) > 1e-12 ? (s.nk * s.sxy - s.sx * s.sy) / den : 0,
    meanSize,
    sizeDisp:  meanSize > 0 ? Math.sqrt(varSize) / meanSize : 0,
    largeFrac: s.vol > 0 ? s.bigVol / s.vol : 0,
    burstiness: meanGap > 0 ? Math.sqrt(varGap) / meanGap : 0,
    ret,
    amihud:    s.dollar > 0 ? Math.abs(ret) / Math.log1p(s.dollar) : 0,
  };
}

async function processDay(dateStr) {
  const url = `https://data.binance.vision/data/${MARKET}/daily/aggTrades/${SYMBOL}/${SYMBOL}-aggTrades-${dateStr}.zip`;
  mkdirSync(TMP, { recursive: true });
  const zip = join(TMP, 'd.zip');
  const dl = spawn('bash', ['-c', `curl -sfS --max-time 600 -o ${zip} '${url}'`]);
  const code = await new Promise((r) => dl.on('close', r));
  if (code !== 0) return null;

  const slots = Array.from({ length: SLOTS }, newSlot);
  const proc = spawn('bash', ['-c', `unzip -p ${zip}`]);
  const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });

  let dayStart = null;
  for await (const line of rl) {
    if (!line) continue;
    const c = line.split(',');
    if (c.length < 7) continue;
    const price = +c[1];
    if (!(price > 0)) continue;                    // skips a header row too
    const qty = +c[2];
    let t = +c[5];
    if (t > 1e15) t = Math.floor(t / 1000);        // 2025+ files are MICROseconds
    // is_buyer_maker true  => the buyer was passive => SELLER-initiated trade
    const sellInit = c[6][0] === 'T' || c[6][0] === 't';

    if (dayStart === null) dayStart = Math.floor(t / 86400000) * 86400000;
    const si = Math.min(SLOTS - 1, Math.max(0, Math.floor((t - dayStart) / (SLOT_MIN * 60000))));
    const s = slots[si];
    const dollar = price * qty;

    s.n++; s.vol += qty; s.dollar += dollar;
    if (sellInit) { s.sellVol += qty; s.sellDol += dollar; } else { s.buyVol += qty; s.buyDol += dollar; }
    if (!s.first) s.first = price;
    s.last = price;
    s.sSize += qty; s.sSize2 += qty * qty;
    if (qty >= 1) s.bigVol += qty;

    if (s.prevP) {
      const r = Math.log(price / s.prevP);
      s.sumR2 += r * r;
      const dP = price - s.prevP;
      if (s.prevD !== 0) { s.sDD += dP * s.prevD; s.nDD++; }
      s.prevD = dP;
      const sq = sellInit ? -qty : qty;            // Kyle: dP on signed volume
      s.sx += sq; s.sy += dP; s.sxy += sq * dP; s.sxx += sq * sq; s.nk++;
    }
    s.prevP = price;
    if (s.prevT) { const g = t - s.prevT; s.sGap += g; s.sGap2 += g * g; s.nGap++; }
    s.prevT = t;
  }
  await new Promise((r) => proc.on('close', r));
  rmSync(zip, { force: true });
  return { date: dateStr, slots: slots.map(finish) };
}

// ---- resumable driver -------------------------------------------------------
const store = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { FEATURES, market: MARKET, symbol: SYMBOL, days: {} };
const endMs = Date.parse(END + 'T00:00:00Z');
const wanted = Array.from({ length: DAYS }, (_, i) => new Date(endMs - (DAYS - 1 - i) * 86400000).toISOString().slice(0, 10));
const todo = wanted.filter((d) => !store.days[d]);
console.log(`${MARKET} ${SYMBOL} aggTrades -> ${SLOTS} x ${SLOT_MIN}min slots`);
console.log(`${wanted.length} days requested, ${todo.length} to fetch\n`);

let done = 0, missing = 0, t0 = Date.now();
for (const d of todo) {
  const r = await processDay(d);
  done++;
  if (!r) { missing++; store.days[d] = null; }
  else store.days[d] = r.slots.map((s) => s && FEATURES.map((f) => s[f]));
  if (done % 10 === 0 || done === todo.length) {
    const rate = done / ((Date.now() - t0) / 1000);
    process.stdout.write(`\r  ${done}/${todo.length} days  (${rate.toFixed(2)}/s, ~${((todo.length - done) / rate / 60).toFixed(1)}min left, ${missing} missing)   `);
    writeFileSync(OUT, JSON.stringify(store));
  }
}
writeFileSync(OUT, JSON.stringify(store));
rmSync(TMP, { recursive: true, force: true });
const have = Object.values(store.days).filter(Boolean).length;
console.log(`\n\ndone — ${have} days with data, ${Object.values(store.days).filter((v) => !v).length} missing`);
