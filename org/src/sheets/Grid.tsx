/**
 * Grid — virtualized spreadsheet grid renderer with inline editor.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { Sheet } from "./types";
import { formatValue, DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT, ROW_HEADER_WIDTH } from "./types";
import { cellKey, indexToCol } from "./cellRef";
import { isCellError } from "./types";
import type { Selection } from "./useSheet";
import { isInSelection } from "./useSheet";
import { copySelection, parsePaste } from "./clipboard";

interface Props {
  sheet: Sheet;
  sel: Selection;
  onSelect: (sel: Selection) => void;
  onCellEdit: (col: number, row: number, raw: string) => void;
  onPaste: (updates: { col: number; row: number; raw: string }[]) => void;
  onDeleteSelection: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onResizeCol: (idx: number, width: number) => void;
}

const BUFFER = 5; // extra rows/cols to render outside viewport

export function Grid({
  sheet,
  sel,
  onSelect,
  onCellEdit,
  onPaste,
  onDeleteSelection,
  onUndo,
  onRedo,
  onResizeCol,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLInputElement>(null);
  const [editValue, setEditValue] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewW, setViewW] = useState(1000);
  const [viewH, setViewH] = useState(600);

  // Resize column drag state
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setViewW(e.contentRect.width);
        setViewH(e.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Column offsets (cumulative x position)
  const colOffsets = useMemo(() => {
    const offsets = [0];
    for (let c = 0; c < sheet.colCount; c++) {
      offsets.push(offsets[c] + (sheet.cols[c]?.width || DEFAULT_COL_WIDTH));
    }
    return offsets;
  }, [sheet.cols, sheet.colCount]);

  // Row offsets (cumulative y position)
  const rowOffsets = useMemo(() => {
    const offsets = [0];
    for (let r = 0; r < sheet.rowCount; r++) {
      offsets.push(offsets[r] + (sheet.rows[r]?.height || DEFAULT_ROW_HEIGHT));
    }
    return offsets;
  }, [sheet.rows, sheet.rowCount]);

  const totalW = colOffsets[sheet.colCount] || 0;
  const totalH = rowOffsets[sheet.rowCount] || 0;

  // Visible range
  const startCol = useMemo(() => {
    let c = 0;
    while (c < sheet.colCount && colOffsets[c + 1] < scrollLeft) c++;
    return Math.max(0, c - BUFFER);
  }, [scrollLeft, colOffsets, sheet.colCount]);

  const endCol = useMemo(() => {
    let c = startCol;
    while (c < sheet.colCount && colOffsets[c] < scrollLeft + viewW) c++;
    return Math.min(sheet.colCount - 1, c + BUFFER);
  }, [startCol, scrollLeft, viewW, colOffsets, sheet.colCount]);

  const startRow = useMemo(() => {
    let r = 0;
    while (r < sheet.rowCount && rowOffsets[r + 1] < scrollTop) r++;
    return Math.max(0, r - BUFFER);
  }, [scrollTop, rowOffsets, sheet.rowCount]);

  const endRow = useMemo(() => {
    let r = startRow;
    while (r < sheet.rowCount && rowOffsets[r] < scrollTop + viewH) r++;
    return Math.min(sheet.rowCount - 1, r + BUFFER);
  }, [startRow, scrollTop, viewH, rowOffsets, sheet.rowCount]);

  // Focus editor when entering edit mode
  useEffect(() => {
    if (sel.editing && editorRef.current) {
      editorRef.current.focus();
    }
  }, [sel.editing]);

  // Start editing with current cell value
  const startEditing = useCallback((col: number, row: number, initialValue?: string) => {
    const key = cellKey(col, row);
    const cell = sheet.cells[key];
    setEditValue(initialValue ?? cell?.raw ?? "");
    onSelect({ col, row, editing: true });
  }, [sheet.cells, onSelect]);

  // Commit edit
  const commitEdit = useCallback(() => {
    if (sel.editing) {
      onCellEdit(sel.col, sel.row, editValue);
      onSelect({ ...sel, editing: false });
    }
  }, [sel, editValue, onCellEdit, onSelect]);

  // Cancel edit
  const cancelEdit = useCallback(() => {
    onSelect({ ...sel, editing: false });
  }, [sel, onSelect]);

  // Navigate
  const navigate = useCallback((dCol: number, dRow: number) => {
    const newCol = Math.max(0, Math.min(sheet.colCount - 1, sel.col + dCol));
    const newRow = Math.max(0, Math.min(sheet.rowCount - 1, sel.row + dRow));
    onSelect({ col: newCol, row: newRow, editing: false });
  }, [sel, sheet.colCount, sheet.rowCount, onSelect]);

  // Keyboard handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Undo/Redo
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); onUndo(); return; }
    if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); onRedo(); return; }

    // Copy/Paste
    if ((e.metaKey || e.ctrlKey) && e.key === "c") {
      e.preventDefault();
      const text = copySelection(sheet.cells, sel);
      navigator.clipboard.writeText(text);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "v") {
      e.preventDefault();
      navigator.clipboard.readText().then((text) => {
        if (text) onPaste(parsePaste(text, sel.col, sel.row));
      });
      return;
    }

    if (sel.editing) {
      // In edit mode
      if (e.key === "Enter") { e.preventDefault(); commitEdit(); navigate(0, 1); }
      else if (e.key === "Tab") { e.preventDefault(); commitEdit(); navigate(e.shiftKey ? -1 : 1, 0); }
      else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
      return;
    }

    // Not editing
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); navigate(0, -1); break;
      case "ArrowDown": e.preventDefault(); navigate(0, 1); break;
      case "ArrowLeft": e.preventDefault(); navigate(-1, 0); break;
      case "ArrowRight": e.preventDefault(); navigate(1, 0); break;
      case "Tab": e.preventDefault(); navigate(e.shiftKey ? -1 : 1, 0); break;
      case "Enter": e.preventDefault(); startEditing(sel.col, sel.row); break;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        onDeleteSelection();
        break;
      case "F2": e.preventDefault(); startEditing(sel.col, sel.row); break;
      default:
        // Printable character → start editing with that character
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          startEditing(sel.col, sel.row, e.key);
        }
    }
  }, [sel, sheet.cells, commitEdit, cancelEdit, navigate, startEditing, onDeleteSelection, onUndo, onRedo, onPaste]);

  // Cell click
  const handleCellClick = useCallback((col: number, row: number, e: React.MouseEvent) => {
    if (sel.editing) commitEdit();
    if (e.shiftKey) {
      onSelect({ ...sel, rangeEndCol: col, rangeEndRow: row, editing: false });
    } else {
      onSelect({ col, row, editing: false, rangeEndCol: undefined, rangeEndRow: undefined });
    }
  }, [sel, onSelect, commitEdit]);

  // Cell double-click → edit
  const handleCellDblClick = useCallback((col: number, row: number) => {
    startEditing(col, row);
  }, [startEditing]);

  // Scroll handler
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setScrollTop(el.scrollTop);
    setScrollLeft(el.scrollLeft);
  }, []);

  // Column resize handlers
  const handleResizeStart = useCallback((colIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(colIdx);
    resizeStartX.current = e.clientX;
    resizeStartW.current = sheet.cols[colIdx]?.width || DEFAULT_COL_WIDTH;
  }, [sheet.cols]);

  useEffect(() => {
    if (resizingCol === null) return;
    const handleMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      onResizeCol(resizingCol, resizeStartW.current + delta);
    };
    const handleUp = () => setResizingCol(null);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [resizingCol, onResizeCol]);

  // Render cells
  const renderedCells: React.ReactNode[] = [];

  // Column headers
  for (let c = startCol; c <= endCol; c++) {
    const w = sheet.cols[c]?.width || DEFAULT_COL_WIDTH;
    renderedCells.push(
      <div
        key={`ch-${c}`}
        className={`sheet-col-header${sel.col === c ? " active" : ""}`}
        style={{
          position: "absolute",
          left: colOffsets[c] + ROW_HEADER_WIDTH,
          top: 0,
          width: w,
          height: DEFAULT_ROW_HEIGHT,
          zIndex: 3,
        }}
      >
        {indexToCol(c)}
        <div
          className="sheet-col-resize"
          onMouseDown={(e) => handleResizeStart(c, e)}
        />
      </div>
    );
  }

  // Row headers
  for (let r = startRow; r <= endRow; r++) {
    const h = sheet.rows[r]?.height || DEFAULT_ROW_HEIGHT;
    renderedCells.push(
      <div
        key={`rh-${r}`}
        className={`sheet-row-header${sel.row === r ? " active" : ""}`}
        style={{
          position: "absolute",
          left: 0,
          top: rowOffsets[r] + DEFAULT_ROW_HEIGHT,
          width: ROW_HEADER_WIDTH,
          height: h,
          zIndex: 2,
        }}
      >
        {r + 1}
      </div>
    );
  }

  // Data cells
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const key = cellKey(c, r);
      const cell = sheet.cells[key];
      const w = sheet.cols[c]?.width || DEFAULT_COL_WIDTH;
      const h = sheet.rows[r]?.height || DEFAULT_ROW_HEIGHT;
      const isActive = sel.col === c && sel.row === r;
      const isSelected = isInSelection(sel, c, r);
      const isEditing = isActive && sel.editing;

      const fmt = cell?.format;
      const displayValue = cell ? formatValue(cell.value, fmt?.numFmt) : "";
      const isError = cell && isCellError(cell.value);

      const cellStyle: React.CSSProperties = {
        position: "absolute",
        left: colOffsets[c] + ROW_HEADER_WIDTH,
        top: rowOffsets[r] + DEFAULT_ROW_HEIGHT,
        width: w,
        height: h,
        fontWeight: fmt?.bold ? 700 : undefined,
        fontStyle: fmt?.italic ? "italic" : undefined,
        textAlign: fmt?.align || (typeof cell?.value === "number" ? "right" : "left"),
        backgroundColor: fmt?.bg || undefined,
        color: isError ? "var(--danger)" : fmt?.fg || undefined,
      };

      renderedCells.push(
        <div
          key={key}
          className={`sheet-cell${isActive ? " active" : ""}${isSelected && !isActive ? " selected" : ""}`}
          style={cellStyle}
          onClick={(e) => handleCellClick(c, r, e)}
          onDoubleClick={() => handleCellDblClick(c, r)}
        >
          {isEditing ? (
            <input
              ref={editorRef}
              className="sheet-cell-editor"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={commitEdit}
            />
          ) : (
            <span className="sheet-cell-text">{displayValue}</span>
          )}
        </div>
      );
    }
  }

  // Corner cell (top-left)
  renderedCells.push(
    <div
      key="corner"
      className="sheet-corner"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: ROW_HEADER_WIDTH,
        height: DEFAULT_ROW_HEIGHT,
        zIndex: 4,
      }}
    />
  );

  return (
    <div
      ref={containerRef}
      className="sheet-grid-container"
      tabIndex={0}
      onKeyDown={!sel.editing ? handleKeyDown : undefined}
      onScroll={handleScroll}
    >
      <div
        className="sheet-grid-canvas"
        style={{
          width: totalW + ROW_HEADER_WIDTH,
          height: totalH + DEFAULT_ROW_HEIGHT,
          position: "relative",
        }}
      >
        {renderedCells}
      </div>
    </div>
  );
}
