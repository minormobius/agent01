// tape.mjs — 1-minute candles for the plans gate, cached so a rerun measures
// the same tape. Node only (fs). Hyperliquid keeps ~3.5-5 days of 1m bars.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// Hyperliquid keeps the last ~5000 bars of a series: 1m ≈ 3.5 days, 4h ≈ 2.3 years.
const MIN = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440 };
export async function loadTape(coin, { refresh = false, interval = '1m' } = {}) {
  const f = join(here, 'fixtures', `candles-${coin.toLowerCase()}-${interval}.json`);
  if (!refresh && existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const end = Date.now(), start = end - 5100 * MIN[interval] * 6e4;
  const res = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval, startTime: start, endTime: end } }) });
  if (!res.ok) throw new Error(`candleSnapshot ${coin}: HTTP ${res.status}`);
  const raw = await res.json();
  const tape = { coin, interval, source: 'api.hyperliquid.xyz candleSnapshot', fetched: new Date().toISOString(), bars: raw.map((b) => [b.t, +b.o, +b.h, +b.l, +b.c]) };
  writeFileSync(f, JSON.stringify(tape));
  return tape;
}
export const toBars = (tape) => { const b = tape.bars.map(([t, o, h, l, c]) => ({ t, o, h, l, c })); b.barMin = MIN[tape.interval || '1m']; return b; };


// Hourly funding, summed into the bars of a tape: fund[i] = the funding a long
// paid over bar i, in bp (negative = longs were paid). fundingHistory returns
// the first 500 prints from startTime, so it is walked FORWARD (walking back
// returns the oldest window and reports it as current: a mistake made once).
export async function loadFunding(coin, bars, { refresh = false } = {}) {
  const f = join(here, 'fixtures', `funding-${coin.toLowerCase()}-${bars.barMin === 240 ? '4h' : bars.barMin + 'm'}.json`);
  if (!refresh && existsSync(f)) return JSON.parse(readFileSync(f, 'utf8')).fund;
  const prints = await fundingPrints(coin, bars);
  const ms = bars.barMin * 6e4, idx = new Map(bars.map((b, i) => [b.t, i])), fund = new Array(bars.length).fill(0);
  for (const p of prints) { const i = idx.get(Math.floor((p.time - 1) / ms) * ms); if (i != null) fund[i] += +p.fundingRate * 1e4; }
  writeFileSync(f, JSON.stringify({ coin, source: 'api.hyperliquid.xyz fundingHistory, summed per bar, bp a long pays', fetched: new Date().toISOString(), prints: prints.length, fund: fund.map((x) => +x.toFixed(4)) }));
  return fund;
}

async function fundingPrints(coin, bars) {
  const prints = [];
  let t = bars[0].t;
  const end = bars.at(-1).t + bars.barMin * 6e4;
  for (let guard = 0; guard < 400 && t < end; guard++) {
    const res = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'fundingHistory', coin, startTime: t }) });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 3000)); continue; }
    const page = await res.json();
    if (!page.length) break;
    prints.push(...page);
    t = page.at(-1).time + 1;
    if (page.length < 500) break;
    await new Promise((r) => setTimeout(r, 120));
  }
  return prints;
}
// The perp's premium over its oracle (a spot index), the last print in each
// bar, in bp: a proxy for the basis a hedged carry trade is exposed to. A bar
// with no print carries the last value forward.
export async function loadPremium(coin, bars, { refresh = false } = {}) {
  const f = join(here, 'fixtures', `premium-${coin.toLowerCase()}-${bars.barMin === 240 ? '4h' : bars.barMin + 'm'}.json`);
  if (!refresh && existsSync(f)) return JSON.parse(readFileSync(f, 'utf8')).prem;
  const prints = await fundingPrints(coin, bars);
  const ms = bars.barMin * 6e4, idx = new Map(bars.map((b, i) => [b.t, i])), prem = new Array(bars.length).fill(null);
  for (const p of prints) { const i = idx.get(Math.floor((p.time - 1) / ms) * ms); if (i != null) prem[i] = +p.premium * 1e4; }
  for (let i = 0; i < prem.length; i++) if (prem[i] == null) prem[i] = i ? prem[i - 1] : 0;
  writeFileSync(f, JSON.stringify({ coin, source: 'api.hyperliquid.xyz fundingHistory premium, last print per bar, bp', fetched: new Date().toISOString(), prints: prints.length, prem: prem.map((x) => +x.toFixed(3)) }));
  return prem;
}
