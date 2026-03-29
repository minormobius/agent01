/**
 * Cell reference utilities — A1 notation parsing, range expansion, col↔number.
 */

/** Convert column letter(s) to 0-based index: A→0, B→1, Z→25, AA→26 */
export function colToIndex(col: string): number {
  let idx = 0;
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx - 1;
}

/** Convert 0-based index to column letter(s): 0→A, 25→Z, 26→AA */
export function indexToCol(idx: number): string {
  let s = "";
  let n = idx + 1;
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

export interface CellRef {
  col: number; // 0-based
  row: number; // 0-based
  absCol?: boolean; // $A
  absRow?: boolean; // $1
}

export interface CellRange {
  start: CellRef;
  end: CellRef;
}

/** Parse "A1", "$A$1", "AB12" → CellRef */
export function parseCellRef(ref: string): CellRef | null {
  const m = ref.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
  if (!m) return null;
  return {
    col: colToIndex(m[2]),
    row: parseInt(m[4], 10) - 1,
    absCol: m[1] === "$",
    absRow: m[3] === "$",
  };
}

/** Format a CellRef back to A1 notation */
export function formatCellRef(ref: CellRef): string {
  return `${ref.absCol ? "$" : ""}${indexToCol(ref.col)}${ref.absRow ? "$" : ""}${ref.row + 1}`;
}

/** Cell key for Map storage: "A1", "B12", etc. */
export function cellKey(col: number, row: number): string {
  return `${indexToCol(col)}${row + 1}`;
}

/** Parse a cell key back to col, row */
export function parseKey(key: string): { col: number; row: number } | null {
  const ref = parseCellRef(key);
  if (!ref) return null;
  return { col: ref.col, row: ref.row };
}

/** Parse "A1:B5" → CellRange */
export function parseRange(range: string): CellRange | null {
  const parts = range.split(":");
  if (parts.length !== 2) return null;
  const start = parseCellRef(parts[0]);
  const end = parseCellRef(parts[1]);
  if (!start || !end) return null;
  return { start, end };
}

/** Expand a range into an array of cell keys */
export function expandRange(range: CellRange): string[] {
  const keys: string[] = [];
  const minCol = Math.min(range.start.col, range.end.col);
  const maxCol = Math.max(range.start.col, range.end.col);
  const minRow = Math.min(range.start.row, range.end.row);
  const maxRow = Math.max(range.start.row, range.end.row);
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      keys.push(cellKey(c, r));
    }
  }
  return keys;
}

/** Get all cell keys referenced by a formula string (for dependency graph) */
export function extractRefs(formula: string): string[] {
  const refs: string[] = [];
  // Match ranges first (A1:B5), then single refs (A1)
  const rangeRe = /\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+/g;
  const singleRe = /\$?[A-Z]+\$?\d+/g;

  const rangeMatches = formula.match(rangeRe) || [];
  const rangeSpans = new Set<string>();
  for (const rm of rangeMatches) {
    const range = parseRange(rm.replace(/\$/g, ""));
    if (range) {
      for (const k of expandRange(range)) {
        refs.push(k);
        rangeSpans.add(k);
      }
    }
  }

  // Strip ranges then find single refs
  const stripped = formula.replace(rangeRe, "");
  const singles = stripped.match(singleRe) || [];
  for (const s of singles) {
    const clean = s.replace(/\$/g, "");
    const parsed = parseCellRef(clean);
    if (parsed) {
      const k = cellKey(parsed.col, parsed.row);
      if (!rangeSpans.has(k)) refs.push(k);
    }
  }
  return refs;
}
