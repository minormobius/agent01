/**
 * Sheets data model — Cell, Sheet, formats, values.
 */

import type { VaultBlobRef } from "../blobs";

// ── Cell Values ──

export type CellError = "#REF!" | "#VALUE!" | "#DIV/0!" | "#NAME?" | "#CIRC!" | "#N/A" | "#NUM!";

export type CellValue = string | number | boolean | null | CellError;

export function isCellError(v: CellValue): v is CellError {
  return typeof v === "string" && v.startsWith("#") && v.endsWith("!");
}

// ── Cell Format ──

export interface CellFormat {
  numFmt?: string;       // "#,##0.00", "0%", "$#,##0", "yyyy-mm-dd"
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  bg?: string;           // hex color
  fg?: string;           // text color
  wrap?: boolean;
}

// ── Cell ──

export interface Cell {
  raw: string;           // what the user typed
  value: CellValue;      // computed result
  format?: CellFormat;
  note?: string;         // cell comment
}

// ── Column / Row metadata ──

export interface ColMeta {
  width: number;         // px
  label?: string;        // override header label
}

export interface RowMeta {
  height: number;        // px
}

export const DEFAULT_COL_WIDTH = 100;
export const DEFAULT_ROW_HEIGHT = 28;
export const ROW_HEADER_WIDTH = 50;

// ── Sheet ──

export interface Sheet {
  name: string;
  cells: Record<string, Cell>; // keyed by "A1", "B12", etc.
  cols: ColMeta[];
  rows: RowMeta[];
  frozenRows: number;
  frozenCols: number;
  colCount: number;
  rowCount: number;
  attachments?: VaultBlobRef[];
  createdAt: string;
  updatedAt?: string;
}

export interface SheetRecord {
  rkey: string;
  sheet: Sheet;
  authorDid: string;
  orgRkey: string;
}

/** Create a blank sheet */
export function createBlankSheet(name: string, cols = 26, rows = 100): Sheet {
  return {
    name,
    cells: {},
    cols: Array.from({ length: cols }, () => ({ width: DEFAULT_COL_WIDTH })),
    rows: Array.from({ length: rows }, () => ({ height: DEFAULT_ROW_HEIGHT })),
    frozenRows: 0,
    frozenCols: 0,
    colCount: cols,
    rowCount: rows,
    createdAt: new Date().toISOString(),
  };
}

// ── Number Formatting ──

export const NUM_FORMATS: { id: string; label: string; fmt: string }[] = [
  { id: "general", label: "General", fmt: "" },
  { id: "number", label: "Number", fmt: "#,##0.00" },
  { id: "integer", label: "Integer", fmt: "#,##0" },
  { id: "currency", label: "Currency", fmt: "$#,##0.00" },
  { id: "percent", label: "Percent", fmt: "0.00%" },
  { id: "date", label: "Date", fmt: "yyyy-mm-dd" },
];

/** Format a cell value using a format string */
export function formatValue(value: CellValue, fmt?: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return value;
  if (!fmt || fmt === "") {
    // General: show reasonable precision
    if (Number.isInteger(value)) return value.toString();
    return parseFloat(value.toFixed(10)).toString();
  }

  const num = value as number;

  if (fmt === "0.00%") return (num * 100).toFixed(2) + "%";
  if (fmt === "0%") return (num * 100).toFixed(0) + "%";

  if (fmt === "yyyy-mm-dd") {
    // Treat as Excel serial date (days since 1900-01-01) or unix ms
    const d = num > 100000 ? new Date(num) : new Date((num - 25569) * 86400000);
    return d.toISOString().slice(0, 10);
  }

  // Currency
  const isCurrency = fmt.startsWith("$");
  const cleanFmt = isCurrency ? fmt.slice(1) : fmt;

  // Determine decimals
  const dotIdx = cleanFmt.indexOf(".");
  const decimals = dotIdx >= 0 ? cleanFmt.length - dotIdx - 1 : 0;
  const useCommas = cleanFmt.includes(",");

  let formatted = num.toFixed(decimals);
  if (useCommas) {
    const [intPart, decPart] = formatted.split(".");
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    formatted = decPart ? `${withCommas}.${decPart}` : withCommas;
  }

  return isCurrency ? `$${formatted}` : formatted;
}

// ── Preset background colors ──

export const BG_COLORS = [
  "", "#1a1a2e", "#16213e", "#0f3460", "#1b4332",
  "#3c1518", "#4a1942", "#2d2d2d", "#f59e0b33",
];

export const FG_COLORS = [
  "", "#e0e0e8", "#6366f1", "#22c55e", "#f59e0b",
  "#ef4444", "#ec4899", "#06b6d4", "#a78bfa",
];
