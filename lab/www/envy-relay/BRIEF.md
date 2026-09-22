# Envy Relay — handoff

## What this is

A playable build of arxiv 2607.27743, "Delegated Fair Division": goods are
allocated through a layer of centers (pantries) who then split what they
receive among their own members. Fairness has to hold at both levels — no
pantry envies another pantry, no member envies their pantry-mate.

Turn one ships: one fixed instance (3 pantries × 2 members, 6 goods, a
hardcoded 6×6 valuation grid rendered as a colour+number heatmap), pointer-
event drag-and-drop (goods → pantry → member), and a live checker that
recomputes both fairness levels after every move. A local elapsed-time
counter starts on first move and freezes on solve; there is no leaderboard.

## Decisions

- **Center valuation = item-based potential, not bundle-based.** The paper
  defines four ways a center can value a bundle. I picked item-based
  potential specifically because it's *additive per good* (Lemma 3 in the
  paper: a center's value for a set of goods is just the sum, over each
  good, of the max of its two members' values for that good) — no
  permutation search needed, and Theorem 1 + Corollary 4 guarantee an
  EF1-both-levels solution always exists under this valuation, for any
  additive member valuations. That means the puzzle is provably solvable
  for any grid I put in, including the one shipped. Bundle-based valuation
  (matching the other center's *actual* bundle split via a permutation) is
  mentioned in the paper too and would be a legitimate harder variant, but
  Theorem 1's existence guarantee doesn't cover it — I didn't want to ship
  a puzzle that might not have a solution.
- **Intra-fairness only, not inter-fairness.** The paper's two info-
  structure modes are: agents compare against everyone (inter) vs. only
  their own center's roster (intra). Intra is the "warm up" section and is
  what the existence guarantee above actually covers alongside item-based
  potential. Inter-fairness is the paper's real technical content (Sections
  4–5, Horizontal Round-Robin, Bilevel Yankee Swap) and is a materially
  harder mode to both compute and to make feel fair to a player — see THE
  PLAN.
- **Values are fully visible**, not hidden. You're playing the allocator,
  not a participant — the allocator needs to see every valuation to make a
  fair split at all, so the "hidden valuation grid" idea from the original
  proposal became an always-visible heatmap (colour + printed number, so
  colour alone never carries information — accessible without relying on
  hue).
- **Drag via Pointer Events, not HTML5 drag-and-drop.** Native DnD is
  unreliable on touch. Pointer events (pointerdown/move/up +
  `elementFromPoint` for drop detection) unify mouse and touch in one code
  path and were the more reliable choice for "will be opened on a phone."
- **No scoring/leaderboard this turn.** The original proposal suggested
  `store.postScore` for a shared "fastest to zero envy" board on a shared
  instance bank. Not built — there's only one instance right now, so a
  leaderboard would just be racing yourself. Worth doing once there's an
  instance generator (see THE PLAN) so a race is actually meaningful.

## The plan (next turn, in order)

1. **Inter-fairness mode toggle.** This is the paper's actual variable and
   the thing worth building next. The hard part: when a member can see
   outside their own pantry, the checker must compare every member against
   every other member globally, and the *center* check should probably also
   switch to a mode where centers reason about the realized (not potential)
   split, since inter-fairness assumes full visibility. Don't just widen
   the same `computeChecks` loop — re-read Definition 4 (agent inter-EF1)
   before changing it, the removal-of-one-good logic is per ordered pair
   globally, not per pantry.
2. **A UI affordance for "why does this fail"** — right now a red ❌ says
   *that* a pair envies, not by how much or which good would fix it. For a
   puzzle this size (6 goods) it'd be cheap to compute and show the
   specific good whose hypothetical removal would clear the envy (the
   paper's own EF1 definition names it: `∃g`). Would make the puzzle
   teach the definition, not just gate on it.
3. **Instance variety + `labPds` scores.** Once there's more than one fixed
   instance (randomize the valuation grid, keep it seeded/shareable via a
   URL param so players can compare times on the *same* puzzle), add
   `store.postScore` for a real "fastest to zero envy on today's instance"
   board, per the original proposal. Don't add this before instance variety
   exists — a leaderboard on a single fixed puzzle isn't a leaderboard.
4. Consider a bundle-based mode as an "expert" toggle, once inter-fairness
   ships — clearly labelled as a variant without the existence guarantee,
   so a player who reaches an unsolvable state understands why (the paper
   leaves this open too — Section 3, end).

## Gotchas

- Item-based potential value does **not** depend on how a center splits
  goods among its own two members — only on which goods it holds overall.
  This means the center-level checker updates the moment a good is dragged
  onto a pantry, before it's split to a member. That's correct per the
  paper's own definition, but it surprised me on first read of Section 2 —
  worth remembering if inter-fairness work changes this.
- `centerValue`/`contrib` assume exactly 2 members per center — the `max`
  shortcut for item-based potential only works because summing over an
  unconstrained 2-way partition reduces to picking the higher bidder per
  good. Generalizing to n members needs an actual per-good argmax over n
  values (still O(goods × members), not a permutation search — item-based
  stays additive regardless of n), but the code as written hardcodes 2.
- Untested in an actual browser by me — no network/shell in this sandbox.
  The harness screenshots after this turn; if pointer-based dragging
  doesn't register on the screenshot pass (some headless browsers handle
  synthetic pointer events differently than real touch), the fallback fix
  is a plain click-to-pick-up/click-to-place interaction, which was the
  rejected-for-time alternative during this turn.
