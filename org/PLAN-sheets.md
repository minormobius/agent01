# Sheets — Encrypted Spreadsheet for Org Hub

## Overview

A from-scratch spreadsheet engine living at `/sheets` in the org hub. No external grid libraries — pure React + CSS Grid + a custom formula evaluator. Encrypted via sealed envelopes like everything else.

This is the heaviest UI component in the hub. The plan is layered: get a working grid with formulas first, then add collaborative features and rich formatting.

---

## Architecture

### Data Model (`sheets/types.ts`)

```
Sheet
├── name: string
├── cells: Map<string, Cell>          // keyed by "A1", "B12", etc.
├── cols: ColumnMeta[]                // width, label overrides
├── rows: RowMeta[]                   // height overrides
├── frozenRows: number                // header freeze
├── frozenCols: number                // row-label freeze
├── namedRanges: Map<string, string>  // "revenue" → "B2:B13"
├── createdAt, updatedAt
└── attachments?: VaultBlobRef[]

Cell
├── raw: string                       // what the user typed ("=SUM(A1:A5)" or "42")
├── value: CellValue                  // computed result (number | string | boolean | null | CellError)
├── format?: CellFormat               // number format, alignment, bold, bg color, etc.
└── note?: string                     // cell comment

CellFormat
├── numFmt?: string                   // "#,##0.00", "0%", "$#,##0", "yyyy-mm-dd"
├── bold?: boolean
├── italic?: boolean
├── align?: "left" | "center" | "right"
├── bg?: string                       // hex color
├── fg?: string                       // text color
├── wrap?: boolean
```

### Formula Engine (`sheets/formula.ts`)

Custom parser + evaluator. No eval(), no Function constructor. AST-based.

**Phase 1 — Core functions:**
- Arithmetic: `+`, `-`, `*`, `/`, `^`, `%`, unary `-`
- Comparison: `=`, `<>`, `<`, `>`, `<=`, `>=`
- References: `A1`, `A1:B5` (ranges), `Sheet2!A1` (cross-sheet, later)
- Math: `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `ABS`, `ROUND`, `CEILING`, `FLOOR`
- Logic: `IF`, `AND`, `OR`, `NOT`, `IFERROR`
- Text: `CONCATENATE`/`&`, `LEFT`, `RIGHT`, `MID`, `LEN`, `TRIM`, `UPPER`, `LOWER`, `TEXT`
- Lookup: `VLOOKUP`, `INDEX`, `MATCH`
- Stats: `MEDIAN`, `STDEV`
- Date: `NOW`, `TODAY`, `DATE`, `YEAR`, `MONTH`, `DAY`

**Evaluation strategy:**
- Topological sort of cell dependency graph
- Detect circular references → `#CIRC!` error
- Lazy recomputation — only recalc cells in the dirty subgraph
- Cell references parsed into `{sheet, col, row, absolute}` tuples

### Grid Renderer (`sheets/Grid.tsx`)

CSS Grid-based virtualized renderer:
- Only render visible rows/cols (virtualization via `position: sticky` headers + scroll handler)
- Viewport window: track `scrollTop`/`scrollLeft`, compute visible row/col range
- Render ~50 rows × ~20 cols at a time with buffer rows above/below
- Column resize via drag handles
- Row resize via drag handles
- Frozen rows/cols via `position: sticky` with appropriate `z-index`

### Cell Editor

- Double-click or type to enter edit mode
- Formula bar at top shows raw content of selected cell
- Tab/Enter/arrow keys navigate (Enter moves down, Tab moves right)
- Escape cancels edit
- Multi-cell selection via shift+click or shift+arrow
- Copy/paste support (clipboard API for TSV format)

### Selection Model

```
Selection
├── anchor: CellRef          // where selection started
├── cursor: CellRef          // where selection ends (for range)
├── ranges: CellRange[]      // multi-select (ctrl+click)
```

### Toolbar

Minimal but functional:
- **Bold** / **Italic** toggle
- **Alignment** (left/center/right)
- **Number format** dropdown (General, Number, Currency, Percent, Date)
- **Cell background** color picker (8 preset colors)
- **Text color** picker
- **Merge cells** (for headers)
- **Freeze rows/cols** toggle
- **Function insert** helper (dropdown of available functions)

---

## File Structure

```
org/src/sheets/
├── types.ts            — Cell, Sheet, CellFormat, CellValue, CellRef, CellRange
├── context.ts          — Sealed envelope CRUD (same pattern as notes)
├── formula.ts          — Tokenizer + parser + evaluator + dependency graph
├── cellRef.ts          — A1 notation parser, range utilities, col↔number conversion
├── SheetsApp.tsx       — Main app shell (sheet list, org filter, new/open)
├── Grid.tsx            — Virtualized grid renderer
├── Toolbar.tsx         — Format bar + formula bar
├── useSheet.ts         — Sheet state hook (cells, selection, undo/redo, recalc)
└── clipboard.ts        — Copy/paste TSV handling
```

---

## Implementation Order

### Step 1: Core types + cell references
- `types.ts` — all data types
- `cellRef.ts` — A1 parsing, range expansion, col letter ↔ number

### Step 2: Formula engine
- `formula.ts` — tokenizer, recursive descent parser, evaluator
- Dependency graph + topological sort recalculation
- ~30 functions covering math, logic, text, lookup

### Step 3: Sheet state hook
- `useSheet.ts` — cell CRUD, selection, navigation, undo/redo stack
- Recalculation triggers on cell edit

### Step 4: Grid renderer
- `Grid.tsx` — CSS Grid with virtualization, frozen headers
- Cell rendering (formatted values, alignment, colors)
- Inline cell editor (activated on double-click or keypress)
- Selection highlighting (single cell + ranges)

### Step 5: Toolbar + formula bar
- `Toolbar.tsx` — format controls, function helper
- Formula bar showing raw content of active cell

### Step 6: Clipboard
- `clipboard.ts` — copy selection as TSV, paste TSV into grid

### Step 7: Sealed envelope integration
- `context.ts` — save/load encrypted sheets via PDS
- `SheetsApp.tsx` — app shell with sheet list, new/open/delete, org filter

### Step 8: Wire into hub
- Add to APPS array, App.tsx routes, AppGrid navigation

### Step 9: CSS
- Grid styles, toolbar styles, cell editor styles, selection styles

---

## Key Design Decisions

1. **No external deps** — Pure React. The formula engine is custom. Grid is CSS Grid + scroll virtualization. This keeps the bundle lean and avoids dependency risk.

2. **Sealed envelopes, not Wave ops** — Each sheet is a single encrypted record. Collaborative editing (OT/CRDT) is a future concern. For now, last-write-wins at the sheet level, same as notes/strategy.

3. **Formula engine is sandboxed** — No eval(). Recursive descent parser produces an AST, evaluator walks it. Cell references resolve through the dependency graph. This is safe and auditable.

4. **Virtualization** — Only render visible cells. A 10,000-row sheet should feel responsive. The trick is measuring row/col offsets and using `transform: translate()` to position the visible window.

5. **Number formatting** — Custom formatter based on format strings (#,##0.00 etc). Not full Excel compat, but covers 95% of use cases: currency, percent, dates, decimals.

6. **Undo/redo** — Command pattern. Each edit produces a reversible command pushed onto a stack. Ctrl+Z/Ctrl+Y traverses the stack.

---

## What This Enables

Once the spreadsheet exists, it becomes infrastructure for:
- **Strategy** — financial models, scoring matrices with formulas, scenario planning
- **PM** — budget tracking, resource allocation, earned value tables
- **CRM** — pipeline forecasts, commission calculators, revenue projections
- **General** — any structured data the org needs to model, all encrypted

The blob layer means you can also attach files to sheets (supporting docs, exports).

---

## Scope & Complexity

This is the largest single feature in the hub. Rough sizing:
- `formula.ts` — ~400 lines (tokenizer + parser + evaluator + functions)
- `cellRef.ts` — ~100 lines
- `useSheet.ts` — ~300 lines
- `Grid.tsx` — ~350 lines
- `Toolbar.tsx` — ~150 lines
- `SheetsApp.tsx` — ~200 lines
- `types.ts` — ~80 lines
- `context.ts` — ~100 lines
- `clipboard.ts` — ~60 lines
- CSS — ~200 lines
- **Total: ~1,900 lines**

Build in the order above. Each step produces something testable.
