// csv.mjs — a correct CSV reader. No dependencies.
//
// "Split on commas" is wrong for every file in this pipeline: BEA quotes its
// area names, and several of them ("Doña Ana, NM") contain the delimiter. This
// handles RFC 4180 quoting, doubled quotes inside quoted fields, and both line
// endings, streaming row by row so a 30 MB table never becomes 30 MB of arrays
// at once.

/** Iterate rows of a CSV string as string arrays. */
export function* rows(text) {
  // Strip a UTF-8 byte-order mark. Read as latin1 it becomes three visible
  // characters glued to the first header name, so `ENTIDAD` silently becomes a
  // column nobody has — INEGI's census file matched zero municipios that way,
  // and the failure looked like an empty file rather than a bug.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  else if (text.charCodeAt(0) === 0xef && text.charCodeAt(1) === 0xbb && text.charCodeAt(2) === 0xbf) text = text.slice(3);
  let i = 0, field = '', row = [], inQuotes = false;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); yield row; row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); yield row; }
}

/** Rows as objects keyed by the header row. */
export function* records(text) {
  let header = null;
  for (const r of rows(text)) {
    if (!header) { header = r.map((h) => h.trim()); continue; }
    const o = {};
    for (let i = 0; i < header.length; i++) o[header[i]] = r[i];
    yield o;
  }
}

/** BEA and Census both use these to mean "suppressed" or "not applicable". */
const NULLS = new Set(['', '(D)', '(L)', '(N)', '(NA)', '(NM)', '(T)', '*', '.', 'NA', 'null', '(S)']);
export const num = (v) => {
  if (v == null) return null;
  const s = String(v).trim().replace(/,/g, '');
  if (NULLS.has(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
