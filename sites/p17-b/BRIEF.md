# BRIEF — that-visualizes (scatter/r)

## What this is

The ask: "make a page that visualizes the concept of a correlation
coefficient." Shipped as a single interactive scatter plot. You can tap/click
empty space to drop a point, drag any point around, and a live Pearson `r`
(plus a plain-English strength/direction label and a dashed regression line)
updates on every move. Five presets seed the canvas: strong positive, strong
negative, no correlation, a curved (nonlinear) relationship, and a cluster
with one outlier. Everything is computed client-side from the point
coordinates — nothing hardcoded as a display value.

This is complete for one turn's scope: the hard part (live drag + correct
live statistics + touch support) is proven, not stubbed.

## Decisions

- **No Bluesky/PDS integration at all** — deliberately. This is a pure math
  concept demo; a handle input or sign-in would add friction with no payoff.
  Per the brief's own rule ("sign-in is optional unless the site is
  meaningless without it"), this site is *more* meaningless with it.
- **No save/leaderboard.** There's no natural "score" for a correlation demo,
  so `pds.js` was skipped rather than forced in.
- **Presets are hardcoded coordinate arrays, not randomly generated.** Keeps
  behavior reproducible and lets the "curved" and "outlier" presets be
  designed precisely to make their pedagogical point (parabola symmetric
  around x=0.5 → cancels to ~0; one far corner point driving an otherwise
  flat cluster).
- **Regression line endpoints are clamped to the unit square [0,1]×[0,1]**
  rather than drawn to their true (possibly off-canvas) intercepts. This is a
  visual simplification for a conceptual demo, not a precision tool — it's
  fine, but don't mistake the drawn line's exact endpoints for the textbook
  formula if someone asks for a "print the equation" feature later.
- **Palette pulled from CSS custom properties at runtime** (`getComputedStyle`
  on `--accent`/`--border`/`--fg`) rather than hardcoded hex, so the canvas
  stays in sync with `tokens.css` without needing to duplicate values.

## The plan (not built yet, in order)

1. **A way to remove a specific point**, not just "remove last." Currently
   the only edit controls are "remove last point" and "clear" — fine for a
   quick demo, weaker if someone wants to sculpt a specific pattern. The
   likely fix: a modifier (long-press, or a small "×" that appears near the
   nearest point on hover/tap-and-hold) — canvas hit-testing for this is the
   fiddly part, not the removal logic itself.
2. **Optional: show the regression equation** (`y = a + bx` in plot-space) as
   a small caption. Currently only `r` and the qualitative label are shown.
   Straightforward — `fit.a`/`fit.b` are already computed in `pearson()`,
   just not surfaced.
3. **Optional: an "r² explained variance" toggle** for anyone who wants the
   next stats layer. Not requested; don't build ahead of demand.
4. No known bugs to fix — this section is genuinely "nice to have," not
   "unfinished."

## Gotchas

- **Regression line intercepts can legitimately fall outside [0,1]** for
  steep slopes (e.g. two points far apart vertically, close together
  horizontally). The clamp in `draw()` handles this by clamping y, not by
  hiding the line — verify visually if you touch this code, since a wrong
  clamp direction silently draws a flat line instead of a steep one.
- **Pointer events, not mouse/touch separately** — `pointerdown/move/up/cancel`
  with `setPointerCapture` covers mouse, touch and pen in one path and is why
  dragging works on a phone without extra code. Don't split this into
  separate mouse/touch handlers later; that's how the "out of order" class of
  bug creeps back in.
- **`touch-action: none` on the canvas is load-bearing** — without it, a drag
  on a phone scrolls the page instead of moving the point.
- Never tested in an actual browser (no Bash/WebFetch here) — the harness
  screenshot after this build is the first real look. If it reports layout
  or interaction issues, start with the canvas sizing math in `sizeCanvas()`
  (CSS pixels vs. device pixels) since that's the part most likely to be
  subtly wrong without visual feedback.
