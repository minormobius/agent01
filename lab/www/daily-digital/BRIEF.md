# Daybook — handoff

## What this is

The ask: "daily digital calendar with an almanac and a daily word puzzle."
This is a new site, built from scratch in one turn. It shipped as one file,
`index.html`, with two halves:

- **Almanac** — today's date, day-of-year, ISO week, zodiac sign, moon
  phase + illumination %, season (with a hemisphere toggle), and
  sunrise/sunset if the visitor grants geolocation. All computed client-side
  with standard closed-form astronomy formulas (Wikipedia's "sunrise
  equation" for sun times, a synodic-month calc for the moon) — no network
  call, so nothing here depends on an API that isn't allowed by the CSP.
  There's also a small "also known as" note keyed by month-day.
- **Word puzzle** — a Wordle-shaped game (own name, own word list, own
  styling — not a clone of the branded product, per the trademark section
  of the top-level instructions). The word is picked deterministically from
  an embedded ~200-word list, indexed by days-since-epoch, so it's the same
  word for every visitor on the same local calendar day. Guess evaluation
  uses the standard two-pass duplicate-letter algorithm (exact matches
  first, then present-elsewhere against unused letters) — that's the part
  most likely to have a subtle bug if someone "simplifies" it later; don't
  collapse it to a single pass, it'll double-count repeated letters wrong.

## Decisions

- **No Bluesky integration at all.** The request has no social angle —
  no handle to look up, no feed to show — so there's nothing here that
  needs `kit.handleInput` or `bskyGet`. Adding a login just to have one
  would violate "sign-in optional unless the site is meaningless without
  it."
- **Streaks are localStorage-only, not synced to the visitor's PDS.**
  `labPds()` (`/_kit/pds.js`) would let a streak follow the visitor across
  devices via `store.save`/`store.load`, but that means adding an
  optional sign-in flow, and I judged the core game correctness (the
  guess-evaluation logic, the daily determinism, the astronomy formulas)
  was the higher-value use of the turn. This is the most obvious "next
  piece" — see below.
- **Any 5-letter alphabetic guess is accepted** — there's no secondary
  "is this a real word" dictionary check. A real Wordle-alike normally
  validates guesses against a larger word list than the answer pool. I
  skipped this deliberately: building a second, larger embedded dictionary
  well enough to avoid false rejections (real words getting rejected) felt
  riskier in one turn than just accepting anything 5 letters long. Worth
  fixing if it comes up.
- **"On this day" is short and honest (~20 entries)** rather than a padded
  365-entry table. I only included dates I was confident about from memory;
  a wrong historical fact is worse than an admitted gap. The UI says so
  plainly when a date has no entry.
- **Sunrise/sunset is opt-in via a button**, not requested automatically on
  load — a page shouldn't fire a permission prompt before the visitor has
  done anything.

## The plan — not built yet, roughly in priority order

1. **PDS-backed streak sync.** Add an optional "sign in to keep your streak
   across devices" affordance using `labPds()` — `store.save('streak', ...)`
   mirroring the localStorage shape, loaded on `store.ready()` if signed in,
   falling back to localStorage otherwise. Needs a plan for merge conflicts
   (played on two devices same day) — simplest correct answer is probably
   "PDS wins if it has today's entry, else localStorage wins."
2. **A bigger, real "on this day" table.** Someone (a human, or an agent
   with real research capability) should build an actually-researched
   365-entry dataset rather than my ~20 confident guesses. Don't hand-wave
   more entries from memory — that's how the current list stayed small.
3. **A larger/second word list for guess validation**, so `refuse` is
   possible for garbage input while still accepting normal words. Needs
   care that the validation list is a superset of the answer list.
4. **Southern-hemisphere season toggle doesn't persist** across reloads —
   trivial `localStorage` fix, just didn't get to it.
5. Consider whether the "day N" counter in the share image/text (currently
   `days since 2024-01-01`, so today is triple digits) is the framing
   people actually want, versus something like "puzzle #N" starting from
   the site's real launch date — I used a fixed epoch rather than the
   actual launch date since I didn't know it at build time.

## Gotchas

- The astronomy math (`sunTimes`, `moonPhase`, `isoWeek`) is **unverified
  in a browser** in the sense that I can't run JS in this sandbox at all —
  I traced the formulas by hand against known reference values from memory,
  but the harness's post-build screenshot only shows that the page *renders*,
  not that the sunrise time is numerically correct. If a future report says
  a moon phase or sunrise time looks wrong, check `sunTimes`/`moonPhase`
  arithmetic first, not the DOM/CSS around it.
- I deliberately used `Math.floor((new Date(y,m,d).getTime() - EPOCH_MS) /
  86400000)` for the daily word index rather than doing anything with
  `getTimezoneOffset()` — an earlier draft subtracted the offset a second
  time, which is redundant since `new Date(y,m,d)` already encodes local
  midnight as an absolute instant. If you touch `localDayIndex`, don't
  reintroduce that; it was wrong, not defensive.
- No text `<input>` exists anywhere on the page (guesses are typed via
  physical keydown or the on-screen keyboard buttons), which was a
  deliberate way to sidestep the iOS 16px-input-zoom problem entirely
  rather than remembering to set `font-size: 16px` on one.
