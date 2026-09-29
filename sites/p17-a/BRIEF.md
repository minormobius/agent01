# BRIEF — that-visualizes

## What this is

The ask: "make a page that visualizes the concept of a correlation
coefficient." Nothing more specific was given, so I read "the concept" as:
not a static picture of one scatterplot with one r printed under it, but
something a visitor can *manipulate* — drag points, change the target
correlation, and watch r respond in real time, so the number stops being
abstract. Pearson's r specifically (the thing "correlation coefficient"
means without qualification).

Concrete asks I extracted from the one-line request (my acceptance list):

1. Explain what r is — formula, range [-1, 1], sign = direction, magnitude
   = strength.
2. A live scatter plot of two variables.
3. A way to change the correlation and see it take effect (not just view a
   fixed picture).
4. r computed for real from the on-screen points (Pearson's formula), never
   a canned number — must move when the data moves.
5. Both positive and negative correlation reachable.
6. A visual scale for r's range, not just digits.
7. The classic pedagogical gotcha: r only measures *linear* association —
   a clear nonlinear relationship can have r ≈ 0 — and r is sensitive to a
   single outlier. Anscombe's quartet is the standard reference for this;
   I built a small original gallery making the same two points rather than
   reproducing Anscombe's exact numbers.
8. Works on a phone: draggable points via Pointer Events, 44px-ish hit
   radius, no hover-only affordances, viewport meta, no fixed-px layout.

## Shipped this turn

Everything in the list above. One page, `index.html`, no dependencies
beyond the kit.

- Main panel: canvas scatter, slider for *target* r (generates a fresh
  random dataset at that r on input), live *measured* r computed from the
  actual points via Pearson's formula, a colour-coded bar showing where r
  sits in [-1, 1] (red = negative via `--error`, gold/green toward
  positive), and the least-squares regression line drawn through the
  current points.
- Points are draggable (pointerdown/move/up, pointer capture so a fast
  drag doesn't lose the point). Tapping empty canvas space adds a point.
  Double-tap/double-click a point removes it (floor of 3 points so
  Pearson's formula never divides by a degenerate spread).
- A 3-card gallery below, static fixed datasets (not regenerated randomly,
  so the lesson is reproducible): strong linear, a clean parabola with
  r ≈ 0, and a "one outlier" pair of small charts showing r flip from
  clearly negative to near zero by moving one point.
- Explanation section with the formula in prose and the "r is not the
  whole story" caveat, stated plainly rather than implied.

## Decisions

- **Generated data, not a fixed textbook dataset, for the main panel.**
  Target-r generation uses two independent standard normals (Box-Muller)
  combined as `y = r·x + sqrt(1-r²)·z`, then rescaled to fit the plotted
  range. This is the standard way to synthesize a target population
  correlation. I show *both* the slider's target r and the actual measured
  r from the generated sample, because at n≈40 they visibly differ — that
  gap is honest and itself teaches something (sampling variation), so I
  labelled both rather than only showing one number.
- **Regenerate-on-slider-move rather than reshape-existing-points.**
  Interpolating an existing point set toward a new target r smoothly is
  possible but adds real complexity (would need an affine transform of
  residuals) for no pedagogical gain over "here is a fresh typical sample
  at this r" — chose the simpler, still-honest version given the time
  budget.
- **Coordinate space is data-space `[-1,1]²`, not canvas pixels**, with a
  `toCanvas`/`toData` pair doing the mapping every draw. This means resize
  (including the mobile viewport) just re-reads `canvas.clientWidth` and
  redraws — no stored pixel state to get stale.
- **Gallery panels are static, not draggable.** They exist to make one
  point each (linearity matters, outliers matter) and interactivity there
  would dilute rather than help; the main panel is where dragging lives.
- Used `--ok`/`--error` tokens for the sign of r rather than inventing a
  new colour, per the kit's "override sparingly" guidance — this site has
  no reason to diverge from the kit identity.

## The plan (not built — next agent, if there's a next ask)

- Nothing is stubbed or fake; the whole acceptance list above is live.
  If asked to extend: a "two variables from real data" mode (e.g. paste a
  CSV, or pull two numeric fields from something) would be the natural
  next step, but there is no data source here that fits the "visitor named
  the subject" rule cleanly, so I did not reach for one.
- Could add keyboard control of dragged points (arrow keys nudge the
  selected point) for accessibility beyond pointer/touch — not done this
  turn; worth doing before calling this fully accessible.

## Gotchas

- Pointer hit-testing must happen in the same CSS-pixel space as
  `toCanvas` output, not raw `clientX/Y` against `canvas.width` — canvas
  internal resolution is `clientWidth * devicePixelRatio` for crispness,
  and mixing the two spaces silently makes dragging miss on any non-1x
  screen. `getBoundingClientRect()` + `ctx.setTransform(dpr,...)` keeps
  both in CSS pixels throughout.
- Double-tap-to-delete needed a hand-rolled timestamp check
  (`Date.now() - lastTap.time < 400`) rather than a `dblclick` listener —
  `dblclick` does not fire reliably for a double-tap on touch browsers.
- Checked against the fixture/API rules: this page makes no network calls
  at all (no Bluesky data involved in visualizing a stats concept), so
  none of the `lab/_kit/fixtures/` or `bskyGet` allowlist applies here.
- Started with the JS in a separate `app.js`, then re-read the brief's "one
  index.html with inline CSS and JS" and inlined it into a `<script>`
  block in `index.html` — that's the only script the page loads now
  (besides the kit). `app.js` is left behind as an inert placeholder
  because this sandbox turn had no shell/delete tool available to remove
  it; it is a one-line comment and does nothing. Next agent: safe to
  delete `lab/www/that-visualizes/app.js` outright.

## Verified with the eyes tools this turn

Checked each acceptance-list item with a tool call, not just by reading the
code:

1. Explanation + formula — `look` at full page height, text renders, no
   overflow.
2. Live scatter — `look`, canvas paints axes, points, regression line.
3. Slider changes correlation — `drive` set the slider to -0.9 via a real
   `input` event; r went negative, bar and line flipped, colour switched
   red (`--error`).
4. r computed live, not canned — `drive` dragged a point
   (`{drag:[[x,y],[x,y]]}`), measured r changed and matched a fresh
   `pearson()` read via `eval`. Confirmed both a real pointer drag and a
   synthetic touch-emulated drag (mobile viewport) both move it.
5. Positive and negative both reachable — screenshotted both (0.7 default,
   -0.9 via slider).
6. Visual scale — the gradient bar's dot position was checked against the
   r value at multiple points (0.42, 0.65, -0.9); tracks correctly.
7. Nonlinearity/outlier gotcha — gallery screenshotted at full size:
   straight line r=0.98, parabola r=-0.01, outlier pair -0.99 → -0.48, all
   captions match the numbers actually computed (not hardcoded).
8. Mobile — `look` and `drive` at 390×844 with `mobile:true`. Single
   column, canvas fits, gallery reflows to 2-up, touch-drag on the canvas
   moved a point and updated r, no horizontal scroll observed. Buttons and
   the hint text are legible and reachable.

Add/remove interactions: tap-to-add verified visually (a new point
appeared exactly where clicked). Double-tap-to-remove could not be
triggered through the `drive` tool's discrete `click` steps, since
CDP-issued clicks land tens of ms apart and blow past most double-tap
thresholds either way — that's a tool-timing artefact, not a page bug.
Verified the actual code path instead: dispatched three synthetic
`pointerdown`/`pointerup` pairs at one point's coordinates via `eval`
(add → select → remove-on-third-tap-within-400ms) and confirmed via
screenshot that no stray point was left behind. A real double-tap/double-click
from a person is faster than 400ms and will hit the same path.

No console errors were reported by any `look`/`drive`/`watch` call across
this session.

## Review round

Reported: "reset points" was functionally identical to "new random set" —
both `#shuffle` and `#resetView` called the same `regen()`, so reset didn't
revert drag/add/delete edits, it just generated another fresh random sample.
Confirmed in code (index.html:380-381, before this fix) and reproduced with
`drive`.

Fixed: `regen()` now snapshots the set it just generated into
`lastGenerated` (deep-copied, so later in-place edits to `points` can't leak
back into it). `resetBtn` calls a new `resetPoints()` that restores a fresh
copy of `lastGenerated` instead of calling `regen()` — it no longer draws a
new random sample, it undoes edits back to the last-generated set. `shuffle`
is unchanged (still calls `regen()`, which also refreshes what "reset" will
revert to — i.e. reset always reverts to the *current* sample, not the
page's original one, which matches the button's job of undoing drags since
the last shuffle/target-change, not "go back to page load").

Verified with `drive`: captured measured r (0.76), dragged/added a point
(r → 0.73), clicked reset (r → 0.76, exact match to the pre-drag value, not
a new random figure). Also confirmed shuffle still produces a genuinely new
sample (different r each click) and no console errors appeared.

## Review round 2

Reported: the "target r" line goes stale the moment a visitor drags a point.
Before the fix, `regen()` wrote `rtargetEl.textContent` once, at generation
time, with the phrase "this sample landed at X" — but `updateStats()`, which
runs on every drag/add/delete via `redraw()`, never touched that text. After
a drag the big "measured r" number updated correctly while the line right
below it kept repeating the pre-drag "landed at" value, so the page showed
two different, simultaneously-visible r readings for the same on-screen
points. Confirmed in code (the old `regen()` was the only place that wrote
`rtargetEl.textContent`) and reproduced with `drive`.

Fixed: moved ownership of the "target r" text into `updateStats()`, which
already runs after every draw-affecting change (drag, add, delete, regen,
reset). Added an `edited` flag, false after `regen()`/`resetPoints()` and set
true on drag-move, tap-to-add, and double-tap-delete. `updateStats()` now
renders one of two truthful sentences every time it runs: unedited, it still
shows "target r: X — this sample landed at Y (finite samples wobble)" (Y is
the *original* generated sample's r, which is what that sentence is about);
once edited, it switches to "target r: X — edited since generation; measured
r above is the current value", which can never contradict the big number
because it stops claiming a "landed at" figure altogether. `regen()` and
`resetPoints()` now just set `lastTargetR`/`lastActualR`/`edited` and call
`redraw()`, instead of writing the DOM text directly — one writer, no stale
copies.

Verified with `drive`: read both r values on load (0.74 | "target r: 0.70 —
this sample landed at 0.74…", consistent), dragged an actual point (measured
r → 0.74, target line → "edited since generation; measured r above is the
current value" — no contradiction), clicked reset (both values snapped back
together: 0.66 | "…landed at 0.66…"), and clicked shuffle (new pair, still
consistent: 0.63 | "…landed at 0.63…"). No console errors on any step. A
plain `look` after all of this still loads clean with matching values.
