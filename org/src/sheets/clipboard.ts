/**
 * Clipboard — copy/paste TSV for spreadsheet.
 */

import type { Cell } from "./types";
import { formatValue } from "./types";
import { cellKey } from "./cellRef";
import type { Selection } from "./useSheet";
import { selectionRange } from "./useSheet";

/** Copy selection to clipboard as tab-separated values */
export function copySelection(
  cells: Record<string, Cell>,
  sel: Selection,
): string {
  const { minCol, maxCol, minRow, maxRow } = selectionRange(sel);
  const rows: string[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    const cols: string[] = [];
    for (let c = minCol; c <= maxCol; c++) {
      const cell = cells[cellKey(c, r)];
      if (cell) {
        cols.push(formatValue(cell.value, cell.format?.numFmt));
      } else {
        cols.push("");
      }
    }
    rows.push(cols.join("\t"));
  }
  return rows.join("\n");
}

/** Parse pasted TSV text into cell updates relative to anchor position */
export function parsePaste(
  tsv: string,
  anchorCol: number,
  anchorRow: number,
): { col: number; row: number; raw: string }[] {
  const updates: { col: number; row: number; raw: string }[] = [];
  const lines = tsv.split("\n");
  for (let r = 0; r < lines.length; r++) {
    const cells = lines[r].split("\t");
    for (let c = 0; c < cells.length; c++) {
      updates.push({
        col: anchorCol + c,
        row: anchorRow + r,
        raw: cells[c],
      });
    }
  }
  return updates;
}
