## What this is

Requester's thread: rate raw floating-point coordinates in the complex plane
(no plot, no visual cue) on how likely each is to be in the Mandelbrot set,
until you've done "enough" that the app can render your own personal brot.
Context in the thread named the exact math (z→z²+c from z=0), joked about
naming "your own ponderbrot" being worse than a friend's, and floated "maybe
atproto-based somehow" for storage — all from the requester themselves.

Shipped, working end to end in this turn:

- Real escape-time Mandelbrot ground truth (500 iterations, |z|>2 escape),
  computed live in JS — not a precomputed image.
- A rating phase that shows literally just `re(c)` / `im(c)` as raw JS
  `toString()` doubles, a slider 0–100, "lock it in, next point". No canvas,
  no axes, no coordinate plot anywhere until after you've committed a guess.
- Point sampling is rejection-biased away from trivial fast-escapers (85%
  of points that escape in <6 iterations get rerolled) so most points you
  see are genuinely ambiguous rather than obviously far outside. Flagged on
  the page itself, not just here — this is a real deviation from uniform
  sampling.
- After 30 ratings (MIN_RATINGS, tunable, one constant near the top of the
  module script): a results view with two canvases side by side — your
  personal brot, built purely by inverse-distance-weighted interpolation of
  your own ratings (weight 1/(d²+ε), documented on-page), and the real
  fractal with your rated points overlaid as green/red dots for
  agree/disagree. Plus accuracy % and Brier score (defined on-page).
- Optional atproto: sign in via labPds, post your accuracy as a
  `com.minomobi.lab.score` record (per-mille integer, `game: 'ponderbrot'`),
  and a "look up their posted score" box (kit.handleInput-backed) that reads
  `store.scoresOf(handle)` for any handle the visitor types — answers their
  own "maybe atproto-based somehow?" aside, and lets them actually check a
  named rival's score, which is the literal "worse than jev's" joke made
  real. Sign-in is optional throughout; the whole rating/render loop works
  with zero network beyond the two allowed Bluesky hosts.

## Decisions

- **Ground truth uses a hard iteration cap (500 for logic, 300 for the
  render canvas), not a proof.** The Mandelbrot membership problem isn't
  decidable by iterating; this is the universal computable stand-in every
  renderer uses, and it's said explicitly on the page rather than presented
  as exact. Don't "fix" this by raising the cap indefinitely — it doesn't
  converge, it just gets slower.
- **Rejected uniform random sampling on purpose.** A literal reading of "a
  bunch of coordinates" could mean uniform-random over the viewport, but
  that mostly produces trivially-obvious points (huge |c|, escapes in one
  step) which tests nothing. Picked biased-toward-boundary sampling instead
  and said so on-page, following the standing habit in this requester's
  profile of flagging any deviation from the most literal reading rather
  than doing it silently.
- **"Personal brot" = inverse-distance-weighted field over your own rated
  points, not a classifier.** No ML, no fitted model — literally "the shade
  at any point is a distance-weighted average of your nearby guesses." This
  was picked because it's the simplest thing that's honestly described as
  "built purely out of your ratings" with no hidden interpolation model
  doing real work you didn't ask for.
- **localStorage always keeps your ratings; atproto is opt-in on top.**
  Per the standing "sign-in is optional unless the site is meaningless
  without it" rule — the core loop (rate → render) never requires an
  account. Only posting/looking up a score touches the network beyond the
  allowed Bluesky hosts.
- **Score value is accuracy×1000 (per-mille), integer.** `postScore`
  requires an integer; percentage alone loses a digit of precision at the
  100-point scale this needs, so per-mille was used instead and the unit
  string says so.

## The plan (not built)

1. **The humanbrot idea (averaging everyone's ratings) was raised in the
   thread but by a bystander, not the requester — deliberately not built.**
   If the requester asks for it directly: there's still no shared backend,
   so it would need to be built the same way the leaderboard is — reading
   named people's own posted records, never a global aggregate. `scoresOf`
   already gives the shape; it would need a *doc* aggregate instead (a
   shared list of (re, im, guess) tuples per person), which the current
   `save`/`load` slot could hold directly.
2. **The IDW field currently recomputes from scratch on every render
   click** (fine at n≈30–200; `canvas 260² × n` points). If a future ask
   pushes ratings into the thousands, this is the first thing to profile —
   probably a spatial grid/k-d tree cutoff on the weight sum rather than an
   exhaustive loop.
3. **No pan/zoom on either canvas.** Both are fixed to the classic
   [-2.5,1]×[-1.25,1.25] window. A natural next step if asked: let a rating
   session be scoped to a chosen sub-window (drag-select before rating
   starts), so someone can build a personal brot of just the boundary
   filaments near a specific point instead of the whole set.
4. **No retry/backoff on `scoresOf` or `postScore` beyond what pds.js
   already does.** Untested against a real OAuth round trip from this
   sandbox (no network here) — the harness's browser pass is the first
   real exercise of the sign-in flow.

## Gotchas

- `postScore` throws `TypeError` if the value isn't an integer — this is
  why the score is per-mille (`Math.round(accuracy*1000)`), not a bare
  0–1 float or a 0–100 percentage with decimals.
- `store.rank()` sorts by each record's own `higherIsBetter`, not by
  assumption — fine here since every ponderbrot score sets it `true`, but
  don't copy the `rank(scores)[0]` "best" pattern into a lower-is-better
  metric without checking that field first.
- `kit.handleInput` is attached to *both* the sign-in handle box and the
  rival-lookup box — it's idempotent and debounced per-element, so this is
  safe, but if either input is removed/recreated dynamically in a future
  edit, re-attach explicitly; it no-ops on an element it's already touched
  (`input._kitTypeahead`).
- The "no visual cues" phase really does show nothing but the two numbers
  — resist the urge to add a tiny preview thumbnail "for context" if asked
  to polish this later; that would undercut the entire premise of the
  request.
