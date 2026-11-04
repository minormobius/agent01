# BRIEF — testing-this

## What this is

The thread's prompt (norvid-studies' "good prompt" template, reused verbatim by
minormobius) asked for the history of the requester's own town "in as much
detail as possible... timeline, demographics, population, economic stats, main
events," with a specific interest in landmarks tied to obscure events and the
"historical layering" of neighborhoods/infrastructure built on top of each
other over time, plus "paths not travelled" — failed proposals. minormobius's
actual message named **Kansas City** specifically. A side-thread reply asked
"would a novelization do?" and got "even better or possibly equally good" —
that's two people riffing, not an instruction; I read it as license to be
creative in *presentation*, not as a directive to build fiction instead of the
literally-requested timeline/demographics/stats. I built the data-rich version.

Shipped: a single-page `index.html` — an intro, a filterable timeline (~43
entries, 1700s to 2026) tagged by category (Land & Peoples, Governance &
Conflict, Transportation & Infrastructure, Economy & Industry, Culture &
Society, Crises & Disasters, and a dedicated **Paths Not Taken** category for
failed proposals — the domed stadium, repeated rapid-transit plans that never
got built, the still-unfilled arena tenant bet), a canvas-drawn population
chart (1860–2020, decennial) with a "copy chart image" button and a raw-numbers
`<details>` table, and an economy table of major employers/sectors.

## Decisions

- **Data-rich timeline over novelization.** The requester's own message asked
  for stats and a timeline; the novelization idea came from someone else
  riffing in the thread and was never repeated by the requester themselves.
  If a follow-up specifically asks for a novelization, that's a genuinely
  different artifact (prose narrative, not a filterable reference page) — don't
  try to retrofit one onto this page, build it separately.
- **Category color + horizontal stagger for "layering," not a literal map.**
  The ask specifically wanted the "historical layering effect" made visible.
  I considered a literal wavy river-shaped SVG spine (KC's whole identity is
  the confluence) but that needed either a lot of per-row JS position math or
  a fixed-height canvas that wouldn't reflow with variable card heights on
  mobile — too much risk for the time budget. What shipped instead: each
  category gets a color and a fixed horizontal indent (`--depth`), so
  scrolling the timeline reads as loosely-stacked strata, and toggling a
  category's checkbox isolates just that layer. Cheaper and mobile-safe.
- **Canvas, not SVG, for the population chart** — per this requester's
  standing profile note (`lab/_profiles/minormobius.bsky.social.md`, "tests on
  mobile" entries): a flat raster is the primary diagram so native long-press
  "copy/save image" works, and I added an explicit "Copy chart image" button
  (ClipboardItem) plus a PNG download fallback, per their other standing
  preference for a prominent copy-image action on any chart.
- **No CARD.json.** This is a browse-and-filter page; the working screenshot
  is a better ad than a generated illustration, per the "usually do not" rule.
- **No PDS/auth at all.** Nothing here needs to be saved per-visitor and there's
  no handle-entry anywhere, so `kit.handleInput`/`pds.js` genuinely don't apply
  — this is pure reference content, not an interactive tool.

## The plan — what's not built yet

1. **The river-spine visual** is the most obvious next step if there's a
   follow-up: a real wavy SVG path down the timeline, with dots at each
   event's true vertical position (needs `getBoundingClientRect` measurement
   after render, since card heights vary) rather than the current flat
   color+indent scheme. This is the "hard part" I deliberately didn't attempt.
2. **Kansas side of the metro is thin.** This leans Missouri-side (Kansas
   City, MO) because that's the older, larger, more history-dense city of the
   pair; Kansas City, Kansas (Fairfax industrial district, Wyandotte County
   history, the Kansas River side of the confluence) gets only glancing
   mentions. A follow-up asking to balance the two sides is a real, scoped
   next task — add a fourth data table / a KCK-specific timeline lane.
3. **No map.** "Specific landmarks" was part of the ask; right now landmarks
   are named in prose (Union Station, 18th & Vine, the Country Club District,
   etc.) but there's no actual map pinning them. A Leaflet-free plain-canvas
   or SVG mini-map of downtown with the timeline's landmarks pinned to it
   would directly answer the "landmarks identified with events" part of the
   original ask better than prose alone does.
4. Metro-area population as a second chart line was deliberately left out
   (see Gotchas) — worth adding for real if a follow-up specifically wants it,
   with real per-decade metro-area figures rather than the single 2020 number
   currently used.

## Gotchas

- All facts here are from general/training knowledge — there is no network in
  this sandbox, so nothing was fact-checked against a live source. Population
  figures (decennial census, Kansas City, MO city proper) and the economy
  table are the parts most likely to have small errors; both are flagged with
  an on-page caveat already. Verify before treating any specific number as
  citable.
- I deliberately did NOT build a multi-decade metro-area population series —
  I was only confident in one point (~2.2M in the 2020 MSA), and inventing a
  plausible-looking curve through the other decades felt like exactly the kind
  of overclaiming the brief says not to do. Better to add real numbers later
  than guess now.
- `--dot` custom property is set inline per-legend-label and per-event via
  `style.setProperty`, then read by CSS (`background:var(--dot)`,
  `accent-color:var(--dot,var(--accent))`) — this only works because CSS
  custom properties inherit down the DOM tree; don't refactor this to computed
  classes without keeping that inheritance intact.
