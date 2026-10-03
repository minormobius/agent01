// tape.mjs — 1-minute candles for the plans gate, cached so a rerun measures
// the same tape. Node only (fs). Hyperliquid keeps ~3.5-5 days of 1m bars.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export async function loadTape(coin, { refresh = false } = {}) {
  const f = join(here, 'fixtures', `candles-${coin.toLowerCase()}-1m.json`);
  if (!refresh && existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const end = Date.now(), start = end - 6 * 864e5;
  const res = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval: '1m', startTime: start, endTime: end } }) });
  if (!res.ok) throw new Error(`candleSnapshot ${coin}: HTTP ${res.status}`);
  const raw = await res.json();
  const tape = { coin, interval: '1m', source: 'api.hyperliquid.xyz candleSnapshot', fetched: new Date().toISOString(), bars: raw.map((b) => [b.t, +b.o, +b.h, +b.l, +b.c]) };
  writeFileSync(f, JSON.stringify(tape));
  return tape;
}
export const toBars = (tape) => tape.bars.map(([t, o, h, l, c]) => ({ t, o, h, l, c }));

