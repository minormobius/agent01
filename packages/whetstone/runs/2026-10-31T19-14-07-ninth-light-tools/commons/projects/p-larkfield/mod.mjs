// mod.mjs — the Larkfield moderation library. See SPEC.md.
// Readings beyond the spec's text are listed in DECISIONS.md.

const DAY = 86400000;

// ---------- M1: parsing ----------

// Split one CSV line. Plain commas; double-quoted fields with "" escapes are
// accepted too (the spec doesn't promise quotes, but a reason like
// "spam, again" would otherwise shift every column after it).
function splitLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"' && cur.trim() === '') { cur = ''; q = true; }
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseTable(text, fields) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n|\r/)
    .filter(l => l.trim() !== '');
  if (lines.length === 0) return [];
  const header = splitLine(lines[0]).map(h => h.toLowerCase());
  const idx = {};
  for (const f of fields) {
    const i = header.indexOf(f);
    if (i < 0) throw new Error(`missing column "${f}" in header: ${lines[0]}`);
    idx[f] = i;
  }
  return lines.slice(1).map(l => {
    const cells = splitLine(l);
    const row = {};
    for (const f of fields) row[f] = cells[idx[f]] ?? '';
    return row;
  });
}

export function parseReports(text) {
  return parseTable(text, ['date', 'reporter', 'reported', 'reason']);
}

export function parseResidents(text) {
  return parseTable(text, ['handle', 'kind', 'joined']);
}

// ---------- M2: weekly counts ----------

function dayNum(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date).trim());
  if (!m) throw new Error(`bad date: ${date}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY;
}

export function weekOf(date, start) {
  return Math.floor((dayNum(date) - dayNum(start)) / 7) + 1;
}

const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function weekly(reports, start) {
  const acc = new Map(); // week -> handle -> {n, set}
  for (const r of reports) {
    const w = weekOf(r.date, start);
    if (!acc.has(w)) acc.set(w, new Map());
    const hm = acc.get(w);
    if (!hm.has(r.reported)) hm.set(r.reported, { n: 0, set: new Set() });
    const e = hm.get(r.reported);
    e.n++;
    e.set.add(r.reporter);
  }
  const out = {};
  for (const w of [...acc.keys()].sort((a, b) => a - b)) {
    const hm = acc.get(w);
    out[String(w)] = {};
    for (const h of [...hm.keys()].sort(byStr)) {
      const e = hm.get(h);
      // defineProperty, not assignment: a handle named "__proto__" must be a key, not a prototype.
      Object.defineProperty(out[String(w)], h, {
        value: { reports: e.n, reporters: [...e.set].sort(byStr) },
        enumerable: true, writable: true, configurable: true,
      });
    }
  }
  return out;
}

// ---------- M3: mutes ----------

export function mutes(reports, start, { minDistinct = 3 } = {}) {
  const w = weekly(reports, start);
  const out = [];
  for (const wk of Object.keys(w)) {
    for (const h of Object.keys(w[wk])) {
      if (w[wk][h].reporters.length >= minDistinct) out.push({ week: Number(wk), handle: h });
    }
  }
  return out.sort((a, b) => a.week - b.week || byStr(a.handle, b.handle));
}

// ---------- M4: rings ----------

export function rings(reports, residents,
  { minReports = 6, minOverlap = 0.8, joinedWithinDays = 1 } = {}) {
  const count = new Map(), targets = new Map();
  for (const r of reports) {
    count.set(r.reporter, (count.get(r.reporter) || 0) + 1);
    if (!targets.has(r.reporter)) targets.set(r.reporter, new Set());
    targets.get(r.reporter).add(r.reported);
  }
  const joined = new Map(residents.map(p => [p.handle, dayNum(p.joined)]));
  // A reporter with no residents row has no join date, so it can't be linked.
  const cand = [...count.keys()]
    .filter(h => count.get(h) >= minReports && joined.has(h)).sort(byStr);

  const parent = new Map(cand.map(h => [h, h]));
  const find = h => { while (parent.get(h) !== h) { parent.set(h, parent.get(parent.get(h))); h = parent.get(h); } return h; };
  const linked = new Set();
  for (let i = 0; i < cand.length; i++) {
    for (let j = i + 1; j < cand.length; j++) {
      const a = cand[i], b = cand[j];
      if (Math.abs(joined.get(a) - joined.get(b)) > joinedWithinDays) continue;
      const A = targets.get(a), B = targets.get(b);
      let inter = 0;
      for (const x of A) if (B.has(x)) inter++;
      const union = A.size + B.size - inter;
      if (union === 0 || inter / union < minOverlap) continue;
      linked.add(a); linked.add(b);
      parent.set(find(a), find(b));
    }
  }
  const groups = new Map();
  for (const h of linked) {
    const r = find(h);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(h);
  }
  return [...groups.values()].map(g => g.sort(byStr))
    .filter(g => g.length >= 2)
    .sort((x, y) => byStr(x[0], y[0]));
}

// ---------- M5: appeals ----------

export function fnv32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function appealJudge({ handle, week, reporters = [] }, residents, start) {
  const lastDay = dayNum(start) + 7 * week - 1;
  const excluded = new Set(reporters);
  let best = null, bestH = 0;
  for (const p of residents) {
    if (p.handle === handle || excluded.has(p.handle)) continue;
    if (dayNum(p.joined) > lastDay) continue;
    const h = fnv32(p.handle + ':' + handle + ':' + week);
    if (best === null || h < bestH || (h === bestH && p.handle < best)) { best = p.handle; bestH = h; }
  }
  return best;
}

// ---------- M6 core (cli.mjs is the thin wrapper) ----------

export function report(reports, residents, start) {
  const w = weekly(reports, start);
  const weeks = reports.length ? Math.max(...Object.keys(w).map(Number)) : 0;
  const ms = mutes(reports, start);
  return {
    weeks,
    mutes: ms,
    rings: rings(reports, residents),
    judges: ms.map(m => ({
      week: m.week, handle: m.handle,
      judge: appealJudge({ handle: m.handle, week: m.week, reporters: w[String(m.week)][m.handle].reporters }, residents, start),
    })),
  };
}
