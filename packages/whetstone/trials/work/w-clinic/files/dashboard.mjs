// dashboard.mjs — weekly wait-time summary for the front desk.
import { readFileSync } from 'node:fs';

export function parse(text) {
  const [head, ...lines] = text.trim().split('\n');
  const cols = head.split(',');
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
}

const minutes = (a, b) => (Date.parse(b.replace(' ', 'T')) - Date.parse(a.replace(' ', 'T'))) / 60000;

function weekOf(ts) {
  const d = new Date(ts.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // back to the start of the week
  return d.toISOString().slice(0, 10);
}

export function median(xs) {
  const s = [...xs].sort();
  return s.length ? s[Math.floor(s.length / 2)] : null;
}

export function summarize(rows) {
  const weeks = new Map();
  for (const r of rows) {
    if (!r.seen_at) continue;
    const w = weekOf(r.signed_in);
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w).push(minutes(r.signed_in, r.seen_at));
  }
  return [...weeks].sort().map(([week, waits]) => ({
    week, visits: waits.length, seen: waits.length, walkouts: 0, median_wait_min: median(waits),
  }));
}

if (process.argv[2]) {
  for (const w of summarize(parse(readFileSync(process.argv[2], 'utf8')))) console.log(JSON.stringify(w));
}
