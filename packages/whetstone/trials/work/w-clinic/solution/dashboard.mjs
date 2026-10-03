// dashboard.mjs — weekly wait-time summary for the front desk.
import { readFileSync } from 'node:fs';

export function parse(text) {
  const [head, ...lines] = text.trim().split('\n');
  const cols = head.split(',');
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
}

const minutes = (a, b) => (Date.parse(b.replace(' ', 'T') + 'Z') - Date.parse(a.replace(' ', 'T') + 'Z')) / 60000;

function weekOf(ts) {
  const d = new Date(ts.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // back to Monday
  return d.toISOString().slice(0, 10);
}

export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function summarize(rows) {
  const weeks = new Map();
  for (const r of rows) {
    const w = weekOf(r.signed_in);
    if (!weeks.has(w)) weeks.set(w, { visits: 0, waits: [] });
    const b = weeks.get(w);
    b.visits++;
    if (r.seen_at) b.waits.push(minutes(r.signed_in, r.seen_at));
  }
  return [...weeks].sort(([a], [b]) => (a < b ? -1 : 1)).map(([week, b]) => ({
    week, visits: b.visits, seen: b.waits.length, walkouts: b.visits - b.waits.length, median_wait_min: median(b.waits),
  }));
}

if (process.argv[2]) {
  for (const w of summarize(parse(readFileSync(process.argv[2], 'utf8')))) console.log(JSON.stringify(w));
}
