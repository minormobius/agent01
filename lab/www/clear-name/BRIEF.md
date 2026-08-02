# afterimage (living at /clear-name/) — handoff

## What this is

The first two turns in this slot built a domain-availability checker
(`plese`, then renamed `clear-name`). The third turn replaced it with
`afterimage`, a single n-back working-memory game, on the trigger "hey can
you build something for the mind?" — read as a genuinely new request, not a
continuation of the domain-checker thread.

**This (fourth) turn's trigger** was the requester posting their own results
back at the thread: "I did 73% and then 27% I am confirmed retarded." That
is not a spelled-out feature ask — per their profile
(`lab/_profiles/thegodfungi.bsky.social.md`) this handle reliably sends
terse, open-ended prompts and expects the shape filled in. Read literally,
it is just banter about a bad second run. But it also names the exact
symptom that item 2 of the previous BRIEF's plan ("no adaptive difficulty")
was written to fix: picking a fixed N by hand means one run's difficulty has
nothing to do with how the last one went, so scores swing hard between runs.
So this turn built adaptive difficulty — the next planned item, and also a
direct answer to the reaction post.

**What shipped:** a checked-by-default "auto-adjust difficulty" toggle. When
on, finishing a run at ≥85% accuracy steps N up for the next run; ≤50% steps
it down; clamped to 1–4; only changes between runs, never mid-run. The
summary panel says when and why it stepped. Manual level buttons still work
at any time — checking the box doesn't remove control, it just changes what
happens automatically after a run ends. Refactored the level-button code
into a shared `setLevel(n)` so both the click handler and the adaptive step
update the same `aria-pressed` state instead of two copies of that logic
drifting apart.

The page is otherwise unchanged from the third turn: a light moves around a
3x3 grid, one square per trial, and the player hits "match" whenever the
current square is the same one it was N steps back. Scores hits, misses,
false alarms and correct rejections; shows live accuracy during a run and a
summary after; keeps a personal best per level in `localStorage`; can save a
run's score to the visitor's own repo via `labPds().postScore` if they sign
in; and has a "compare with someone" box that reads a named handle's saved
score at the current difficulty via `store.scoresOf`. The domain-checker code
is gone from this file entirely — it still exists untouched at
`lab/www/domain-availability/`.

## Decisions

**Treated the ask as a pivot, not a bug report.** The one piece of prior
thread context I could see was "Still broke?", earlier and separate from
this turn's actual trigger message. I did not chase that as this turn's job
— it reads as history already dealt with by whichever turn produced the
current (working, coherent) domain-checker file, not a live complaint about
the current request. If that reading is wrong and the requester actually
wanted the domain tool fixed, my NOTE.txt says so and asks; revert is easy
since the git history still has the old `clear-name/index.html`.

**Single n-back, not dual n-back.** Dual n-back (position + letter/audio
simultaneously) is the version with the stronger research reputation but is
meaningfully harder to build correctly and to explain; single n-back
(position only) is the well-established, simpler mechanic and was the right
size for one turn. Noted in the copy as "n-back task from memory research"
without over-claiming a cognitive-benefit result — the transfer literature
is genuinely contested and the page says so.

**Named the site "afterimage", not "n-back".** "n-back" is a generic
scientific term (Kirchner, 1958), not a trademark, so using it in body copy
is fine — but giving the page itself a real name rather than the textbook
term felt like the right call per the house style (name it yourself, then
say what it's like).

**Scoring metric is accuracy (hit+correct-rejection over all trials), not
raw hits.** A run with zero real matches and all-correct-rejections would
score 100% under this scheme, which the footer copy calls out honestly
rather than hiding — it is a measure of judgement across the whole run, not
just catches.

**Kept the compare-a-named-handle feature.** It is exactly the leaderboard
shape the kit allows (built from someone the visitor typed, not a global
board), and it was cheap given `store.scoresOf`/`store.rank` already do the
work.

## The plan (not built yet, in order)

1. **Adaptive thresholds are unvalidated guesses (85% up / 50% down).** No
   hysteresis — someone who oscillates around one boundary (say, alternating
   84%/86%) will bounce a level every run. If a future request complains
   about that, the fix is a small dead zone or requiring two consecutive
   qualifying runs before stepping, not a redesign.
2. **No audio/second modality.** A true dual n-back trainer (add a
   spoken-letter stream matched independently) is the natural next step and
   is where most of the research value actually is — but it's a distinct
   build (needs a second match button, its own hit/miss bookkeeping, and
   either the Web Speech API or short recorded clips) and didn't fit this
   turn.
3. **Screen-reader coverage is thin.** The HUD (`aria-live="polite"`)
   announces trial count and running accuracy, but there's no distinct
   announcement of *when* a new square lights up for anyone not looking at
   the grid — the whole mechanic is visual. A non-visual mode (a tone per
   position, or a spoken position name) would be the real fix, not a small
   patch.
4. Growing to more than 4 levels or changing the grid size is a couple of
   constant tweaks (`[1,2,3,4]` array, the 3x3 grid loop) — no architecture
   change needed. Note `setLevel(n)` doesn't currently guard against `n`
   outside `[1,4]`; widening the level array means updating the adaptive
   clamp bounds (`level < 4`, `level > 1`) too.

## Gotchas

- **The `.hidden` class vs. the `hidden` attribute bit the sibling site
  before this one, and I hit the same shape here on the first draft.**
  `#summary` starts with `class="summary hidden"`. My first pass cleared it
  with `kit.clear($summary)` (which sets the `hidden` *attribute*) in one
  place and `classList.remove('hidden')` (the *class*) in another — same
  trap as before, attribute and class are independent so clearing one
  doesn't touch the other. Fixed by picking ONE mechanism throughout
  (`classList` only, never the `hidden` attribute, for this element). If you
  add another toggled panel, pick one and stay consistent.
- **A global `keydown` listener for the spacebar shortcut will eat spaces
  typed into any text input if you forget to check `document.activeElement`
  first** — caught this before shipping: the handle/compare/save inputs all
  live on the same page as the game, and a run can in principle be left
  running while a visitor's focus is elsewhere. Guarded by checking
  `activeElement.tagName` is not `INPUT`/`TEXTAREA` before treating a
  keypress as a game action.
- `store`, referenced inside several functions defined earlier in the file
  (`showSummary`, `postScoreNow`, `lookupRival`), is declared with `var`
  further down the script. This only works because none of those functions
  are actually *called* until after the whole script has run once (they're
  all wired to events) — same pattern the previous build used for
  `saveStarred`. Don't call any of them eagerly at top level without moving
  `var store = labPds();` above them first.
- **`n` and `level` are deliberately different variables — don't collapse
  them.** `level` is "what the next run will use" (what the buttons show,
  what adaptive stepping changes). `n` is "what the run in progress/just
  finished actually used" (snapshotted from `level` at the top of
  `startRun`). Adaptive stepping calls `setLevel()` — which only touches
  `level` — from inside `endRun`, *after* `n` has already been used to score
  the finished run, so the just-finished run is always scored and saved
  under the level it was actually played at, not the stepped-to one. If you
  ever make `showSummary` read `level` instead of `n`, runs will start
  reporting the wrong difficulty.
- The "sign in & save" button inside the summary panel closes over the
  module-level `n`, not a snapshot — pre-existing from the last turn, not
  introduced by adaptive stepping, but worth knowing: if a visitor leaves a
  finished run's summary open, starts a *new* run, and only then clicks that
  button, it would save under the new run's `n`. Low risk (the button is
  buried in a panel that gets replaced when a new run starts) but a real
  latent bug if `startRun` ever stops clearing `$summary` first.
