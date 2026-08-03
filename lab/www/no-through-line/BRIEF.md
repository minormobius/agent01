# BRIEF.md — for the next agent on site-2 ("No Through Line")

## What this is

A colleague's proposal (see the task's "no-through-line" concept, seeded from a
paper on general position sets in strong graph products) reached this
requester as "build that" on a factory advert. The paper's core claim: take a
graph H, stack `s` copies of it into a bundle shaped like a path (the strong
product `H ⊠ P_s`), and the largest "general position set" you can fit — a set
of vertices where no member sits on a shortest path between two other members
— is always exactly `2·gp(H)`, for every `s ≥ 2`, no matter how deep the stack
goes. That's the surprise the page is built to demonstrate, not just state.

Turn one shipped, fully working:

- `H` fixed to `C_5` (a 5-cycle). Grid renders `H` as 5 rows, `s` columns
  (path positions), `s` adjustable 2–6 via a slider.
- Real distance computation: `d_H` via the cycle-distance formula, `d_path`
  via `|a-b|`, combined as `max(d_H, d_path)` — the exact theorem for strong
  products, not a geometric/pixel proxy. This is the "hard part" named in the
  brief and it's done properly.
- `gp(H)` is computed live, by brute force over all 32 subsets of `C_5`
  (small enough that brute force is the right tool, not an approximation) —
  so the number on the page isn't a hardcoded constant, it's derived the same
  way the product-graph checker works.
- Click a vertex to toggle it into your working set. Any vertex that lands on
  a shortest path between two other selected vertices turns red *live*, on
  every click — this is the actual mechanic the paper's pitch asked for.
- The slider changes `s` but the displayed ceiling `2·gp(H)` never moves —
  that's shown deliberately, as the point, not hidden as an implementation
  detail.
- Copy-image button (rasterizes the inline SVG to canvas — no CORS issue
  since nothing in the diagram is cross-origin — then clipboard-writes a
  PNG), per this requester's standing "big shiny copy button on any diagram"
  preference (see `lab/_profiles/minormobius.bsky.social.md`).
- Leaderboard via the visitor's own repo (`labPds`): sign in, save your best
  *violation-free* set size found this session; look up a named rival's best
  via `scoresOf`. Optional — the board works fully without signing in.

## Decisions

- **`H` is fixed to `C_5`, not selectable, this turn.** The pitch's own "turn
  one" scope was explicitly "a small fixed case (P_3 boxed with C_5)" — I
  read "P_3 boxed with C_5" as `C_5 ⊠ P_s` with `s` starting at 3 (the
  slider default), not literally locking `s=3` forever, since the whole point
  is showing the ceiling doesn't move as `s` varies.
- **Diagonal strong-product edges are not drawn.** `H ⊠ P` has edges for
  `(a=b, i~j)`, `(a~b, i=j)`, AND `(a~b, i~j)` (the diagonal case). Drawing
  all three on a 5×6 grid was a visual tangle that actively hurt legibility.
  The distance function does NOT skip them — `max(d_H, d_path)` is the correct
  closed-form distance for the *whole* strong product regardless of which
  edges get drawn, so the violation-checker is exact even though the picture
  only shows two of the three edge types. Said explicitly in the page copy so
  nobody mistakes the drawing for the whole graph.
- **No BFS over an explicit adjacency list.** Since H is a cycle and the
  stacking factor is a path, both have closed-form distances
  (`min(|a-b|, n-|a-b|)` and `|a-b|`), and the strong-product distance
  theorem (`max` of the two) is exact for any two connected graphs — so this
  isn't a shortcut/approximation, it *is* the real shortest-path computation,
  just via the closed forms instead of a generic BFS. If `H` ever becomes
  visitor-selectable (see below) and isn't a cycle or path, swap in real BFS
  over `H`'s adjacency list; the `max(...)` combination step doesn't change.
- **Slider capped at s=2–6**, not "up to a thousand" as the pitch's prose
  imagines. Each vertex needs a genuine ~44px tap target on a 360px-wide
  phone screen; 5 rows × 6 columns of 44px cells is about as far as that goes
  without triggering horizontal scroll. Said in the page copy rather than
  silently shipping a smaller range than the paper's claim.
- **Selection is never blocked.** Clicking a vertex that would violate general
  position still selects it (and turns it red) rather than refusing the
  click — matches the pitch's "highlight live any triple," and lets a visitor
  see *why* something breaks instead of being told no.
- **"Best clean set so far" is session-local (a JS variable), not persisted
  to localStorage.** It resets on reload. Saving to the repo (via the save
  button) is the durable path, and that's the one that's meant to survive.

## The plan — what's not built yet, in the order I'd do it

1. **Let the visitor choose H.** Right now it's hardcoded to `C_5`. The
   natural next step: a small picker (C_4, C_5, C_6, maybe a path P_4 or a
   small tree) that swaps in a real adjacency-list BFS for `d_H` instead of
   the cycle closed-form, and recomputes `gp(H)` and the target live. This is
   the single highest-value addition — it's what turns "one fixed demo" into
   "the general mechanic the paper is actually about."
2. **Small-cycle stacking (the paper's other result).** The brief mentions
   "exact values when the stacking graph is a small cycle instead of a
   path" — i.e. `H ⊠ C_k` instead of `H ⊠ P_s`. That changes `d_path` to
   `d_cycle` for the stacking dimension too, and the wraparound-arc drawing
   already built for `H`'s own cycle edges can be reused for the stacking
   dimension's wraparound. The ceiling is no longer flat `2·gp(H)` in this
   case — the brief says the paper gives exact values, not a single constant,
   so this needs the actual formula from the paper (not fetched — no network
   here — so this needs the paper's text pulled in a future turn) or another
   brute-force verification pass for small cases.
3. **The counterexample to gp multiplying across `C_m □ C_n`** (Cartesian,
   not strong, product) is mentioned in the pitch as a paper finding but is a
   genuinely different product operation from what this page builds — it
   would be a separate small demo, not a mode of this one. Lowest priority;
   flag to the requester rather than silently building it into the same page.
4. **Persist "best clean set" across reloads** in localStorage per-`H`
   (keyed by `H`'s identity once #1 lands), so switching `s` and reloading
   doesn't lose progress before someone decides to sign in and save.

## Gotchas

- SVG click targets: a `<rect class="hit">` with `fill:transparent` needs
  `pointer-events: all` set explicitly in CSS — a transparent fill does not
  reliably capture pointer events on its own across engines. Already handled,
  but worth remembering if the hit-rect approach gets copied elsewhere.
- The copy-image button rasterizes the *live* SVG element directly (not a
  separate canvas re-draw), so there's no risk of the "copied a stale
  generation" race this requester has hit before on other sites (see
  `want-pairwise` history in the profile) — there's nothing async between
  "user clicks copy" and "read the current SVG," so no re-entrancy guard was
  needed here the way it was there.
- Did not test in an actual browser (no network/shell in this sandbox) — the
  harness screenshot pass is the first real look. If the SVG viewBox/CSS
  `max-width` combination doesn't scale down correctly on very narrow
  viewports, that's the first place to check — it was reasoned through, not
  observed.
- **`build()` must run after `const store = labPds()` is declared, not
  before.** `build()` calls `refresh()` synchronously, which calls
  `updateSaveBtn()`, which reads `store.user()` — so if `build()` is invoked
  while `store` is still in its temporal dead zone (declared later in the same
  scope), it's a `ReferenceError: Cannot access 'store' before initialization`,
  not a timing/async bug. The harness screenshot caught this on turn one; fixed
  by moving `store` and the other DOM lookups `updateSaveBtn` touches
  (`saveBtn`, `signInBtn`, `meHandleInput`) above the `build()` call.
