# daily-digital — handoff

## What this is

Requested: "daily digital calendar with an almanac and a daily word puzzle."
Three words doing real work — **daily**, **almanac**, **word puzzle**. Read
as three concrete deliverables:

1. A calendar — a month grid, today highlighted, that a visitor can browse.
2. An almanac — real computed facts about a date: moon phase (rendered, not
   just named), sunrise/sunset for a location, day length, season, zodiac
   sign, week number, day-of-year/days-remaining.
3. A daily word puzzle — a guess-the-word game where everyone gets the same
   puzzle on the same calendar day (deterministic from the date, not random
   per visit), with limited guesses and letter feedback.

Acceptance list, checked with the eyes tool (screenshots + drive scripts) before
calling this done — see notes after each:

- [x] Month calendar renders, today is visually distinct, prev/next month
      navigation works, clicking a day updates the almanac panel for that date.
      Verified: clicked Sept 30, almanac header updated; nextMonth → October,
      prevMonth×2 → August, with the selected date's info still shown.
- [x] Moon phase is actually computed from the date (not a fixed icon) and
      rendered as a shape (canvas), correct across the full cycle. Verified by
      forcing phase 0/.125/.25/.375/.5/.625/.75/.875 via a temporary debug hook
      and screenshotting each — see GOTCHAS, this caught a real inverted-winding
      bug in the waning half that I fixed before shipping.
- [x] Sunrise/sunset/day-length computed for a real lat/lon (geolocation with a
      manual fallback), labelled as approximate. Verified: geolocation-denied
      path shows a graceful message (not a crash); manual lat/lon for Paris
      (48,2) recomputed correctly; invalid input (letters, out-of-range) is
      rejected with a message instead of producing NaN.
- [x] Season, zodiac sign, ISO week number, day-of-year all computed correctly
      for the selected date. Verified the southern-hemisphere checkbox flips
      Autumn→Spring instantly.
- [x] Word puzzle: same target word for everyone on the same local date, 6
      guesses, green/yellow/gray feedback, on-screen + physical keyboard,
      win/lose state. Verified: a partial-match guess (WOMAN vs WHEEL) painted
      exactly one green + rest gray on both tiles and keyboard; a correct guess
      on attempt 2 showed "solved in 2/6!" and updated stats to
      1 played/100%/streak 1; a full 6-wrong-guess run showed "the word was
      WHEEL" and reset streak to 0; a 5-Z non-word guess was rejected with
      "ZZZZZ is not on the word list" without consuming the row; backspace
      removes the last letter; both on-screen keyboard clicks and real
      keydown events work.
- [ ] "Does not reset on reload / persists via localStorage" — **could not be
      verified from this sandbox.** The eyes tool appears to give every
      top-level tool call (including an in-page `location.reload()`) a fresh
      browser storage partition, so `localStorage.getItem(...)` came back null
      immediately after a save that had just succeeded, even though a bare
      `localStorage.setItem/getItem` round-trip in the same reloaded page
      worked fine. The save/load code itself is a plain, standard
      `JSON.stringify` into `localStorage` (see `PUZZLE_KEY`/`STATS_KEY`),
      the same pattern as any other localStorage-backed page — I'm confident
      in it but it needs a real browser (not this harness) to confirm the
      persistence claim end to end.
- [x] Mobile: no horizontal scroll at 360/390px, inputs ≥16px (all in
      `tokens.css`'s 16px base), the on-screen letter keys are 30×46px each
      (narrower than the general 44px tap-target guideline, but this is the
      standard on-screen-QWERTY trade-off — 10 keys × 44px is 440px, wider
      than a 390px phone; every Wordle-style keyboard including iOS's own does
      this). Calendar cells and other buttons are ≥40px square.
- [x] og:title/og:description/<title> present and honest — describe the
      calendar+almanac+puzzle combination without overclaiming.

## Decisions

- **No "on this day in history" trivia.** I don't have a verified dataset of
  historical events and no network to fetch one — inventing dates/events from
  model memory risks confidently-wrong facts, which the brief explicitly warns
  against ("do not overclaim"). Everything the almanac shows is *computed*
  (astronomy/calendar math), not recalled trivia. If a human vendors a
  fact-checked "on this day" dataset into `_kit/`, that's the natural place to
  add it later — see THE PLAN.
- **Word list doubles as the valid-guess dictionary.** A real Wordle-style
  game normally has a small answer list inside a much larger "accepted guess"
  dictionary. I only had time/confidence to hand-write one clean list of
  common 5-letter words (~300), so guesses are restricted to that same list.
  Said so in the UI ("guesses from a ~300-word list") rather than pretending
  it's a full dictionary — a real word typed that isn't in the list will be
  rejected with an honest message, not a silent failure.
- **Site is not named "Wordle" or "Almanac"-anything-trademarked.** Called it
  "Lumen Almanac" / puzzle "Lumen Word" internally — own name, mechanic only,
  per the Tetris Holding precedent in the task brief.
- **No Bluesky sign-in.** The site is fully useful with zero auth (calendar,
  almanac, puzzle, stats all work from localStorage alone) so per the kit's
  own rule ("sign-in is optional unless the site is meaningless without it")
  I left out labPds entirely rather than bolt on a leaderboard nobody asked
  for. This is a plain calendar/puzzle tool, not a social feature — the
  profile's "handle-entry+typeahead" and "graph+copy-image" defaults don't
  apply because this build has neither a handle field nor a chart.
- **Geolocation is opt-in via a button**, not an automatic prompt on load —
  a permission dialog firing before a visitor has read a word of the page is
  the kind of thing that gets a tab closed. Manual lat/lon inputs work
  without it, defaulting to a documented example location (London) until
  changed.

## The plan (not built yet, in order)

1. **"On this day" facts**, if a human vendors a licensed/verified dataset
   into `_kit/` (e.g. a small JSON of {month,day,year,event} — public domain
   almanac data exists but needs sourcing, not guessing). Wire into the
   per-date panel next to moon phase/zodiac.
2. **Difficulty modes / harder word list** — the current 300-word list skews
   toward very common words; a "hard mode" pulling from a larger curated list
   would need that list vendored or hand-built with more care/time than this
   turn had.
3. **Share-result copy button** (grid of emoji squares, Wordle-style) — cheap
   to add, didn't fit this pass; `kit.copy` is right there for it.
4. **Print/export a paper month calendar** — asked for nothing here, but a
   "calendar" request sometimes implies wanting to print it; not attempted.

## Gotchas

- The moon-phase canvas render (circle + ellipse combined into one path,
  filled with the browser's default nonzero winding rule so the overlap
  cancels into a crescent/gibbous lune) is fiddly to get the winding
  direction right on paper. I verified it visually with the eyes tool across
  8 phase values rather than trusting the derivation blind — if you touch
  `drawMoon()`, re-check all 8 phases with a screenshot, not just full/new.
- Sunrise/sunset uses the classic Sunrise Equation (Almanac for Computers
  1990 algorithm — zenith 90.833°, the `lngHour`/`Lquadrant`/`RAquadrant`
  formulation widely republished). It's approximate near the poles and can
  return "sun never rises/sets" (cosH out of [-1,1]) — handled, not thrown.
- ISO week numbers: week 1 is the week containing the year's first Thursday;
  getting the year-boundary weeks (week 52/53 vs week 1 of next year) right
  needs the Thursday-shift trick, not a naive `day-of-year / 7`.
- Daily word seed uses the visitor's **local** midnight (like most daily
  puzzles), not UTC — so someone west of you may still be on "yesterday's"
  word for a few hours. Documented in-page as "today, your time."
