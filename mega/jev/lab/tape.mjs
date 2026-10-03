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

