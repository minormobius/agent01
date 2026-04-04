/**
 * Toolbar — formula bar + format controls for the spreadsheet.
 */

import { useState, useCallback } from "react";
import type { Sheet, CellFormat } from "./types";
import { NUM_FORMATS, BG_COLORS, FG_COLORS } from "./types";
import { cellKey, indexToCol } from "./cellRef";
import type { Selection } from "./useSheet";

interface Props {
  sheet: Sheet;
  sel: Selection;
  onCellEdit: (col: number, row: number, raw: string) => void;
  onFormat: (fmt: Partial<CellFormat>) => void;
  onStartEditing: () => void;
}

export function Toolbar({ sheet, sel, onCellEdit, onFormat, onStartEditing }: Props) {
  const key = cellKey(sel.col, sel.row);
  const cell = sheet.cells[key];
  const [formulaFocused, setFormulaFocused] = useState(false);
  const [formulaValue, setFormulaValue] = useState("");
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showFgPicker, setShowFgPicker] = useState(false);

  const cellLabel = `${indexToCol(sel.col)}${sel.row + 1}`;
  const rawValue = cell?.raw ?? "";
  const currentFmt = cell?.format;

  const handleFormulaFocus = useCallback(() => {
    setFormulaValue(rawValue);
    setFormulaFocused(true);
    onStartEditing();
  }, [rawValue, onStartEditing]);

  const handleFormulaBlur = useCallback(() => {
    setFormulaFocused(false);
    if (formulaValue !== rawValue) {
      onCellEdit(sel.col, sel.row, formulaValue);
    }
  }, [formulaValue, rawValue, sel, onCellEdit]);

  const handleFormulaKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setFormulaValue(rawValue);
      setFormulaFocused(false);
    }
  }, [rawValue]);

  const toggleBold = () => onFormat({ bold: !currentFmt?.bold });
  const toggleItalic = () => onFormat({ italic: !currentFmt?.italic });
  const setAlign = (align: "left" | "center" | "right") => onFormat({ align });

  return (
    <div className="sheet-toolbar">
      {/* Cell reference label */}
      <div className="sheet-toolbar-cell-ref">{cellLabel}</div>

      {/* Formula bar */}
      <input
        className="sheet-formula-bar"
        value={formulaFocused ? formulaValue : rawValue}
        onChange={(e) => setFormulaValue(e.target.value)}
        onFocus={handleFormulaFocus}
        onBlur={handleFormulaBlur}
        onKeyDown={handleFormulaKeyDown}
        placeholder="Enter value or formula (=SUM...)"
      />

      <div className="sheet-toolbar-sep" />

      {/* Format buttons */}
      <button
        className={`sheet-tb-btn${currentFmt?.bold ? " active" : ""}`}
        onClick={toggleBold}
        title="Bold"
      >
        <strong>B</strong>
      </button>
      <button
        className={`sheet-tb-btn${currentFmt?.italic ? " active" : ""}`}
        onClick={toggleItalic}
        title="Italic"
      >
        <em>I</em>
      </button>

      <div className="sheet-toolbar-sep" />

      {/* Alignment */}
      <button
        className={`sheet-tb-btn${currentFmt?.align === "left" ? " active" : ""}`}
        onClick={() => setAlign("left")}
        title="Align left"
      >
        &equiv;
      </button>
      <button
        className={`sheet-tb-btn${currentFmt?.align === "center" ? " active" : ""}`}
        onClick={() => setAlign("center")}
        title="Align center"
      >
        &#8801;
      </button>
      <button
        className={`sheet-tb-btn${currentFmt?.align === "right" ? " active" : ""}`}
        onClick={() => setAlign("right")}
        title="Align right"
      >
        &equiv;
      </button>

      <div className="sheet-toolbar-sep" />

      {/* Number format */}
      <select
        className="sheet-tb-select"
        value={currentFmt?.numFmt || ""}
        onChange={(e) => onFormat({ numFmt: e.target.value || undefined })}
      >
        {NUM_FORMATS.map((f) => (
          <option key={f.id} value={f.fmt}>{f.label}</option>
        ))}
      </select>

      {/* Background color */}
      <div className="sheet-tb-picker-wrap">
        <button
          className="sheet-tb-btn"
          onClick={() => { setShowBgPicker(!showBgPicker); setShowFgPicker(false); }}
          title="Background color"
          style={{ borderBottom: `3px solid ${currentFmt?.bg || "transparent"}` }}
        >
          Bg
        </button>
        {showBgPicker && (
          <div className="sheet-tb-picker">
            {BG_COLORS.map((c) => (
              <button
                key={c || "none"}
                className="sheet-tb-color-swatch"
                style={{ background: c || "var(--bg)" }}
                onClick={() => { onFormat({ bg: c || undefined }); setShowBgPicker(false); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Text color */}
      <div className="sheet-tb-picker-wrap">
        <button
          className="sheet-tb-btn"
          onClick={() => { setShowFgPicker(!showFgPicker); setShowBgPicker(false); }}
          title="Text color"
          style={{ borderBottom: `3px solid ${currentFmt?.fg || "var(--text)"}` }}
        >
          A
        </button>
        {showFgPicker && (
          <div className="sheet-tb-picker">
            {FG_COLORS.map((c) => (
              <button
                key={c || "none"}
                className="sheet-tb-color-swatch"
                style={{ background: c || "var(--text)" }}
                onClick={() => { onFormat({ fg: c || undefined }); setShowFgPicker(false); }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
