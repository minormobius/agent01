// days/calendar.js — the grid, the levels, the streaks, and "who were they on
// that day". Pure: no DOM, no network. days.selftest.mjs holds it to answers.

export const METRICS = {
  all:     { label: 'everything', cols: null },
  posts:   { label: 'posts',      cols: ['app.bsky.feed.post'] },
  likes:   { label: 'likes',      cols: ['app.bsky.feed.like'] },
  reposts: { label: 'reposts',    cols: ['app.bsky.feed.repost'] },
  follows: { label: 'follows',    cols: ['app.bsky.graph.follow'] },
};

/** One day's number under a metric. */
export function countFor(row, metric = 'all') {
  if (!row) return 0;
  const cols = METRICS[metric]?.cols;
  let n = 0;
  if (!cols) { for (const k in row) n += row[k]; return n; }
  for (const c of cols) n += row[c] || 0;
  return n;
}

// Dates are handled as local calendar days, 'YYYY-MM-DD', and walked with
// Date's own day arithmetic so a daylight-saving change never skips or doubles
// a square.
const parse = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); };
export const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
export const addDays = (d, n) => { const x = parse(d); x.setDate(x.getDate() + n); return fmt(x); };
export const weekday = (d) => parse(d).getDay();          // 0 = Sunday, as GitHub draws it

/**
 * One grid per calendar year, newest year first, GitHub's shape: columns are
 * weeks starting Sunday, rows are weekdays. Only days inside [from, to] get a
 * cell; the rest of the first and last weeks are left blank rather than shown
 * as zero, because "before the account existed" is not "a quiet day".
 * @returns [{ year, weeks, cells: [{ day, col, row, n }], months: [{ label, col }] }]
 */
export function yearGrids(days, from, to, metric = 'all') {
  const out = [];
  const y0 = Number(from.slice(0, 4)), y1 = Number(to.slice(0, 4));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let y = y1; y >= y0; y--) {
    const jan1 = `${y}-01-01`;
    const lead = weekday(jan1);                          // blank cells before Jan 1 in week 0
    const cells = [], months = [];
    let d = jan1, i = 0;
    while (d.slice(0, 4) === String(y)) {
      const col = Math.floor((i + lead) / 7), row = (i + lead) % 7;
      if (d.endsWith('-01')) months.push({ label: MONTHS[Number(d.slice(5, 7)) - 1], col });
      if (d >= from && d <= to) cells.push({ day: d, col, row, n: countFor(days.get(d), metric) });
      d = addDays(d, 1); i++;
    }
    out.push({ year: y, weeks: Math.floor((i - 1 + lead) / 7) + 1, cells, months });
  }
  return out;
}

/**
 * Colour levels 0–4, like GitHub. Thresholds are quartiles of the ACTIVE days
 * (zero days excluded), so one viral day does not wash every other day out to
 * level 1, and a quiet account still uses the whole ramp.
 */
export function levels(days, metric = 'all') {
  const vals = [];
  for (const row of days.values()) { const n = countFor(row, metric); if (n > 0) vals.push(n); }
  vals.sort((a, b) => a - b);
  // nearest-rank quantile: with floor(p·n) the top cut landed ON the maximum
  // for small n, so a quiet account's busiest day never reached the top level
  const q = (p) => (vals.length ? vals[Math.max(0, Math.ceil(p * vals.length) - 1)] : 0);
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const max = vals.length ? vals[vals.length - 1] : 0;
  return {
    cuts, max,
    // the busiest day is always the darkest square, stated as a rule: with a
    // handful of active days every quartile cut can sit on the maximum
    level: (n) => (n <= 0 ? 0 : n >= max ? 4 : n <= cuts[0] ? 1 : n <= cuts[1] ? 2 : n <= cuts[2] ? 3 : 4),
  };
}

/** Totals, busiest day, streaks — the summary line, GitHub-style. */
export function summary(days, from, to, metric = 'all', today = to) {
  let total = 0, active = 0, busiest = null, longest = 0, run = 0, longestEnd = null;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const n = countFor(days.get(d), metric);
    total += n;
    if (n > 0) {
      active++; run++;
      if (run > longest) { longest = run; longestEnd = d; }
      if (!busiest || n > busiest.n) busiest = { day: d, n };
    } else run = 0;
  }
  // the current streak may include today (still going) or end yesterday
  let current = 0;
  let d = countFor(days.get(today), metric) > 0 ? today : addDays(today, -1);
  while (d >= from && countFor(days.get(d), metric) > 0) { current++; d = addDays(d, -1); }
  return { total, active, busiest, longest, longestFrom: longestEnd ? addDays(longestEnd, -(longest - 1)) : null, current };
}

/**
 * Cumulative counts per collection at the END of each day, for "their profile
 * on that day". Counts what EXISTS TODAY and was made by then: a post deleted
 * since is not in the repo and so is not counted, and the page says so.
 */
export function cumulative(days) {
  const sorted = [...days.keys()].sort();
  const acc = {}, at = new Map();
  for (const d of sorted) {
    for (const [c, n] of Object.entries(days.get(d))) acc[c] = (acc[c] || 0) + n;
    at.set(d, { ...acc });
  }
  return {
    sorted,
    /** totals as of the end of `day` (the last recorded day at or before it) */
    asOf(day) {
      let lo = 0, hi = sorted.length - 1, best = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= day) { best = mid; lo = mid + 1; } else hi = mid - 1; }
      return best < 0 ? {} : at.get(sorted[best]);
    },
  };
}

/** Days between two calendar days (b − a). */
export function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }

/**
 * The handle an account had at a moment, from its PLC audit log
 * (plc.directory/<did>/log/audit). Each operation sets alsoKnownAs (or, in the
 * oldest format, `handle`); the one in force is the latest at or before `t`.
 */
export function handleHistory(audit) {
  const steps = [];
  for (const op of audit || []) {
    if (op.nullified) continue;
    const o = op.operation || {};
    const aka = (o.alsoKnownAs || []).find((x) => typeof x === 'string' && x.startsWith('at://'));
    const h = aka ? aka.slice(5) : o.handle || null;
    const t = Date.parse(op.createdAt);
    if (h && Number.isFinite(t)) steps.push({ t, handle: h });
  }
  steps.sort((a, b) => a.t - b.t);
  const changes = steps.filter((s, i) => i === 0 || s.handle !== steps[i - 1].handle);
  return {
    changes,
    at(t) { let h = null; for (const s of changes) { if (s.t <= t) h = s.handle; else break; } return h; },
  };
}

/** The next and previous ACTIVE day under a metric, for stepping through. */
export function neighbours(days, day, metric = 'all') {
  const act = [...days.keys()].filter((d) => countFor(days.get(d), metric) > 0).sort();
  let prev = null, next = null;
  for (const d of act) { if (d < day) prev = d; else if (d > day && !next) next = d; }
  return { prev, next };
}
