# BRIEF — gibson-jackpot

## What was asked (in my own words)

Build a mortality/demography toy called "Gibson Jackpot": pick a country from a
map, enter age plus income-or-SES-percentile, and get an individual survival
curve out of an age-based proportional-hazards model driven by three factors —
country risk, state resilience, and personal SES. Also show expected lifespan
plotted against population, and separately model an 80%-by-2099 world
population decline (the title's "jackpot" — the slow multi-causal collapse
trope from climate/futurist speculative fiction, e.g. Gibson's own *The
Peripheral*, referenced only as inspiration for the idea, not as an affiliated
product).

## Checklist (acceptance test — verified with the eyes tools, not just read)

1. [x] Pick a country via a map. Verified: clicked a canvas point (desktop and
   mobile touch emulation), saw the tooltip and the "Selected:" line update;
   also typed "jap"/"niger"/"braz" into the text filter and both mouse-click
   and Tab+Enter keyboard selection worked on the dropdown rows.
2. [x] Enter age. Verified 0, 30, 45, 99, and -5 (rejected with a visible
   error, doesn't silently clamp).
3. [x] Income OR SES percentile toggle. Verified both fields render, both
   validate, and switching modes swaps which field is required.
4. [x] Real proportional-hazards computation — Gompertz baseline × calibrated
   country-risk multiplier × resilience × SES × the shared jackpot-year
   multiplier. Verified monotonicity directly: raising SES percentile from 10
   to 90 (same country/age) raised expected lifespan 44.9 → 47.5; nothing is a
   lookup table.
5. [x] Survival curve + expected lifespan by numeric integration (trapezoid
   rule over the hazard, not a formula plugged in after the fact). Verified
   visually at several ages, including the age=99 edge case (curve still
   renders, no NaN/blank chart).
6. [x] "Expected lifespan vs population" scatter, all 50 countries, selected
   one enlarged/labelled. Verified the selected country's own label roughly
   matches the figure printed under the map (see GOTCHAS — this needed a real
   fix, wasn't true on the first pass).
7. [x] World population 2024→2099: true single-year-age cohort simulation,
   annual births/deaths, shock intensity solved by bisection to hit exactly
   20% of 2024's population by 2099. Verified the chart's own end value reads
   1.62bn against a 2024 value of 8.10bn — 20.0%, not approximately.
8. [x] Mobile. Verified at 390×844 and 360px width: no horizontal scroll,
   toggle buttons now fit without clipping (see GOTCHAS), 44px targets on
   toggle/compute buttons, no hover-only affordance (map tooltip is a bonus on
   top of tap-to-select, never required), reduced-motion respected for the
   one animated thing (scroll-into-view falls back to instant).
9. [x] `<title>`, og:title, og:description present; copy says "toy" / "not a
   forecast" up front rather than after the fact.
10. [x] All country figures captioned as approximate/illustrative; page makes
   zero network calls (no bskyGet usage — there was no visitor-named subject
   to look up for this particular site, so the kit's Bluesky helpers go
   unused here, which is correct, not an oversight).

## Decisions

- **Single inline `<script>`, not separate .js files.** The brief said "one
  index.html with inline CSS and JS" explicitly, so despite the size (data +
  model + app), it's all one `<script>` block using comment markers
  (`/* ===== DATA/MODEL/APP ===== */`) to keep it navigable.
- **The individual hazard model and the world population model share the same
  jackpot trajectory** (`JACKPOT.result.jByYear`), computed once and read by
  both. This was a deliberate design choice over building two unrelated
  "vibes-based" charts — a 20-year-old's survival curve actually runs into the
  same rising shock the population chart shows, scaled by their country's
  resilience.
- **State resilience does double duty**: a small direct hazard modifier today
  (`resilienceNowMult`, ±~15%) plus a much larger amplifier on how hard the
  future jackpot hits that country (`ampFactor = (100-res)/50`, ranging
  0–2×). This was intentional — resilience is framed as "capacity to absorb
  future shocks," so most of its effect should show up in the tail, not now.
- **Country risk multipliers are solved by bisection to reproduce each
  country's own stated life expectancy exactly** (at neutral resilience),
  rather than a hand-picked exponential formula. See GOTCHAS — the formula
  version was off by up to 9 years for the lowest-LE countries.
- **No CARD.json.** This is a tool people need to open and interact with; the
  screenshot-based link card is the better advert than a generated image, per
  the brief's own guidance.
- **Map is a stylised lon/lat scatter on a graticule, not real coastlines.**
  Hand-drawing accurate low-res coastlines in the time available risked
  looking worse than admitting the stylisation; the grid/dot aesthetic also
  fits the "Gibson" cyberpunk framing better than a literal atlas would.

## The plan (not built — in priority order)

1. **Only 50 countries.** The filter and map both degrade gracefully with
   more, so the next easy win is just adding rows to the `COUNTRIES` array —
   no code changes needed, just more (still illustrative) data points.
2. **No URL-based sharing of a result** (country+age+SES as query params).
   Would be a small, self-contained addition: read `location.search` on load,
   write it on compute. Not done because it wasn't asked for and time went to
   getting the model itself right instead.
3. **No use of `/_kit/pds.js`.** There's no natural "save" here — a computed
   number isn't really a document worth persisting — but if a future ask adds
   a leaderboard of "who got the shortest jackpot-adjusted lifespan among
   people you follow," that's exactly the `store.scoresOf()` shape and it's a
   genuine visitor-named-subject use, not a rule violation.
4. **The birth-rate decline during the jackpot is a single hand-picked
   dampening curve** (`birthDamp`, floor 0.3), not itself calibrated to
   anything. If someone wants the death/birth split behind the 80% decline
   argued more carefully, that function is the one to rebuild — right now
   it's "plausible shape," not "solved for."

## Gotchas (would not be obvious from reading the code cold)

- **`input[type=number]` is NOT covered by `tokens.css`** — that stylesheet
  only styles `input[type=text]` and `input:not([type])`. All three numeric
  fields (age/income/percentile) silently fell back to the unstyled Chrome
  default, which renders at **13.3333px** — under the 16px mobile floor, so
  it would have triggered iOS zoom-on-focus on every single input on this
  page. Caught only by checking `getComputedStyle(...).fontSize` directly,
  not by looking at a screenshot (it looked like a plain white box, which
  read as "unstyled but probably fine" until measured). Added a local
  `input[type=number]` rule mirroring the kit's own input style. **If a future
  lab site uses number inputs, check this before assuming the kit covers it.**
- **The exponential-formula country-risk multiplier undershot low-LE
  countries badly**: Nigeria's stated life expectancy of 53 came back out of
  the model as 62 when the multiplier was `exp((anchor - le) * k)`. The
  hazard→life-expectancy relationship isn't linear in log-multiplier space
  over a 30+ year spread — it compresses at the extremes because of the
  Makeham floor term. Fixed by bisecting for the exact multiplier per
  country instead of trusting the formula. Worth remembering for any future
  hazard-curve work here: **don't hand-derive the multiplier-to-outcome
  relationship, solve for it.**
- **The eyes tools each start a fresh page load** — state set in one
  `drive`/`look` call does not persist into the next call. Any test that
  depends on prior UI state (select a country, then compute) has to happen in
  one `drive` call's `steps` list, not across two.
- **The jackpot's solved intensity is large (~46×** peak hazard multiplier).
  That's real, not a bug: a Gompertz curve's youth/working-age hazard is so
  low that reaching an 80% population decline in 75 years, even with fertility
  also declining, needs a genuinely severe shock. Flagged in NOTE.txt so the
  requester doesn't think it's an error.
