/**
 * useSheet — React hook managing sheet state: cells, selection, undo/redo, recalculation.
 */

import { useState, useCallback, useRef } from "react";
import type { Sheet, Cell, CellFormat, CellValue } from "./types";
import { createBlankSheet } from "./types";
import { cellKey } from "./cellRef";
import { evaluateFormula, recalculate } from "./formula";

// ── Selection ──

export interface Selection {
  /** Active cell (cursor) */
  col: number;
  row: number;
  /** Range selection end (if dragging/shift-selecting) */
  rangeEndCol?: number;
  rangeEndRow?: number;
  /** Is the cell being edited? */
  editing: boolean;
}

export function selectionRange(sel: Selection): { minCol: number; maxCol: number; minRow: number; maxRow: number } {
  const c1 = sel.col;
  const c2 = sel.rangeEndCol ?? sel.col;
  const r1 = sel.row;
  const r2 = sel.rangeEndRow ?? sel.row;
  return {
    minCol: Math.min(c1, c2),
    maxCol: Math.max(c1, c2),
    minRow: Math.min(r1, r2),
    maxRow: Math.max(r1, r2),
  };
}

export function isInSelection(sel: Selection, col: number, row: number): boolean {
  const { minCol, maxCol, minRow, maxRow } = selectionRange(sel);
  return col >= minCol && col <= maxCol && row >= minRow && row <= maxRow;
}

// ── Undo/Redo Command ──

interface Command {
  /** Cells before the change (snapshot of affected keys) */
  before: Record<string, Cell | undefined>;
  /** Cells after the change */
  after: Record<string, Cell | undefined>;
}

// ── Hook ──

export function useSheet(initial?: Sheet) {
  const [sheet, setSheet] = useState<Sheet>(() => initial || createBlankSheet("Sheet 1"));
  const [sel, setSel] = useState<Selection>({ col: 0, row: 0, editing: false });

  const undoStack = useRef<Command[]>([]);
  const redoStack = useRef<Command[]>([]);

  /** Get the value of a cell (for formula evaluation) */
  const getCellValue = useCallback((key: string): CellValue => {
    return sheet.cells[key]?.value ?? null;
  }, [sheet.cells]);

  /** Set a cell's raw content and recalculate */
  const setCellRaw = useCallback((col: number, row: number, raw: string) => {
    setSheet((prev) => {
      const key = cellKey(col, row);
      const oldCell = prev.cells[key];
      const newCells = { ...prev.cells };

      // Evaluate the new value
      const value = evaluateFormula(raw, (k) => prev.cells[k]?.value ?? null);
      const newCell: Cell = {
        raw,
        value,
        format: oldCell?.format,
        note: oldCell?.note,
      };

      if (raw === "" && !oldCell?.format && !oldCell?.note) {
        delete newCells[key];
      } else {
        newCells[key] = newCell;
      }

      // Recalculate dependents
      recalculate(newCells);

      // Push undo command
      undoStack.current.push({
        before: { [key]: oldCell },
        after: { [key]: newCells[key] },
      });
      redoStack.current = [];

      return { ...prev, cells: newCells, updatedAt: new Date().toISOString() };
    });
  }, []);

  /** Set format on the current selection */
  const setFormat = useCallback((fmt: Partial<CellFormat>) => {
    setSheet((prev) => {
      const { minCol, maxCol, minRow, maxRow } = selectionRange(sel);
      const newCells = { ...prev.cells };
      const before: Record<string, Cell | undefined> = {};
      const after: Record<string, Cell | undefined> = {};

      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const key = cellKey(c, r);
          before[key] = newCells[key];
          const existing = newCells[key] || { raw: "", value: null };
          newCells[key] = {
            ...existing,
            format: { ...existing.format, ...fmt },
          };
          after[key] = newCells[key];
        }
      }

      undoStack.current.push({ before, after });
      redoStack.current = [];
      return { ...prev, cells: newCells };
    });
  }, [sel]);

  /** Bulk set cells (for paste) */
  const setCellsBulk = useCallback((updates: { col: number; row: number; raw: string }[]) => {
    setSheet((prev) => {
      const newCells = { ...prev.cells };
      const before: Record<string, Cell | undefined> = {};
      const after: Record<string, Cell | undefined> = {};

      // Expand sheet if needed
      let maxCol = prev.colCount;
      let maxRow = prev.rowCount;

      for (const { col, row, raw } of updates) {
        const key = cellKey(col, row);
        before[key] = newCells[key];
        const value = evaluateFormula(raw, (k) => newCells[k]?.value ?? null);
        if (raw === "") {
          delete newCells[key];
        } else {
          newCells[key] = { raw, value, format: newCells[key]?.format };
        }
        after[key] = newCells[key];
        if (col + 1 > maxCol) maxCol = col + 1;
        if (row + 1 > maxRow) maxRow = row + 1;
      }

      recalculate(newCells);

      undoStack.current.push({ before, after });
      redoStack.current = [];

      const cols = maxCol > prev.colCount
        ? [...prev.cols, ...Array.from({ length: maxCol - prev.colCount }, () => ({ width: 100 }))]
        : prev.cols;
      const rows = maxRow > prev.rowCount
        ? [...prev.rows, ...Array.from({ length: maxRow - prev.rowCount }, () => ({ height: 28 }))]
        : prev.rows;

      return { ...prev, cells: newCells, cols, rows, colCount: maxCol, rowCount: maxRow, updatedAt: new Date().toISOString() };
    });
  }, []);

  /** Delete cells in current selection */
  const deleteSelection = useCallback(() => {
    setSheet((prev) => {
      const { minCol, maxCol, minRow, maxRow } = selectionRange(sel);
      const newCells = { ...prev.cells };
      const before: Record<string, Cell | undefined> = {};
      const after: Record<string, Cell | undefined> = {};

      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const key = cellKey(c, r);
          before[key] = newCells[key];
          delete newCells[key];
          after[key] = undefined;
        }
      }

      recalculate(newCells);
      undoStack.current.push({ before, after });
      redoStack.current = [];
      return { ...prev, cells: newCells, updatedAt: new Date().toISOString() };
    });
  }, [sel]);

  /** Undo */
  const undo = useCallback(() => {
    const cmd = undoStack.current.pop();
    if (!cmd) return;
    setSheet((prev) => {
      const newCells = { ...prev.cells };
      for (const [key, cell] of Object.entries(cmd.before)) {
        if (cell) newCells[key] = cell;
        else delete newCells[key];
      }
      recalculate(newCells);
      redoStack.current.push(cmd);
      return { ...prev, cells: newCells };
    });
  }, []);

  /** Redo */
  const redo = useCallback(() => {
    const cmd = redoStack.current.pop();
    if (!cmd) return;
    setSheet((prev) => {
      const newCells = { ...prev.cells };
      for (const [key, cell] of Object.entries(cmd.after)) {
        if (cell) newCells[key] = cell;
        else delete newCells[key];
      }
      recalculate(newCells);
      undoStack.current.push(cmd);
      return { ...prev, cells: newCells };
    });
  }, []);

  /** Resize column */
  const resizeCol = useCallback((idx: number, width: number) => {
    setSheet((prev) => {
      const cols = [...prev.cols];
      cols[idx] = { ...cols[idx], width: Math.max(30, width) };
      return { ...prev, cols };
    });
  }, []);

  /** Resize row */
  const resizeRow = useCallback((idx: number, height: number) => {
    setSheet((prev) => {
      const rows = [...prev.rows];
      rows[idx] = { ...rows[idx], height: Math.max(18, height) };
      return { ...prev, rows };
    });
  }, []);

  /** Add rows at the end */
  const addRows = useCallback((count: number) => {
    setSheet((prev) => ({
      ...prev,
      rows: [...prev.rows, ...Array.from({ length: count }, () => ({ height: 28 }))],
      rowCount: prev.rowCount + count,
    }));
  }, []);

  /** Add columns at the end */
  const addCols = useCallback((count: number) => {
    setSheet((prev) => ({
      ...prev,
      cols: [...prev.cols, ...Array.from({ length: count }, () => ({ width: 100 }))],
      colCount: prev.colCount + count,
    }));
  }, []);

  /** Update sheet name */
  const setName = useCallback((name: string) => {
    setSheet((prev) => ({ ...prev, name }));
  }, []);

  /** Replace the entire sheet (for loading from PDS) */
  const loadSheet = useCallback((s: Sheet) => {
    setSheet(s);
    setSel({ col: 0, row: 0, editing: false });
    undoStack.current = [];
    redoStack.current = [];
  }, []);

  return {
    sheet,
    sel,
    setSel,
    getCellValue,
    setCellRaw,
    setFormat,
    setCellsBulk,
    deleteSelection,
    undo,
    redo,
    resizeCol,
    resizeRow,
    addRows,
    addCols,
    setName,
    loadSheet,
  };
}
