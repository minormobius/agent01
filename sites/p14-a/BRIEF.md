# BRIEF — daily-digital

## What this is
Requested as "daily digital calendar with an almanac and a daily word puzzle."
One turn, one `index.html`, three sections, all shipped and functional:

1. **Calendar** — current month grid, today highlighted, prev/next month
   navigation (pure client-side `Date` math, no data source needed).
2. **Almanac** — day-of-year / days-remaining / ISO week / zodiac sign /
   season (computed from the date alone), a moon-phase estimate (synodic
   period from a known new-moon epoch), and real sunrise/sunset times
   computed from the visitor's own geolocation using the standard
   Meeus/NOAA solar-position formulas (no API call — implemented directly
   in JS). Location is opt-in via a button; the rest of the almanac works
   without it.
3. **Daily word puzzle** — a five-letter guessing game (not named or
   styled after any specific commercial game — see Decisions) with a
   ~470-word list, deterministic daily answer keyed off days-since-epoch
   (same word for everyone, all day, UTC-aligned), 6 guesses, on-screen +
   physical keyboard input, localStorage persistence per day so a reload
   doesn't lose progress, and a day-to-day streak counter.

## Decisions
- **No handle input, no OAuth, no `pds.js`.** Nothing here needs a Bluesky
  identity — it's calendar/puzzle state, not a social feature — so I kept
  sign-in out entirely per "sign-in is optional unless the site is
  meaningless without it." Streak/progress live in `localStorage` only.
- **Word puzzle mechanic, not the brand.** Built the classic
  guess-a-word-with-colored-feedback mechanic (this genre is not
  protectable, per the Tetris precedent in the task brief) but gave it no
  branded name, a five-tile-different color scheme (kit accent for
  correct, kit `--ok` green for present, muted border for absent — not the
  familiar green/yellow), and titled it plainly "Five-Letter Puzzle."
  Nothing in the title, headings, or copy references any specific existing
  word game.
- **Word list is curated by hand (~470 words), not fetched.** No network
  access in this sandbox, so I hand-wrote a list of common English
  five-letter words. It's a fraction of what a real dictionary API would
  offer — decent variety, not exhaustive, and it's the *same* list used
  both to pick the daily answer and to validate guesses (so an unusual but
  valid English word may get rejected as "not in the word list" — this is
  disclosed nowhere explicit on the page beyond that error message; worth
  a copy tweak if it annoys people).
- **On-this-day trivia was deliberately left out.** I considered adding it
  to the almanac but had no reliable data source and didn't want to
  fabricate historical facts under an honest-copy site. Everything shown
  is either pure date arithmetic or real astronomical calculation.
- Sunrise/sunset math was hand-implemented from the public Meeus/NOAA
  formulas (the same math behind the well-known SunCalc library) rather
  than copying any third-party file — no network access to fetch a copy,
  and no external script allowed under CSP anyway.

## The plan (next turn, in order)
1. **Verify the sunrise/sunset formulas against a known reference by hand**
   once a browser is available — I could not run this in the sandbox. Pick
   a known lat/lon/date with a published sunrise time and compare; the
   Meeus algorithm is well-established but I transcribed it from memory
   plus reconstructed derivation, not from a checked copy.
2. **On-this-day almanac facts.** Would need either a small curated
   dataset written into the page (a `{month, day, fact}` array — tedious
   but doable in a turn) or leaving it out permanently. If asked for this
   specifically, that's the approach — do NOT call any live API, since
   there's no allowed public endpoint for historical trivia here.
3. **Calendar could show puzzle/streak history** — e.g. dot markers on
   past days the visitor completed the puzzle — but that needs storing a
   per-day completion flag across many days (currently only today's
   `dd-puzzle-<date>` key and the streak counter persist; a full history
   view would want to enumerate localStorage keys by prefix, which is easy
   to add).
4. **Optional: offer saving streak/history to the visitor's own ATProto
   repo via `/_kit/pds.js`** (`store.save('streak', {...})`) so it survives
   clearing localStorage / switching devices. Skipped this turn to keep
   sign-in fully optional and because localStorage already satisfies "the
   site works without it" — but it's a natural `postScore`/`save` fit if
   requested.

## Gotchas
- The Meeus `hourAngle` calculation returns `NaN` via `Math.acos` for
  polar day/night (argument outside [-1, 1]) — handled explicitly with a
  fallback message rather than showing "Invalid Date".
- Word puzzle's date key and the daily answer index both derive from UTC
  (`Date.now() / 86400000`), NOT the visitor's local calendar day, so the
  word can change mid-afternoon somewhere in the world. Said so directly
  in the page copy and NOTE.txt — don't quietly "fix" this to local time,
  since that would make the puzzle non-synchronized between visitors in
  different timezones, which is worse.
- Guess evaluation handles duplicate letters the standard way (two-pass:
  exact matches first, then a "used" array so a repeated letter in the
  guess doesn't double-count against a single occurrence in the answer).
  If this ever looks wrong, check `evaluateGuess` first — it's the part
  most word-puzzle clones get subtly wrong.
- Never actually opened this in a browser — untested render/interaction
  beyond reading the code. Per the harness, a screenshot pass happens
  after this turn ends; if the calendar grid or puzzle keyboard look
  broken there, start with CSS grid column counts (`repeat(7, 1fr)` /
  `repeat(5, 1fr)`) since that's the part most likely to be subtly wrong
  without a render to check against.
