# The deck format: usability laws

A deck is a run of phone-sized slides. Each slide is one live widget with
lecture notes on a sheet over it. These laws apply to every deck built in this
format. **Machine-checked** laws are enforced by `browser.selftest.mjs`, which
preflight runs whenever this directory changes. The rest are checked in review.

## The widget

**1. One idea per slide.** The title states the idea. The caption takes two
sentences at most. If a slide needs a second widget, it is two slides.

**2. Every slide asks you to do something, and the widget notices.** The `do`
line names one action on the widget ("pin t to within 0.01 of the first
zero"). The widget calls `ctx.done()` when you have actually done it, not when
you scroll past. *Machine-checked: every slide has a `do`.*

**3. Every chart has a cursor that reaches every data point.** *Machine-checked.*
- The cursor **snaps to real data**: the points the chart was drawn from. It
  never interpolates a value that was not computed.
- It shows **every series at that point**, each in its own colour, with its
  value, and the x it belongs to.
- It works by **pointer** (hover, or press-and-drag on touch) and by
  **keyboard**: Tab focuses the chart, ← → step through points (↑ ↓ for
  vertical layouts), Home and End jump to the ends, and Esc hides it.
  Keystrokes on a focused chart never turn the page.
- It **survives redraws**. Moving a slider keeps the cursor on the same data
  point.
- A heatmap's data points are its cells: the cursor snaps to a cell centre and
  the arrow keys walk cells (Shift for 10 at a time).
- Use `cursor()` from `kit.js`. A chart drawn without it fails the test.

**4. Light, dark, or the system's choice, on every page.** A toggle in the
header cycles auto → light → dark and is remembered (`proofs-theme`). Every
colour is a CSS token. Charts read the tokens when they draw and redraw when
the theme changes, so no chart hard-codes a colour. *Machine-checked: the
toggle changes the page background, and a chart's strokes change with it.*

**5. The widget owns its gestures.** Sliders, drags and taps on the stage
never turn the page. Pages turn from the sheet (a sideways swipe), the arrow
buttons, the progress bars and the ← → keys, but not while a chart has focus.
A drag across a chart moves its cursor and **never starts a text selection**:
the chart and its labels are unselectable, and on touch the long-press
selection and callout are suppressed (`noSelect()` in `kit.js`, applied by
`cursor()`). The notes stay selectable. *Machine-checked: a corner-to-corner drag
over every chart selects nothing, and the caption can still be selected.*

## The notes

**6. Notes go over the widget, never instead of it.** At peek the sheet covers
at most 46% of the screen, and the widget lays itself out in the rest. Opening
the full notes dims the widget but leaves it in place. *Machine-checked: the
peek height.*

**7. Predict before the reveal.** Where the answer is surprising, the slide
asks for a prediction first. Answers commit: you cannot change one after the
reveal. The reveal says why.

**8. Recall at the end.** A deck ends with questions answered from memory,
each linking back to its slide.

## Honesty

**9. Numbers come from the engine.** The deck computes nothing of its own
beyond plotting. The engine's selftest holds every number a slide shows to a
known value.

**10. Label what a chart is.** Claims are drawn in the claim colour. A
qualitative picture says "shape only". Log axes say so.

## The page

**11. Phone first.** Nothing scrolls sideways at 390 px. Touch targets are at
least 2rem tall. *Machine-checked: no horizontal scroll.*

**12. Resumable and linkable.** `#n` opens slide n. Progress, predictions and
answers are saved in this browser only, and every storage access is wrapped
so a private window still works.

**13. Nothing breaks.** No console errors on any slide in either theme.
*Machine-checked.*
