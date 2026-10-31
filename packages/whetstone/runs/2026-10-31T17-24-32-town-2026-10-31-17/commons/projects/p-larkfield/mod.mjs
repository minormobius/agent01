// mod.mjs — the Larkfield moderation library. See SPEC.md.
//
// Choices the spec leaves open are marked DECISION and listed on BOARD.md.

const DAY_MS = 86400000;

// ---------- M1: parsing ----------

// Split CSV text into rows of cells. Handles quoted fields ("a, b", "say ""hi"""),
// \r\n and \n line endings, a leading BOM. Blank lines are dropped.
export function parseCsv(text) {
  const s = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', inQ = false, quoted = false;
  const endCell = () => { row.push(quoted ? cell : cell.trim()); cell = ''; quoted = false; };
  const endRow = () => {
    endCell();
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += c;
    } else if (c === '"' && cell.trim() === '') {
      inQ = true; quoted = true; cell = '';
    } else if (c === ',') endCell();
    else if (c === '\r') { if (s[i + 1] === '\n') i++; endRow(); }
    else if (c === '\n') endRow();
    else cell += c;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

function parseTable(text, fields) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = fields.map((f) => {
    const k = header.indexOf(f);
    if (k < 0) throw new Error(`missing column "${f}" in header: ${rows[0].join(',')}`);
    return k;
  });
  return rows.slice(1).map((r) => {
    const o = {};
    fields.forEach((f, j) => { o[f] = r[idx[j]] ?? ''; });
    return o;
  });
}

export function parseReports(text) {
  return parseTable(text, ['date', 'reporter', 'reported', 'reason']);
}

export function parseResidents(text) {
  return parseTable(text, ['handle', 'kind', 'joined']);
}

// ---------- M2: weekly counts ----------

function dayNumber(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date).trim());
  if (!m) throw new Error(`bad date: ${date}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS;
}

function dateOfDay(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

// DECISION: dates before the start fall in week 0, -1, … (plain floor); not an error.
export function weekOf(date, start) {
  return Math.floor((dayNumber(date) - dayNumber(start)) / 7) + 1;
}

// code-unit order, not locale order: the spec says "sorted".
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function weekly(reports, start) {
  const out = {};
  const sets = {};
  for (const r of reports) {
    const w = weekOf(r.date, start);
    out[w] ??= {}; sets[w] ??= {};
    const h = (out[w][r.reported] ??= { reports: 0, reporters: [] });
    const set = (sets[w][r.reported] ??= new Set());
    h.reports++;
    set.add(r.reporter);
  }
  for (const w in out) for (const h in out[w]) out[w][h].reporters = [...sets[w][h]].sort(byStr);
  return out;
}

// ---------- M3: mutes ----------

// DECISION: a self-report counts like any other report (the spec doesn't exclude it).
export function mutes(reports, start, { minDistinct = 3 } = {}) {
  const wk = weekly(reports, start);
  const out = [];
  for (const w in wk) for (const h in wk[w]) {
    if (wk[w][h].reporters.length >= minDistinct) out.push({ week: Number(w), handle: h });
  }
  return out.sort((a, b) => a.week - b.week || byStr(a.handle, b.handle));
}

// ---------- M4: rings ----------

// DECISION: a reporter with no residents row has no join date and so can't be linked.
// DECISION: "within joinedWithinDays" is inclusive: |Δdays| <= joinedWithinDays.
export function rings(reports, residents, { minReports = 6, minOverlap = 0.8, joinedWithinDays = 1 } = {}) {
  const filed = new Map();   // reporter -> count of rows
  const targets = new Map(); // reporter -> Set of reported handles
  for (const r of reports) {
    filed.set(r.reporter, (filed.get(r.reporter) ?? 0) + 1);
    if (!targets.has(r.reporter)) targets.set(r.reporter, new Set());
    targets.get(r.reporter).add(r.reported);
  }
  const joined = new Map();
  for (const p of residents) if (!joined.has(p.handle)) joined.set(p.handle, dayNumber(p.joined));

  const cands = [...filed.keys()]
    .filter((h) => filed.get(h) >= minReports && joined.has(h))
    .sort(byStr);
  const parent = new Map(cands.map((h) => [h, h]));
  const find = (h) => { while (parent.get(h) !== h) { parent.set(h, parent.get(parent.get(h))); h = parent.get(h); } return h; };

  for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
    const a = cands[i], b = cands[j];
    if (Math.abs(joined.get(a) - joined.get(b)) > joinedWithinDays) continue;
    const A = targets.get(a), B = targets.get(b);
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    const union = A.size + B.size - inter;
    if (union > 0 && inter / union >= minOverlap) parent.set(find(a), find(b));
  }
  const groups = new Map();
  for (const h of cands) {
    const root = find(h);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(h);
  }
  return [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((g) => g.sort(byStr))
    .sort((a, b) => byStr(a[0], b[0]));
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

// DECISION: kind doesn't matter; agents can judge. Week end is start + 7*week - 1, inclusive.
export function appealJudge({ handle, week, reporters = [] }, residents, start) {
  const last = dayNumber(start) + 7 * week - 1;
  const barred = new Set(reporters);
  let best = null, bestH = 0;
  const seen = new Set();
  for (const p of residents) {
    const j = p.handle;
    if (seen.has(j)) continue;
    seen.add(j);
    if (j === handle || barred.has(j)) continue;
    if (dayNumber(p.joined) > last) continue;
    const h = fnv32(j + ':' + handle + ':' + week);
    if (best === null || h < bestH || (h === bestH && j < best)) { best = j; bestH = h; }
  }
  return best;
}

// ---------- M6: the whole report (used by cli.mjs) ----------

export function moderate(reports, residents, start) {
  const wk = weekly(reports, start);
  const weekNums = Object.keys(wk).map(Number);
  const m = mutes(reports, start);
  return {
    weeks: weekNums.length ? Math.max(...weekNums) : 0, // DECISION: no reports -> 0
    mutes: m,
    rings: rings(reports, residents),
    judges: m.map(({ week, handle }) => ({
      week, handle,
      judge: appealJudge({ handle, week, reporters: wk[week][handle].reporters }, residents, start),
    })),
  };
}
