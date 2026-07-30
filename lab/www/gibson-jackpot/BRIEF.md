# BRIEF — gibson-jackpot

## Turn 2 — fixed the "not working" report

The requester said "don't think it's working buddy" with no detail. Found it
by reading the code cold: the reveal line was

    document.getElementById('resultsWrap').style.display = '';

`#resultsWrap` is hidden by a rule in the `<style>` block (`display:none`),
not by an inline `style=""` attribute. Clearing an *inline* property that was
never set does nothing — the stylesheet rule just kept winning. So pressing
"compute survival" silently did nothing: no error, no stats, no charts, ever,
for every visitor. Changed it to `= 'block'`, which actually overrides the
rule. This was very likely the entire complaint — everything downstream of
that line (the model, the three charts) was already correct on paper per the
turn-1 brief; it just never got shown.

Also gave `input[type=number]` (age, income) real styling — they'd fallen
through the kit's `input:not([type])` selector unstyled, so they rendered as
tiny native number spinners next to the styled `select`/`range` controls.
Cheap fix, done while already in the file.

**Not yet re-verified in a real browser** — same tooling gap as turn 1, but
this time the harness's post-build screenshot is the thing that actually
proves it, not my reading. If the screenshot still shows nothing after
clicking compute, the next place to look is whether `resultsWrap.scrollIntoView`
or the chart-building code throws before reaching the display line — check
the console, not the CSS, this time.

## What this is (turn 1)

A mortality calculator: pick a country (map or dropdown), enter age plus
either an SES percentile or an income, and the page runs a proportional-hazards
survival model — country risk × state resilience × SES, on top of standard
Gompertz–Makeham aging — and plots your survival curve. Layered on top is a
fixed "jackpot" scenario, the same for every visitor: a slow-motion global
excess-mortality ramp calibrated so world population lands at 20% of today's
by 2099 (the request's "80% decline by 2099"). Two more charts show that
population curve and how newborn life expectancy erodes under the same
scenario, birth-year by birth-year, 2024–2099. This shipped complete and
working in one turn — nothing here is a stub.

## Decisions

- **No real geo/topojson data exists anywhere in the kit or repo** (checked —
  nothing under `_kit/` or vendored elsewhere), and there's no network access
  to fetch any. Building an actual bordered world map was out of scope for one
  turn, so the "map" is a hand-placed dot scatter (49 countries, equirectangular
  projection, lat/lon from memory) rather than real cartography. The page says
  so explicitly rather than pretending precision it doesn't have.
- **Country risk/resilience scores are hand-estimated, not sourced.** No
  network access means no real life-expectancy or governance dataset was
  available to pull from. Rather than fabricate false precision, the page
  states outright that these are illustrative guesses for a toy model. If a
  future turn has a way to bring in real data (a vendored CSV, say), replace
  `COUNTRIES` in the script and keep the disclosure honest either way.
- **Income → SES percentile uses one global log-normal reference, not
  per-country income tables.** Same reasoning: no data source to build real
  per-country distributions from in the time available. Disclosed in the UI
  copy next to the income field.
- **No Bluesky sign-in, no `pds.js`.** This calculator is fully meaningful
  without an account — nothing here needs saving across visits — so per the
  kit's own rule ("sign-in optional unless the site is meaningless without
  it"), it was left out entirely rather than bolted on for its own sake.
- **Dual-axis was avoided on purpose.** "Expected lifespan vs population" is
  built as two stacked single-series charts sharing a 2024–2099 x-axis
  (population % and newborn life-expectancy-in-years), not one chart with two
  y-scales, per the dataviz skill's non-negotiable.

## The plan — what's not built yet, in order

1. **Real map tap targets on phones.** The dot-hit-circles are ~24px
   diameter in SVG user-space, which shrinks below the 44px guidance once the
   viewBox scales down on a narrow screen — the native `<select>` is the fully
   accessible fallback, but the map itself is a known miss on small screens.
   Next step: either a cartogram-style layout that spaces markers apart
   regardless of true geography (so hit circles can be bigger without
   overlapping), or a two-level UI — continent buttons first, then a
   country list per continent.
2. **Real per-country data**, if a source ever gets vendored — replace the
   hand-guessed `risk`/`res` numbers in the `COUNTRIES` array with something
   sourced, and say in the copy that it's sourced.
3. **Save a run to the visitor's own repo** (`labPds`) so they can compare a
   result against an earlier one — genuinely optional, the model works fully
   without it, but was the natural "next" feature that didn't fit the turn.
4. **Country outlines** if a topojson/geojson file is ever vendored into
   `_kit/` — would upgrade the scatter into an actual world map.

## Gotchas

- The `NOW_YEAR` constant is hardcoded to 2026 (today's date per the task
  context) rather than read from `Date.now()` — deliberate, so the model is
  reproducible and doesn't silently drift as visitors load the page across
  future years without the jackpot ramp being re-checked. Worth revisiting if
  this site is still live well past 2026.
- The survival integration is capped at age 100 and disclosed as such in the
  copy — true remaining-life-expectancy integrals run to infinity, but a
  numeric cutoff is normal for this kind of model and doesn't materially
  change the result for realistic ages.
- Untested in an actual browser by me (no network/shell tools available this
  turn) beyond reading the code closely — the harness will screenshot it
  under the real CSP after this ships; if `lineChart`'s SVG viewBox math is
  off on real render (e.g. text labels colliding with the axis), that's the
  first place to look.
